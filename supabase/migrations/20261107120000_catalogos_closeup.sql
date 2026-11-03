-- ============================================================
-- SegmentApp · Migración 17 · Catálogos de CloseUp y filtros (Fase 12B)
-- Reemplaza las "tablas de dimensiones" de Power Query. El admin sube
-- en Ajustes → Catálogos los archivos tal como salen del portal:
--   - Especialidades: código (Esp1) → nombre
--   - Laboratorios:   abreviatura → nombre
--   - Productos:      UNA fila por producto (laboratorio, molécula,
--                     clase terapéutica, genérico). Así el cruce nunca
--                     duplica recetas.
--   - Clases terapéuticas: código → nombre (vacía por ahora; lista para
--                     cuando exista ese catálogo).
-- Subir un catálogo AGREGA o ACTUALIZA filas; nunca borra.
-- Filtros de la carga de CloseUp en configuracion.filtros_closeup.
-- Aditiva. Deshacer: supabase/rollback/20261107120000_deshacer_catalogos_closeup.sql
-- ============================================================

create table public.catalogo_especialidades (
    codigo         text primary key,
    nombre         text not null,
    actualizado_en timestamptz not null default now()
);
create table public.catalogo_laboratorios (
    abreviatura    text primary key,
    nombre         text not null,
    codigo         text,
    actualizado_en timestamptz not null default now()
);
create table public.catalogo_productos (
    producto          text primary key,
    laboratorio       text,              -- abreviatura (se cruza con catalogo_laboratorios)
    molecula          text,
    clase_terapeutica text,              -- código (ej. S01R0); su nombre, en catalogo_clases
    generico          text,              -- SI / NO
    variantes         integer not null default 1,   -- filas del portal (concentraciones, formas)
    clases_distintas  text[] not null default '{}', -- si sus filas traían clases distintas
    editado_a_mano    boolean not null default false, -- corregido en la app: subir el catálogo no lo pisa
    actualizado_en    timestamptz not null default now()
);
create table public.catalogo_clases (
    codigo         text primary key,
    nombre         text not null,
    actualizado_en timestamptz not null default now()
);
comment on table public.catalogo_productos is 'Una fila por producto de CloseUp: evita que el cruce duplique recetas.';

-- Solo el administrador los lee y los cambia (la carga de CloseUp se procesa en su navegador)
do $$
declare t text;
begin
    foreach t in array array['catalogo_especialidades', 'catalogo_laboratorios', 'catalogo_productos', 'catalogo_clases'] loop
        execute format('alter table public.%I enable row level security', t);
        execute format('revoke all on public.%I from anon', t);
        execute format('grant select, insert, update on public.%I to authenticated', t);
        execute format('create policy %I on public.%I for select to authenticated using ((select public.es_admin()))', t || '_ver', t);
        execute format('create policy %I on public.%I for insert to authenticated with check ((select public.es_admin()))', t || '_crear', t);
        execute format('create policy %I on public.%I for update to authenticated using ((select public.es_admin())) with check ((select public.es_admin()))', t || '_editar', t);
    end loop;
end $$;

-- ------------------------------------------------------------
-- Guardar un catálogo completo de una vez (agrega o actualiza; no borra)
-- Devuelve cuántas filas son nuevas, cambiaron o quedaron iguales.
-- ------------------------------------------------------------
create function public.admin_guardar_catalogo(p_tipo text, p_filas jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
    v_nuevas integer := 0;
    v_cambiadas integer := 0;
    v_total integer := jsonb_array_length(coalesce(p_filas, '[]'::jsonb));
begin
    perform public._exigir_admin();
    if p_tipo = 'especialidades' then
        select count(*) filter (where c.codigo is null),
               count(*) filter (where c.codigo is not null and c.nombre is distinct from x.nombre)
          into v_nuevas, v_cambiadas
          from jsonb_to_recordset(p_filas) as x(codigo text, nombre text)
          left join public.catalogo_especialidades c on c.codigo = x.codigo;
        insert into public.catalogo_especialidades (codigo, nombre)
        select distinct on (codigo) codigo, nombre from jsonb_to_recordset(p_filas) as x(codigo text, nombre text)
         where coalesce(codigo, '') <> ''
        on conflict (codigo) do update set nombre = excluded.nombre, actualizado_en = now()
         where public.catalogo_especialidades.nombre is distinct from excluded.nombre;
    elsif p_tipo = 'laboratorios' then
        select count(*) filter (where c.abreviatura is null),
               count(*) filter (where c.abreviatura is not null and (c.nombre, c.codigo) is distinct from (x.nombre, x.codigo))
          into v_nuevas, v_cambiadas
          from jsonb_to_recordset(p_filas) as x(abreviatura text, nombre text, codigo text)
          left join public.catalogo_laboratorios c on c.abreviatura = x.abreviatura;
        insert into public.catalogo_laboratorios (abreviatura, nombre, codigo)
        select distinct on (abreviatura) abreviatura, nombre, codigo
          from jsonb_to_recordset(p_filas) as x(abreviatura text, nombre text, codigo text)
         where coalesce(abreviatura, '') <> ''
        on conflict (abreviatura) do update set nombre = excluded.nombre, codigo = excluded.codigo, actualizado_en = now()
         where (public.catalogo_laboratorios.nombre, public.catalogo_laboratorios.codigo) is distinct from (excluded.nombre, excluded.codigo);
    elsif p_tipo = 'productos' then
        select count(*) filter (where c.producto is null),
               count(*) filter (where c.producto is not null and (c.laboratorio, c.molecula, c.clase_terapeutica, c.generico)
                                      is distinct from (x.laboratorio, x.molecula, x.clase_terapeutica, x.generico))
          into v_nuevas, v_cambiadas
          from jsonb_to_recordset(p_filas) as x(producto text, laboratorio text, molecula text, clase_terapeutica text, generico text)
          left join public.catalogo_productos c on c.producto = x.producto;
        -- Lo corregido a mano (editado_a_mano) se respeta: un archivo del portal no lo pisa
        insert into public.catalogo_productos as c (producto, laboratorio, molecula, clase_terapeutica, generico, variantes, clases_distintas, editado_a_mano)
        select distinct on (producto) producto, laboratorio, molecula, clase_terapeutica, generico,
               coalesce(variantes, 1), coalesce(clases_distintas, '{}'), coalesce(editado_a_mano, false)
          from jsonb_to_recordset(p_filas) as x(producto text, laboratorio text, molecula text, clase_terapeutica text,
                                                 generico text, variantes integer, clases_distintas text[], editado_a_mano boolean)
         where coalesce(producto, '') <> ''
        on conflict (producto) do update set
            laboratorio       = case when c.editado_a_mano and not excluded.editado_a_mano then c.laboratorio else excluded.laboratorio end,
            molecula          = case when c.editado_a_mano and not excluded.editado_a_mano then c.molecula else excluded.molecula end,
            clase_terapeutica = case when c.editado_a_mano and not excluded.editado_a_mano then c.clase_terapeutica else excluded.clase_terapeutica end,
            generico          = case when c.editado_a_mano and not excluded.editado_a_mano then c.generico else excluded.generico end,
            variantes = excluded.variantes, clases_distintas = excluded.clases_distintas,
            editado_a_mano = c.editado_a_mano or excluded.editado_a_mano, actualizado_en = now()
         where (c.laboratorio, c.molecula, c.clase_terapeutica, c.generico, c.variantes, c.clases_distintas, c.editado_a_mano)
               is distinct from (excluded.laboratorio, excluded.molecula, excluded.clase_terapeutica, excluded.generico,
                                 excluded.variantes, excluded.clases_distintas, excluded.editado_a_mano);
    elsif p_tipo = 'clases' then
        select count(*) filter (where c.codigo is null),
               count(*) filter (where c.codigo is not null and c.nombre is distinct from x.nombre)
          into v_nuevas, v_cambiadas
          from jsonb_to_recordset(p_filas) as x(codigo text, nombre text)
          left join public.catalogo_clases c on c.codigo = x.codigo;
        insert into public.catalogo_clases (codigo, nombre)
        select distinct on (codigo) codigo, nombre from jsonb_to_recordset(p_filas) as x(codigo text, nombre text)
         where coalesce(codigo, '') <> ''
        on conflict (codigo) do update set nombre = excluded.nombre, actualizado_en = now()
         where public.catalogo_clases.nombre is distinct from excluded.nombre;
    else
        raise exception 'Catálogo desconocido: %', p_tipo using errcode = '22023';
    end if;
    return jsonb_build_object('ok', true, 'total', v_total, 'nuevas', v_nuevas, 'cambiadas', v_cambiadas,
                              'iguales', v_total - v_nuevas - v_cambiadas);
end;
$$;
revoke all on function public.admin_guardar_catalogo(text, jsonb) from public;
grant execute on function public.admin_guardar_catalogo(text, jsonb) to authenticated;

-- ------------------------------------------------------------
-- Filtros de la carga de CloseUp (los mismos de Power Query; editables en Ajustes → Catálogos)
-- ------------------------------------------------------------
insert into public.configuracion (clave, valor, descripcion) values
('filtros_closeup',
 '{"especialidades_excluir": ["DCR", "INS", "OTR"], "nombres_especialidad_excluir": ["UNIDAD DE CUIDADOS INTENS"], "excluir_matricula_cero": true}',
 'Filas que se quitan al cargar CloseUp: códigos de especialidad (Esp1), nombres de especialidad y matrículas en cero')
on conflict (clave) do nothing;

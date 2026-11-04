-- ============================================================
-- SegmentApp · Migración 19 · Fase 12D-2
--   Renombrar mercados que ya están cargados ("ESOZ MERCADO A02B2" →
--   "Mdo Esoz") en TODAS las versiones de recetas y en las evaluaciones
--   guardadas, para unificar la nomenclatura. No se borra nada:
--     - cada cambio queda anotado en public.mercados_renombres (con lo
--       necesario para deshacerlo) y en la bitácora;
--     - las evaluaciones guardan su versión anterior en su historial
--       (lo hace solo el disparador de siempre);
--     - "Deshacer" (admin_deshacer_renombre) devuelve todo como estaba.
--   Si el nombre nuevo ya existe (ej. una carga nueva ya trae "Mdo Esoz"),
--   las versiones viejas se juntan con él, siempre que no estén ambos en
--   la misma versión (eso sumaría dos veces).
-- Aditiva. Deshacer: supabase/rollback/20261109120000_deshacer_renombrar_mercados.sql
-- ============================================================

create table public.mercados_renombres (
    id               bigint generated always as identity primary key,
    viejo            text not null,
    nuevo            text not null,
    mercado_viejo_id bigint references public.cat_mercados (id),
    mercado_nuevo_id bigint references public.cat_mercados (id),
    fusion           boolean not null default false,   -- se juntó con un mercado que ya existía
    versiones        uuid[] not null default '{}',     -- versiones de recetas que se movieron (si hubo fusión)
    evaluaciones     uuid[] not null default '{}',     -- evaluaciones renombradas
    sin_cambiar      integer not null default 0,       -- evaluaciones que no se tocaron (ya había una con el nombre nuevo)
    nombres_antes    jsonb,                            -- tabla de nombres de mercado antes del cambio (para deshacer)
    hecho_por        uuid default auth.uid() references public.perfiles (id),
    hecho_en         timestamptz not null default now(),
    deshecho_en      timestamptz,
    deshecho_por     uuid references public.perfiles (id)
);
alter table public.mercados_renombres enable row level security;
revoke all on public.mercados_renombres from anon;
grant select on public.mercados_renombres to authenticated;
create policy mercados_renombres_ver on public.mercados_renombres for select to authenticated using ((select public.es_admin()));

-- ------------------------------------------------------------
-- Los mercados que hay hoy: en cuántas versiones están y cuántas evaluaciones tienen
-- ------------------------------------------------------------
create function public.admin_mercados_en_uso()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
    perform public._exigir_admin();
    return coalesce((
        with recetas_por_mercado as (
            select r.mercado_id, count(distinct r.snapshot_id) as versiones,
                   bool_or(s.es_vigente) as en_vigente
              from public.recetas r join public.data_snapshots s on s.id = r.snapshot_id
             group by r.mercado_id
        ), evaluaciones_por_mercado as (
            select e.mercado, count(*) filter (where e.eliminado_en is null) as evaluaciones
              from public.evaluaciones e group by e.mercado
        ), nombres as (
            select mk.nombre from public.cat_mercados mk join recetas_por_mercado r on r.mercado_id = mk.id
            union
            select ev.mercado from evaluaciones_por_mercado ev
        )
        select jsonb_agg(jsonb_build_object(
                   'nombre', n.nombre,
                   'versiones', coalesce(r.versiones, 0),
                   'en_vigente', coalesce(r.en_vigente, false),
                   'evaluaciones', coalesce(ev.evaluaciones, 0)) order by n.nombre)
          from nombres n
          left join public.cat_mercados mk on mk.nombre = n.nombre
          left join recetas_por_mercado r on r.mercado_id = mk.id
          left join evaluaciones_por_mercado ev on ev.mercado = n.nombre), '[]'::jsonb);
end;
$$;
revoke all on function public.admin_mercados_en_uso() from public;
grant execute on function public.admin_mercados_en_uso() to authenticated;

-- ------------------------------------------------------------
-- Renombrar: p_cambios = [{"viejo": "ESOZ MERCADO A02B2", "nuevo": "Mdo Esoz"}, …]
-- Todo o nada: si uno falla, no se cambia ninguno.
-- ------------------------------------------------------------
create function public.admin_renombrar_mercados(p_cambios jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
    c record;
    v_viejo text;
    v_nuevo text;
    v_id_viejo bigint;
    v_id_nuevo bigint;
    v_fusion boolean;
    v_versiones uuid[];
    v_evals uuid[];
    v_sin_cambiar integer;
    v_tabla jsonb;
    v_tabla_nueva jsonb;
    v_resultados jsonb := '[]'::jsonb;
begin
    perform public._exigir_admin();
    for c in select * from jsonb_to_recordset(coalesce(p_cambios, '[]'::jsonb)) as x(viejo text, nuevo text) loop
        v_viejo := btrim(regexp_replace(coalesce(c.viejo, ''), '\s+', ' ', 'g'));
        v_nuevo := btrim(regexp_replace(coalesce(c.nuevo, ''), '\s+', ' ', 'g'));
        if v_nuevo = '' then raise exception 'Escribe el nombre nuevo de "%".', v_viejo using errcode = '22023'; end if;
        continue when v_viejo = v_nuevo;

        select id into v_id_viejo from public.cat_mercados where nombre = v_viejo;
        select id into v_id_nuevo from public.cat_mercados where nombre = v_nuevo;
        if v_id_viejo is null and not exists (select 1 from public.evaluaciones where mercado = v_viejo) then
            raise exception 'No existe el mercado "%".', v_viejo using errcode = '22023';
        end if;

        -- 1) Recetas (todas las versiones)
        v_fusion := v_id_viejo is not null and v_id_nuevo is not null;
        v_versiones := '{}';
        if v_fusion then
            if exists (select 1 from public.recetas a where a.mercado_id = v_id_viejo
                          and exists (select 1 from public.recetas b where b.snapshot_id = a.snapshot_id and b.mercado_id = v_id_nuevo)) then
                raise exception 'Los mercados "%" y "%" están los dos en la misma versión de datos: no se pueden juntar.', v_viejo, v_nuevo
                    using errcode = '23505';
            end if;
            select coalesce(array_agg(distinct snapshot_id), '{}') into v_versiones from public.recetas where mercado_id = v_id_viejo;
            update public.recetas set mercado_id = v_id_nuevo where mercado_id = v_id_viejo;
            update public.recetas_orden_mercado set mercado_id = v_id_nuevo where mercado_id = v_id_viejo;
        elsif v_id_viejo is not null then
            update public.cat_mercados set nombre = v_nuevo where id = v_id_viejo;
        end if;

        -- 2) Evaluaciones (su versión anterior queda en el historial). Si el mismo visitador ya
        --    tiene una evaluación activa de ese médico con el nombre nuevo, esa no se toca.
        with cambiadas as (
            update public.evaluaciones e set mercado = v_nuevo
             where e.mercado = v_viejo
               and (e.eliminado_en is not null or not exists (
                    select 1 from public.evaluaciones o
                     where o.visitador_id = e.visitador_id and o.matricula_norm = e.matricula_norm
                       and o.mercado = v_nuevo and o.eliminado_en is null))
            returning e.id)
        select coalesce(array_agg(id), '{}') into v_evals from cambiadas;
        select count(*) into v_sin_cambiar from public.evaluaciones where mercado = v_viejo and eliminado_en is null;

        -- 3) Tabla de nombres de mercado: lo que apuntaba al nombre viejo apunta al nuevo,
        --    y el nombre viejo queda como alias (por si vuelve a aparecer)
        select valor into v_tabla from public.configuracion where clave = 'nombres_mercado';
        v_tabla := coalesce(v_tabla, '{}'::jsonb);
        select coalesce(jsonb_object_agg(k, case when v = to_jsonb(v_viejo) then to_jsonb(v_nuevo) else v end), '{}'::jsonb)
          into v_tabla_nueva from jsonb_each(v_tabla) as t(k, v);
        if not (v_tabla_nueva ? upper(v_viejo)) then
            v_tabla_nueva := v_tabla_nueva || jsonb_build_object(upper(v_viejo), v_nuevo);
        end if;
        insert into public.configuracion (clave, valor, descripcion)
        values ('nombres_mercado', v_tabla_nueva, 'Nombre de cada mercado del portal de CloseUp → nombre que usa la app')
        on conflict (clave) do update set valor = excluded.valor;

        insert into public.mercados_renombres (viejo, nuevo, mercado_viejo_id, mercado_nuevo_id, fusion, versiones,
                                               evaluaciones, sin_cambiar, nombres_antes)
        values (v_viejo, v_nuevo, v_id_viejo, coalesce(v_id_nuevo, v_id_viejo), v_fusion, v_versiones,
                v_evals, v_sin_cambiar, v_tabla);
        insert into public.bitacora (hecho_por, accion, clave, antes, despues)
        values (auth.uid(), 'renombrar_mercado', v_nuevo, jsonb_build_object('nombre', v_viejo),
                jsonb_build_object('nombre', v_nuevo, 'evaluaciones', coalesce(array_length(v_evals, 1), 0), 'fusion', v_fusion));
        v_resultados := v_resultados || jsonb_build_object('viejo', v_viejo, 'nuevo', v_nuevo, 'fusion', v_fusion,
            'evaluaciones', coalesce(array_length(v_evals, 1), 0), 'sin_cambiar', v_sin_cambiar);
    end loop;
    return jsonb_build_object('ok', true, 'resultados', v_resultados);
end;
$$;
revoke all on function public.admin_renombrar_mercados(jsonb) from public;
grant execute on function public.admin_renombrar_mercados(jsonb) to authenticated;

-- ------------------------------------------------------------
-- Deshacer un renombre (el último primero, si hubo varios del mismo mercado)
-- ------------------------------------------------------------
create function public.admin_deshacer_renombre(p_id bigint)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
    r public.mercados_renombres;
    v_evals integer;
begin
    perform public._exigir_admin();
    select * into r from public.mercados_renombres where id = p_id and deshecho_en is null;
    if r.id is null then raise exception 'Ese cambio no existe o ya se deshizo.' using errcode = '22023'; end if;
    if exists (select 1 from public.mercados_renombres
                where id > r.id and deshecho_en is null and viejo = r.nuevo) then
        raise exception 'Primero deshaz los cambios más recientes de ese mercado.' using errcode = '22023';
    end if;

    if r.fusion then
        update public.recetas set mercado_id = r.mercado_viejo_id
         where mercado_id = r.mercado_nuevo_id and snapshot_id = any (r.versiones);
        update public.recetas_orden_mercado set mercado_id = r.mercado_viejo_id
         where mercado_id = r.mercado_nuevo_id and snapshot_id = any (r.versiones);
    elsif r.mercado_viejo_id is not null then
        if exists (select 1 from public.cat_mercados where nombre = r.viejo and id <> r.mercado_viejo_id) then
            raise exception 'Ya existe otro mercado llamado "%".', r.viejo using errcode = '23505';
        end if;
        update public.cat_mercados set nombre = r.viejo where id = r.mercado_viejo_id;
    end if;

    update public.evaluaciones e set mercado = r.viejo
     where e.id = any (r.evaluaciones) and e.mercado = r.nuevo
       and (e.eliminado_en is not null or not exists (
            select 1 from public.evaluaciones o
             where o.visitador_id = e.visitador_id and o.matricula_norm = e.matricula_norm
               and o.mercado = r.viejo and o.eliminado_en is null));
    get diagnostics v_evals = row_count;

    -- Tabla de nombres: solo lo que tocó este cambio (lo que el admin cambió después se respeta)
    update public.configuracion c
       set valor = coalesce((
           select jsonb_object_agg(k, case when v = to_jsonb(r.nuevo) and coalesce(r.nombres_antes, '{}'::jsonb) ? k
                                           then r.nombres_antes -> k else v end)
             from jsonb_each(c.valor) as t(k, v)
            where not (k = upper(r.viejo) and not coalesce(r.nombres_antes, '{}'::jsonb) ? k)), '{}'::jsonb)
     where c.clave = 'nombres_mercado';
    update public.mercados_renombres set deshecho_en = now(), deshecho_por = auth.uid() where id = r.id;
    insert into public.bitacora (hecho_por, accion, clave, antes, despues)
    values (auth.uid(), 'renombrar_mercado', r.viejo, jsonb_build_object('nombre', r.nuevo),
            jsonb_build_object('nombre', r.viejo, 'evaluaciones', v_evals, 'deshecho', true));
    return jsonb_build_object('ok', true, 'viejo', r.viejo, 'nuevo', r.nuevo, 'evaluaciones', v_evals);
end;
$$;
revoke all on function public.admin_deshacer_renombre(bigint) from public;
grant execute on function public.admin_deshacer_renombre(bigint) to authenticated;

-- ============================================================
-- SegmentApp · Migración 7 · Datos por equipo (Fase 7, velocidad)
--   - datos_equipo(): cada VM o GD recibe SOLO las recetas y el
--     fichero de sus médicos (unos KB en vez de 8,8 MB), más la
--     clasificación nacional por mercado de esos médicos (que antes
--     exigía descargar todas las recetas del país).
--   - El archivo completo de cada versión queda solo para quienes
--     ven todo (admin y Gerente Nacional).
-- Aditiva. Deshacer: supabase/rollback/20261030120000_deshacer_datos_por_equipo.sql
-- ============================================================

-- ------------------------------------------------------------
-- Encabezados del fichero con los repetidos renombrados "X (2)",
-- igual que las claves de fichero.datos
-- ------------------------------------------------------------
create function public.claves_columnas(p_columnas text[])
returns text[]
language sql
immutable
set search_path = ''
as $$
    select coalesce(array_agg(case when x.veces > 1 then x.c || ' (' || x.veces || ')' else x.c end order by x.n), '{}')
    from (
        select t.c, t.n, count(*) over (partition by t.c order by t.n) as veces
        from unnest(p_columnas) with ordinality as t(c, n)
    ) x
$$;

-- ------------------------------------------------------------
-- Datos de MI equipo para una versión de recetas y una de fichero.
-- Devuelve:
--   columnas            encabezados del fichero (en orden)
--   fichero             filas del fichero de mis visitadores (valores en ese orden)
--   medicos/productos/mercados  catálogos de las recetas enviadas
--   recetas             [medico, mercado, producto, rx] en el orden del archivo
--   clasificacion       por mercado y matrícula: total, phq, acumulado y total
--                       del mercado NACIONAL (para la etiqueta A+/B/C- por mercado)
-- Los umbrales se aplican en la app, así un cambio de umbral no exige
-- volver a descargar nada.
-- ------------------------------------------------------------
create function public.datos_equipo(p_recetas uuid, p_fichero uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
    v_admin boolean := public.es_admin();
    v_columnas text[];
    v_claves text[];
    v_res jsonb;
begin
    if public.mi_rol() is null then
        raise exception 'Tu usuario no tiene permisos';
    end if;
    if not exists (select 1 from public.data_snapshots s
                   where s.id = p_recetas and s.tipo = 'recetas' and (s.estado = 'publicado' or v_admin)) then
        raise exception 'La versión de recetas no existe o no está publicada';
    end if;
    if p_fichero is not null then
        select s.columnas into v_columnas from public.data_snapshots s
        where s.id = p_fichero and s.tipo = 'fichero' and (s.estado = 'publicado' or v_admin);
        if not found then
            raise exception 'La versión del fichero no existe o no está publicada';
        end if;
    end if;
    v_columnas := coalesce(v_columnas, '{}');
    v_claves := public.claves_columnas(v_columnas);

    with mis_fichero as (
        select f.fila, f.matricula_norm, f.datos
        from public.fichero f
        where f.snapshot_id = p_fichero
          and f.visitador_id in (select public.visitadores_visibles())
    ),
    mis_matriculas as (
        select distinct matricula_norm from mis_fichero where matricula_norm <> ''
    ),
    mis_recetas as (
        select r.fila, r.medico_id, r.mercado_id, r.producto_id, r.rx
        from public.recetas r
        join public.cat_medicos m on m.id = r.medico_id
        where r.snapshot_id = p_recetas
          and m.matricula_norm in (select matricula_norm from mis_matriculas)
    ),
    -- Productos del laboratorio: misma regla que la app (el nombre CONTIENE uno de la lista)
    lista_phq as (
        select upper(x) as p
        from public.configuracion c, jsonb_array_elements_text(c.valor) as x
        where c.clave = 'productos_phq'
    ),
    productos_version as (
        select p.id, exists (select 1 from lista_phq l where strpos(upper(p.producto), l.p) > 0) as es_phq
        from public.cat_productos p
        where p.id in (select distinct producto_id from public.recetas where snapshot_id = p_recetas)
    ),
    -- Totales NACIONALES por mercado y matrícula (como la app los calculaba con todas las recetas)
    grupos as (
        select r.mercado_id, btrim(m.matricula) as matricula,
               sum(r.rx) as total,
               coalesce(sum(r.rx) filter (where pv.es_phq), 0) as phq,
               min(r.fila) as primera,
               -- Desempate igual que la app: las matrículas que son un número "limpio"
               -- (sin ceros a la izquierda) van primero y de menor a mayor; luego las
               -- demás, en el orden en que aparecen en el archivo.
               case when btrim(m.matricula) ~ '^(0|[1-9][0-9]{0,9})$' and btrim(m.matricula)::bigint < 4294967295
                    then btrim(m.matricula)::bigint end as numero
        from public.recetas r
        join public.cat_medicos m on m.id = r.medico_id
        join productos_version pv on pv.id = r.producto_id
        where r.snapshot_id = p_recetas
        group by r.mercado_id, btrim(m.matricula)
    ),
    ordenados as (
        select g.*,
               ltrim(split_part(g.matricula, '_', 1), '0') as matricula_norm,
               sum(g.total) over (partition by g.mercado_id order by g.total desc, g.numero nulls last, g.primera
                                  rows between unbounded preceding and current row) as acumulado,
               sum(g.total) over (partition by g.mercado_id) as total_mercado
        from grupos g
    ),
    primeros as (
        select o.*, row_number() over (partition by o.mercado_id, o.matricula_norm
                                       order by o.total desc, o.numero nulls last, o.primera) as orden
        from ordenados o
    )
    select jsonb_build_object(
        'columnas', to_jsonb(v_columnas),
        'fichero', coalesce((
            select jsonb_agg((select jsonb_agg(coalesce(f.datos ->> k.c, '') order by k.n)
                              from unnest(v_claves) with ordinality as k(c, n)) order by f.fila)
            from mis_fichero f), '[]'::jsonb),
        'medicos', coalesce((
            select jsonb_object_agg(m.id, jsonb_build_array(m.matricula, m.nombre, m.medico_unico, m.domicilio,
                                                            m.cod_postal, m.localidad, m.region, m.especialidad))
            from public.cat_medicos m where m.id in (select medico_id from mis_recetas)), '{}'::jsonb),
        'productos', coalesce((
            select jsonb_object_agg(p.id, jsonb_build_array(p.producto, p.molecula, p.clase_terapeutica, p.generico, p.laboratorio))
            from public.cat_productos p where p.id in (select producto_id from mis_recetas)), '{}'::jsonb),
        'mercados', coalesce((
            select jsonb_object_agg(mk.id, mk.nombre) from public.cat_mercados mk
            where mk.id in (select mercado_id from mis_recetas)
               or mk.id in (select mercado_id from primeros p
                            where p.orden = 1 and p.matricula_norm in (select matricula_norm from mis_matriculas))), '{}'::jsonb),
        'recetas', coalesce((
            select jsonb_agg(jsonb_build_array(r.medico_id, r.mercado_id, r.producto_id, r.rx) order by r.fila)
            from mis_recetas r), '[]'::jsonb),
        'clasificacion', coalesce((
            select jsonb_agg(jsonb_build_array(p.mercado_id, p.matricula_norm, p.total, p.phq, p.acumulado, p.total_mercado))
            from primeros p
            where p.orden = 1 and p.matricula_norm in (select matricula_norm from mis_matriculas)), '[]'::jsonb)
    ) into v_res;
    return v_res;
end;
$$;

revoke all on function public.claves_columnas(text[]) from public;
revoke all on function public.datos_equipo(uuid, uuid) from public;
grant execute on function public.claves_columnas(text[]) to authenticated;
grant execute on function public.datos_equipo(uuid, uuid) to authenticated;

-- ------------------------------------------------------------
-- El archivo COMPLETO de una versión: solo admin y Gerente Nacional.
-- (VM y GD ya no lo necesitan: reciben solo lo suyo con datos_equipo.)
-- ------------------------------------------------------------
drop policy if exists datos_leer on storage.objects;
create policy datos_leer on storage.objects for select to authenticated
    using (
        bucket_id = 'datos'
        and (
            (select public.es_admin())
            or (
                (select public.ve_todo())
                and exists (select 1 from public.data_snapshots s
                            where s.archivo = storage.objects.name and s.estado = 'publicado')
            )
        )
    );

-- ============================================================
-- SegmentApp · Migración 8 · Orden nacional por mercado PRECALCULADO
-- Arreglo de la Fase 7: datos_equipo() calculaba, en cada entrada de
-- un VM, el orden de las 231 mil recetas del país, y Supabase cortaba
-- la consulta ("statement timeout", límite de 8 s). Ese orden es igual
-- para todos: ahora se calcula UNA vez por versión (un mercado por
-- llamada, para no pasar nunca del límite) y se guarda.
-- Aditiva. Deshacer: supabase/rollback/20261030130000_deshacer_orden_mercado.sql
-- ============================================================

-- Orden de cada matrícula dentro de su mercado. No depende de la lista
-- PHQ ni de los umbrales: esos se siguen aplicando al consultar.
create table if not exists public.recetas_orden_mercado (
    snapshot_id    uuid not null references public.data_snapshots (id),
    mercado_id     bigint not null references public.cat_mercados (id),
    matricula      text not null,          -- tal como viene (sin espacios a los lados)
    matricula_norm text not null,
    total          bigint not null,        -- recetas de esa matrícula en el mercado
    acumulado      bigint not null,        -- suma de las anteriores + esta (Pareto)
    total_mercado  bigint not null,
    es_primero     boolean not null,       -- la que representa a la matrícula normalizada
    primary key (snapshot_id, mercado_id, matricula)
);
create index if not exists recetas_orden_mercado_mat_idx on public.recetas_orden_mercado (snapshot_id, matricula_norm);
alter table public.recetas_orden_mercado enable row level security;
-- Se lee a través de datos_equipo(); el admin también puede consultarla
create policy orden_mercado_admin_ver on public.recetas_orden_mercado for select to authenticated
    using ((select public.es_admin()));

alter table public.data_snapshots add column if not exists orden_listo boolean not null default false;

-- ------------------------------------------------------------
-- Calcula el orden de UN mercado de una versión (uso interno).
-- Mismo orden que la app: más recetas primero; si empatan, la matrícula
-- numérica "limpia" de menor a mayor; luego, orden de aparición en el archivo.
-- ------------------------------------------------------------
create function public._calcular_orden_mercado(p_snapshot uuid, p_mercado bigint)
returns void
language sql
security definer
set search_path = ''
as $$
    insert into public.recetas_orden_mercado
        (snapshot_id, mercado_id, matricula, matricula_norm, total, acumulado, total_mercado, es_primero)
    select p_snapshot, p_mercado, g.matricula, g.matricula_norm, g.total,
           sum(g.total) over (order by g.total desc, g.numero nulls last, g.primera
                              rows between unbounded preceding and current row),
           sum(g.total) over (),
           row_number() over (partition by g.matricula_norm order by g.total desc, g.numero nulls last, g.primera) = 1
    from (
        select btrim(m.matricula) as matricula,
               ltrim(split_part(btrim(m.matricula), '_', 1), '0') as matricula_norm,
               sum(r.rx) as total,
               min(r.fila) as primera,
               case when btrim(m.matricula) ~ '^(0|[1-9][0-9]{0,9})$' and btrim(m.matricula)::bigint < 4294967295
                    then btrim(m.matricula)::bigint end as numero
        from public.recetas r
        join public.cat_medicos m on m.id = r.medico_id
        where r.snapshot_id = p_snapshot and r.mercado_id = p_mercado
        group by btrim(m.matricula)
    ) g
    on conflict do nothing
$$;
revoke all on function public._calcular_orden_mercado(uuid, bigint) from public, anon, authenticated;

-- ------------------------------------------------------------
-- Prepara una versión de recetas: calcula UN mercado pendiente por
-- llamada y devuelve cuántos faltan (la app llama hasta que dé 0).
-- Solo el admin.
-- ------------------------------------------------------------
create function public.preparar_orden_mercado(p_snapshot uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_pendientes bigint[];
begin
    if not public.es_admin() then
        raise exception 'Solo el administrador';
    end if;
    if not exists (select 1 from public.data_snapshots where id = p_snapshot and tipo = 'recetas') then
        raise exception 'La versión de recetas no existe';
    end if;
    select coalesce(array_agg(x.mercado_id order by x.mercado_id), '{}') into v_pendientes
    from (select distinct r.mercado_id from public.recetas r where r.snapshot_id = p_snapshot) x
    where not exists (select 1 from public.recetas_orden_mercado o
                      where o.snapshot_id = p_snapshot and o.mercado_id = x.mercado_id);
    if cardinality(v_pendientes) > 0 then
        perform public._calcular_orden_mercado(p_snapshot, v_pendientes[1]);
    end if;
    if cardinality(v_pendientes) <= 1 then
        update public.data_snapshots set orden_listo = true where id = p_snapshot and not orden_listo;
        return 0;
    end if;
    return cardinality(v_pendientes) - 1;
end;
$$;
revoke all on function public.preparar_orden_mercado(uuid) from public;
grant execute on function public.preparar_orden_mercado(uuid) to authenticated;

-- ------------------------------------------------------------
-- datos_equipo() ahora LEE el orden precalculado (milisegundos)
-- ------------------------------------------------------------
create or replace function public.datos_equipo(p_recetas uuid, p_fichero uuid)
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
    if not exists (select 1 from public.data_snapshots s where s.id = p_recetas and s.orden_listo) then
        raise exception 'Esta versión de recetas aún no está preparada para los visitadores. El administrador debe abrir "Cargar Datos", pestaña "Versiones", y publicarla de nuevo.';
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
    -- Orden NACIONAL por mercado (precalculado una vez por versión): solo mis médicos
    mi_orden as (
        select o.mercado_id, o.matricula, o.matricula_norm, o.total, o.acumulado, o.total_mercado
        from public.recetas_orden_mercado o
        where o.snapshot_id = p_recetas and o.es_primero
          and o.matricula_norm in (select matricula_norm from mis_matriculas)
    ),
    -- Recetas del laboratorio de esas mismas matrículas (están todas en mis_recetas)
    mi_phq as (
        select r.mercado_id, btrim(m.matricula) as matricula, sum(r.rx) as phq
        from mis_recetas r
        join public.cat_medicos m on m.id = r.medico_id
        join public.cat_productos p on p.id = r.producto_id
        where exists (select 1 from lista_phq l where strpos(upper(p.producto), l.p) > 0)
        group by r.mercado_id, btrim(m.matricula)
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
               or mk.id in (select mercado_id from mi_orden)), '{}'::jsonb),
        'recetas', coalesce((
            select jsonb_agg(jsonb_build_array(r.medico_id, r.mercado_id, r.producto_id, r.rx) order by r.fila)
            from mis_recetas r), '[]'::jsonb),
        'clasificacion', coalesce((
            select jsonb_agg(jsonb_build_array(o.mercado_id, o.matricula_norm, o.total, coalesce(ph.phq, 0),
                                               o.acumulado, o.total_mercado))
            from mi_orden o
            left join mi_phq ph on ph.mercado_id = o.mercado_id and ph.matricula = o.matricula), '[]'::jsonb)
    ) into v_res;
    return v_res;
end;
$$;


-- ------------------------------------------------------------
-- Preparar las versiones de recetas que ya existen (incluida la vigente)
-- ------------------------------------------------------------
do $$
declare
    v_snap uuid;
    v_mercado bigint;
begin
    for v_snap in select id from public.data_snapshots where tipo = 'recetas' and not orden_listo loop
        for v_mercado in select distinct mercado_id from public.recetas where snapshot_id = v_snap loop
            perform public._calcular_orden_mercado(v_snap, v_mercado);
        end loop;
        update public.data_snapshots set orden_listo = true where id = v_snap;
    end loop;
end;
$$;

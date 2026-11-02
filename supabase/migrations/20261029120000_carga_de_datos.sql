-- ============================================================
-- SegmentApp · Migración 6 · Carga de datos desde la app (Fase 5)
--   - Archivo comprimido PRIVADO por versión (Supabase Storage)
--   - Carga por lotes en el servidor (solo admin, solo borradores)
--   - Comparación de una versión contra otra
-- Aditiva. Deshacer: supabase/rollback/20261029120000_deshacer_carga_de_datos.sql
-- ============================================================

-- Archivo de cada versión (lo que la app descarga después de iniciar sesión)
alter table public.data_snapshots
    add column if not exists archivo text,
    add column if not exists archivo_bytes bigint;

-- ------------------------------------------------------------
-- Almacén privado "datos": nadie lo ve sin iniciar sesión.
-- Con sesión, se puede leer el archivo de una versión PUBLICADA;
-- los borradores solo el admin. Solo el admin sube archivos.
-- (Hasta la Fase 7 cada usuario descarga el archivo completo, como hoy,
--  pero ya no es público en internet.)
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('datos', 'datos', false)
on conflict (id) do nothing;

create policy datos_leer on storage.objects for select to authenticated
    using (
        bucket_id = 'datos'
        and (
            (select public.es_admin())
            or (
                (select public.mi_rol()) is not null
                and exists (select 1 from public.data_snapshots s
                            where s.archivo = storage.objects.name and s.estado = 'publicado')
            )
        )
    );
create policy datos_admin_subir on storage.objects for insert to authenticated
    with check (bucket_id = 'datos' and (select public.es_admin()));
create policy datos_admin_reemplazar on storage.objects for update to authenticated
    using (bucket_id = 'datos' and (select public.es_admin()))
    with check (bucket_id = 'datos' and (select public.es_admin()));

-- ------------------------------------------------------------
-- Ayudante: solo se carga en BORRADORES y solo el admin
-- ------------------------------------------------------------
create function public.exigir_borrador_admin(p_snapshot uuid, p_tipo text)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
    if not public.es_admin() then
        raise exception 'Solo el administrador puede cargar datos';
    end if;
    if not exists (select 1 from public.data_snapshots
                   where id = p_snapshot and tipo = p_tipo and estado = 'borrador') then
        raise exception 'La versión no existe, no es de tipo % o ya no es un borrador', p_tipo;
    end if;
end;
$$;

-- ------------------------------------------------------------
-- Cargar un lote de RECETAS (hasta unas miles de filas por llamada).
-- p_filas: [{fila, medico, matricula, mercado, producto, rx, medico_unico,
--            domicilio, cod_postal, localidad, region, especialidad,
--            molecula, clase_terapeutica, generico, laboratorio}, ...]
-- Repetir el mismo lote no duplica (la fila ya existe y se omite).
-- ------------------------------------------------------------
create function public.cargar_recetas_lote(p_snapshot uuid, p_filas jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
set statement_timeout = '120s'
as $$
declare
    v_insertadas integer;
begin
    perform public.exigir_borrador_admin(p_snapshot, 'recetas');

    create temporary table if not exists _lote_recetas (
        fila integer, medico text, matricula text, mercado text, producto text, rx integer,
        medico_unico text, domicilio text, cod_postal text, localidad text, region text,
        especialidad text, molecula text, clase_terapeutica text, generico text, laboratorio text
    ) on commit drop;
    truncate _lote_recetas;
    insert into _lote_recetas
    select x.fila, coalesce(x.medico, ''), coalesce(x.matricula, ''), coalesce(x.mercado, ''), coalesce(x.producto, ''),
           x.rx, coalesce(x.medico_unico, ''), coalesce(x.domicilio, ''), coalesce(x.cod_postal, ''),
           coalesce(x.localidad, ''), coalesce(x.region, ''), coalesce(x.especialidad, ''), coalesce(x.molecula, ''),
           coalesce(x.clase_terapeutica, ''), coalesce(x.generico, ''), coalesce(x.laboratorio, '')
    from jsonb_to_recordset(p_filas) as x(
        fila integer, medico text, matricula text, mercado text, producto text, rx integer,
        medico_unico text, domicilio text, cod_postal text, localidad text, region text,
        especialidad text, molecula text, clase_terapeutica text, generico text, laboratorio text);

    if exists (select 1 from _lote_recetas where fila is null or rx is null or rx < 0) then
        raise exception 'El lote tiene filas sin número de fila o con recetas inválidas';
    end if;

    insert into public.cat_medicos (matricula, nombre, medico_unico, domicilio, cod_postal, localidad, region, especialidad)
    select distinct matricula, medico, medico_unico, domicilio, cod_postal, localidad, region, especialidad from _lote_recetas
    on conflict do nothing;
    insert into public.cat_productos (producto, molecula, clase_terapeutica, generico, laboratorio)
    select distinct producto, molecula, clase_terapeutica, generico, laboratorio from _lote_recetas
    on conflict do nothing;
    insert into public.cat_mercados (nombre)
    select distinct mercado from _lote_recetas
    on conflict do nothing;

    insert into public.recetas (snapshot_id, fila, medico_id, mercado_id, producto_id, rx)
    select p_snapshot, l.fila, m.id, mk.id, p.id, l.rx
    from _lote_recetas l
    join public.cat_medicos m on m.matricula = l.matricula and m.nombre = l.medico and m.medico_unico = l.medico_unico
        and m.domicilio = l.domicilio and m.cod_postal = l.cod_postal and m.localidad = l.localidad
        and m.region = l.region and m.especialidad = l.especialidad
    join public.cat_mercados mk on mk.nombre = l.mercado
    join public.cat_productos p on p.producto = l.producto and p.molecula = l.molecula
        and p.clase_terapeutica = l.clase_terapeutica and p.generico = l.generico and p.laboratorio = l.laboratorio
    on conflict do nothing;
    get diagnostics v_insertadas = row_count;
    return v_insertadas;
end;
$$;

-- ------------------------------------------------------------
-- Cargar un lote del FICHERO.
-- p_filas: [{fila, matricula, nombre, visitador_nombre, sector,
--            distrito_codigo, distrito_nombre, equipo, datos}, ...]
-- Crea los distritos y visitadores nuevos (no cambia los existentes).
-- ------------------------------------------------------------
create function public.cargar_fichero_lote(p_snapshot uuid, p_filas jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
set statement_timeout = '120s'
as $$
declare
    v_insertadas integer;
    v_otc text[];
begin
    perform public.exigir_borrador_admin(p_snapshot, 'fichero');

    select coalesce(array(select jsonb_array_elements_text(valor)), array['7'])
      into v_otc from public.configuracion where clave = 'equipos_otc';
    v_otc := coalesce(v_otc, array['7']);

    create temporary table if not exists _lote_fichero (
        fila integer, matricula text, nombre text, visitador_nombre text, sector text,
        distrito_codigo text, distrito_nombre text, equipo text, datos jsonb
    ) on commit drop;
    truncate _lote_fichero;
    insert into _lote_fichero
    select x.fila, coalesce(x.matricula, ''), coalesce(x.nombre, ''), upper(btrim(coalesce(x.visitador_nombre, ''))),
           coalesce(x.sector, ''), btrim(coalesce(x.distrito_codigo, '')), btrim(coalesce(x.distrito_nombre, '')),
           btrim(coalesce(x.equipo, '')), coalesce(x.datos, '{}'::jsonb)
    from jsonb_to_recordset(p_filas) as x(
        fila integer, matricula text, nombre text, visitador_nombre text, sector text,
        distrito_codigo text, distrito_nombre text, equipo text, datos jsonb);

    if exists (select 1 from _lote_fichero where fila is null) then
        raise exception 'El lote tiene filas sin número de fila';
    end if;

    insert into public.distritos (codigo, nombre)
    select distinct on (distrito_codigo) distrito_codigo, distrito_nombre
    from _lote_fichero where distrito_codigo <> ''
    order by distrito_codigo, fila
    on conflict (codigo) do nothing;

    insert into public.visitadores (nombre_sector, codigo_sector, distrito_id, linea)
    select distinct on (l.visitador_nombre) l.visitador_nombre, l.sector, d.id,
           case when l.equipo = any (v_otc) then 'OTC' else 'Pharmetique' end
    from _lote_fichero l
    left join public.distritos d on d.codigo = l.distrito_codigo
    where l.visitador_nombre <> ''
    order by l.visitador_nombre, l.fila
    on conflict (nombre_sector) do nothing;

    insert into public.fichero (snapshot_id, fila, matricula, nombre, visitador_nombre, visitador_id, distrito_codigo, equipo, datos)
    select p_snapshot, l.fila, l.matricula, l.nombre, l.visitador_nombre, v.id, l.distrito_codigo, l.equipo, l.datos
    from _lote_fichero l
    left join public.visitadores v on v.nombre_sector = l.visitador_nombre
    on conflict do nothing;
    get diagnostics v_insertadas = row_count;
    return v_insertadas;
end;
$$;

-- ------------------------------------------------------------
-- Filas cargadas en una versión (para confirmar que llegó todo)
-- ------------------------------------------------------------
create function public.contar_filas_snapshot(p_snapshot uuid)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
    v_tipo text;
    v_n integer;
begin
    if not public.es_admin() then
        raise exception 'Solo el administrador';
    end if;
    select tipo into v_tipo from public.data_snapshots where id = p_snapshot;
    if v_tipo = 'recetas' then
        select count(*) into v_n from public.recetas where snapshot_id = p_snapshot;
    else
        select count(*) into v_n from public.fichero where snapshot_id = p_snapshot;
    end if;
    return v_n;
end;
$$;

-- ------------------------------------------------------------
-- Comparar una versión (normalmente un borrador) contra otra
-- (normalmente la vigente). Devuelve totales y ejemplos de filas
-- nuevas, eliminadas y cambiadas.
--   recetas: se compara por médico + matrícula + mercado + producto
--   fichero: se compara por matrícula + visitador
-- ------------------------------------------------------------
create function public.comparar_snapshots(p_nuevo uuid, p_base uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
set statement_timeout = '120s'
as $$
declare
    v_tipo text;
    v_tipo_base text;
    v jsonb;
begin
    if not public.es_admin() then
        raise exception 'Solo el administrador puede comparar versiones';
    end if;
    select tipo into v_tipo from public.data_snapshots where id = p_nuevo;
    select tipo into v_tipo_base from public.data_snapshots where id = p_base;
    if v_tipo is null or v_tipo_base is null or v_tipo <> v_tipo_base then
        raise exception 'Las dos versiones deben existir y ser del mismo tipo';
    end if;

    if v_tipo = 'recetas' then
        with a as (
            select m.matricula_norm, m.nombre as medico, mk.nombre as mercado, p.producto, sum(r.rx)::bigint as rx
            from public.recetas r
            join public.cat_medicos m on m.id = r.medico_id
            join public.cat_mercados mk on mk.id = r.mercado_id
            join public.cat_productos p on p.id = r.producto_id
            where r.snapshot_id = p_nuevo group by 1, 2, 3, 4
        ), b as (
            select m.matricula_norm, m.nombre as medico, mk.nombre as mercado, p.producto, sum(r.rx)::bigint as rx
            from public.recetas r
            join public.cat_medicos m on m.id = r.medico_id
            join public.cat_mercados mk on mk.id = r.mercado_id
            join public.cat_productos p on p.id = r.producto_id
            where r.snapshot_id = p_base group by 1, 2, 3, 4
        ), j as (
            select coalesce(a.matricula_norm, b.matricula_norm) as matricula, coalesce(a.medico, b.medico) as medico,
                   coalesce(a.mercado, b.mercado) as mercado, coalesce(a.producto, b.producto) as producto,
                   a.rx as rx_nuevo, b.rx as rx_base,
                   case when b.rx is null then 'nueva' when a.rx is null then 'eliminada'
                        when a.rx <> b.rx then 'cambiada' else 'igual' end as estado
            from a full join b using (matricula_norm, medico, mercado, producto)
        )
        select jsonb_build_object(
            'tipo', 'recetas',
            'nuevas',     count(*) filter (where estado = 'nueva'),
            'eliminadas', count(*) filter (where estado = 'eliminada'),
            'cambiadas',  count(*) filter (where estado = 'cambiada'),
            'iguales',    count(*) filter (where estado = 'igual'),
            'rx_nuevo',   coalesce(sum(rx_nuevo), 0),
            'rx_base',    coalesce(sum(rx_base), 0),
            'medicos_nuevo', count(distinct matricula) filter (where rx_nuevo is not null),
            'medicos_base',  count(distinct matricula) filter (where rx_base is not null),
            'ejemplos', coalesce((
                select jsonb_agg(e) from (
                    (select to_jsonb(j2) - 'estado' || jsonb_build_object('estado', estado) as e from j j2 where estado = 'nueva' limit 20)
                    union all
                    (select to_jsonb(j3) - 'estado' || jsonb_build_object('estado', estado) from j j3 where estado = 'eliminada' limit 20)
                    union all
                    (select to_jsonb(j4) - 'estado' || jsonb_build_object('estado', estado) from j j4 where estado = 'cambiada' limit 20)
                ) t), '[]'::jsonb)
        ) into v from j;
    else
        with a as (
            select matricula_norm as matricula, visitador_nombre as visitador, min(nombre) as nombre,
                   md5(string_agg(datos::text, '|' order by fila)) as huella
            from public.fichero where snapshot_id = p_nuevo group by 1, 2
        ), b as (
            select matricula_norm as matricula, visitador_nombre as visitador, min(nombre) as nombre,
                   md5(string_agg(datos::text, '|' order by fila)) as huella
            from public.fichero where snapshot_id = p_base group by 1, 2
        ), j as (
            select coalesce(a.matricula, b.matricula) as matricula, coalesce(a.visitador, b.visitador) as visitador,
                   coalesce(a.nombre, b.nombre) as nombre,
                   case when b.huella is null then 'nueva' when a.huella is null then 'eliminada'
                        when a.huella <> b.huella then 'cambiada' else 'igual' end as estado
            from a full join b using (matricula, visitador)
        )
        select jsonb_build_object(
            'tipo', 'fichero',
            'nuevas',     count(*) filter (where estado = 'nueva'),
            'eliminadas', count(*) filter (where estado = 'eliminada'),
            'cambiadas',  count(*) filter (where estado = 'cambiada'),
            'iguales',    count(*) filter (where estado = 'igual'),
            'visitadores_nuevo', count(distinct visitador) filter (where estado <> 'eliminada'),
            'visitadores_base',  count(distinct visitador) filter (where estado <> 'nueva'),
            'ejemplos', coalesce((
                select jsonb_agg(e) from (
                    (select to_jsonb(j2) as e from j j2 where estado = 'nueva' limit 20)
                    union all
                    (select to_jsonb(j3) from j j3 where estado = 'eliminada' limit 20)
                    union all
                    (select to_jsonb(j4) from j j4 where estado = 'cambiada' limit 20)
                ) t), '[]'::jsonb)
        ) into v from j;
    end if;
    return v;
end;
$$;

-- Permisos de ejecución: solo usuarios con sesión (cada función exige admin)
revoke execute on function public.exigir_borrador_admin(uuid, text) from public, anon;
revoke execute on function public.cargar_recetas_lote(uuid, jsonb) from public, anon;
revoke execute on function public.cargar_fichero_lote(uuid, jsonb) from public, anon;
revoke execute on function public.contar_filas_snapshot(uuid) from public, anon;
revoke execute on function public.comparar_snapshots(uuid, uuid) from public, anon;
grant execute on function public.cargar_recetas_lote(uuid, jsonb) to authenticated;
grant execute on function public.cargar_fichero_lote(uuid, jsonb) to authenticated;
grant execute on function public.contar_filas_snapshot(uuid) to authenticated;
grant execute on function public.comparar_snapshots(uuid, uuid) to authenticated;

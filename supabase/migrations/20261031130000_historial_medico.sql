-- ============================================================
-- SegmentApp · Migración 10 · Historial de un médico (ficha)
-- Por cada versión PUBLICADA de recetas: sus recetas totales y de
-- La Santé, y por mercado los datos para su clasificación nacional
-- (la misma regla que usa la app: orden precalculado por versión).
-- Solo para quien puede ver a ese médico (admin y Gte. Nacional, o el
-- VM/GD que lo tiene en su fichero vigente).
-- Aditiva. Deshacer: supabase/rollback/20261031130000_deshacer_historial_medico.sql
-- ============================================================
create function public.historial_medico(p_matricula text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
    v_norm text := ltrim(split_part(btrim(coalesce(p_matricula, '')), '_', 1), '0');
    v_res jsonb;
begin
    if public.mi_rol() is null then
        raise exception 'Tu usuario no tiene permisos';
    end if;
    if v_norm = '' then
        return '[]'::jsonb;
    end if;
    if not public.ve_todo() and v_norm not in (select public.matriculas_visibles()) then
        raise exception 'Este médico no está en tu fichero';
    end if;

    with lista_phq as (
        select upper(x) as p from public.configuracion c, jsonb_array_elements_text(c.valor) as x
        where c.clave = 'productos_phq'
    ),
    versiones as (
        select s.id, s.nombre, s.fecha from public.data_snapshots s
        where s.tipo = 'recetas' and s.estado = 'publicado'
    ),
    filas as (
        select r.snapshot_id, r.mercado_id, btrim(m.matricula) as matricula, r.rx,
               exists (select 1 from lista_phq l where strpos(upper(p.producto), l.p) > 0) as es_phq
        from public.recetas r
        join public.cat_medicos m on m.id = r.medico_id
        join public.cat_productos p on p.id = r.producto_id
        where m.matricula_norm = v_norm and r.snapshot_id in (select id from versiones)
    ),
    por_mercado as (
        select o.snapshot_id, mk.nombre as mercado, o.total, o.acumulado, o.total_mercado,
               coalesce((select sum(f.rx) from filas f where f.snapshot_id = o.snapshot_id and f.mercado_id = o.mercado_id
                         and f.matricula = o.matricula and f.es_phq), 0) as phq
        from public.recetas_orden_mercado o
        join public.cat_mercados mk on mk.id = o.mercado_id
        where o.matricula_norm = v_norm and o.es_primero and o.snapshot_id in (select id from versiones)
    )
    select coalesce(jsonb_agg(jsonb_build_object(
        'id', v.id, 'nombre', v.nombre, 'fecha', v.fecha,
        'total', coalesce((select sum(f.rx) from filas f where f.snapshot_id = v.id), 0),
        'phq', coalesce((select sum(f.rx) from filas f where f.snapshot_id = v.id and f.es_phq), 0),
        'mercados', coalesce((select jsonb_agg(jsonb_build_array(pm.mercado, pm.total, pm.phq, pm.acumulado, pm.total_mercado) order by pm.total desc)
                              from por_mercado pm where pm.snapshot_id = v.id), '[]'::jsonb)
    ) order by v.fecha), '[]'::jsonb)
    into v_res
    from versiones v;
    return v_res;
end;
$$;
revoke all on function public.historial_medico(text) from public;
grant execute on function public.historial_medico(text) to authenticated;

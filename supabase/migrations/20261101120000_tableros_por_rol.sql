-- ============================================================
-- SegmentApp · Migración 11 · Tableros por rol (Fase 9B)
-- 1. evolucion_mercados(): recetas y recetas La Santé por mercado en
--    cada versión PUBLICADA (para el gráfico "mes a mes"). Admin y
--    Gte. Nacional ven todo el país; GD y VM, solo sus médicos de hoy.
-- 2. avance_distrito(): para el VM, su avance y el PROMEDIO de su
--    distrito (sin nombres de otros visitadores).
-- 3. bitacora: quién cambió la configuración (umbrales, ponderación,
--    productos) y quién publicó cada versión de datos. Solo la lee
--    el administrador; se llena sola (nadie puede escribirla a mano).
-- Aditiva: no cambia ni borra nada existente.
-- Deshacer: supabase/rollback/20261101120000_deshacer_tableros_por_rol.sql
-- ============================================================

-- ------------------------------------------------------------
-- 1. Evolución por mercado en cada versión publicada
-- ------------------------------------------------------------
-- Totales de un conjunto de filas de recetas, en el formato que usa la app
create function public._evolucion_json(p_todos boolean, p_medicos bigint[])
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
    with lista_phq as (
        select upper(x) as p from public.configuracion c, jsonb_array_elements_text(c.valor) as x
        where c.clave = 'productos_phq'
    ),
    productos as materialized (   -- cada producto se revisa una sola vez, no en cada fila
        select p.id, exists (select 1 from lista_phq l where strpos(upper(p.producto), l.p) > 0) as es_phq
        from public.cat_productos p
    ),
    versiones as (
        select s.id, s.nombre, s.fecha, s.creado_en from public.data_snapshots s
        where s.tipo = 'recetas' and s.estado = 'publicado'
    ),
    totales as (
        select r.snapshot_id, r.mercado_id, sum(r.rx) as total,
               coalesce(sum(r.rx) filter (where pr.es_phq), 0) as phq
        from public.recetas r
        join productos pr on pr.id = r.producto_id
        where r.snapshot_id in (select id from versiones)
          and (p_todos or r.medico_id = any (p_medicos))
        group by r.snapshot_id, r.mercado_id
    )
    select coalesce(jsonb_agg(jsonb_build_object(
        'id', v.id, 'nombre', v.nombre, 'fecha', v.fecha,
        'mercados', coalesce((select jsonb_agg(jsonb_build_array(mk.nombre, t.total, t.phq) order by t.total desc)
                              from totales t join public.cat_mercados mk on mk.id = t.mercado_id
                              where t.snapshot_id = v.id), '[]'::jsonb)
    ) order by v.fecha, v.creado_en), '[]'::jsonb)
    from versiones v
$$;
revoke all on function public._evolucion_json(boolean, bigint[]) from public, anon, authenticated;

create function public.evolucion_mercados()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
    v_medicos bigint[];
begin
    if public.mi_rol() is null then
        raise exception 'Tu usuario no tiene permisos';
    end if;
    -- Admin y Gte. Nacional: todo el país (sin filtro, rápido)
    if public.ve_todo() then
        return public._evolucion_json(true, null);
    end if;
    -- GD y VM: solo sus médicos de hoy
    select coalesce(array_agg(m.id), '{}') into v_medicos
    from public.cat_medicos m
    where m.matricula_norm in (select public.matriculas_visibles());
    return public._evolucion_json(false, v_medicos);
end;
$$;
revoke all on function public.evolucion_mercados() from public;
grant execute on function public.evolucion_mercados() to authenticated;

-- ------------------------------------------------------------
-- 2. Avance del VM frente al promedio de su distrito
--    "Evaluado" = el médico tiene al menos una evaluación activa del VM.
-- ------------------------------------------------------------
create function public.avance_distrito()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
    v_vis uuid := public.mi_visitador_id();
    v_distrito uuid;
    v_res jsonb;
begin
    if v_vis is null then
        return null;   -- solo tiene sentido para un VM
    end if;
    select v.distrito_id into v_distrito from public.visitadores v where v.id = v_vis;

    with fichero_hoy as (
        select distinct f.visitador_id, f.matricula_norm
        from public.fichero f
        join public.data_snapshots s on s.id = f.snapshot_id and s.es_vigente
        join public.visitadores v on v.id = f.visitador_id
        where v.activo and v.distrito_id is not distinct from v_distrito and f.matricula_norm <> ''
    ),
    por_vm as (
        select fh.visitador_id,
               count(*) as total,
               count(*) filter (where exists (
                   select 1 from public.evaluaciones e
                   where e.visitador_id = fh.visitador_id and e.matricula_norm = fh.matricula_norm and e.eliminado_en is null
               )) as evaluados
        from fichero_hoy fh
        group by fh.visitador_id
    )
    select jsonb_build_object(
        'total', coalesce((select total from por_vm where visitador_id = v_vis), 0),
        'evaluados', coalesce((select evaluados from por_vm where visitador_id = v_vis), 0),
        'promedio_pct', coalesce((select round(avg(evaluados * 100.0 / total), 1) from por_vm where total > 0), 0),
        'visitadores', (select count(*) from por_vm where total > 0)
    ) into v_res;
    return v_res;
end;
$$;
revoke all on function public.avance_distrito() from public;
grant execute on function public.avance_distrito() to authenticated;

-- ------------------------------------------------------------
-- 3. Bitácora de cambios (solo la lee el administrador)
-- ------------------------------------------------------------
create table public.bitacora (
    id         bigint generated always as identity primary key,
    hecho_en   timestamptz not null default now(),
    hecho_por  uuid references public.perfiles (id) on delete set null,
    accion     text not null,      -- 'configuracion' | 'publicar_version'
    clave      text,               -- qué configuración, o el tipo de versión
    antes      jsonb,
    despues    jsonb
);
create index bitacora_fecha_idx on public.bitacora (hecho_en desc);
alter table public.bitacora enable row level security;
revoke all on public.bitacora from anon, authenticated;
grant select on public.bitacora to authenticated;
create policy bitacora_ver on public.bitacora for select to authenticated
    using ((select public.es_admin()));

create function public.bitacora_configuracion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    if new.valor is distinct from old.valor then
        insert into public.bitacora (hecho_por, accion, clave, antes, despues)
        values (auth.uid(), 'configuracion', new.clave, old.valor, new.valor);
    end if;
    return new;
end;
$$;
create trigger configuracion_bitacora after update on public.configuracion
    for each row execute function public.bitacora_configuracion();

create function public.bitacora_versiones()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    if new.es_vigente and not old.es_vigente then
        insert into public.bitacora (hecho_por, accion, clave, despues)
        values (auth.uid(), 'publicar_version', new.tipo,
                jsonb_build_object('id', new.id, 'nombre', new.nombre, 'fecha', new.fecha));
    end if;
    return new;
end;
$$;
create trigger data_snapshots_bitacora after update on public.data_snapshots
    for each row execute function public.bitacora_versiones();

-- Lo más reciente, con el nombre de quién lo hizo
create function public.bitacora_reciente(p_limite integer default 50)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
    if not public.es_admin() then
        raise exception 'Solo el administrador';
    end if;
    return coalesce((
        select jsonb_agg(jsonb_build_object(
            'hecho_en', b.hecho_en, 'accion', b.accion, 'clave', b.clave, 'antes', b.antes, 'despues', b.despues,
            'quien', coalesce(nullif(p.nombre, ''), p.correo, 'Sistema')
        ) order by b.hecho_en desc)
        from (select * from public.bitacora order by hecho_en desc limit greatest(1, least(p_limite, 200))) b
        left join public.perfiles p on p.id = b.hecho_por
    ), '[]'::jsonb);
end;
$$;
revoke all on function public.bitacora_reciente(integer) from public;
grant execute on function public.bitacora_reciente(integer) to authenticated;

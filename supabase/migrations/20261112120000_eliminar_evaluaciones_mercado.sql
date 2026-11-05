-- ============================================================
-- SegmentApp · Migración 22 · Fase 12J
--   "Eliminar" un mercado que altera los resultados: sus evaluaciones
--   se ARCHIVAN (eliminado_en, como al eliminar una evaluación: se
--   puede deshacer). El mercado queda oculto (configuracion.mercados_ocultos).
--   Las recetas de cada versión NO se tocan (nunca se borran datos).
-- Aditiva. Deshacer: supabase/rollback/20261112120000_deshacer_eliminar_evaluaciones_mercado.sql
-- ============================================================
create table public.mercados_eliminados (
    id            bigint generated always as identity primary key,
    mercado       text not null,
    evaluaciones  uuid[] not null default '{}',   -- las que se archivaron (para deshacer)
    hecho_por     uuid default auth.uid() references public.perfiles (id),
    hecho_en      timestamptz not null default now(),
    deshecho_en   timestamptz,
    deshecho_por  uuid references public.perfiles (id)
);
alter table public.mercados_eliminados enable row level security;
revoke all on public.mercados_eliminados from anon;
grant select on public.mercados_eliminados to authenticated;
create policy mercados_eliminados_ver on public.mercados_eliminados for select to authenticated using ((select public.es_admin()));

create function public.admin_eliminar_evaluaciones_mercado(p_mercado text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
    v_ids uuid[];
    v_id bigint;
begin
    perform public._exigir_admin();
    if btrim(coalesce(p_mercado, '')) = '' then raise exception 'Falta el mercado.' using errcode = '22023'; end if;
    with archivadas as (
        update public.evaluaciones set eliminado_en = now()
         where mercado = p_mercado and eliminado_en is null
        returning id)
    select coalesce(array_agg(id), '{}') into v_ids from archivadas;
    insert into public.mercados_eliminados (mercado, evaluaciones) values (p_mercado, v_ids) returning id into v_id;
    insert into public.bitacora (hecho_por, accion, clave, despues)
    values (auth.uid(), 'eliminar_mercado', p_mercado, jsonb_build_object('evaluaciones', coalesce(array_length(v_ids, 1), 0)));
    return jsonb_build_object('ok', true, 'id', v_id, 'mercado', p_mercado, 'evaluaciones', coalesce(array_length(v_ids, 1), 0));
end;
$$;
revoke all on function public.admin_eliminar_evaluaciones_mercado(text) from public;
grant execute on function public.admin_eliminar_evaluaciones_mercado(text) to authenticated;

create function public.admin_deshacer_eliminar_mercado(p_id bigint)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
    r public.mercados_eliminados;
    v_n integer;
begin
    perform public._exigir_admin();
    select * into r from public.mercados_eliminados where id = p_id and deshecho_en is null;
    if r.id is null then raise exception 'Ese cambio no existe o ya se deshizo.' using errcode = '22023'; end if;
    -- Vuelven las que se archivaron (si el mismo médico ya tiene otra activa en ese mercado, esa no se toca)
    update public.evaluaciones e set eliminado_en = null
     where e.id = any (r.evaluaciones) and e.eliminado_en is not null
       and not exists (select 1 from public.evaluaciones o where o.visitador_id = e.visitador_id
                        and o.matricula_norm = e.matricula_norm and o.mercado = e.mercado and o.eliminado_en is null);
    get diagnostics v_n = row_count;
    update public.mercados_eliminados set deshecho_en = now(), deshecho_por = auth.uid() where id = r.id;
    insert into public.bitacora (hecho_por, accion, clave, despues)
    values (auth.uid(), 'eliminar_mercado', r.mercado, jsonb_build_object('evaluaciones', v_n, 'deshecho', true));
    return jsonb_build_object('ok', true, 'mercado', r.mercado, 'evaluaciones', v_n);
end;
$$;
revoke all on function public.admin_deshacer_eliminar_mercado(bigint) from public;
grant execute on function public.admin_deshacer_eliminar_mercado(bigint) to authenticated;

-- ============================================================
-- SegmentApp · Migración 21 · Fase 12E
--   Visitadores que tienen acceso pero NO cuentan en las métricas del
--   GD ni en las nacionales (ej. no les corresponde llenar encuestas).
--   Siguen entrando y viendo lo suyo; sus datos no se tocan.
-- Aditiva. Deshacer: supabase/rollback/20261111120000_deshacer_visitadores_fuera_de_metricas.sql
-- ============================================================
alter table public.visitadores add column if not exists en_metricas boolean not null default true;
comment on column public.visitadores.en_metricas is 'false = tiene acceso pero no cuenta en las métricas del GD ni nacionales';

create function public.admin_metricas_visitador(p_visitador text, p_en_metricas boolean)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
    v_nombre text := upper(btrim(coalesce(p_visitador, '')));
    v_antes boolean;
begin
    perform public._exigir_admin();
    select en_metricas into v_antes from public.visitadores where nombre_sector = v_nombre;
    if not found then raise exception 'No existe el visitador "%".', v_nombre using errcode = '22023'; end if;
    update public.visitadores set en_metricas = coalesce(p_en_metricas, true) where nombre_sector = v_nombre;
    if v_antes is distinct from coalesce(p_en_metricas, true) then
        insert into public.bitacora (hecho_por, accion, clave, antes, despues)
        values (auth.uid(), 'metricas_visitador', v_nombre, jsonb_build_object('en_metricas', v_antes),
                jsonb_build_object('en_metricas', coalesce(p_en_metricas, true)));
    end if;
    return jsonb_build_object('ok', true, 'visitador', v_nombre, 'en_metricas', coalesce(p_en_metricas, true));
end;
$$;
revoke all on function public.admin_metricas_visitador(text, boolean) from public;
grant execute on function public.admin_metricas_visitador(text, boolean) to authenticated;

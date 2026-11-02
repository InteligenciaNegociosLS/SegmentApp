-- ============================================================
-- SegmentApp · Migración 16 · Desactivar a un visitador lo oculta
-- Al desactivar el acceso de un VM en Ajustes → Usuarios, también se
-- marca su visitador como inactivo: la app deja de mostrar sus
-- médicos y sus números (avance, evaluaciones) en Equipo, Inicio y
-- listas. NO se borra nada: al reactivarlo, todo vuelve a aparecer.
-- Aditiva. Deshacer: supabase/rollback/20261106120000_deshacer_desactivar_oculta_visitador.sql
-- ============================================================
create or replace function public.admin_activar_usuario(p_id uuid, p_activo boolean)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
    perform public._exigir_admin();
    if p_id = auth.uid() and not p_activo then
        raise exception 'No puedes desactivar tu propio acceso.' using errcode = '22023';
    end if;
    update public.perfiles set activo = p_activo where id = p_id;
    if not found then
        raise exception 'No existe ese usuario.' using errcode = 'P0002';
    end if;
    -- Su visitador (si es VM) se oculta o vuelve a mostrarse con él
    update public.visitadores set activo = p_activo where perfil_id = p_id;
    return jsonb_build_object('ok', true, 'activo', p_activo);
end;
$$;

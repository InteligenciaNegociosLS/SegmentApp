-- Deshace la migración 16: admin_activar_usuario vuelve a cambiar solo el acceso
-- (no toca visitadores). No cambia lo que ya esté activo o inactivo.
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
    return jsonb_build_object('ok', true, 'activo', p_activo);
end;
$$;

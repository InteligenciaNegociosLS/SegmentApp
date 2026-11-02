-- ============================================================
-- SegmentApp · Migración 15 · Claves temporales para varios a la vez
-- En Ajustes → Usuarios, el administrador puede dar una CLAVE
-- TEMPORAL a todas las personas de la lista (o a las filtradas) de una
-- sola vez, y descargar o compartir sus accesos. Al entrar, la app le
-- pide a cada una crear su propia clave.
-- Todo o nada: si una falla, no cambia ninguna. Nunca la del propio admin.
-- Aditiva. Deshacer: supabase/rollback/20261105120000_deshacer_claves_temporales_masivas.sql
-- ============================================================
create function public.admin_claves_temporales(p_claves jsonb)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
    v_item  jsonb;
    v_id    uuid;
    v_clave text;
    v_n     integer := 0;
begin
    perform public._exigir_admin();
    if jsonb_typeof(p_claves) <> 'array' then
        raise exception 'Formato no válido.' using errcode = '22023';
    end if;
    for v_item in select * from jsonb_array_elements(p_claves) loop
        v_id := (v_item ->> 'id')::uuid;
        v_clave := coalesce(v_item ->> 'clave', '');
        if v_id = auth.uid() then
            raise exception 'Para tu propia clave usa "Cambiar mi clave" en el menú.' using errcode = '22023';
        end if;
        if length(v_clave) < 8 then
            raise exception 'Cada clave temporal debe tener al menos 8 caracteres.' using errcode = '22023';
        end if;
        update auth.users
           set encrypted_password = extensions.crypt(v_clave, extensions.gen_salt('bf')),
               raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || '{"clave_temporal": true}'::jsonb,
               updated_at = now()
         where id = v_id;
        if not found then
            raise exception 'No existe uno de los usuarios.' using errcode = 'P0002';
        end if;
        v_n := v_n + 1;
    end loop;
    return v_n;
end;
$$;
revoke all on function public.admin_claves_temporales(jsonb) from public;
grant execute on function public.admin_claves_temporales(jsonb) to authenticated;

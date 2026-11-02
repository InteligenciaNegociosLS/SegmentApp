-- ============================================================
-- SegmentApp · Migración 14 · Usuarios desde la app (solo admin)
-- El administrador puede, desde Ajustes → Usuarios:
--   - ver a todos (rol, visitador o distritos, si tiene clave temporal
--     pendiente y cuándo entró por última vez);
--   - cambiar el nombre y el correo con el que entra una persona;
--   - darle una CLAVE TEMPORAL nueva (al entrar, la app le pide crear
--     la suya), sin correo automático;
--   - activar o desactivar su acceso (no se borra nada).
-- Cada función revisa que quien la usa sea admin. Las claves se
-- guardan cifradas (bcrypt, igual que Supabase), nunca en texto.
-- Aditiva. Deshacer: supabase/rollback/20261104120000_deshacer_usuarios_admin.sql
-- ============================================================

-- Cifrado de claves (en Supabase ya viene instalado en el esquema "extensions")
do $$
begin
    if to_regprocedure('extensions.crypt(text,text)') is null then
        create schema if not exists extensions;
        create extension if not exists pgcrypto with schema extensions;
    end if;
end $$;

-- Detiene la función si quien la usa no es admin
create function public._exigir_admin()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
    if not public.es_admin() then
        raise exception 'Solo el administrador puede gestionar usuarios.' using errcode = '42501';
    end if;
end;
$$;
revoke all on function public._exigir_admin() from public;

-- ------------------------------------------------------------
-- Lista de usuarios
-- ------------------------------------------------------------
create function public.admin_usuarios()
returns table (
    id              uuid,
    correo          text,
    nombre          text,
    rol             public.rol_app,
    activo          boolean,
    visitador       text,
    distritos       text,
    clave_temporal  boolean,
    ultimo_ingreso  timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
    perform public._exigir_admin();
    return query
    select p.id, p.correo, p.nombre, p.rol, p.activo,
           (select v.nombre_sector from public.visitadores v where v.perfil_id = p.id limit 1),
           (select string_agg(d.nombre || ' (' || d.codigo || ')', ', ' order by d.codigo)
              from public.perfil_distritos pd join public.distritos d on d.id = pd.distrito_id
             where pd.perfil_id = p.id),
           coalesce((u.raw_user_meta_data ->> 'clave_temporal')::boolean, false),
           u.last_sign_in_at
      from public.perfiles p
      left join auth.users u on u.id = p.id
     order by case p.rol when 'admin' then 1 when 'gte_nacional' then 2 when 'gd' then 3 else 4 end, p.nombre;
end;
$$;

-- ------------------------------------------------------------
-- Cambiar nombre y correo
-- ------------------------------------------------------------
create function public.admin_editar_usuario(p_id uuid, p_nombre text, p_correo text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
    v_correo text := lower(trim(coalesce(p_correo, '')));
    v_nombre text := trim(coalesce(p_nombre, ''));
begin
    perform public._exigir_admin();
    if not exists (select 1 from public.perfiles where id = p_id) then
        raise exception 'No existe ese usuario.' using errcode = 'P0002';
    end if;
    if v_nombre = '' then
        raise exception 'Escribe el nombre.' using errcode = '22023';
    end if;
    if v_correo !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
        raise exception 'El correo no es válido.' using errcode = '22023';
    end if;
    if exists (select 1 from auth.users where lower(email) = v_correo and id <> p_id)
       or exists (select 1 from public.perfiles where correo = v_correo and id <> p_id) then
        raise exception 'Ese correo ya lo usa otra persona.' using errcode = '23505';
    end if;

    update auth.users
       set email = v_correo,
           raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('nombre', v_nombre),
           updated_at = now()
     where id = p_id;
    -- El "correo de entrada" también vive en la identidad de Supabase
    update auth.identities
       set identity_data = coalesce(identity_data, '{}'::jsonb) || jsonb_build_object('email', v_correo),
           updated_at = now()
     where user_id = p_id and provider = 'email';
    update public.perfiles set correo = v_correo, nombre = v_nombre where id = p_id;
    return jsonb_build_object('ok', true, 'correo', v_correo, 'nombre', v_nombre);
end;
$$;

-- ------------------------------------------------------------
-- Clave temporal nueva (la crea la app, aquí solo se guarda cifrada)
-- ------------------------------------------------------------
create function public.admin_clave_temporal(p_id uuid, p_clave text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
    perform public._exigir_admin();
    if p_id = auth.uid() then
        raise exception 'Para tu propia clave usa "Cambiar mi clave" en el menú.' using errcode = '22023';
    end if;
    if length(coalesce(p_clave, '')) < 8 then
        raise exception 'La clave temporal debe tener al menos 8 caracteres.' using errcode = '22023';
    end if;
    update auth.users
       set encrypted_password = extensions.crypt(p_clave, extensions.gen_salt('bf')),
           raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || '{"clave_temporal": true}'::jsonb,
           updated_at = now()
     where id = p_id;
    if not found then
        raise exception 'No existe ese usuario.' using errcode = 'P0002';
    end if;
    return jsonb_build_object('ok', true);
end;
$$;

-- ------------------------------------------------------------
-- Activar o desactivar el acceso (no borra nada)
-- ------------------------------------------------------------
create function public.admin_activar_usuario(p_id uuid, p_activo boolean)
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

revoke all on function public.admin_usuarios() from public;
revoke all on function public.admin_editar_usuario(uuid, text, text) from public;
revoke all on function public.admin_clave_temporal(uuid, text) from public;
revoke all on function public.admin_activar_usuario(uuid, boolean) from public;
grant execute on function public.admin_usuarios() to authenticated;
grant execute on function public.admin_editar_usuario(uuid, text, text) to authenticated;
grant execute on function public.admin_clave_temporal(uuid, text) to authenticated;
grant execute on function public.admin_activar_usuario(uuid, boolean) to authenticated;

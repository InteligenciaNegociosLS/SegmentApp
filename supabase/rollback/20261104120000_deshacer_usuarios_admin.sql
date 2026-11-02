-- Deshace la migración 14 (solo quita las funciones de usuarios del admin).
-- No borra usuarios ni cambia claves o correos ya guardados.
drop function if exists public.admin_activar_usuario(uuid, boolean);
drop function if exists public.admin_clave_temporal(uuid, text);
drop function if exists public.admin_editar_usuario(uuid, text, text);
drop function if exists public.admin_usuarios();
drop function if exists public._exigir_admin();

-- Deshace la migración 18. No borra usuarios creados ni archivos guardados en el almacén.
drop function if exists public.admin_pendientes_acceso();
drop function if exists public.admin_crear_usuario(text, text, text, text, text, text[]);
drop table if exists public.catalogo_versiones;
drop function if exists public.admin_guardar_clases(jsonb);
alter table public.catalogo_clases drop column if exists padre;
alter table public.catalogo_clases drop column if exists nivel;
delete from public.configuracion where clave in ('laboratorios_propios', 'productos_phq_excluidos', 'instructivos_descarga');

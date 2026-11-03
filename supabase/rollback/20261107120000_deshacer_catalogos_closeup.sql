-- Deshace la migración 17 (catálogos de CloseUp y filtros).
-- OJO: quita las tablas de catálogos con lo que tengan. Antes de usarlo,
-- descarga los catálogos desde Ajustes → Catálogos si quieres conservarlos.
drop function if exists public.admin_guardar_catalogo(text, jsonb);
drop table if exists public.catalogo_clases;
drop table if exists public.catalogo_productos;
drop table if exists public.catalogo_laboratorios;
drop table if exists public.catalogo_especialidades;
delete from public.configuracion where clave = 'filtros_closeup';

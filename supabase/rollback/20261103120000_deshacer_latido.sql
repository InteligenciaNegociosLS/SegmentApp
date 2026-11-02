-- Deshace la migración 13 (solo quita el contador del latido).
drop function if exists public.latido();
drop table if exists public.latidos;

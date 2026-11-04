-- Deshace la migración 20 (solo quita la función; no hay datos que tocar).
drop function if exists public.admin_espacio();

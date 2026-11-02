-- Deshace la migración 15 (solo quita la función; no cambia claves ya guardadas).
drop function if exists public.admin_claves_temporales(jsonb);

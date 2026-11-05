-- Deshace la migración 22. Antes, en la app, usa "Deshacer" en los mercados eliminados para
-- que sus evaluaciones vuelvan; este archivo solo quita las funciones y el registro.
drop function if exists public.admin_deshacer_eliminar_mercado(bigint);
drop function if exists public.admin_eliminar_evaluaciones_mercado(text);
drop table if exists public.mercados_eliminados;

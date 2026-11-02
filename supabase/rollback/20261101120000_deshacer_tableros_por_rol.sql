-- Deshace la migración 11 (no toca recetas, fichero ni evaluaciones).
-- Ojo: borra la bitácora de cambios (solo el registro de quién cambió qué).
drop trigger if exists configuracion_bitacora on public.configuracion;
drop trigger if exists data_snapshots_bitacora on public.data_snapshots;
drop function if exists public.bitacora_reciente(integer);
drop function if exists public.bitacora_configuracion();
drop function if exists public.bitacora_versiones();
drop table if exists public.bitacora;
drop function if exists public.avance_distrito();
drop function if exists public.evolucion_mercados();
drop function if exists public._evolucion_json(boolean, bigint[]);

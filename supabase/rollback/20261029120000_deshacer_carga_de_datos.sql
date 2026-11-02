-- Deshace la migración 6 (no borra datos de recetas, fichero ni evaluaciones).
-- Los archivos ya subidos al almacén "datos" se conservan.
drop policy if exists datos_leer on storage.objects;
drop policy if exists datos_admin_subir on storage.objects;
drop policy if exists datos_admin_reemplazar on storage.objects;
drop function if exists public.comparar_snapshots(uuid, uuid);
drop function if exists public.contar_filas_snapshot(uuid);
drop function if exists public.cargar_fichero_lote(uuid, jsonb);
drop function if exists public.cargar_recetas_lote(uuid, jsonb);
drop function if exists public.exigir_borrador_admin(uuid, text);
-- Las columnas archivo / archivo_bytes se dejan (quitar datos no es reversible).

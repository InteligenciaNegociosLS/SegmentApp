-- ============================================================
-- SegmentApp · Migración 20 · Fase 12E
--   Cuánto espacio se usa en Supabase (para no pasarse del plan):
--   tamaño de la base, de los archivos guardados (almacén) y de las
--   tablas más grandes. Solo lo ve el admin. Solo lee: no cambia nada.
-- Aditiva. Deshacer: supabase/rollback/20261110120000_deshacer_espacio_usado.sql
-- ============================================================
create function public.admin_espacio()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
    perform public._exigir_admin();
    return jsonb_build_object(
        'base_bytes', pg_database_size(current_database()),
        'archivos_bytes', coalesce((select sum(coalesce((o.metadata ->> 'size')::bigint, 0)) from storage.objects o), 0),
        'archivos', (select count(*) from storage.objects),
        'tablas', coalesce((
            select jsonb_agg(jsonb_build_object('nombre', t.relname, 'bytes', t.bytes) order by t.bytes desc)
              from (select c.relname, pg_total_relation_size(c.oid) as bytes
                      from pg_class c join pg_namespace n on n.oid = c.relnamespace
                     where n.nspname = 'public' and c.relkind = 'r'
                     order by 2 desc limit 6) t), '[]'::jsonb),
        'versiones', coalesce((
            select jsonb_agg(jsonb_build_object('nombre', s.nombre, 'tipo', s.tipo, 'filas', s.filas, 'estado', s.estado, 'es_vigente', s.es_vigente)
                             order by s.tipo, s.fecha desc)
              from public.data_snapshots s where s.estado <> 'archivado'), '[]'::jsonb));
end;
$$;
revoke all on function public.admin_espacio() from public;
grant execute on function public.admin_espacio() to authenticated;

-- Deshace la migración 7 (no borra ningún dato).
-- Vuelve a permitir que cualquier usuario con sesión lea el archivo
-- completo de una versión publicada (como en la Fase 5).
drop function if exists public.datos_equipo(uuid, uuid);
drop function if exists public.claves_columnas(text[]);
drop policy if exists datos_leer on storage.objects;
create policy datos_leer on storage.objects for select to authenticated
    using (
        bucket_id = 'datos'
        and (
            (select public.es_admin())
            or (
                (select public.mi_rol()) is not null
                and exists (select 1 from public.data_snapshots s
                            where s.archivo = storage.objects.name and s.estado = 'publicado')
            )
        )
    );

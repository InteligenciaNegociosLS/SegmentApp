-- Deshace la migración 19 (quita las funciones y el registro de renombres).
-- Los mercados que ya se renombraron se quedan con su nombre nuevo: para volver
-- al anterior, usa "Deshacer" en Ajustes → Catálogos → Renombrar mercados ANTES
-- de correr este archivo.
drop function if exists public.admin_deshacer_renombre(bigint);
drop function if exists public.admin_renombrar_mercados(jsonb);
drop function if exists public.admin_mercados_en_uso();
drop table if exists public.mercados_renombres;

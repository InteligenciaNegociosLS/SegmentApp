-- Deshace la migración 12. Solo borra la marca de "hasta dónde vi los avisos"
-- de cada persona (no toca evaluaciones, recetas ni fichero).
drop table if exists public.avisos_vistos;

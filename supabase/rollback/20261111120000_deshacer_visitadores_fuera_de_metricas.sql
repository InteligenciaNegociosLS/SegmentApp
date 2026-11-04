-- Deshace la migración 21: quita la función y la marca (todos vuelven a contar en las métricas).
drop function if exists public.admin_metricas_visitador(text, boolean);
alter table public.visitadores drop column if exists en_metricas;

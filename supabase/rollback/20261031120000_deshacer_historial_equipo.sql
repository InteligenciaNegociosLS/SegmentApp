-- Deshace la migración 9: el historial vuelve a ser solo para admin y Gerente Nacional.
drop policy if exists historial_ver_equipo on public.evaluaciones_historial;

-- Deshace la migración 5 (no borra datos: solo quita la regla)
alter table public.perfil_distritos drop constraint if exists perfil_distritos_un_gd_por_distrito;

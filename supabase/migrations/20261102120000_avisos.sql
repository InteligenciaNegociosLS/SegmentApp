-- ============================================================
-- SegmentApp · Migración 12 · Avisos (campanita) · Fase 9C
-- Guarda hasta cuándo cada persona ya vio sus avisos, para que la
-- campanita marque lo mismo en el teléfono y en la computadora.
-- Los avisos en sí se arman en la app con las evaluaciones que esa
-- persona ya puede ver (las reglas de siempre: el GD solo su distrito).
-- Cada persona solo lee y cambia SU propia fila.
-- Aditiva. Deshacer: supabase/rollback/20261102120000_deshacer_avisos.sql
-- ============================================================
create table public.avisos_vistos (
    perfil_id    uuid primary key references public.perfiles (id) on delete cascade,
    visto_hasta  timestamptz not null default now(),
    actualizado_en timestamptz not null default now()
);
create trigger avisos_vistos_actualizado before update on public.avisos_vistos
    for each row execute function public.marcar_actualizado();

alter table public.avisos_vistos enable row level security;
revoke all on public.avisos_vistos from anon, authenticated;
grant select, insert, update on public.avisos_vistos to authenticated;

create policy avisos_ver on public.avisos_vistos for select to authenticated
    using (perfil_id = (select auth.uid()));
create policy avisos_crear on public.avisos_vistos for insert to authenticated
    with check (perfil_id = (select auth.uid()) and (select public.mi_rol()) is not null);
create policy avisos_editar on public.avisos_vistos for update to authenticated
    using (perfil_id = (select auth.uid())) with check (perfil_id = (select auth.uid()));

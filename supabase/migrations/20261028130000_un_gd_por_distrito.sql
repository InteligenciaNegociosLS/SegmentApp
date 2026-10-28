-- ============================================================
-- SegmentApp · Migración 5 · Un solo GD por distrito
-- Regla del dueño: un GD puede tener varios distritos (y por lo
-- tanto varios VM), pero cada VM tiene UN solo GD. Como cada VM
-- pertenece a un distrito, basta con que cada distrito tenga un
-- solo GD asignado.
-- Aditiva. Deshacer: supabase/rollback/20261028130000_deshacer_un_gd_por_distrito.sql
-- ============================================================
alter table public.perfil_distritos
    add constraint perfil_distritos_un_gd_por_distrito unique (distrito_id);

comment on constraint perfil_distritos_un_gd_por_distrito on public.perfil_distritos
    is 'Cada distrito tiene un solo GD (así cada VM tiene un solo GD).';

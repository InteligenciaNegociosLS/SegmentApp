-- ============================================================
-- SegmentApp · Migración 13 · Latido (Supabase siempre activo)
-- El plan gratis de Supabase PAUSA un proyecto tras 7 días sin uso.
-- Un trabajo automático de GitHub (".github/workflows/latido.yml")
-- llama a latido() cada 2 días: anota la hora en una sola fila y así
-- la base nunca queda "sin uso". No toca ningún dato de la app.
-- Aditiva. Deshacer: supabase/rollback/20261103120000_deshacer_latido.sql
-- ============================================================
create table public.latidos (
    id      integer primary key default 1 check (id = 1),   -- siempre una sola fila
    ultimo  timestamptz not null default now(),
    veces   bigint not null default 0
);
alter table public.latidos enable row level security;   -- sin reglas: nadie la lee desde la app
revoke all on public.latidos from anon, authenticated;
insert into public.latidos (id) values (1) on conflict do nothing;

create function public.latido()
returns jsonb
language sql
volatile
security definer
set search_path = ''
as $$
    update public.latidos set ultimo = now(), veces = veces + 1 where id = 1
    returning jsonb_build_object('ok', true, 'hora', ultimo, 'veces', veces)
$$;
revoke all on function public.latido() from public;
grant execute on function public.latido() to anon, authenticated;

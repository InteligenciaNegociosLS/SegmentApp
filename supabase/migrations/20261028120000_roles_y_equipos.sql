-- ============================================================
-- SegmentApp · Migración 1/4 · Roles, distritos y visitadores
-- Aditiva: solo crea objetos nuevos. Deshacer: supabase/rollback/
-- ============================================================

-- Roles de la aplicación
create type public.rol_app as enum ('vm', 'gd', 'gte_nacional', 'admin');

-- ------------------------------------------------------------
-- Distritos (uno por Gerente de Distrito; código = GER_DIS del fichero)
-- Se pueden agregar, renombrar o desactivar sin cambiar código.
-- ------------------------------------------------------------
create table public.distritos (
    id            uuid primary key default gen_random_uuid(),
    codigo        text not null unique,            -- GER_DIS (ej. 100007)
    nombre        text not null,                   -- NOME_GER_DIS (ej. EI-LING LOPEZ)
    activo        boolean not null default true,
    creado_en     timestamptz not null default now(),
    actualizado_en timestamptz not null default now()
);
comment on table public.distritos is 'Distritos comerciales. Un GD puede tener uno o varios.';

-- ------------------------------------------------------------
-- Perfiles: un registro por usuario que inicia sesión (auth.users)
-- ------------------------------------------------------------
create table public.perfiles (
    id            uuid primary key references auth.users (id) on delete cascade,
    correo        text not null unique,
    nombre        text not null default '',
    rol           public.rol_app not null default 'vm',
    activo        boolean not null default false,  -- el admin lo activa
    creado_en     timestamptz not null default now(),
    actualizado_en timestamptz not null default now()
);
comment on table public.perfiles is 'Usuarios de la app con su rol. activo=false bloquea el acceso sin borrar nada.';

-- Distritos que ve cada GD (puede ser más de uno)
create table public.perfil_distritos (
    perfil_id     uuid not null references public.perfiles (id) on delete cascade,
    distrito_id   uuid not null references public.distritos (id) on delete cascade,
    primary key (perfil_id, distrito_id)
);

-- ------------------------------------------------------------
-- Visitadores (VM). nombre_sector = "Nombre del sector" del fichero,
-- que es también el nombre guardado en las evaluaciones históricas.
-- perfil_id = su usuario para entrar (puede quedar vacío).
-- ------------------------------------------------------------
create table public.visitadores (
    id            uuid primary key default gen_random_uuid(),
    nombre_sector text not null unique,
    codigo_sector text,                             -- columna "Sector" del fichero
    distrito_id   uuid references public.distritos (id),
    linea         text,                             -- OTC / Pharmetique
    perfil_id     uuid unique references public.perfiles (id) on delete set null,
    activo        boolean not null default true,
    creado_en     timestamptz not null default now(),
    actualizado_en timestamptz not null default now()
);
create index visitadores_distrito_idx on public.visitadores (distrito_id);

-- ------------------------------------------------------------
-- Al crear un usuario en Supabase Auth, se crea su perfil.
-- El rol solo lo puede fijar el admin (app_metadata), nunca el usuario.
-- Sin rol asignado queda INACTIVO hasta que el admin lo active.
-- ------------------------------------------------------------
create function public.crear_perfil_nuevo_usuario()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_rol text := new.raw_app_meta_data ->> 'rol';
begin
    insert into public.perfiles (id, correo, nombre, rol, activo)
    values (
        new.id,
        lower(coalesce(new.email, '')),
        coalesce(new.raw_app_meta_data ->> 'nombre', ''),
        coalesce(nullif(v_rol, '')::public.rol_app, 'vm'),
        v_rol is not null
    )
    on conflict (id) do nothing;
    return new;
end;
$$;

create trigger al_crear_usuario
    after insert on auth.users
    for each row execute function public.crear_perfil_nuevo_usuario();

-- Mantener actualizado_en
create function public.marcar_actualizado()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    new.actualizado_en := now();
    return new;
end;
$$;

create trigger distritos_actualizado   before update on public.distritos   for each row execute function public.marcar_actualizado();
create trigger perfiles_actualizado    before update on public.perfiles    for each row execute function public.marcar_actualizado();
create trigger visitadores_actualizado before update on public.visitadores for each row execute function public.marcar_actualizado();

-- ------------------------------------------------------------
-- Funciones de permisos (las usan las reglas por fila, RLS)
-- ------------------------------------------------------------
-- Rol del usuario actual (null si no tiene sesión o está inactivo)
create function public.mi_rol()
returns public.rol_app
language sql
stable
security definer
set search_path = ''
as $$
    select p.rol from public.perfiles p
    where p.id = auth.uid() and p.activo
$$;

create function public.es_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select coalesce(public.mi_rol() = 'admin', false)
$$;

-- Admin o Gerente Nacional: ven todo
create function public.ve_todo()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select coalesce(public.mi_rol() in ('admin', 'gte_nacional'), false)
$$;

-- Visitador vinculado al usuario actual (si es VM)
create function public.mi_visitador_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
    select v.id from public.visitadores v
    where v.perfil_id = auth.uid() and v.activo and public.mi_rol() = 'vm'
$$;

-- Visitadores que el usuario actual puede ver
create function public.visitadores_visibles()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
    select v.id from public.visitadores v
    where public.ve_todo()
       or (public.mi_rol() = 'vm' and v.id = public.mi_visitador_id())
       or (public.mi_rol() = 'gd' and v.distrito_id in (
              select pd.distrito_id from public.perfil_distritos pd
              where pd.perfil_id = auth.uid()))
$$;

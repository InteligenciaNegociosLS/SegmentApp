-- ============================================================
-- SegmentApp · Migración 2/4 · Datos con versiones (snapshots)
-- Fichero médico y recetas CloseUp. Cada carga es una versión
-- nueva; solo una por tipo es la "vigente" (la que se ve en "Hoy").
-- Aditiva: solo crea objetos nuevos. Deshacer: supabase/rollback/
-- ============================================================

create table public.data_snapshots (
    id            uuid primary key default gen_random_uuid(),
    nombre        text not null,                    -- ej. "Datos enero"
    tipo          text not null check (tipo in ('fichero', 'recetas')),
    fecha         date not null,                    -- fecha de corte de los datos
    estado        text not null default 'borrador'
                  check (estado in ('borrador', 'publicado', 'archivado')),
    es_vigente    boolean not null default false,
    columnas      text[],                           -- encabezados originales, en orden
    filas         integer not null default 0,
    notas         text,
    creado_por    uuid references public.perfiles (id),
    creado_en     timestamptz not null default now(),
    publicado_por uuid references public.perfiles (id),
    publicado_en  timestamptz,
    constraint vigente_solo_publicado check (not es_vigente or estado = 'publicado')
);
-- Solo UNA versión vigente por tipo
create unique index data_snapshots_un_vigente on public.data_snapshots (tipo) where es_vigente;
comment on table public.data_snapshots is 'Versiones de datos. "Hoy" = la vigente; las demás se pueden consultar.';

-- ------------------------------------------------------------
-- Catálogos compartidos entre versiones (ahorran espacio).
-- Guardan cada combinación EXACTA tal como vino en el archivo,
-- así no se pierde ni se "corrige" ningún dato.
-- ------------------------------------------------------------
create table public.cat_medicos (
    id             bigint generated always as identity primary key,
    matricula      text not null,
    matricula_norm text generated always as (ltrim(split_part(btrim(matricula), '_', 1), '0')) stored,
    nombre         text not null,
    medico_unico   text not null default '',
    domicilio      text not null default '',
    cod_postal     text not null default '',
    localidad      text not null default '',
    region         text not null default '',
    especialidad   text not null default '',
    unique (matricula, nombre, medico_unico, domicilio, cod_postal, localidad, region, especialidad)
);
create index cat_medicos_matricula_idx on public.cat_medicos (matricula_norm);

create table public.cat_productos (
    id                bigint generated always as identity primary key,
    producto          text not null,
    molecula          text not null default '',
    clase_terapeutica text not null default '',
    generico          text not null default '',
    laboratorio       text not null default '',
    unique (producto, molecula, clase_terapeutica, generico, laboratorio)
);

create table public.cat_mercados (
    id      bigint generated always as identity primary key,
    nombre  text not null unique
);

-- ------------------------------------------------------------
-- Recetas CloseUp: una fila por fila del archivo original
-- ------------------------------------------------------------
create table public.recetas (
    snapshot_id  uuid not null references public.data_snapshots (id),
    fila         integer not null,                  -- n.º de fila en el archivo (orden original)
    medico_id    bigint not null references public.cat_medicos (id),
    mercado_id   bigint not null references public.cat_mercados (id),
    producto_id  bigint not null references public.cat_productos (id),
    rx           integer not null check (rx >= 0),
    primary key (snapshot_id, fila)
);
create index recetas_medico_idx  on public.recetas (snapshot_id, medico_id);
create index recetas_mercado_idx on public.recetas (snapshot_id, mercado_id);

-- ------------------------------------------------------------
-- Fichero médico: columnas clave + TODAS las columnas originales en
-- "datos" (los VM necesitan toda la información del médico).
-- Encabezados repetidos se guardan como "Nombre (2)".
-- ------------------------------------------------------------
create table public.fichero (
    snapshot_id      uuid not null references public.data_snapshots (id),
    fila             integer not null,
    matricula        text not null default '',
    matricula_norm   text generated always as (ltrim(split_part(btrim(matricula), '_', 1), '0')) stored,
    nombre           text not null default '',
    visitador_nombre text not null default '',      -- "Nombre del sector"
    visitador_id     uuid references public.visitadores (id),
    distrito_codigo  text not null default '',      -- GER_DIS
    equipo           text not null default '',
    datos            jsonb not null,
    primary key (snapshot_id, fila)
);
create index fichero_visitador_idx on public.fichero (snapshot_id, visitador_id);
create index fichero_matricula_idx on public.fichero (snapshot_id, matricula_norm);

-- ------------------------------------------------------------
-- Vista plana de recetas (igual al archivo original)
-- security_invoker: respeta los permisos de quien consulta
-- ------------------------------------------------------------
create view public.v_recetas
with (security_invoker = true) as
select r.snapshot_id, r.fila,
       m.nombre as medico, m.matricula, m.matricula_norm, mk.nombre as mercado,
       p.producto, r.rx, m.medico_unico, m.domicilio, m.cod_postal, m.localidad,
       m.region, m.especialidad, p.molecula, p.clase_terapeutica, p.generico, p.laboratorio
from public.recetas r
join public.cat_medicos  m  on m.id  = r.medico_id
join public.cat_mercados mk on mk.id = r.mercado_id
join public.cat_productos p on p.id  = r.producto_id;

-- ------------------------------------------------------------
-- Matrículas que el usuario actual puede ver (según el fichero vigente)
-- ------------------------------------------------------------
create function public.matriculas_visibles()
returns setof text
language sql
stable
security definer
set search_path = ''
as $$
    select distinct f.matricula_norm
    from public.fichero f
    join public.data_snapshots s on s.id = f.snapshot_id and s.es_vigente
    where f.visitador_id in (select public.visitadores_visibles())
$$;

-- ------------------------------------------------------------
-- Publicar una versión (o volver a una anterior). Solo admin.
-- No borra nada: la versión que deja de ser vigente sigue consultable.
-- ------------------------------------------------------------
create function public.publicar_snapshot(p_snapshot_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_tipo text;
begin
    if not public.es_admin() then
        raise exception 'Solo el administrador puede publicar versiones';
    end if;
    select tipo into v_tipo from public.data_snapshots where id = p_snapshot_id and estado <> 'archivado';
    if v_tipo is null then
        raise exception 'La versión no existe o está archivada';
    end if;
    update public.data_snapshots set es_vigente = false where tipo = v_tipo and es_vigente;
    update public.data_snapshots
       set es_vigente = true, estado = 'publicado',
           publicado_por = coalesce(publicado_por, auth.uid()),
           publicado_en  = coalesce(publicado_en, now())
     where id = p_snapshot_id;
end;
$$;

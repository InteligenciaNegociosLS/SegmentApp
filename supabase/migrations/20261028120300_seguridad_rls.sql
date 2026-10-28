-- ============================================================
-- SegmentApp · Migración 4/4 · Seguridad por fila (RLS)
--
--   vm            → ve y edita SOLO lo suyo
--   gd            → ve SOLO los VM de su(s) distrito(s); no edita
--   gte_nacional  → ve TODO; no edita ni elimina
--   admin         → ve y edita todo (eliminar = marcar, nunca borrar)
--   sin sesión    → no ve nada (solo puede reportar fallas)
--
-- Nadie puede borrar filas desde la app: no hay ninguna regla DELETE.
-- ============================================================

-- Encender RLS en todas las tablas
alter table public.distritos              enable row level security;
alter table public.perfiles               enable row level security;
alter table public.perfil_distritos       enable row level security;
alter table public.visitadores            enable row level security;
alter table public.data_snapshots         enable row level security;
alter table public.cat_medicos            enable row level security;
alter table public.cat_productos          enable row level security;
alter table public.cat_mercados           enable row level security;
alter table public.recetas                enable row level security;
alter table public.fichero                enable row level security;
alter table public.evaluaciones           enable row level security;
alter table public.evaluaciones_historial enable row level security;
alter table public.configuracion          enable row level security;
alter table public.app_errores            enable row level security;

-- Permisos base: anónimos fuera de todo (salvo reportar fallas)
revoke all on all tables in schema public from anon;
revoke all on all tables in schema public from authenticated;
grant select on all tables in schema public to authenticated;
grant insert, update on public.distritos, public.perfiles, public.perfil_distritos, public.visitadores,
                       public.data_snapshots, public.cat_medicos, public.cat_productos, public.cat_mercados,
                       public.recetas, public.fichero, public.evaluaciones, public.configuracion
      to authenticated;
grant insert on public.app_errores to anon, authenticated;
revoke execute on all functions in schema public from anon;

-- ---------------- Distritos ----------------
create policy distritos_ver on public.distritos for select to authenticated
    using ((select public.mi_rol()) is not null);
create policy distritos_admin_crear on public.distritos for insert to authenticated
    with check ((select public.es_admin()));
create policy distritos_admin_editar on public.distritos for update to authenticated
    using ((select public.es_admin())) with check ((select public.es_admin()));

-- ---------------- Perfiles ----------------
-- Cada uno ve el suyo; admin y Gte. Nacional ven todos;
-- el GD ve los perfiles de los VM de su distrito.
create policy perfiles_ver on public.perfiles for select to authenticated
    using (
        id = (select auth.uid())
        or (select public.ve_todo())
        or id in (select v.perfil_id from public.visitadores v
                  where v.id in (select public.visitadores_visibles()))
    );
create policy perfiles_admin_crear on public.perfiles for insert to authenticated
    with check ((select public.es_admin()));
create policy perfiles_admin_editar on public.perfiles for update to authenticated
    using ((select public.es_admin())) with check ((select public.es_admin()));

create policy perfil_distritos_ver on public.perfil_distritos for select to authenticated
    using (perfil_id = (select auth.uid()) or (select public.ve_todo()));
create policy perfil_distritos_admin_crear on public.perfil_distritos for insert to authenticated
    with check ((select public.es_admin()));
create policy perfil_distritos_admin_editar on public.perfil_distritos for update to authenticated
    using ((select public.es_admin())) with check ((select public.es_admin()));

-- ---------------- Visitadores ----------------
create policy visitadores_ver on public.visitadores for select to authenticated
    using (id in (select public.visitadores_visibles()));
create policy visitadores_admin_crear on public.visitadores for insert to authenticated
    with check ((select public.es_admin()));
create policy visitadores_admin_editar on public.visitadores for update to authenticated
    using ((select public.es_admin())) with check ((select public.es_admin()));

-- ---------------- Versiones de datos ----------------
-- Todos ven las publicadas; los borradores solo el admin.
create policy snapshots_ver on public.data_snapshots for select to authenticated
    using ((select public.es_admin()) or ((select public.mi_rol()) is not null and estado = 'publicado'));
create policy snapshots_admin_crear on public.data_snapshots for insert to authenticated
    with check ((select public.es_admin()) and not es_vigente);
create policy snapshots_admin_editar on public.data_snapshots for update to authenticated
    using ((select public.es_admin())) with check ((select public.es_admin()));

-- ---------------- Catálogos ----------------
create policy productos_ver on public.cat_productos for select to authenticated
    using ((select public.mi_rol()) is not null);
create policy mercados_ver on public.cat_mercados for select to authenticated
    using ((select public.mi_rol()) is not null);
create policy medicos_ver on public.cat_medicos for select to authenticated
    using ((select public.ve_todo()) or matricula_norm in (select public.matriculas_visibles()));
create policy productos_admin_crear on public.cat_productos for insert to authenticated with check ((select public.es_admin()));
create policy mercados_admin_crear  on public.cat_mercados  for insert to authenticated with check ((select public.es_admin()));
create policy medicos_admin_crear   on public.cat_medicos   for insert to authenticated with check ((select public.es_admin()));

-- ---------------- Recetas ----------------
-- Admin / Gte. Nacional: todas. GD y VM: solo las de sus médicos.
-- (Los totales de mercado se calcularán en el servidor, Fase 7.)
create policy recetas_ver on public.recetas for select to authenticated
    using (
        (select public.es_admin())
        or (
            snapshot_id in (select s.id from public.data_snapshots s where s.estado = 'publicado')
            and (
                (select public.ve_todo())
                or medico_id in (select m.id from public.cat_medicos m
                                 where m.matricula_norm in (select public.matriculas_visibles()))
            )
        )
    );
create policy recetas_admin_crear on public.recetas for insert to authenticated
    with check ((select public.es_admin()));

-- ---------------- Fichero ----------------
create policy fichero_ver on public.fichero for select to authenticated
    using (
        (select public.es_admin())
        or (
            snapshot_id in (select s.id from public.data_snapshots s where s.estado = 'publicado')
            and ((select public.ve_todo()) or visitador_id in (select public.visitadores_visibles()))
        )
    );
create policy fichero_admin_crear on public.fichero for insert to authenticated
    with check ((select public.es_admin()));
create policy fichero_admin_editar on public.fichero for update to authenticated
    using ((select public.es_admin())) with check ((select public.es_admin()));

-- ---------------- Evaluaciones ----------------
create policy evaluaciones_ver on public.evaluaciones for select to authenticated
    using (
        visitador_id in (select public.visitadores_visibles())
        and (eliminado_en is null or (select public.ve_todo()))
    );
-- Crear: el VM solo a su nombre; el admin para cualquiera
create policy evaluaciones_crear on public.evaluaciones for insert to authenticated
    with check (
        (select public.es_admin())
        or (visitador_id = (select public.mi_visitador_id()) and eliminado_en is null)
    );
-- Editar: el VM solo las suyas y sin poder "eliminarlas"; el admin todas
create policy evaluaciones_editar on public.evaluaciones for update to authenticated
    using (
        (select public.es_admin())
        or (visitador_id = (select public.mi_visitador_id()) and eliminado_en is null)
    )
    with check (
        (select public.es_admin())
        or (visitador_id = (select public.mi_visitador_id()) and eliminado_en is null)
    );

create policy historial_ver on public.evaluaciones_historial for select to authenticated
    using ((select public.ve_todo()));

-- ---------------- Configuración ----------------
create policy configuracion_ver on public.configuracion for select to authenticated
    using ((select public.mi_rol()) is not null);
create policy configuracion_admin_crear on public.configuracion for insert to authenticated
    with check ((select public.es_admin()));
create policy configuracion_admin_editar on public.configuracion for update to authenticated
    using ((select public.es_admin())) with check ((select public.es_admin()));

-- ---------------- Registro de fallas ----------------
-- Cualquiera puede reportar (incluso antes de iniciar sesión);
-- solo el admin y el Gte. Nacional pueden leerlas.
create policy errores_reportar on public.app_errores for insert to anon, authenticated
    with check (true);
create policy errores_ver on public.app_errores for select to authenticated
    using ((select public.ve_todo()));

-- Publicar versiones: solo usuarios con sesión (y la función exige admin)
revoke execute on function public.publicar_snapshot(uuid) from public, anon;
grant execute on function public.publicar_snapshot(uuid) to authenticated;

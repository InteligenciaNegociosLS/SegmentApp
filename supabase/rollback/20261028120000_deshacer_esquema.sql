-- ============================================================
-- SegmentApp · DESHACER las migraciones de la Fase 3
--
-- ⚠️ SOLO para el Supabase de PRUEBAS, o en producción ANTES de
--    cargar datos. Si ya hay datos, esto los BORRA: en ese caso
--    primero se exporta todo (Fase 4) y se decide con el dueño.
-- Orden inverso a la creación.
-- ============================================================
begin;

drop trigger if exists al_crear_usuario on auth.users;

drop table if exists public.app_errores;
drop table if exists public.configuracion;
drop table if exists public.evaluaciones_historial;
drop table if exists public.evaluaciones;
drop view  if exists public.v_recetas;
drop table if exists public.fichero;
drop table if exists public.recetas;
drop table if exists public.cat_mercados;
drop table if exists public.cat_productos;
drop table if exists public.cat_medicos;
drop table if exists public.data_snapshots;
drop table if exists public.visitadores;
drop table if exists public.perfil_distritos;
drop table if exists public.perfiles;
drop table if exists public.distritos;

drop function if exists public.publicar_snapshot(uuid);
drop function if exists public.matriculas_visibles();
drop function if exists public.visitadores_visibles();
drop function if exists public.mi_visitador_id();
drop function if exists public.ve_todo();
drop function if exists public.es_admin();
drop function if exists public.mi_rol();
drop function if exists public.evaluaciones_auditar();
drop function if exists public.marcar_actualizado();
drop function if exists public.crear_perfil_nuevo_usuario();
drop type if exists public.rol_app;

commit;

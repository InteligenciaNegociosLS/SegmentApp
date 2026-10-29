-- ============================================================
-- SegmentApp · Migración 9 · Historial de evaluaciones para el equipo
-- Hasta ahora solo el admin y el Gerente Nacional podían ver las
-- versiones anteriores de una evaluación. Ahora cada VM ve el historial
-- de SUS evaluaciones y cada GD el de su distrito (para mostrar
-- "evaluación anterior" y la evolución de la clasificación).
-- Aditiva (solo agrega una regla de lectura). Deshacer:
-- supabase/rollback/20261031120000_deshacer_historial_equipo.sql
-- ============================================================
create policy historial_ver_equipo on public.evaluaciones_historial for select to authenticated
    using (
        evaluacion_id in (
            select e.id from public.evaluaciones e
            where e.visitador_id in (select public.visitadores_visibles())
        )
    );

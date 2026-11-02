/* ============================================================
   SegmentApp · Migración · Preparar las versiones de recetas
   Calcula el orden nacional de cada mercado (migración 8) para las
   versiones que todavía no lo tienen. Sin esto, el VM y el GD ven
   "La versión aún no está preparada". En la app lo hace el admin al
   publicar; aquí es para los datos importados con los scripts.
   Solo agrega filas en recetas_orden_mercado: no cambia ningún dato.
============================================================ */
export async function prepararVersiones({ db, simulacro = false, log = console.log }) {
    const versiones = (await db.query(`select id, nombre from public.data_snapshots
        where tipo = 'recetas' and not orden_listo order by fecha, creado_en`)).rows;
    if (!versiones.length) { log('Todas las versiones de recetas ya están preparadas.'); return []; }
    const hechas = [];
    for (const v of versiones) {
        const pendientes = (await db.query(`select distinct r.mercado_id from public.recetas r
            where r.snapshot_id = $1 and not exists (select 1 from public.recetas_orden_mercado o
                where o.snapshot_id = r.snapshot_id and o.mercado_id = r.mercado_id) order by 1`, [v.id])).rows.map(r => r.mercado_id);
        log(`   • ${v.nombre}: ${pendientes.length} mercado(s) por preparar`);
        if (simulacro) continue;
        for (const m of pendientes) await db.query('select public._calcular_orden_mercado($1, $2)', [v.id, m]);
        await db.query('update public.data_snapshots set orden_listo = true where id = $1', [v.id]);
        hechas.push(v.nombre);
    }
    return hechas;
}

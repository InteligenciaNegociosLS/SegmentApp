/* ============================================================
   SegmentApp · Migración · Importación a Supabase (lógica)
   Recibe una conexión "db" con db.query(sql, parametros) → { rows }
   (sirve igual para Supabase real y para el Postgres de pruebas).

   Pasos (cada uno en su propia transacción: o entra completo o nada):
     1. Distritos y visitadores (desde el fichero)
     2. Versión "Datos enero" del FICHERO
     3. Versión "Datos enero" de las RECETAS
     4. Publicar ambas versiones como vigentes (si no hay otra vigente)
     5. Evaluaciones de Firebase
   Es seguro repetirlo: lo que ya existe no se duplica ni se cambia.
   En modo simulacro todo se hace dentro de una transacción que al
   final se DESHACE: se validan los datos sin dejar nada guardado.
============================================================ */
import path from 'node:path';
import {
    leerCsvGz, prepararFichero, prepararRecetas, resolverDuplicados,
    claveMedico, claveProducto, SEP
} from './transformar.mjs';

export const NOMBRE_VERSION = 'Datos enero';
export const FECHA_VERSION = '2026-01-31';

/* ---------- Inserción por lotes ---------- */
export async function insertarLotes(db, tabla, columnas, filas, { sufijo = '', tamano } = {}) {
    if (filas.length === 0) return 0;
    const porLote = tamano || Math.max(1, Math.floor(30000 / columnas.length));
    let total = 0;
    for (let i = 0; i < filas.length; i += porLote) {
        const lote = filas.slice(i, i + porLote);
        const params = [];
        const valores = lote.map(fila => '(' + fila.map(v => { params.push(v); return '$' + params.length; }).join(',') + ')');
        const r = await db.query(`insert into ${tabla} (${columnas.join(',')}) values ${valores.join(',')} ${sufijo}`, params);
        total += r.affectedRows ?? r.rowCount ?? lote.length;
    }
    return total;
}

async function enTransaccion(db, simulacro, fn) {
    if (simulacro) return fn();             // el simulacro ya está dentro de una transacción
    await db.query('begin');
    try {
        const r = await fn();
        await db.query('commit');
        return r;
    } catch (e) {
        await db.query('rollback');
        throw e;
    }
}

async function versionExistente(db, tipo) {
    const r = await db.query('select id, filas from public.data_snapshots where nombre = $1 and tipo = $2', [NOMBRE_VERSION, tipo]);
    return r.rows[0] || null;
}

/* ---------- Paso 1 y 2: fichero ---------- */
async function importarFichero(db, archivo, log) {
    const cfg = await db.query(`select valor from public.configuracion where clave = 'equipos_otc'`);
    const equiposOtc = cfg.rows[0] ? cfg.rows[0].valor : ['7'];
    const csv = leerCsvGz(archivo);
    const { distritos, visitadores, filasFichero, avisos } = prepararFichero(csv, equiposOtc);
    avisos.forEach(a => log('  ⚠️  ' + a));

    const nd = await insertarLotes(db, 'public.distritos', ['codigo', 'nombre'],
        [...distritos].map(([codigo, nombre]) => [codigo, nombre]), { sufijo: 'on conflict (codigo) do nothing' });
    const mapaDistritos = new Map((await db.query('select id, codigo from public.distritos')).rows.map(r => [r.codigo, r.id]));
    const nv = await insertarLotes(db, 'public.visitadores', ['nombre_sector', 'codigo_sector', 'distrito_id', 'linea'],
        [...visitadores].map(([nombre, v]) => [nombre, v.codigo_sector, mapaDistritos.get(v.distrito_codigo) || null, v.linea]),
        { sufijo: 'on conflict (nombre_sector) do nothing' });
    log(`  Distritos nuevos: ${nd} (del fichero: ${distritos.size}) · Visitadores nuevos: ${nv} (del fichero: ${visitadores.size})`);

    const existente = await versionExistente(db, 'fichero');
    if (existente) {
        log(`  La versión "${NOMBRE_VERSION}" del fichero ya existe (${existente.filas} filas): no se vuelve a cargar.`);
        return { id: existente.id, filas: Number(existente.filas), nueva: false };
    }
    const mapaVis = new Map((await db.query('select id, nombre_sector from public.visitadores')).rows.map(r => [r.nombre_sector, r.id]));
    const snap = (await db.query(
        `insert into public.data_snapshots (nombre, tipo, fecha, columnas, filas, notas)
         values ($1, 'fichero', $2, $3, $4, 'Migrado desde fichero_medico.csv.gz') returning id`,
        [NOMBRE_VERSION, FECHA_VERSION, csv.encabezados, filasFichero.length])).rows[0].id;
    await insertarLotes(db, 'public.fichero',
        ['snapshot_id', 'fila', 'matricula', 'nombre', 'visitador_nombre', 'visitador_id', 'distrito_codigo', 'equipo', 'datos'],
        filasFichero.map(f => [snap, f.fila, f.matricula, f.nombre, f.visitador_nombre, mapaVis.get(f.visitador_nombre) || null,
            f.distrito_codigo, f.equipo, JSON.stringify(f.datos)]), { tamano: 500 });
    log(`  Fichero: ${filasFichero.length} filas cargadas.`);
    return { id: snap, filas: filasFichero.length, nueva: true };
}

/* ---------- Paso 3: recetas ---------- */
async function importarRecetas(db, archivo, log) {
    const existente = await versionExistente(db, 'recetas');
    if (existente) {
        log(`  La versión "${NOMBRE_VERSION}" de recetas ya existe (${existente.filas} filas): no se vuelve a cargar.`);
        return { id: existente.id, filas: Number(existente.filas), nueva: false };
    }
    const csv = leerCsvGz(archivo);
    const prep = prepararRecetas(csv);
    if (prep.errores.length) throw new Error('El archivo de recetas tiene errores:\n' + prep.errores.slice(0, 20).join('\n'));

    await insertarLotes(db, 'public.cat_medicos',
        ['matricula', 'nombre', 'medico_unico', 'domicilio', 'cod_postal', 'localidad', 'region', 'especialidad'],
        prep.medicos.map(k => k.split(SEP)), { sufijo: 'on conflict do nothing' });
    await insertarLotes(db, 'public.cat_productos', ['producto', 'molecula', 'clase_terapeutica', 'generico', 'laboratorio'],
        prep.productos.map(k => k.split(SEP)), { sufijo: 'on conflict do nothing' });
    await insertarLotes(db, 'public.cat_mercados', ['nombre'], prep.mercados.map(m => [m]), { sufijo: 'on conflict do nothing' });

    const idMed = new Map((await db.query(
        'select id, matricula, nombre, medico_unico, domicilio, cod_postal, localidad, region, especialidad from public.cat_medicos')).rows
        .map(r => [[r.matricula, r.nombre, r.medico_unico, r.domicilio, r.cod_postal, r.localidad, r.region, r.especialidad].join(SEP), r.id]));
    const idProd = new Map((await db.query(
        'select id, producto, molecula, clase_terapeutica, generico, laboratorio from public.cat_productos')).rows
        .map(r => [[r.producto, r.molecula, r.clase_terapeutica, r.generico, r.laboratorio].join(SEP), r.id]));
    const idMk = new Map((await db.query('select id, nombre from public.cat_mercados')).rows.map(r => [r.nombre, r.id]));

    const snap = (await db.query(
        `insert into public.data_snapshots (nombre, tipo, fecha, columnas, filas, notas)
         values ($1, 'recetas', $2, $3, $4, 'Migrado desde datacloseup.csv.gz') returning id`,
        [NOMBRE_VERSION, FECHA_VERSION, csv.encabezados, csv.filas.length])).rows[0].id;
    await insertarLotes(db, 'public.recetas', ['snapshot_id', 'fila', 'medico_id', 'mercado_id', 'producto_id', 'rx'],
        csv.filas.map((r, i) => [snap, i + 1, idMed.get(claveMedico(r)), idMk.get(r[2]), idProd.get(claveProducto(r)), parseInt(r[4], 10)]),
        { tamano: 5000 });
    log(`  Recetas: ${csv.filas.length} filas · ${prep.medicos.length} médicos · ${prep.productos.length} productos · ${prep.mercados.length} mercados.`);
    return { id: snap, filas: csv.filas.length, nueva: true };
}

/* ---------- Paso 4: publicar ---------- */
async function publicarSiNoHayVigente(db, snapId, tipo, log) {
    const vig = await db.query('select nombre from public.data_snapshots where tipo = $1 and es_vigente', [tipo]);
    if (vig.rows.length) {
        log(`  Ya hay una versión vigente de ${tipo} ("${vig.rows[0].nombre}"): no se cambia.`);
        return;
    }
    await db.query(`update public.data_snapshots set estado = 'publicado', es_vigente = true, publicado_en = now() where id = $1`, [snapId]);
    log(`  "${NOMBRE_VERSION}" de ${tipo} publicada como vigente ("Hoy").`);
}

/* ---------- Paso 5: evaluaciones ---------- */
async function importarEvaluaciones(db, exportacion, log) {
    const { evaluaciones, duplicadas } = resolverDuplicados(exportacion.evaluaciones);
    // Visitadores que evaluaron pero ya no están en el fichero: se crean INACTIVOS (no se pierde su historial)
    const conocidos = new Set((await db.query('select nombre_sector from public.visitadores')).rows.map(r => r.nombre_sector));
    const faltantes = [...new Set(evaluaciones.map(e => e.visitador_nombre))].filter(n => n && !conocidos.has(n));
    if (faltantes.length) {
        await insertarLotes(db, 'public.visitadores', ['nombre_sector', 'activo'], faltantes.map(n => [n, false]),
            { sufijo: 'on conflict (nombre_sector) do nothing' });
        log(`  ⚠️  ${faltantes.length} visitador(es) con evaluaciones que no están en el fichero; se crearon inactivos: ${faltantes.join(', ')}`);
    }
    const sinVisitador = evaluaciones.filter(e => !e.visitador_nombre);
    if (sinVisitador.length) throw new Error(`${sinVisitador.length} evaluación(es) sin visitador: ${sinVisitador.map(e => e.firebase_id).join(', ')}`);

    const mapaVis = new Map((await db.query('select id, nombre_sector from public.visitadores')).rows.map(r => [r.nombre_sector, r.id]));
    // Primero las activas, luego las duplicadas (marcadas como eliminadas)
    const orden = [...evaluaciones.filter(e => !e.eliminada), ...evaluaciones.filter(e => e.eliminada)];
    const columnas = ['firebase_id', 'visitador_id', 'matricula', 'medico_nombre', 'mercado', 'cuadrante', 'notas',
        'q1_pacientes_semana', 'q2_pacientes_patologia', 'q3_pacientes_producto', 'q4_otros_productos', 'q5_costo_consulta',
        'cruce_errado', 'nombre_fichero', 'rol_autor', 'origen_timestamp', 'creado_en', 'actualizado_en', 'eliminado_en'];
    const ahora = new Date().toISOString();
    const nuevas = await insertarLotes(db, 'public.evaluaciones', columnas, orden.map(e => [
        e.firebase_id, mapaVis.get(e.visitador_nombre), e.matricula, e.medico_nombre, e.mercado, e.cuadrante, e.notas,
        e.q1_pacientes_semana, e.q2_pacientes_patologia, e.q3_pacientes_producto, e.q4_otros_productos, e.q5_costo_consulta,
        e.cruce_errado, e.nombre_fichero, e.rol_autor, e.origen_timestamp,
        e.creado_en || ahora, e.creado_en || ahora, e.eliminada ? ahora : null
    ]), { sufijo: 'on conflict do nothing', tamano: 500 });
    log(`  Evaluaciones: ${evaluaciones.length} en Firebase · ${nuevas} nuevas en Supabase` +
        (duplicadas.length ? ` · ${duplicadas.length} duplicada(s) guardada(s) como eliminadas` : ''));
    return { total: evaluaciones.length, nuevas, duplicadas, faltantes };
}

/* ============================================================
   IMPORTACIÓN COMPLETA
============================================================ */
export async function importar({ db, raiz, exportacion, simulacro = false, log = console.log }) {
    const archivoFichero = path.join(raiz, 'fichero_medico.csv.gz');
    const archivoRecetas = path.join(raiz, 'datacloseup.csv.gz');
    const resumen = {};
    if (simulacro) await db.query('begin');
    try {
        log('\n1-2. Distritos, visitadores y fichero');
        resumen.fichero = await enTransaccion(db, simulacro, () => importarFichero(db, archivoFichero, log));
        log('\n3. Recetas');
        resumen.recetas = await enTransaccion(db, simulacro, () => importarRecetas(db, archivoRecetas, log));
        log('\n4. Publicar versiones');
        await enTransaccion(db, simulacro, async () => {
            await publicarSiNoHayVigente(db, resumen.fichero.id, 'fichero', log);
            await publicarSiNoHayVigente(db, resumen.recetas.id, 'recetas', log);
        });
        log('\n5. Evaluaciones');
        resumen.evaluaciones = await enTransaccion(db, simulacro, () => importarEvaluaciones(db, exportacion, log));
    } finally {
        if (simulacro) {
            await db.query('rollback');
            log('\n🔎 SIMULACRO: todo se deshizo; no quedó nada guardado.');
        }
    }
    return resumen;
}

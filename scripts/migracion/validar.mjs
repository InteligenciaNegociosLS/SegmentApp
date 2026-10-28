/* ============================================================
   SegmentApp · Migración · Validación (solo lectura)
   Compara lo que hay en Supabase contra:
     - la exportación de Firebase (evaluaciones)
     - los archivos originales .csv.gz (fichero y recetas)
   y arma el informe docs/VALIDACION.md.
============================================================ */
import path from 'node:path';
import { leerCsvGz, clavesUnicas, normalizarVisitador, resolverDuplicados } from './transformar.mjs';
import { NOMBRE_VERSION } from './importar.mjs';

const CAMPOS_EVAL = ['visitador_nombre', 'matricula', 'medico_nombre', 'mercado', 'cuadrante', 'notas',
    'q1_pacientes_semana', 'q2_pacientes_patologia', 'q3_pacientes_producto', 'q4_otros_productos',
    'q5_costo_consulta', 'cruce_errado', 'nombre_fichero', 'origen_timestamp'];

// Muestra aleatoria reproducible (misma semilla = misma muestra)
function muestraAleatoria(lista, n, semilla = 20261028) {
    let s = semilla;
    const azar = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
    const copia = [...lista];
    for (let i = copia.length - 1; i > 0; i--) {
        const j = Math.floor(azar() * (i + 1));
        [copia[i], copia[j]] = [copia[j], copia[i]];
    }
    return copia.slice(0, n);
}

export async function validar({ db, raiz, exportacion }) {
    const chequeos = [];
    const agregar = (grupo, nombre, ok, detalle = '') => chequeos.push({ grupo, nombre, ok, detalle });
    const n = async (sql, p) => Number((await db.query(sql, p)).rows[0].n);

    /* ---------- Evaluaciones ---------- */
    const { evaluaciones, duplicadas } = resolverDuplicados(exportacion.evaluaciones);
    const enFirebase = evaluaciones.length;
    const enSupabase = await n('select count(*) as n from public.evaluaciones where firebase_id is not null');
    agregar('Evaluaciones', 'Cantidad total (Firebase vs Supabase)', enFirebase === enSupabase, `${enFirebase} vs ${enSupabase}`);
    const activasEsperadas = enFirebase - duplicadas.length;
    const activas = await n('select count(*) as n from public.evaluaciones where firebase_id is not null and eliminado_en is null');
    agregar('Evaluaciones', 'Activas (sin contar duplicados marcados)', activas === activasEsperadas, `${activasEsperadas} vs ${activas}`);

    const porVisFirebase = new Map();
    evaluaciones.forEach(e => porVisFirebase.set(e.visitador_nombre, (porVisFirebase.get(e.visitador_nombre) || 0) + 1));
    const porVisSupabase = new Map((await db.query(
        `select v.nombre_sector, count(*) as n from public.evaluaciones e
         join public.visitadores v on v.id = e.visitador_id where e.firebase_id is not null group by 1`)).rows
        .map(r => [r.nombre_sector, Number(r.n)]));
    const difVis = [...new Set([...porVisFirebase.keys(), ...porVisSupabase.keys()])]
        .filter(v => (porVisFirebase.get(v) || 0) !== (porVisSupabase.get(v) || 0));
    agregar('Evaluaciones', `Cantidad por visitador (${porVisFirebase.size} visitadores)`, difVis.length === 0,
        difVis.length ? 'Diferencias en: ' + difVis.join(', ') : 'Todos coinciden');

    const nulos = (await db.query(
        `select count(*) filter (where matricula = '') as sin_matricula,
                count(*) filter (where mercado = '') as sin_mercado,
                count(*) filter (where cuadrante = '') as sin_cuadrante,
                count(*) filter (where creado_en is null) as sin_fecha
         from public.evaluaciones where firebase_id is not null`)).rows[0];
    const vaciosOrigen = {
        sin_matricula: evaluaciones.filter(e => e.matricula === '').length,
        sin_mercado: 0,
        sin_cuadrante: evaluaciones.filter(e => e.cuadrante === '').length,
        sin_fecha: 0
    };
    for (const campo of Object.keys(vaciosOrigen)) {
        const enSb = Number(nulos[campo]);
        agregar('Evaluaciones', `Campos vacíos: ${campo.replace('_', ' ')}`, enSb === vaciosOrigen[campo],
            `Firebase ${vaciosOrigen[campo]} · Supabase ${enSb}`);
    }

    // Muestra aleatoria de 20, comparada campo por campo
    const muestra = muestraAleatoria(evaluaciones, 20);
    const filasMuestra = [];
    for (const esperado of muestra) {
        const real = (await db.query(
            `select e.*, v.nombre_sector as visitador_nombre from public.evaluaciones e
             join public.visitadores v on v.id = e.visitador_id where e.firebase_id = $1`, [esperado.firebase_id])).rows[0];
        const diferencias = real ? CAMPOS_EVAL.filter(c => String(real[c] ?? '') !== String(esperado[c] ?? '')) : ['no existe'];
        filasMuestra.push({ firebase_id: esperado.firebase_id, visitador: esperado.visitador_nombre, mercado: esperado.mercado, diferencias });
    }
    const malas = filasMuestra.filter(f => f.diferencias.length);
    agregar('Evaluaciones', `Muestra aleatoria de ${muestra.length}, campo por campo`, malas.length === 0,
        malas.length ? `${malas.length} con diferencias` : 'Idénticas');

    /* ---------- Fichero ---------- */
    const fichero = leerCsvGz(path.join(raiz, 'fichero_medico.csv.gz'));
    const snapF = (await db.query(`select id, es_vigente from public.data_snapshots where nombre = $1 and tipo = 'fichero'`, [NOMBRE_VERSION])).rows[0];
    if (!snapF) {
        agregar('Fichero', `Existe la versión "${NOMBRE_VERSION}"`, false, 'No existe');
    } else {
        agregar('Fichero', `Versión "${NOMBRE_VERSION}" vigente`, snapF.es_vigente === true, snapF.es_vigente ? 'Sí' : 'No');
        const filasF = await n('select count(*) as n from public.fichero where snapshot_id = $1', [snapF.id]);
        agregar('Fichero', 'Cantidad de filas (archivo vs Supabase)', filasF === fichero.filas.length, `${fichero.filas.length} vs ${filasF}`);
        const claves = clavesUnicas(fichero.encabezados);
        let difF = 0;
        const guardadas = [];
        for (let desde = 1; desde <= fichero.filas.length; desde += 1000) {
            guardadas.push(...(await db.query('select fila, datos from public.fichero where snapshot_id = $1 and fila between $2 and $3',
                [snapF.id, desde, desde + 999])).rows);
        }
        guardadas.forEach(g => {
            const original = fichero.filas[g.fila - 1] || [];
            const datos = typeof g.datos === 'string' ? JSON.parse(g.datos) : g.datos;
            if (claves.some((c, k) => String(datos[c] ?? '') !== String(original[k] ?? ''))) difF++;
        });
        agregar('Fichero', `Las ${claves.length} columnas de cada fila, idénticas al archivo`, difF === 0, `${difF} filas con diferencias`);
        const sinVis = await n(`select count(*) as n from public.fichero where snapshot_id = $1 and visitador_nombre <> '' and visitador_id is null`, [snapF.id]);
        agregar('Fichero', 'Todas las filas con visitador quedaron vinculadas', sinVis === 0, `${sinVis} sin vincular`);
        const visArchivo = new Set(fichero.filas.map(r => normalizarVisitador(r[fichero.encabezados.indexOf('Nombre del sector')])).filter(Boolean));
        const visActivos = await n('select count(*) as n from public.visitadores where activo');
        agregar('Fichero', 'Visitadores del fichero creados', visActivos >= visArchivo.size, `${visArchivo.size} en el archivo · ${visActivos} activos en Supabase`);
    }

    /* ---------- Recetas ---------- */
    const recetas = leerCsvGz(path.join(raiz, 'datacloseup.csv.gz'));
    const snapR = (await db.query(`select id, es_vigente from public.data_snapshots where nombre = $1 and tipo = 'recetas'`, [NOMBRE_VERSION])).rows[0];
    if (!snapR) {
        agregar('Recetas', `Existe la versión "${NOMBRE_VERSION}"`, false, 'No existe');
    } else {
        agregar('Recetas', `Versión "${NOMBRE_VERSION}" vigente`, snapR.es_vigente === true, snapR.es_vigente ? 'Sí' : 'No');
        const filasR = await n('select count(*) as n from public.recetas where snapshot_id = $1', [snapR.id]);
        agregar('Recetas', 'Cantidad de filas (archivo vs Supabase)', filasR === recetas.filas.length, `${recetas.filas.length} vs ${filasR}`);
        const rxArchivo = recetas.filas.reduce((s, r) => s + parseInt(r[4], 10), 0);
        const rxSb = await n('select coalesce(sum(rx),0) as n from public.recetas where snapshot_id = $1', [snapR.id]);
        agregar('Recetas', 'Total de recetas (suma de Rx)', rxArchivo === rxSb, `${rxArchivo} vs ${rxSb}`);
        let difR = 0;
        for (let desde = 1; desde <= recetas.filas.length; desde += 20000) {
            const lote = (await db.query(
                `select fila, medico, matricula, mercado, producto, rx, medico_unico, domicilio, cod_postal, localidad,
                        region, especialidad, molecula, clase_terapeutica, generico, laboratorio
                 from public.v_recetas where snapshot_id = $1 and fila between $2 and $3`, [snapR.id, desde, desde + 19999])).rows;
            for (const b of lote) {
                const rec = [b.medico, b.matricula, b.mercado, b.producto, String(b.rx), b.medico_unico, b.domicilio, b.cod_postal,
                    b.localidad, b.region, b.especialidad, b.molecula, b.clase_terapeutica, b.generico, b.laboratorio].join(';');
                if (rec !== recetas.filas[b.fila - 1].join(';')) difR++;
            }
        }
        agregar('Recetas', 'Reconstrucción fila por fila, idéntica al archivo', difR === 0, `${difR} filas con diferencias`);
    }

    return { chequeos, muestra: filasMuestra, duplicadas, todoOk: chequeos.every(c => c.ok) };
}

/* ---------- Informe en Markdown ---------- */
export function informeMarkdown(resultado, { destino, proyecto, exportacion }) {
    const { chequeos, muestra, duplicadas, todoOk } = resultado;
    const l = [];
    l.push('# Validación de la migración Firebase → Supabase', '');
    l.push(`- **Fecha:** ${new Date().toISOString().replace('T', ' ').slice(0, 16)} UTC`);
    l.push(`- **Destino:** ${destino} (${proyecto})`);
    l.push(`- **Exportación de Firebase usada:** ${exportacion.creadoEn || 'sin fecha'}`);
    l.push(`- **Resultado:** ${todoOk ? '✅ TODO COINCIDE' : '❌ HAY DIFERENCIAS (no pasar a producción)'}`, '');
    let grupo = '';
    for (const c of chequeos) {
        if (c.grupo !== grupo) {
            grupo = c.grupo;
            l.push(`## ${grupo}`, '', '| Revisión | Resultado | Detalle |', '|---|---|---|');
        }
        l.push(`| ${c.nombre} | ${c.ok ? '✅' : '❌'} | ${c.detalle} |`);
        const sig = chequeos[chequeos.indexOf(c) + 1];
        if (!sig || sig.grupo !== grupo) l.push('');
    }
    l.push('## Muestra aleatoria de evaluaciones', '', '| ID en Firebase | Visitador | Mercado | Resultado |', '|---|---|---|---|');
    muestra.forEach(m => l.push(`| \`${m.firebase_id}\` | ${m.visitador} | ${m.mercado} | ${m.diferencias.length ? '❌ ' + m.diferencias.join(', ') : '✅ idéntica'} |`));
    l.push('');
    if (duplicadas.length) {
        l.push('## Evaluaciones duplicadas (guardadas como eliminadas, no se perdieron)', '', '| Guardada como eliminada | Se conserva activa |', '|---|---|');
        duplicadas.forEach(d => l.push(`| \`${d.firebase_id}\` | \`${d.se_conserva}\` |`));
        l.push('');
    }
    return l.join('\n');
}

/* ============================================================
   SegmentApp · Migración · Transformaciones (sin conexión a nada)
   Convierte los archivos actuales y la exportación de Firebase en
   filas para las tablas de Supabase. Son funciones "puras": no
   leen ni escriben bases de datos, por eso se prueban fácilmente.
============================================================ */
import fs from 'node:fs';
import zlib from 'node:zlib';

/* ---------- Lectura de los .csv.gz (separador ;) ---------- */
// Formato de los archivos: UTF-8 con BOM, separador ";". Un valor puede
// venir entre comillas (y entonces puede contener ";", saltos de línea
// o comillas dobles escritas como ""). Igual que lo lee la app hoy, pero
// SIN recortar espacios: se guarda el valor exacto.
export function parsearCsv(texto, separador = ';') {
    const filas = [];
    let fila = [], valor = '', i = 0, entreComillas = false;
    while (i < texto.length) {
        const c = texto[i];
        if (entreComillas) {
            if (c === '"') {
                if (texto[i + 1] === '"') { valor += '"'; i += 2; continue; }
                entreComillas = false; i++; continue;
            }
            valor += c; i++; continue;
        }
        if (c === '"' && valor === '') { entreComillas = true; i++; continue; }
        if (c === separador) { fila.push(valor); valor = ''; i++; continue; }
        if (c === '\r' || c === '\n') {
            fila.push(valor); filas.push(fila); fila = []; valor = '';
            i += (c === '\r' && texto[i + 1] === '\n') ? 2 : 1;
            continue;
        }
        valor += c; i++;
    }
    if (valor !== '' || fila.length) { fila.push(valor); filas.push(fila); }
    // Ignorar líneas vacías
    return filas.filter(f => !(f.length === 1 && f[0] === ''));
}

export function leerCsvGz(ruta) {
    const texto = zlib.gunzipSync(fs.readFileSync(ruta)).toString('utf8').replace(/^\uFEFF/, '');
    const [encabezados, ...filas] = parsearCsv(texto);
    return { encabezados, filas };
}

// Encabezados repetidos → "Nombre (2)" (para guardarlos sin perder ninguno)
export function clavesUnicas(encabezados) {
    const vistos = {};
    return encabezados.map(c => {
        vistos[c] = (vistos[c] || 0) + 1;
        return vistos[c] > 1 ? `${c} (${vistos[c]})` : c;
    });
}

// Igual que normalizeKey de la app y que matricula_norm en la base
export function normalizarMatricula(valor) {
    return String(valor == null ? '' : valor).trim().split('_')[0].replace(/^0+/, '');
}

// Nombre del visitador tal como lo usa la app (mayúsculas, sin espacios extremos)
export function normalizarVisitador(valor) {
    return String(valor == null ? '' : valor).trim().toUpperCase();
}

/* ---------- Fichero médico ---------- */
export function prepararFichero({ encabezados, filas }, equiposOtc = ['7']) {
    const col = (nombre) => {
        const i = encabezados.indexOf(nombre);
        if (i < 0) throw new Error(`Al fichero le falta la columna "${nombre}"`);
        return i;
    };
    const iMat = col('Matricula'), iNom = col('Nombre'), iVis = col('Nombre del sector'),
          iSec = col('Sector'), iGer = col('GER_DIS'), iGerNom = col('NOME_GER_DIS'), iEq = col('Equipo');
    const claves = clavesUnicas(encabezados);

    const distritos = new Map();     // codigo -> nombre
    const visitadores = new Map();   // nombre_sector -> { codigo_sector, distrito_codigo, linea }
    const avisos = [];
    const filasFichero = filas.map((r, i) => {
        const vis = normalizarVisitador(r[iVis]);
        const ger = String(r[iGer] || '').trim();
        if (ger) {
            const nombre = String(r[iGerNom] || '').trim();
            if (distritos.has(ger) && distritos.get(ger) !== nombre) {
                avisos.push(`El distrito ${ger} aparece con dos nombres: "${distritos.get(ger)}" y "${nombre}"`);
            }
            if (!distritos.has(ger)) distritos.set(ger, nombre);
        }
        if (vis) {
            const linea = equiposOtc.includes(String(r[iEq] || '').trim()) ? 'OTC' : 'Pharmetique';
            const previo = visitadores.get(vis);
            if (previo && previo.distrito_codigo !== ger) {
                avisos.push(`El visitador ${vis} aparece en dos distritos (${previo.distrito_codigo} y ${ger}); se usa el primero`);
            }
            if (!previo) visitadores.set(vis, { codigo_sector: String(r[iSec] || '').trim(), distrito_codigo: ger, linea });
        }
        return {
            fila: i + 1,
            matricula: r[iMat] || '',
            nombre: r[iNom] || '',
            visitador_nombre: vis,
            distrito_codigo: ger,
            equipo: String(r[iEq] || '').trim(),
            datos: Object.fromEntries(claves.map((c, k) => [c, r[k] ?? '']))
        };
    });
    return { distritos, visitadores, filasFichero, avisos };
}

/* ---------- Recetas CloseUp ---------- */
// Columnas por posición, igual que la app: 0 Medico, 1 Matricula, 2 Mercado,
// 3 Producto, 4 Rx, 5 Medico Unico, 6 Domicilio, 7 CP, 8 Localidad, 9 Region,
// 10 Especialidad, 11 Molecula, 12 Clase, 13 Generico, 14 Laboratorio
export const SEP = '\u0001';
export const claveMedico   = (r) => [r[1], r[0], r[5], r[6], r[7], r[8], r[9], r[10]].join(SEP);
export const claveProducto = (r) => [r[3], r[11], r[12], r[13], r[14]].join(SEP);

export function prepararRecetas({ encabezados, filas }) {
    if (encabezados.length < 15) throw new Error(`El archivo de recetas tiene ${encabezados.length} columnas; se esperaban 15`);
    const medicos = new Map(), productos = new Map(), mercados = new Set();
    const errores = [];
    filas.forEach((r, i) => {
        if (r.length !== encabezados.length) errores.push(`Fila ${i + 2}: tiene ${r.length} columnas`);
        if (!/^\d+$/.test(String(r[4]).trim())) errores.push(`Fila ${i + 2}: recetas "${r[4]}" no es un número entero`);
        medicos.set(claveMedico(r), true);
        productos.set(claveProducto(r), true);
        mercados.add(r[2]);
    });
    return { medicos: [...medicos.keys()], productos: [...productos.keys()], mercados: [...mercados], errores };
}

/* ---------- Evaluaciones de Firebase ---------- */
export function mapearEvaluacion(firebaseId, d) {
    const survey = d.survey || {};
    const texto = (v) => (v == null ? '' : String(v));
    const fecha = Date.parse(d.timestamp);
    return {
        firebase_id: firebaseId,
        visitador_nombre: normalizarVisitador(d.visitador),
        matricula: texto(d.medico_id).trim(),
        medico_nombre: texto(d.medico_name),
        mercado: texto(d.mercado).trim() || 'General',
        cuadrante: texto(d.cuadrante),
        notas: texto(d.notas),
        q1_pacientes_semana: texto(survey.q1),
        q2_pacientes_patologia: texto(survey.q2),
        q3_pacientes_producto: texto(survey.q3),
        q4_otros_productos: texto(survey.q4),
        q5_costo_consulta: texto(survey.q5),
        cruce_errado: d.cruceErrado === true,
        nombre_fichero: d.nombreFichero == null ? null : texto(d.nombreFichero),
        rol_autor: d._user_role == null ? null : texto(d._user_role),
        origen_timestamp: d.timestamp == null ? null : texto(d.timestamp),
        creado_en: Number.isFinite(fecha) ? new Date(fecha).toISOString() : null
    };
}

// Si dos evaluaciones caen en el mismo visitador + médico + mercado,
// la más reciente queda activa y las otras se guardan como "eliminadas"
// (no se pierden; quedan en el historial).
export function resolverDuplicados(evaluaciones) {
    const grupos = new Map();
    for (const e of evaluaciones) {
        const k = [e.visitador_nombre, normalizarMatricula(e.matricula), e.mercado].join(SEP);
        if (!grupos.has(k)) grupos.set(k, []);
        grupos.get(k).push(e);
    }
    const resultado = [], duplicadas = [];
    for (const grupo of grupos.values()) {
        grupo.sort((a, b) => String(b.origen_timestamp || '').localeCompare(String(a.origen_timestamp || '')));
        grupo.forEach((e, i) => {
            const marcada = i > 0;
            resultado.push({ ...e, eliminada: marcada });
            if (marcada) duplicadas.push({ firebase_id: e.firebase_id, se_conserva: grupo[0].firebase_id });
        });
    }
    return { evaluaciones: resultado, duplicadas };
}

/* ---------- Exportación de Firebase ---------- */
// Devuelve evaluaciones, claves de visitadores y clave de admin de un
// archivo creado por 1-exportar-firebase.mjs
export function leerExportacion(rutaOObjeto) {
    const exp = typeof rutaOObjeto === 'string' ? JSON.parse(fs.readFileSync(rutaOObjeto, 'utf8')) : rutaOObjeto;
    const docs = exp.documentos || {};
    const evaluaciones = [], claves = new Map();
    let claveAdmin = '';
    for (const [ruta, datos] of Object.entries(docs)) {
        const partes = ruta.split('/');
        const id = partes[partes.length - 1];
        const coleccion = partes.slice(0, -1).join('/');
        if (coleccion.endsWith('/public/data/evaluaciones_matriz')) evaluaciones.push(mapearEvaluacion(id, datos));
        else if (coleccion.endsWith('/public/data/claves_visitadores')) claves.set(normalizarVisitador(id), String(datos.clave || ''));
        else if (ruta.endsWith('/config/admin_settings')) claveAdmin = String(datos.clave || '');
    }
    // Correos de Firebase Auth → para llenar la plantilla de usuarios
    const correosVisitador = new Map();
    let correoAdmin = '';
    for (const u of exp.usuarios_con_correo || []) {
        if (u.desactivado) continue;
        const c = u.claims || {};
        const correo = String(u.correo || '').trim().toLowerCase();
        if (c.role === 'admin' && !correoAdmin) correoAdmin = correo;
        if (c.role === 'visitador' && c.visitadorName) correosVisitador.set(normalizarVisitador(c.visitadorName), correo);
    }
    return { evaluaciones, claves, claveAdmin, correosVisitador, correoAdmin, conteo: exp.conteo || {}, creadoEn: exp.creado_en };
}

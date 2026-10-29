/* ============================================================
   SegmentApp - Panel de carga de datos (solo admin)
   Archivo: js/carga-datos.js
   Flujo:
     1. Elegir tipo (recetas CloseUp o fichero médico) y archivo
        (Excel .xlsx o CSV; también .csv.gz)
     2. REVISAR: columnas esperadas, vacíos, formatos y duplicados,
        con errores fila por fila
     3. SUBIR como BORRADOR, por lotes, con barra de progreso y
        reintentos (si se corta, se puede reanudar sin duplicar)
     4. COMPARAR el borrador contra la versión vigente
     5. PUBLICAR (pasa a ser "Hoy") o dejarlo como borrador
   En "Versiones" se puede renombrar, comparar y volver a una
   versión anterior. Nada se borra.
============================================================ */

window.App = window.App || {};
window.App.carga = {};

/* ============================================================
   COLUMNAS ESPERADAS
============================================================ */
// Recetas: el orden de la app (se reordena solo si el archivo trae otro orden)
window.App.carga.COLUMNAS_RECETAS = [
    'Medico', 'Matricula', 'Mercado', 'Producto', 'Px_Product', 'Medico Unico', 'Domicilio', 'Cod.Postal',
    'Localidad', 'Region', 'Especialidad', 'Molecula', 'Clase Terapeutica', 'Generico', 'Laboratorio'
];
const CAMPOS_RECETAS = ['medico', 'matricula', 'mercado', 'producto', 'rx', 'medico_unico', 'domicilio', 'cod_postal',
    'localidad', 'region', 'especialidad', 'molecula', 'clase_terapeutica', 'generico', 'laboratorio'];
// Fichero: estas columnas son obligatorias (las demás se guardan todas tal cual)
window.App.carga.COLUMNAS_FICHERO = ['Matricula', 'Nombre', 'Nombre del sector', 'Sector', 'GER_DIS', 'NOME_GER_DIS', 'Equipo'];

const LOTE_RECETAS = 2000;
const LOTE_FICHERO = 400;
const MAX_ERRORES_MOSTRADOS = 200;

/* ============================================================
   LECTURA DE ARCHIVOS
============================================================ */
// Igual que la app y los scripts de migración: respeta comillas y no recorta espacios
window.App.carga.parsearCsv = function(texto, separador) {
    texto = texto.replace(/^﻿/, '');
    if (!separador) {
        const primera = texto.slice(0, texto.indexOf('\n') >= 0 ? texto.indexOf('\n') : texto.length);
        separador = primera.includes(';') ? ';' : (primera.includes('\t') ? '\t' : ',');
    }
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
    const limpias = filas.filter(f => !(f.length === 1 && f[0] === ''));
    return { encabezados: limpias[0] || [], filas: limpias.slice(1) };
};

window.App.carga.leerArchivo = async function(archivo) {
    const nombre = archivo.name.toLowerCase();
    const bytes = new Uint8Array(await archivo.arrayBuffer());
    if (/\.(xlsx|xls|xlsm)$/.test(nombre)) {
        await window.App.data.loadLibrary('xlsx');
        const libro = XLSX.read(bytes, { type: 'array' });
        const hoja = libro.Sheets[libro.SheetNames[0]];
        const matriz = XLSX.utils.sheet_to_json(hoja, { header: 1, raw: false, defval: '' })
            .map(f => f.map(v => (v == null ? '' : String(v))))
            .filter(f => f.some(v => v !== ''));
        return { encabezados: matriz[0] || [], filas: matriz.slice(1), origen: 'Excel' };
    }
    const texto = await window.App.data.descomprimirTexto(bytes);
    return { ...window.App.carga.parsearCsv(texto), origen: 'CSV' };
};

/* ============================================================
   VALIDACIÓN
============================================================ */
const normalizar = (h) => String(h || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

// Ubica cada columna esperada por su NOMBRE (no por su posición)
function ubicarColumnas(encabezados, esperadas) {
    const indice = new Map();
    encabezados.forEach((h, i) => { const k = normalizar(h); if (!indice.has(k)) indice.set(k, i); });
    const posiciones = esperadas.map(c => indice.has(normalizar(c)) ? indice.get(normalizar(c)) : -1);
    const faltan = esperadas.filter((c, i) => posiciones[i] < 0);
    return { posiciones, faltan };
}

window.App.carga.validarRecetas = function({ encabezados, filas }) {
    const C = window.App.carga.COLUMNAS_RECETAS;
    const { posiciones, faltan } = ubicarColumnas(encabezados, C);
    const errores = [], avisos = [];
    if (faltan.length) {
        return { ok: false, errores: [{ fila: 1, mensaje: `Faltan columnas: ${faltan.join(', ')}` }], avisos, resumen: { filas: filas.length } };
    }
    const ordenOriginal = posiciones.every((p, i) => p === i);
    if (!ordenOriginal) avisos.push('Las columnas venían en otro orden: se ordenaron solas (no hace falta corregir el archivo).');
    const sobrantes = encabezados.length - C.length;
    if (sobrantes > 0) avisos.push(`El archivo trae ${sobrantes} columna(s) adicional(es) que no se usan; se ignoran.`);

    const filasCanonicas = [];
    const medicos = new Set(), mercados = new Set(), productos = new Set();
    const claves = new Map();
    let rx = 0, duplicadas = 0;
    filas.forEach((r, i) => {
        const n = i + 2;   // número de fila como se ve en Excel (la 1 es el encabezado)
        const v = posiciones.map(p => (r[p] == null ? '' : String(r[p])));
        const problemas = [];
        if (r.length < encabezados.length && r.length < C.length) problemas.push(`tiene ${r.length} columnas`);
        if (!v[0].trim()) problemas.push('falta Medico');
        if (!v[1].trim()) problemas.push('falta Matricula');
        if (!v[2].trim()) problemas.push('falta Mercado');
        if (!v[3].trim()) problemas.push('falta Producto');
        if (!/^\d+$/.test(v[4].trim())) problemas.push(`Px_Product "${v[4]}" no es un número entero`);
        if (problemas.length) { errores.push({ fila: n, mensaje: problemas.join('; ') }); return; }
        v[4] = v[4].trim();
        rx += parseInt(v[4], 10);
        medicos.add(v[1].trim().replace(/^0+/, '') + '|' + v[0]);
        mercados.add(v[2]); productos.add(v[3]);
        const k = [v[1], v[0], v[2], v[3]].join('|');
        if (claves.has(k)) duplicadas++; else claves.set(k, n);
        filasCanonicas.push(v);
    });
    if (duplicadas) avisos.push(`${duplicadas} fila(s) repiten médico + mercado + producto. Se guardan igual (así venían; los datos actuales también tienen algunas).`);
    return {
        ok: errores.length === 0, errores, avisos, encabezados: C, filasCanonicas,
        resumen: { filas: filas.length, medicos: medicos.size, mercados: mercados.size, productos: productos.size, rx }
    };
};

window.App.carga.validarFichero = function({ encabezados, filas }, visitadoresExistentes = []) {
    const C = window.App.carga.COLUMNAS_FICHERO;
    const { posiciones, faltan } = ubicarColumnas(encabezados, C);
    const errores = [], avisos = [];
    if (faltan.length) {
        return { ok: false, errores: [{ fila: 1, mensaje: `Faltan columnas: ${faltan.join(', ')}` }], avisos, resumen: { filas: filas.length } };
    }
    const [iMat, iNom, iVis, iSec, iGer, iGerNom, iEq] = posiciones;
    const matriculas = new Set(), visitadores = new Set(), distritos = new Map();
    const pares = new Set();
    let sinVisitador = 0, duplicadas = 0;
    filas.forEach((r, i) => {
        const n = i + 2;
        const problemas = [];
        if (r.length < encabezados.length) problemas.push(`tiene ${r.length} de ${encabezados.length} columnas`);
        if (!String(r[iMat] || '').trim()) problemas.push('falta Matricula');
        if (!String(r[iNom] || '').trim()) problemas.push('falta Nombre');
        if (problemas.length) { errores.push({ fila: n, mensaje: problemas.join('; ') }); return; }
        const vis = String(r[iVis] || '').trim().toUpperCase();
        const ger = String(r[iGer] || '').trim();
        matriculas.add(String(r[iMat]).trim().replace(/^0+/, ''));
        if (!vis) sinVisitador++;
        else visitadores.add(vis);
        if (ger) {
            const nom = String(r[iGerNom] || '').trim();
            if (distritos.has(ger) && distritos.get(ger) !== nom) avisos.push(`Fila ${n}: el distrito ${ger} aparece con otro nombre ("${nom}")`);
            if (!distritos.has(ger)) distritos.set(ger, nom);
        }
        const par = String(r[iMat]).trim().replace(/^0+/, '') + '|' + vis;
        if (pares.has(par)) duplicadas++; else pares.add(par);
    });
    if (sinVisitador) avisos.push(`${sinVisitador} fila(s) sin "Nombre del sector": esos médicos no quedarán asignados a ningún visitador.`);
    if (duplicadas) avisos.push(`${duplicadas} fila(s) repiten matrícula + visitador. Se guardan igual.`);
    const existentes = new Set(visitadoresExistentes.map(v => String(v).toUpperCase()));
    if (existentes.size) {
        const nuevos = [...visitadores].filter(v => !existentes.has(v));
        const ausentes = [...existentes].filter(v => !visitadores.has(v));
        if (nuevos.length) avisos.push(`Visitadores NUEVOS que se crearán (${nuevos.length}): ${nuevos.join(', ')}`);
        if (ausentes.length) avisos.push(`Visitadores que NO aparecen en este fichero (${ausentes.length}); no se borran, pero no tendrán médicos en esta versión: ${ausentes.join(', ')}`);
    }
    return {
        ok: errores.length === 0, errores, avisos, encabezados, filasCanonicas: filas, indices: { iMat, iNom, iVis, iSec, iGer, iGerNom, iEq },
        resumen: { filas: filas.length, medicos: matriculas.size, visitadores: visitadores.size, distritos: distritos.size }
    };
};

/* ============================================================
   ARCHIVO COMPRIMIDO DE LA VERSIÓN (lo que descarga la app)
============================================================ */
window.App.carga.aCsv = function(encabezados, filas) {
    const celda = (v) => {
        // Sin tabuladores: la app detecta el separador buscando uno en todo el texto
        const s = v == null ? '' : String(v).replace(/\t/g, ' ');
        return /[;"\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    return '﻿' + [encabezados, ...filas].map(f => f.map(celda).join(';')).join('\r\n') + '\r\n';
};

window.App.carga.comprimir = async function(texto) {
    const flujo = new Blob([texto]).stream().pipeThrough(new CompressionStream('gzip'));
    return await new Response(flujo).blob();
};

/* ============================================================
   SUBIDA POR LOTES (con reintentos)
============================================================ */
async function conReintentos(fn, intentos = 4) {
    let ultimo;
    for (let k = 0; k < intentos; k++) {
        try { return await fn(); } catch (e) {
            ultimo = e;
            if (k < intentos - 1) await new Promise(r => setTimeout(r, 1000 * Math.pow(2, k)));
        }
    }
    throw ultimo;
}

function lotesRecetas(validacion) {
    return validacion.filasCanonicas.map((v, i) => {
        const o = { fila: i + 1 };
        CAMPOS_RECETAS.forEach((c, k) => { o[c] = c === 'rx' ? parseInt(v[k], 10) : v[k]; });
        return o;
    });
}

function lotesFichero(validacion) {
    const { encabezados, filasCanonicas, indices } = validacion;
    const vistos = {};
    const claves = encabezados.map(c => { vistos[c] = (vistos[c] || 0) + 1; return vistos[c] > 1 ? `${c} (${vistos[c]})` : c; });
    return filasCanonicas.map((r, i) => ({
        fila: i + 1,
        matricula: r[indices.iMat] || '',
        nombre: r[indices.iNom] || '',
        visitador_nombre: r[indices.iVis] || '',
        sector: r[indices.iSec] || '',
        distrito_codigo: r[indices.iGer] || '',
        distrito_nombre: r[indices.iGerNom] || '',
        equipo: r[indices.iEq] || '',
        datos: Object.fromEntries(claves.map((c, k) => [c, r[k] == null ? '' : r[k]]))
    }));
}

// Recetas: deja listo el orden nacional por mercado que usan los VM y GD
// (un mercado por llamada para no pasar el límite de tiempo de Supabase)
window.App.carga.prepararVersion = async function(id, alAvanzar = () => {}) {
    let faltan = await conReintentos(() => window.App.sb.prepararOrden(id));
    const total = faltan + 1;
    while (faltan > 0) {
        alAvanzar({ etapa: 'preparando', hechas: total - faltan, total, id });
        faltan = await conReintentos(() => window.App.sb.prepararOrden(id));
    }
};

// Sube la validación como BORRADOR. Si ya existe snapshotId (reanudar), continúa ahí.
window.App.carga.subir = async function({ tipo, nombre, fecha, validacion, snapshotId }, alAvanzar = () => {}) {
    const sb = window.App.sb;
    const filasFinales = validacion.filasCanonicas;
    const encabezados = validacion.encabezados;
    const id = snapshotId || await sb.crearBorrador({ nombre, tipo, fecha, columnas: encabezados, notas: 'Cargado desde el panel de la app' });

    const filas = tipo === 'recetas' ? lotesRecetas(validacion) : lotesFichero(validacion);
    const tamano = tipo === 'recetas' ? LOTE_RECETAS : LOTE_FICHERO;
    const total = filas.length;
    for (let desde = 0; desde < total; desde += tamano) {
        const lote = filas.slice(desde, desde + tamano);
        await conReintentos(() => sb.cargarLote(tipo, id, lote));
        alAvanzar({ etapa: 'filas', hechas: Math.min(desde + tamano, total), total, id });
    }

    alAvanzar({ etapa: 'verificando', hechas: total, total, id });
    const enBase = await conReintentos(() => sb.contarFilas(id));
    if (enBase !== total) throw new Error(`Se esperaban ${total} filas y en la base hay ${enBase}. Pulsa "Reintentar" para completar.`);
    if (tipo === 'recetas') await window.App.carga.prepararVersion(id, alAvanzar);

    alAvanzar({ etapa: 'archivo', hechas: total, total, id });
    const blob = await window.App.carga.comprimir(window.App.carga.aCsv(encabezados, filasFinales));
    const ruta = `snapshots/${id}/datos.csv.gz`;
    await conReintentos(() => sb.subirArchivo(ruta, blob));
    await sb.actualizarVersion(id, { archivo: ruta, archivo_bytes: blob.size, filas: total, columnas: encabezados });
    alAvanzar({ etapa: 'listo', hechas: total, total, id });
    return id;
};

/* ============================================================
   INTERFAZ DEL PANEL
============================================================ */
const esc = (v) => window.App.ui.escapeHtml(v);
const fmt = (n) => window.App.ui.formatNumber(n || 0);
window.App.carga._estado = { validacion: null, tipo: null, snapshotId: null };

window.App.carga.abrirPanel = function(pestana = 'nueva') {
    if (window.App.state.rolReal !== 'admin') return;
    document.getElementById('cargaDatosModal').classList.remove('hidden');
    window.App.carga.mostrarPestana(pestana);
};

window.App.carga.cerrarPanel = function() {
    document.getElementById('cargaDatosModal').classList.add('hidden');
};

window.App.carga.mostrarPestana = function(pestana) {
    ['nueva', 'versiones'].forEach(p => {
        document.getElementById(`cargaTab_${p}`).classList.toggle('hidden', p !== pestana);
        const b = document.getElementById(`cargaTabBtn_${p}`);
        b.classList.toggle('bg-indigo-600', p === pestana);
        b.classList.toggle('text-white', p === pestana);
        b.classList.toggle('text-slate-600', p !== pestana);
    });
    if (pestana === 'versiones') window.App.carga.renderVersiones();
};

/* ---------- Paso 2: revisar ---------- */
window.App.carga.revisar = async function() {
    const ui = window.App.ui;
    const archivo = document.getElementById('cargaArchivo').files[0];
    const tipo = document.querySelector('input[name="cargaTipo"]:checked')?.value;
    const zona = document.getElementById('cargaResultado');
    if (!tipo) { ui.showToast('Elige si el archivo es de recetas o de fichero.'); return; }
    if (!archivo) { ui.showToast('Elige el archivo a cargar.'); return; }

    zona.innerHTML = '<div class="p-6 text-center text-indigo-600 font-bold flex items-center justify-center gap-2"><span class="material-symbols-outlined animate-spin-reverse">sync</span> Revisando el archivo...</div>';
    await new Promise(r => setTimeout(r, 30));
    try {
        const leido = await window.App.carga.leerArchivo(archivo);
        let existentes = [];
        if (tipo === 'fichero') existentes = await window.App.sb.nombresVisitadoresVisibles().catch(() => []);
        const v = tipo === 'recetas' ? window.App.carga.validarRecetas(leido) : window.App.carga.validarFichero(leido, existentes);
        window.App.carga._estado = { validacion: v, tipo, snapshotId: null };
        window.App.carga.renderRevision(v, tipo, leido.origen);
    } catch (e) {
        console.error('[SegmentApp] No se pudo leer el archivo:', e);
        zona.innerHTML = `<div class="p-4 bg-rose-50 border border-rose-200 rounded-2xl text-rose-700 text-sm font-bold">No se pudo leer el archivo: ${esc(e.message)}</div>`;
    }
};

window.App.carga.renderRevision = function(v, tipo, origen) {
    const r = v.resumen;
    const tarjetas = tipo === 'recetas'
        ? [['Filas', r.filas], ['Médicos', r.medicos], ['Mercados', r.mercados], ['Productos', r.productos], ['Recetas (Rx)', r.rx]]
        : [['Filas', r.filas], ['Médicos', r.medicos], ['Visitadores', r.visitadores], ['Distritos', r.distritos]];
    const errores = v.errores.slice(0, MAX_ERRORES_MOSTRADOS);
    document.getElementById('cargaResultado').innerHTML = `
        <div class="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-2">Resultado de la revisión (${esc(origen || '')})</div>
        <div class="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-4">
            ${tarjetas.map(([t, n]) => `<div class="bg-slate-50 border border-slate-200 rounded-xl p-3 text-center"><div class="text-[10px] font-bold text-slate-500 uppercase">${t}</div><div class="text-lg font-display font-black text-slate-800">${fmt(n)}</div></div>`).join('')}
        </div>
        ${v.errores.length ? `
            <div class="bg-rose-50 border border-rose-200 rounded-2xl p-4 mb-3">
                <div class="font-bold text-rose-800 text-sm mb-2">❌ ${fmt(v.errores.length)} fila(s) con errores. Corrige el archivo y vuelve a revisarlo.</div>
                <div class="max-h-56 overflow-y-auto text-xs"><table class="w-full"><thead><tr class="text-left text-rose-700"><th class="p-1 w-20">Fila</th><th class="p-1">Problema</th></tr></thead><tbody>
                ${errores.map(e => `<tr class="border-t border-rose-100"><td class="p-1 font-mono">${e.fila}</td><td class="p-1">${esc(e.mensaje)}</td></tr>`).join('')}
                </tbody></table>${v.errores.length > errores.length ? `<div class="p-1 text-rose-600">… y ${fmt(v.errores.length - errores.length)} más.</div>` : ''}</div>
            </div>` : `<div class="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 mb-3 font-bold text-emerald-800 text-sm">✅ Sin errores. El archivo se puede subir.</div>`}
        ${v.avisos.length ? `<div class="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-3 text-xs text-amber-900 space-y-1">${v.avisos.map(a => `<div>⚠️ ${esc(a)}</div>`).join('')}</div>` : ''}
        <div class="flex justify-end">
            <button id="btnCargaSubir" onclick="App.carga.iniciarSubida()" ${v.ok ? '' : 'disabled'} class="px-6 py-3 rounded-full text-sm font-bold shadow-md transition flex items-center gap-2 ${v.ok ? 'bg-indigo-600 hover:bg-indigo-700 text-white' : 'bg-slate-200 text-slate-400 cursor-not-allowed'}">
                <span class="material-symbols-outlined text-[18px]">cloud_upload</span> Subir como borrador
            </button>
        </div>`;
};

/* ---------- Paso 3: subir ---------- */
window.App.carga.iniciarSubida = async function() {
    const ui = window.App.ui;
    const est = window.App.carga._estado;
    const nombre = document.getElementById('cargaNombre').value.trim();
    const fecha = document.getElementById('cargaFecha').value;
    if (!est.validacion || !est.validacion.ok) return;
    if (!nombre) { ui.showToast('Ponle un nombre a la versión (ej. "Datos noviembre").'); document.getElementById('cargaNombre').focus(); return; }
    if (!fecha) { ui.showToast('Indica la fecha de corte de los datos.'); document.getElementById('cargaFecha').focus(); return; }

    const zona = document.getElementById('cargaProgreso');
    const pintar = ({ etapa, hechas, total }) => {
        const pct = total ? Math.round((hechas / total) * 100) : 0;
        const textos = { filas: `Subiendo filas: ${fmt(hechas)} de ${fmt(total)}`, verificando: 'Verificando que llegó todo...',
            preparando: `Preparando la versión para los visitadores: mercado ${fmt(hechas)} de ${fmt(total)}`, archivo: 'Guardando el archivo de la versión...', listo: '¡Listo!' };
        zona.innerHTML = `<div class="text-sm font-bold text-slate-700 mb-2">${textos[etapa]}</div>
            <div class="w-full bg-slate-200 rounded-full h-3 overflow-hidden"><div class="bg-indigo-600 h-3 rounded-full transition-all" style="width:${etapa === 'filas' || etapa === 'preparando' ? pct : 100}%"></div></div>`;
    };
    zona.classList.remove('hidden');
    const btn = document.getElementById('btnCargaSubir');
    if (btn) btn.disabled = true;
    try {
        const id = await window.App.carga.subir({ tipo: est.tipo, nombre, fecha, validacion: est.validacion, snapshotId: est.snapshotId },
            (p) => { est.snapshotId = p.id; pintar(p); });
        est.snapshotId = id;
        ui.showToast('Borrador cargado. Revisa la comparación antes de publicar.');
        await window.App.carga.mostrarComparacion(id, est.tipo);
    } catch (e) {
        console.error('[SegmentApp] Falló la subida:', e);
        zona.innerHTML = `<div class="p-4 bg-rose-50 border border-rose-200 rounded-2xl text-sm text-rose-700">
            <div class="font-bold mb-2">La subida se interrumpió: ${esc(e.message)}</div>
            <div class="mb-3">Lo que ya se subió está guardado como borrador. Reintentar continúa sin duplicar.</div>
            <button onclick="App.carga.iniciarSubida()" class="bg-rose-600 hover:bg-rose-700 text-white px-5 py-2 rounded-full font-bold">Reintentar</button></div>`;
        if (btn) btn.disabled = false;
    }
};

/* ---------- Paso 4: comparar ---------- */
window.App.carga.mostrarComparacion = async function(id, tipo, destino = 'cargaProgreso') {
    const zona = document.getElementById(destino);
    zona.classList.remove('hidden');
    const versiones = await window.App.sb.versiones();
    const vigente = versiones.find(v => v.tipo === tipo && v.es_vigente);
    const esta = versiones.find(v => v.id === id) || {};
    if (!vigente || vigente.id === id) {
        zona.innerHTML = `<div class="p-4 bg-indigo-50 border border-indigo-200 rounded-2xl text-sm">
            <div class="font-bold text-indigo-900 mb-3">No hay otra versión vigente de ${tipo} para comparar.</div>
            ${botonesPublicar(id, esta)}</div>`;
        return;
    }
    zona.innerHTML = '<div class="p-4 text-indigo-600 font-bold">Comparando con la versión vigente…</div>';
    try {
        const c = await window.App.sb.comparar(id, vigente.id);
        const ej = (estado) => (c.ejemplos || []).filter(e => e.estado === estado).slice(0, 8);
        const filaEj = (e) => tipo === 'recetas'
            ? `${esc(e.medico)} (${esc(e.matricula)}) · ${esc(e.mercado)} · ${esc(e.producto)}${e.rx_base != null && e.rx_nuevo != null ? ` · Rx ${e.rx_base} → ${e.rx_nuevo}` : ''}`
            : `${esc(e.nombre)} (${esc(e.matricula)}) · ${esc(e.visitador || 'sin visitador')}`;
        const bloque = (titulo, color, n, estado) => `
            <div class="bg-${color}-50 border border-${color}-200 rounded-xl p-3">
                <div class="text-[10px] font-bold text-${color}-700 uppercase">${titulo}</div>
                <div class="text-xl font-display font-black text-${color}-800">${fmt(n)}</div>
                <div class="text-[10px] text-${color}-900 mt-1 space-y-0.5">${ej(estado).map(e => `<div class="truncate">${filaEj(e)}</div>`).join('')}</div>
            </div>`;
        zona.innerHTML = `
            <div class="text-sm font-bold text-slate-800 mb-1">Comparación: "${esc(esta.nombre)}" contra la vigente "${esc(vigente.nombre)}"</div>
            ${tipo === 'recetas' ? `<div class="text-xs text-slate-500 mb-3">Recetas totales: ${fmt(c.rx_base)} → <b>${fmt(c.rx_nuevo)}</b> · Médicos: ${fmt(c.medicos_base)} → <b>${fmt(c.medicos_nuevo)}</b></div>`
                                 : `<div class="text-xs text-slate-500 mb-3">Visitadores: ${fmt(c.visitadores_base)} → <b>${fmt(c.visitadores_nuevo)}</b></div>`}
            <div class="grid grid-cols-1 sm:grid-cols-4 gap-2 mb-4">
                ${bloque('Nuevas', 'emerald', c.nuevas, 'nueva')}
                ${bloque('Eliminadas', 'rose', c.eliminadas, 'eliminada')}
                ${bloque('Cambiadas', 'amber', c.cambiadas, 'cambiada')}
                ${bloque('Iguales', 'slate', c.iguales, 'igual')}
            </div>
            ${botonesPublicar(id, esta)}`;
    } catch (e) {
        console.error('[SegmentApp] Falló la comparación:', e);
        zona.innerHTML = `<div class="p-4 bg-rose-50 border border-rose-200 rounded-2xl text-sm text-rose-700 mb-3">No se pudo comparar: ${esc(e.message)}</div>${botonesPublicar(id, esta)}`;
    }
};

function botonesPublicar(id, version) {
    if (!version.archivo) return '<div class="text-xs text-rose-600 font-bold">Esta versión no tiene su archivo completo; termina la subida antes de publicarla.</div>';
    return `<div class="flex flex-wrap justify-end gap-2">
        <button onclick="App.carga.mostrarPestana('versiones')" class="px-5 py-2.5 text-slate-600 hover:bg-slate-100 rounded-full text-sm font-bold">Dejar como borrador</button>
        <button onclick="App.carga.publicar('${id}')" class="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-full text-sm font-bold shadow-md flex items-center gap-2">
            <span class="material-symbols-outlined text-[18px]">publish</span> Publicar (pasa a ser "Hoy")</button></div>`;
}

/* ---------- Paso 5: publicar / volver a una versión ---------- */
window.App.carga.publicar = async function(id) {
    const ui = window.App.ui;
    const v = (window.App.state.VERSIONES || []).find(x => x.id === id) || (await window.App.sb.versiones()).find(x => x.id === id);
    const nombre = v ? v.nombre : 'esta versión';
    if (!confirm(`¿Publicar "${nombre}"?\n\nPasará a ser la versión de HOY para todo el equipo. La versión anterior queda guardada y se puede volver a ella.`)) return;
    try {
        // Una versión de recetas cargada antes de este cambio puede no estar preparada todavía
        if (v && v.tipo === 'recetas') {
            ui.showToast('Preparando la versión para los visitadores...');
            await window.App.carga.prepararVersion(id);
        }
        await window.App.sb.publicar(id);
        ui.showToast(`"${nombre}" publicada. Cargando los datos nuevos...`);
        window.App.data.elegirVersion(v ? v.tipo : 'recetas', null);
        window.App.carga.cerrarPanel();
        await window.App.main.reintentarCarga();
    } catch (e) {
        console.error('[SegmentApp] No se pudo publicar:', e);
        ui.showToast('No se pudo publicar. Revisa tu conexión e intenta de nuevo.');
    }
};

window.App.carga.renombrar = async function(id) {
    const v = (window.App.state.VERSIONES || []).find(x => x.id === id);
    const nuevo = prompt('Nuevo nombre de la versión:', v ? v.nombre : '');
    if (!nuevo || !nuevo.trim()) return;
    try {
        await window.App.sb.actualizarVersion(id, { nombre: nuevo.trim() });
        window.App.ui.showToast('Nombre actualizado.');
        window.App.carga.renderVersiones();
    } catch (e) {
        window.App.ui.showToast('No se pudo renombrar.');
    }
};

window.App.carga.archivar = async function(id) {
    if (!confirm('¿Archivar este borrador? No se borra: solo deja de aparecer como pendiente.')) return;
    try {
        await window.App.sb.actualizarVersion(id, { estado: 'archivado' });
        window.App.carga.renderVersiones();
    } catch (e) {
        window.App.ui.showToast('No se pudo archivar.');
    }
};

window.App.carga.compararDesdeLista = async function(id, tipo) {
    await window.App.carga.mostrarComparacion(id, tipo, 'cargaComparacionLista');
};

/* ---------- Lista de versiones ---------- */
window.App.carga.renderVersiones = async function() {
    const zona = document.getElementById('cargaListaVersiones');
    zona.innerHTML = '<div class="p-6 text-center text-indigo-600 font-bold">Cargando versiones…</div>';
    document.getElementById('cargaComparacionLista').classList.add('hidden');
    try {
        const versiones = await window.App.sb.versiones();
        window.App.state.VERSIONES = versiones;
        const etiquetaEstado = (v) => v.es_vigente
            ? '<span class="text-[10px] font-bold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full">HOY (vigente)</span>'
            : ({ borrador: '<span class="text-[10px] font-bold bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">Borrador</span>',
                 publicado: '<span class="text-[10px] font-bold bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full">Anterior</span>',
                 archivado: '<span class="text-[10px] font-bold bg-slate-100 text-slate-400 px-2 py-0.5 rounded-full">Archivado</span>' })[v.estado];
        const acciones = (v) => {
            const b = [];
            if (!v.es_vigente && v.estado !== 'archivado') b.push(`<button onclick="App.carga.compararDesdeLista('${v.id}','${v.tipo}')" class="text-xs font-bold text-indigo-700 hover:bg-indigo-50 px-3 py-1.5 rounded-full">Comparar</button>`);
            if (!v.es_vigente && v.estado !== 'archivado' && v.archivo) b.push(`<button onclick="App.carga.publicar('${v.id}')" class="text-xs font-bold text-emerald-700 hover:bg-emerald-50 px-3 py-1.5 rounded-full">${v.estado === 'publicado' ? 'Volver a esta versión' : 'Publicar'}</button>`);
            b.push(`<button onclick="App.carga.renombrar('${v.id}')" class="text-xs font-bold text-slate-600 hover:bg-slate-100 px-3 py-1.5 rounded-full">Renombrar</button>`);
            if (v.estado === 'borrador') b.push(`<button onclick="App.carga.archivar('${v.id}')" class="text-xs font-bold text-slate-500 hover:bg-slate-100 px-3 py-1.5 rounded-full">Archivar</button>`);
            return b.join('');
        };
        const grupo = (tipo, titulo) => {
            const lista = versiones.filter(v => v.tipo === tipo);
            return `<div class="mb-5"><div class="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-2">${titulo}</div>
                ${lista.length ? lista.map(v => `
                    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 mb-2 bg-white border border-slate-200 rounded-2xl">
                        <div class="min-w-0"><div class="font-bold text-sm text-slate-800 flex items-center gap-2 flex-wrap">${esc(v.nombre)} ${etiquetaEstado(v)}</div>
                        <div class="text-[11px] text-slate-500">Corte: ${esc(v.fecha)} · ${fmt(v.filas)} filas${v.archivo ? '' : ' · sin archivo'}</div></div>
                        <div class="flex flex-wrap gap-1 shrink-0">${acciones(v)}</div>
                    </div>`).join('') : '<div class="text-xs text-slate-400 italic p-2">Sin versiones.</div>'}</div>`;
        };
        zona.innerHTML = grupo('recetas', 'Recetas (CloseUp)') + grupo('fichero', 'Fichero médico');
    } catch (e) {
        console.error('[SegmentApp] No se pudieron leer las versiones:', e);
        zona.innerHTML = '<div class="p-4 bg-rose-50 border border-rose-200 rounded-2xl text-rose-700 text-sm font-bold">No se pudieron leer las versiones. Revisa tu conexión.</div>';
    }
};

/* ============================================================
   ALIAS GLOBALES
============================================================ */
window.abrirCargaDatos = window.App.carga.abrirPanel;

console.log('[SegmentApp] carga-datos.js cargado.');

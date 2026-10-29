/* ============================================================
   SegmentApp - Carga, parseo y persistencia de datos
   Archivo: js/data.js
   Responsable de:
   - Descargar la versión de datos elegida desde Supabase (privado)
   - Parsear y normalizar datos (auditoría + fichero médico)
   - Guardar una copia local por versión (IndexedDB)
============================================================ */

window.App = window.App || {};
window.App.data = {};

/* ============================================================
   HELPERS PUROS (sin efectos secundarios)
============================================================ */

/* ------------------------------------------------------------
   NORMALIZE KEY
   Convierte IDs de médicos a una forma comparable.
   Ojo: elimina ceros a la izquierda y si el id tiene "_nombre"
   se queda solo con la parte de la matrícula.
------------------------------------------------------------ */
window.App.data.normalizeKey = function(key) {
    if (!key) return "";
    let s = String(key).trim();
    if (s.includes('_')) s = s.split('_')[0];
    return s.replace(/^0+/, '');
};

/* ------------------------------------------------------------
   IS PHQ
   Determina si un producto pertenece al portfolio del laboratorio.
------------------------------------------------------------ */
// Se memoriza por producto: 231 mil filas comparadas contra ~70 productos
// eran millones de comparaciones en cada filtro. Si cambia la lista, se reinicia.
let memoPhq = new Map(), listaMemoPhq = null;
window.App.data.isPhq = function(prodName) {
    if (!prodName) return false;
    const list = window.App.state.PHQ_PRODUCTS;
    if (list !== listaMemoPhq) { memoPhq = new Map(); listaMemoPhq = list; }
    let r = memoPhq.get(prodName);
    if (r === undefined) {
        const mayus = prodName.toUpperCase();
        r = list.some(p => mayus.includes(p));
        memoPhq.set(prodName, r);
    }
    return r;
};

/* ------------------------------------------------------------
   GET VALUE CASE INSENSITIVE
   Obtiene el valor de una propiedad buscando la clave sin importar
   mayúsculas/minúsculas.
------------------------------------------------------------ */
window.App.data.getValueCaseInsensitive = function(obj, keyPart) {
    if (!obj) return null;
    const foundKey = Object.keys(obj).find(k => k.toUpperCase().includes(keyPart.toUpperCase()));
    return foundKey ? obj[foundKey] : null;
};

/* ------------------------------------------------------------
   GET FICHERO REP KEY
   Detecta cuál columna del fichero médico representa al visitador.
------------------------------------------------------------ */
window.App.data.getFicheroRepKey = function(row) {
    if (!row) return null;
    const keys = Object.keys(row);
    let exactMatch = keys.find(k => k.toLowerCase().trim() === 'nombre del sector');
    if (exactMatch) return exactMatch;
    return keys.find(k => {
        const kLower = k.toLowerCase().trim();
        if (/^(visitador|asesor|representante|contacto|rep|asesor consultivo)$/.test(kLower)) return true;
        if (kLower.includes('asesor') || kLower.includes('visitador') || kLower.includes('representante') || kLower.includes('promotor') || kLower.includes('rep ')) {
            if (/(id|cod|código|zona|terr|freq|frec|cuota|num|cant|total)/.test(kLower)) return false;
            if (/^(visitas|visita|visitas mensuales|visitas_totales)$/.test(kLower)) return false;
            return true;
        }
        return false;
    });
};

/* ============================================================
   LAZY LOADING DE LIBRERÍAS (XLSX, jsPDF, html2canvas)
============================================================ */
window.App.data.loadLibrary = async function(name) {
    const LIBS = window.App.config.LIBRARIES;
    // Si ya está cargada, salir
    if (window[name] || (name === 'jspdf' && window.jspdf) || (name === 'xlsx' && window.XLSX)) {
        return true;
    }
    return new Promise((resolve, reject) => {
        window.App.ui.showToast('Descargando herramienta para exportar...');
        const script = document.createElement('script');
        script.src = LIBS[name];
        script.onload = () => resolve(true);
        script.onerror = () => {
            window.App.ui.showToast('Error al cargar la herramienta. Revisa tu conexión.');
            reject(false);
        };
        document.head.appendChild(script);
    });
};

/* ============================================================
   PARSEO DE CSV (ALTA PERFORMANCE)
============================================================ */
window.App.data.parseCSVFast = function(str) {
    const delim = str.indexOf('\t') !== -1 ? '\t' : (str.indexOf(';') !== -1 ? ';' : ',');
    const regex = new RegExp(`(\\${delim}|\\r?\\n|\\r|^)(?:"([^"]*(?:""[^"]*)*)"|([^"\\${delim}\\r\\n]*))`, 'gi');
    let result = [[]];
    let matches = null;
    while ((matches = regex.exec(str))) {
        let m1 = matches[1];
        if (m1.length && m1 !== delim) result.push([]);
        let val = matches[2] ? matches[2].replace(/""/g, '"') : matches[3];
        result[result.length - 1].push(val);
    }
    const headers = result[0].map(h => h ? h.trim() : "");
    const json = [];
    for (let i = 1; i < result.length; i++) {
        if (result[i].length === 1 && !result[i][0]) continue;
        let obj = {};
        for (let j = 0; j < headers.length; j++) {
            obj[headers[j] || `col_${j}`] = result[i][j] ? result[i][j].trim() : "";
        }
        json.push(obj);
    }
    return json;
};

/* ============================================================
   DESCARGA CON PROGRESO + DESCOMPRESIÓN GZIP
   url: dirección del archivo (enlace firmado del almacén privado)
   nombre: texto para la barra de progreso
============================================================ */
window.App.data.fetchFileAsJson = async function(url, nombre) {
    const ui = window.App.ui;
    ui.safeSetText('loadingText', `Conectando con Servidor...`);
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) throw new Error(`No se pudo descargar ${nombre} (HTTP ${response.status})`);

    const contentLength = response.headers.get('content-length');
    const total = contentLength ? parseInt(contentLength, 10) : 0;
    let loaded = 0;
    const reader = response.body.getReader();
    const chunks = [];

    const barContainer = document.getElementById('loadingBarContainer');
    const barFill = document.getElementById('loadingBarFill');
    const bytesText = document.getElementById('loadingBytes');
    if (barContainer) barContainer.classList.remove('hidden');
    if (bytesText)    bytesText.classList.remove('hidden');
    ui.safeSetText('loadingText', `Descargando ${nombre}...`);

    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value);
            loaded += value.length;
            if (total > 0) {
                const percent = Math.round((loaded / total) * 100);
                if (barFill) barFill.style.width = percent + '%';
                if (bytesText) bytesText.innerText = `${(loaded / 1048576).toFixed(2)} MB / ${(total / 1048576).toFixed(2)} MB`;
            } else {
                if (barFill) { barFill.style.width = '100%'; barFill.classList.add('animate-pulse'); }
                if (bytesText) bytesText.innerText = `${(loaded / 1048576).toFixed(2)} MB obtenidos...`;
            }
        }
    } finally {
        if (barFill) barFill.classList.remove('animate-pulse');
    }
    ui.safeSetText('loadingText', `Procesando ${nombre}...`);

    const combined = new Uint8Array(loaded);
    let position = 0;
    for (const chunk of chunks) { combined.set(chunk, position); position += chunk.length; }
    return window.App.data.parseCSVFast(await window.App.data.descomprimirTexto(combined));
};

// Descomprime gzip si hace falta (si el servidor ya lo descomprimió, lo deja igual)
window.App.data.descomprimirTexto = async function(bytes) {
    const esGzip = bytes.length > 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
    if (!esGzip) return new TextDecoder('utf-8').decode(bytes);
    const flujo = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    return await new Response(flujo).text();
};

/* ============================================================
   PARSEO DEL FICHERO MÉDICO (desde archivo nuevo)
============================================================ */
window.App.data.parseFicheroData = function(fichJson) {
    const st = window.App.state;
    st.FICHERO_MAP.clear();
    st.REP_MANAGER_MAP = {};

    fichJson.forEach(row => {
        const keys = Object.keys(row);
        let keyCol = keys.find(k => k.toLowerCase().trim() === 'matricula');
        if (!keyCol) {
            keyCol = keys.find(k =>
                k.toLowerCase().includes('matricula') ||
                k.toLowerCase().includes('licencia') ||
                k.toLowerCase().includes('license')
            );
        }
        const mgrKey = keys.find(k => k.toUpperCase().trim() === 'NOME_GER_DIS');
        const repKey = window.App.data.getFicheroRepKey(row);

        if (repKey && row[repKey] && mgrKey && row[mgrKey]) {
            st.REP_MANAGER_MAP[String(row[repKey]).trim().toUpperCase()] = String(row[mgrKey]).trim();
        }
        if (keyCol && row[keyCol]) {
            const normalizedKey = window.App.data.normalizeKey(row[keyCol]);
            if (!st.FICHERO_MAP.has(normalizedKey)) st.FICHERO_MAP.set(normalizedKey, []);
            st.FICHERO_MAP.get(normalizedKey).push(row);
        }
    });
};

/* ============================================================
   RESTAURAR FICHERO MÉDICO (desde IndexedDB)
============================================================ */
window.App.data.parseStoredFicheroData = function(savedArray) {
    const st = window.App.state;
    st.FICHERO_MAP = new Map(savedArray);
    st.REP_MANAGER_MAP = {};
    st.FICHERO_MAP.forEach(rows => {
        rows.forEach(row => {
            const keys = Object.keys(row);
            const mgrKey = keys.find(k => k.toUpperCase().trim() === 'NOME_GER_DIS');
            const repKey = window.App.data.getFicheroRepKey(row);
            if (repKey && row[repKey] && mgrKey && row[mgrKey]) {
                st.REP_MANAGER_MAP[String(row[repKey]).trim().toUpperCase()] = String(row[mgrKey]).trim();
            }
        });
    });
};

/* ============================================================
   PARSEO DE CSV DE AUDITORÍA (CloseUp)
============================================================ */
window.App.data.parseAuditData = function(json) {
    const st = window.App.state;
    st.RAW_DATA = [];
    json.forEach(row => {
        const vals = Object.values(row);
        if (vals.length >= 10) {
            st.RAW_DATA.push({
                doc:      String(vals[0] || "").trim(),
                license:  String(vals[1] || "").trim(),
                market:   String(vals[2] || "").trim(),
                prod:     String(vals[3] || "").trim(),
                rx:       parseInt(vals[4]) || 0,
                address:  String(vals[6] || "").trim(),
                zip:      String(vals[7] || "").trim(),
                city:     String(vals[8] || "").trim(),
                region:   String(vals[9] || "").trim(),
                spec:     String(vals[10] || "").trim(),
                molecule: String(vals[11] || "").trim(),
                class:    String(vals[12] || "").trim(),
                generic:  String(vals[13] || "").trim(),
                lab:      String(vals[14] || "").trim()
            });
        }
    });
    st.MARKET_CACHE = {};
};

/* ============================================================
   COPIA LOCAL (IndexedDB) DE LA VERSIÓN DESCARGADA
   Se identifica por usuario + modo + IDs de las versiones: si se
   publica una versión nueva o entra otra persona en el mismo
   equipo, la copia vieja deja de usarse sola.
============================================================ */
window.App.data.claveCopia = function(ids, modo = 'archivo') {
    const st = window.App.state;
    return `${st.usuarioId || '-'}|${modo}|${ids.fichero || '-'}|${ids.recetas || '-'}`;
};

window.App.data.saveSession = async function(ids, modo = 'archivo', paquete = null) {
    if (!window.localforage || !ids) return;
    const st = window.App.state;
    try {
        const t0 = performance.now();
        if (modo === 'equipo') {
            // Pocos KB: se guarda tal cual llegó y se vuelve a aplicar al abrir
            await localforage.removeItem('RAW_DATA_STR');
            await localforage.removeItem('FICHERO_DATA_STR');
            await localforage.setItem('EQUIPO_DATOS', paquete);
        } else {
            await localforage.removeItem('EQUIPO_DATOS');
            await localforage.setItem('RAW_DATA_STR', JSON.stringify(st.RAW_DATA));
            await localforage.setItem('FICHERO_DATA_STR', JSON.stringify(Array.from(st.FICHERO_MAP.entries())));
        }
        await localforage.setItem('DATA_COPIA', window.App.data.claveCopia(ids, modo));
        console.log(`[SegmentApp] Copia local guardada en ${Math.round(performance.now() - t0)}ms`);
    } catch (e) {
        console.error('[SegmentApp] No se pudo guardar la copia local:', e);
    }
};

async function restaurarCopia(ids, modo) {
    if (!window.localforage) return false;
    try {
        if ((await localforage.getItem('DATA_COPIA')) !== window.App.data.claveCopia(ids, modo)) return false;
        window.App.ui.safeSetText('loadingText', 'Abriendo la copia guardada en este dispositivo...');
        if (modo === 'equipo') {
            const paquete = await localforage.getItem('EQUIPO_DATOS');
            if (!paquete) return false;
            window.App.data.aplicarDatosEquipo(paquete);
            return true;
        }
        const audit = await localforage.getItem('RAW_DATA_STR');
        const fichero = await localforage.getItem('FICHERO_DATA_STR');
        if (!audit) return false;
        window.App.state.MARKET_SERVIDOR = null;
        window.App.state.RAW_DATA = JSON.parse(audit);
        if (fichero) window.App.data.parseStoredFicheroData(JSON.parse(fichero));
        return true;
    } catch (e) {
        console.error('[SegmentApp] Copia local dañada; se descargará de nuevo:', e);
        return false;
    }
}

/* ============================================================
   DATOS DE MI EQUIPO (VM y GD)
   El servidor envía solo los médicos del usuario, en formato
   compacto. Aquí se rearman EXACTAMENTE como si vinieran del
   archivo completo, para que todos los cálculos den lo mismo.
============================================================ */
window.App.data.aplicarDatosEquipo = function(p) {
    const st = window.App.state;
    const columnas = p.columnas || [];
    const encabezados = columnas.map((h, j) => String(h == null ? '' : h).trim() || `col_${j}`);
    const fichero = (p.fichero || []).map(valores => {
        const fila = {};
        encabezados.forEach((h, j) => { fila[h] = valores[j] ? String(valores[j]).trim() : ''; });
        return fila;
    });
    window.App.data.parseFicheroData(fichero);

    // Mismo orden de columnas que el archivo de recetas
    const filas = (p.recetas || []).map(([medico, mercado, producto, rx]) => {
        const m = p.medicos[medico], pr = p.productos[producto];
        return [m[1], m[0], p.mercados[mercado], pr[0], rx, m[2], m[3], m[4], m[5], m[6], m[7], pr[1], pr[2], pr[3], pr[4]];
    });
    window.App.data.parseAuditData(filas);

    // Clasificación nacional por mercado (la etiqueta se calcula con los umbrales actuales)
    const porMercado = {};
    (p.clasificacion || []).forEach(([mercado, matricula, total, phq, acumulado, totalMercado]) => {
        const nombre = p.mercados[mercado];
        if (!porMercado[nombre]) porMercado[nombre] = new Map();
        porMercado[nombre].set(matricula, { total: Number(total), phq: Number(phq), acumulado: Number(acumulado), totalMercado: Number(totalMercado) });
    });
    st.MARKET_SERVIDOR = porMercado;
};

/* ============================================================
   VERSIONES ELEGIDAS ("Hoy" = la vigente, o una anterior)
============================================================ */
window.App.data.versionesElegidas = function(versiones) {
    let elegidas = {};
    try { elegidas = JSON.parse(sessionStorage.getItem('VERSIONES_ELEGIDAS') || '{}'); } catch (e) { elegidas = {}; }
    const buscar = (tipo) => {
        const publicadas = versiones.filter(v => v.tipo === tipo && v.estado === 'publicado' && v.archivo);
        return publicadas.find(v => v.id === elegidas[tipo]) || publicadas.find(v => v.es_vigente) || null;
    };
    return { fichero: buscar('fichero'), recetas: buscar('recetas') };
};

window.App.data.elegirVersion = function(tipo, id) {
    let elegidas = {};
    try { elegidas = JSON.parse(sessionStorage.getItem('VERSIONES_ELEGIDAS') || '{}'); } catch (e) { elegidas = {}; }
    if (id) elegidas[tipo] = id; else delete elegidas[tipo];
    try { sessionStorage.setItem('VERSIONES_ELEGIDAS', JSON.stringify(elegidas)); } catch (e) { /* sin almacenamiento */ }
};

/* ============================================================
   CARGAR DATOS DESDE SUPABASE (después de iniciar sesión)
   Devuelve las versiones en uso: { fichero, recetas }
============================================================ */
window.App.data.cargarDatos = async function() {
    const st = window.App.state;
    const ui = window.App.ui;
    document.getElementById('emptyState').classList.add('hidden');
    document.getElementById('restoringSession').classList.remove('hidden');
    ui.safeSetText('loadingText', 'Buscando la versión de datos vigente...');

    let versiones;
    try {
        versiones = await window.App.sb.versiones();
        if (window.localforage) localforage.setItem('VERSIONES_CACHE', versiones);
    } catch (e) {
        // Sin conexión: usar la última lista conocida
        versiones = window.localforage ? (await localforage.getItem('VERSIONES_CACHE')) || [] : [];
        if (!versiones.length) throw e;
    }
    st.VERSIONES = versiones;
    const elegidas = window.App.data.versionesElegidas(versiones);
    st.VERSIONES_EN_USO = elegidas;
    if (!elegidas.recetas) {
        throw new Error('Todavía no hay una versión de recetas publicada. El administrador debe cargar y publicar una.');
    }
    const ids = { fichero: elegidas.fichero && elegidas.fichero.id, recetas: elegidas.recetas.id };
    // Admin y Gerente Nacional ven todo: archivo completo. VM y GD: solo lo suyo.
    const modo = ['admin', 'gte_nacional'].includes(st.rolReal) ? 'archivo' : 'equipo';

    if (!(await restaurarCopia(ids, modo))) {
        if (modo === 'equipo') {
            ui.safeSetText('loadingText', 'Descargando los datos de tus médicos...');
            const paquete = await window.App.sb.datosEquipo(ids.recetas, ids.fichero || null);
            window.App.data.aplicarDatosEquipo(paquete);
            window.App.data.saveSession(ids, modo, paquete);
        } else {
            const [fichero, recetas] = await Promise.all([
                elegidas.fichero
                    ? window.App.sb.urlArchivo(elegidas.fichero.archivo).then(url => window.App.data.fetchFileAsJson(url, 'fichero médico'))
                    : Promise.resolve(null),
                window.App.sb.urlArchivo(elegidas.recetas.archivo).then(url => window.App.data.fetchFileAsJson(url, 'recetas'))
            ]);
            st.MARKET_SERVIDOR = null;
            if (fichero) window.App.data.parseFicheroData(fichero);
            window.App.data.parseAuditData(recetas);
            window.App.data.saveSession(ids, modo);
        }
    }
    st.MARKET_CACHE = {};
    st._lastUniverseSignature = null;
    st._lastUniverseRows = null;
    st._lastGroups = null;
    return elegidas;
};

/* ------------------------------------------------------------
   ALIAS GLOBALES (compatibilidad con HTML actual)
------------------------------------------------------------ */
window.normalizeKey            = window.App.data.normalizeKey;
window.isPhq                   = window.App.data.isPhq;
window.getValueCaseInsensitive = window.App.data.getValueCaseInsensitive;
window.getFicheroRepKey        = window.App.data.getFicheroRepKey;
window.loadLibrary             = window.App.data.loadLibrary;
window.parseCSVFast            = window.App.data.parseCSVFast;
window.parseFicheroData        = window.App.data.parseFicheroData;
window.parseStoredFicheroData  = window.App.data.parseStoredFicheroData;
window.parseAuditData          = window.App.data.parseAuditData;

console.log('[SegmentApp] data.js cargado.');

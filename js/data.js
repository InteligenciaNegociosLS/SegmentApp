/* ============================================================
   SegmentApp - Carga, parseo y persistencia de datos
   Archivo: js/data.js
   Responsable de:
   - Leer CSV/Excel desde el repositorio o archivos subidos
   - Parsear y normalizar datos (auditoría + fichero médico)
   - Persistir en IndexedDB (localforage)
   - Restaurar la sesión al abrir la app
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
window.App.data.isPhq = function(prodName) {
    if (!prodName) return false;
    const list = window.App.state.PHQ_PRODUCTS;
    return list.some(p => prodName.toUpperCase().includes(p));
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
   LECTURA DE ARCHIVOS SUBIDOS POR EL USUARIO (Excel/CSV)
============================================================ */
window.App.data.readFileAsJson = function(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                resolve(XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval: "" }));
            } catch (err) {
                reject(err);
            }
        };
        reader.onerror = (err) => reject(err);
        reader.readAsArrayBuffer(file);
    });
};

/* ============================================================
   DESCARGA CON PROGRESO + DESCOMPRESIÓN GZIP
============================================================ */
window.App.data.fetchFileAsJson = async function(filename) {
    const ui = window.App.ui;
    try {
        ui.safeSetText('loadingText', `Conectando con Servidor...`);
        const response = await fetch(filename, { cache: "force-cache" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

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
        ui.safeSetText('loadingText', `Descargando ${filename.split('/').pop()}...`);

        // Leer archivo en fragmentos (Chunks) para animar la barra
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
        ui.safeSetText('loadingText', `Procesando base de datos...`);

        const combined = new Uint8Array(loaded);
        let position = 0;
        for (let chunk of chunks) { combined.set(chunk, position); position += chunk.length; }

        let text = "";
        // Si es GZIP, descomprimir nativamente
        if (filename.endsWith('.gz')) {
            try {
                const ds = new DecompressionStream('gzip');
                const writer = ds.writable.getWriter();
                writer.write(combined); writer.close();

                const output = [];
                const resReader = ds.readable.getReader();
                while (true) {
                    const { done, value } = await resReader.read();
                    if (done) break;
                    output.push(value);
                }
                const decCombined = new Uint8Array(output.reduce((acc, val) => acc + val.length, 0));
                let offset = 0;
                for (let chunk of output) { decCombined.set(chunk, offset); offset += chunk.length; }
                text = new TextDecoder('utf-8').decode(decCombined);
            } catch (e) {
                // Si el servidor ya descomprimió automáticamente
                text = new TextDecoder('utf-8').decode(combined);
            }
        } else if (filename.includes('.csv')) {
            text = new TextDecoder('utf-8').decode(combined);
        } else {
            // Excel antiguo
            const workbook = XLSX.read(combined.buffer, { type: 'array' });
            return XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval: "" });
        }
        return window.App.data.parseCSVFast(text);
    } catch (error) {
        console.warn(`Error cargando ${filename}:`, error);
        return null;
    } finally {
        const barFill = document.getElementById('loadingBarFill');
        if (barFill) barFill.classList.remove('animate-pulse');
    }
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
   PERSISTENCIA EN INDEXEDDB (localforage)
============================================================ */
window.App.data.saveSession = async function() {
    if (!window.localforage) return;
    const st = window.App.state;
    try {
        // Guardar RAW_DATA como JSON string (5-10x más rápido en IndexedDB Safari/iPad)
        const t0 = performance.now();
        await localforage.setItem('RAW_DATA_STR', JSON.stringify(st.RAW_DATA));
        await localforage.setItem('FICHERO_DATA_STR', JSON.stringify(Array.from(st.FICHERO_MAP.entries())));
        await localforage.setItem('PHQ_PRODUCTS', st.PHQ_PRODUCTS);
        await localforage.setItem('SURVEY_WEIGHTS', st.SURVEY_WEIGHTS);
        await localforage.setItem('SURVEY_THRESHOLDS', st.SURVEY_THRESHOLDS);
        // Guardar fingerprint: cantidad de registros + timestamp de guardado
        await localforage.setItem('DATA_FINGERPRINT', {
            rawCount: st.RAW_DATA.length,
            ficheroSize: st.FICHERO_MAP.size,
            savedAt: new Date().toISOString()
        });
        console.log(`[SegmentApp] Sesión guardada en ${Math.round(performance.now() - t0)}ms (${st.RAW_DATA.length} registros como string)`);
    } catch (e) {
        console.error('[SegmentApp] Error al guardar sesión:', e);
    }
};
/* ============================================================
   INICIALIZAR STORAGE Y RESTAURAR SESIÓN
============================================================ */
window.App.data.initStorage = async function() {
    if (!window.localforage) return;
    const st = window.App.state;
    const ui = window.App.ui;

    localforage.config({ name: 'PHQ_Matrix_DB', storeName: 'session_data' });

    try {
        document.getElementById('emptyState').classList.add('hidden');
        document.getElementById('restoringSession').classList.remove('hidden');

        const t0 = performance.now();

        // Intentar formato optimizado (string) primero, fallback al formato viejo (array)
        let savedAudit = null;
        let savedFichero = null;
        const savedAuditStr = await localforage.getItem('RAW_DATA_STR');
        if (savedAuditStr) {
            ui.safeSetText('loadingText', 'Restaurando sesión (caché rápido)...');
            savedAudit = JSON.parse(savedAuditStr);
            const savedFicheroStr = await localforage.getItem('FICHERO_DATA_STR');
            if (savedFicheroStr) savedFichero = JSON.parse(savedFicheroStr);
            console.log(`[SegmentApp] Caché STRING leído en ${Math.round(performance.now() - t0)}ms`);
        } else {
            // Fallback: formato viejo (migración automática)
            savedAudit = await localforage.getItem('RAW_DATA');
            savedFichero = await localforage.getItem('FICHERO_DATA');
            if (savedAudit && savedAudit.length > 0) {
                console.log(`[SegmentApp] Caché LEGACY leído en ${Math.round(performance.now() - t0)}ms — se migrará al formato rápido`);
            }
        }

        const savedConfig     = await localforage.getItem('PHQ_PRODUCTS');
        const savedWeights    = await localforage.getItem('SURVEY_WEIGHTS');
        const savedThresholds = await localforage.getItem('SURVEY_THRESHOLDS');

        if (savedWeights)    st.SURVEY_WEIGHTS = savedWeights;
        if (savedThresholds) st.SURVEY_THRESHOLDS = savedThresholds;

        if (savedAudit && savedAudit.length > 0) {
            ui.safeSetText('loadingText', 'Procesando datos...');
            st.RAW_DATA = savedAudit;
            if (savedFichero) {
                // Si viene del formato string, ya es un array de entries
                if (savedFichero instanceof Map) {
                    window.App.data.parseStoredFicheroData(Array.from(savedFichero.entries()));
                } else {
                    window.App.data.parseStoredFicheroData(savedFichero);
                }
            }
            if (savedConfig) st.PHQ_PRODUCTS = savedConfig;
            await processData(true);

            // Si venía del formato viejo, migrar al nuevo automáticamente
            if (!savedAuditStr) {
                console.log('[SegmentApp] Migrando caché al formato rápido...');
                window.App.data.saveSession();
                // Limpiar formato viejo para no duplicar espacio
                localforage.removeItem('RAW_DATA');
                localforage.removeItem('FICHERO_DATA');
            }

            const totalMs = Math.round(performance.now() - t0);
            console.log(`[SegmentApp] ✅ Sesión restaurada en ${totalMs}ms (${savedAudit.length} registros)`);
            ui.showToast('Sesión restaurada correctamente');
        } else {
            ui.safeSetText('loadingText', 'Buscando datos en el repositorio...');
            window.App.data.loadRepoData();
        }
    } catch (err) {
        console.error('[SegmentApp] Storage Error:', err);
        window.App.data.loadRepoData();
    }
};

/* ============================================================
   CARGA AUTOMÁTICA DESDE EL REPOSITORIO (GitHub/Vercel)
============================================================ */
window.App.data.loadRepoData = async function() {
    const FILES = window.App.config.FILES;
    const ui = window.App.ui;

    document.getElementById('emptyState').classList.add('hidden');
    document.getElementById('restoringSession').classList.remove('hidden');
    ui.safeSetText('loadingText', 'Descargando archivos del servidor...');

    try {
        const [auditData, ficheroData] = await Promise.all([
            window.App.data.fetchFileAsJson(FILES.AUDIT),
            window.App.data.fetchFileAsJson(FILES.FICHERO)
        ]);
        let dataLoaded = false;
        if (ficheroData) window.App.data.parseFicheroData(ficheroData);
        if (auditData && auditData.length > 0) {
            window.App.data.parseAuditData(auditData);
            dataLoaded = true;
        }
        if (dataLoaded) {
            await processData(true); // orquestador en main.js
            ui.showToast('Datos cargados desde GitHub exitosamente');
        } else {
            document.getElementById('restoringSession').classList.add('hidden');
            document.getElementById('emptyState').classList.remove('hidden');
        }
    } catch (error) {
        console.error('[SegmentApp] Error en carga automática:', error);
        document.getElementById('restoringSession').classList.add('hidden');
        document.getElementById('emptyState').classList.remove('hidden');
        ui.showToast('Error conectando con el repositorio local');
    }
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
window.readFileAsJson          = window.App.data.readFileAsJson;
window.fetchFileAsJson         = window.App.data.fetchFileAsJson;
window.parseFicheroData        = window.App.data.parseFicheroData;
window.parseStoredFicheroData  = window.App.data.parseStoredFicheroData;
window.parseAuditData          = window.App.data.parseAuditData;
window.saveSession             = window.App.data.saveSession;
window.initStorage             = window.App.data.initStorage;
window.loadRepoData            = window.App.data.loadRepoData;

console.log('[SegmentApp] data.js cargado.');

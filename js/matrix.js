/* ============================================================
   SegmentApp - Matriz 9-Box y Tabla Principal
   Archivo: js/matrix.js
   Responsable de:
   - Calcular la matriz (Potencialidad x Adopción)
   - Agregar y calcular datos por médico
   - Renderizar la grilla de 9 celdas
   - Renderizar la tabla principal con paginación
   - Dashboard principal (KPIs y composición del mercado)
   - Interacción de filtro por clic en celda
   - Toggle CloseUp / Encuesta
============================================================ */

window.App = window.App || {};
window.App.matrix = {};

/* ============================================================
   PUNTAJE OBJETIVO DE LA ENCUESTA
============================================================ */

// Convierte textos tipo "10 a 20" o "Más de 40" en un número promedio
window.App.matrix.parseSurveyRange = function(val) {
    if (!val || val === "0" || val === "0 (Ninguno)") return 0;
    if (val.includes("Más de")) {
        let m = val.match(/\d+/);
        return m ? parseInt(m[0]) + 5 : 0;
    }
    if (val.includes("Menos de")) {
        let m = val.match(/\d+/);
        return m ? parseInt(m[0]) / 2 : 0;
    }
    const pts = val.split(" a ");
    if (pts.length === 2) return (parseInt(pts[0]) + parseInt(pts[1])) / 2;
    return 0;
};

// Calcula el puntaje objetivo: Potencialidad (Q1+Q2+Q5) y Fidelidad (Q3/Q2)
window.App.matrix.calculateObjectiveScore = function(survey) {
    const st = window.App.state;
    if (!survey) return { score: 0, label: "N/A", pot: "", loy: "" };

    let score = 0;
    const W = st.SURVEY_WEIGHTS;
    if (W.q1 && W.q1[survey.q1]) score += Number(W.q1[survey.q1]);
    if (W.q2 && W.q2[survey.q2]) score += Number(W.q2[survey.q2]);
    if (W.q5 && W.q5[survey.q5]) score += Number(W.q5[survey.q5]);

    // Eje X: POTENCIALIDAD (basada en puntaje total)
    let pot = 'C';
    if (score >= st.SURVEY_THRESHOLDS.A)      pot = 'A';
    else if (score >= st.SURVEY_THRESHOLDS.B) pot = 'B';

    // Eje Y: ADOPCIÓN (Q3 / Q2)
    const q2_val = window.App.matrix.parseSurveyRange(survey.q2);
    const q3_val = window.App.matrix.parseSurveyRange(survey.q3);
    const fidelityPct = q2_val > 0 ? (q3_val / q2_val) * 100 : 0;

    let loySign = '-';
    let loyLetter = 'C';
    if (fidelityPct >= st.TH_LOY_HIGH) { loySign = '+'; loyLetter = 'A'; }
    else if (fidelityPct > st.TH_LOY_LOW) { loySign = ''; loyLetter = 'B'; }

    return { score, label: pot + loySign, pot, loy: loyLetter };
};

/* ============================================================
   CLASIFICACIÓN POR MERCADO (caché)
============================================================ */
window.App.matrix.getDoctorMarketClassification = function(docId, targetMarket) {
    const st = window.App.state;
    const d  = window.App.data;
    if (!targetMarket || targetMarket === 'General') return "";

    // VM y GD: los totales nacionales vienen del servidor; aquí solo se aplican los umbrales
    if (st.MARKET_SERVIDOR) {
        const g = st.MARKET_SERVIDOR[targetMarket] && st.MARKET_SERVIDOR[targetMarket].get(d.normalizeKey(docId));
        if (!g) return "";
        const pct = g.totalMercado > 0 ? (g.acumulado / g.totalMercado) * 100 : 100;
        const p = pct <= st.TH_POT_LOW ? 'A' : (pct <= st.TH_POT_HIGH ? 'B' : 'C');
        const share = g.total > 0 ? (g.phq / g.total) * 100 : 0;
        const l = share >= st.TH_LOY_HIGH ? 'A' : (share > st.TH_LOY_LOW ? 'B' : 'C');
        return p + (l === 'C' ? '-' : (l === 'A' ? '+' : ''));
    }

    if (!st.MARKET_CACHE[targetMarket]) {
        const mktRows = st.RAW_DATA.filter(r => r.market === targetMarket);
        const grouped = {};
        mktRows.forEach(r => {
            if (!grouped[r.license]) grouped[r.license] = { rxTotal: 0, rxPhq: 0 };
            grouped[r.license].rxTotal += r.rx;
            if (d.isPhq(r.prod)) grouped[r.license].rxPhq += r.rx;
        });
        const docs = Object.keys(grouped).map(k => ({ id: k, ...grouped[k] }));
        docs.sort((a, b) => b.rxTotal - a.rxTotal);

        const gTotal = docs.reduce((s, d) => s + d.rxTotal, 0);
        let run = 0;
        docs.forEach(doc => {
            run += doc.rxTotal;
            const pct = gTotal > 0 ? (run / gTotal) * 100 : 100;
            const p = pct <= st.TH_POT_LOW ? 'A' : (pct <= st.TH_POT_HIGH ? 'B' : 'C');
            const share = doc.rxTotal > 0 ? (doc.rxPhq / doc.rxTotal) * 100 : 0;
            const l = share >= st.TH_LOY_HIGH ? 'A' : (share > st.TH_LOY_LOW ? 'B' : 'C');
            doc.matrixLabel = p + (l === 'C' ? '-' : (l === 'A' ? '+' : ''));
        });
        const byKey = new Map();
        docs.forEach(doc => {
            const k = d.normalizeKey(doc.id);
            if (!byKey.has(k)) byKey.set(k, doc);
        });
        st.MARKET_CACHE[targetMarket] = byKey;
    }
    const found = st.MARKET_CACHE[targetMarket].get(d.normalizeKey(docId));
    return found ? found.matrixLabel : "";
};

/* ============================================================
   GENERACIÓN DE LA GRILLA DE 9 CELDAS (HTML estático)
============================================================ */
window.App.matrix.generateMatrixGridHTML = function() {
    const container = document.getElementById('matrixContainer');
    if (!container) return;

    const cellIds = [
        { id: 'cell_A_C', label: 'A-', title: 'Conquistar' },
        { id: 'cell_A_B', label: 'A',  title: 'Desarrollar' },
        { id: 'cell_A_A', label: 'A+', title: 'Defender' },
        { id: 'cell_B_C', label: 'B-', title: 'Conquistar' },
        { id: 'cell_B_B', label: 'B',  title: 'Desarrollar' },
        { id: 'cell_B_A', label: 'B+', title: 'Defender' },
        { id: 'cell_C_C', label: 'C-', title: 'Revisar' },
        { id: 'cell_C_B', label: 'C',  title: 'Desarrollar' },
        { id: 'cell_C_A', label: 'C+', title: 'Defender' }
    ];

    let html = '';
    cellIds.slice(0, 3).forEach(c => html += window.App.matrix.generateSingleCellHTML(c));
    html += window.App.matrix.generateSummaryCellHTML('row_A', 'Potencial A');

    html += `<div class="matrix-header-row">
        <span class="text-slate-700 text-center font-bold">Potencial medio (B)</span>
        <span class="text-[10px] font-medium text-slate-500 mt-2 hidden sm:inline" id="row_label_B">33% - 66%</span>
    </div>`;
    cellIds.slice(3, 6).forEach(c => html += window.App.matrix.generateSingleCellHTML(c));
    html += window.App.matrix.generateSummaryCellHTML('row_B', 'Potencial B');

    html += `<div class="matrix-header-row">
        <span class="text-slate-700 text-center font-bold">Potencial bajo (C)</span>
        <span class="text-[10px] font-medium text-slate-500 mt-2 hidden sm:inline" id="row_label_C">> 66%</span>
    </div>`;
    cellIds.slice(6, 9).forEach(c => html += window.App.matrix.generateSingleCellHTML(c));
    html += window.App.matrix.generateSummaryCellHTML('row_C', 'Potencial C');

    html += `<div class="summary-element hidden items-center justify-end font-bold text-xs text-slate-500 uppercase tracking-wide pr-4">Resumen Adopción</div>`;
    html += window.App.matrix.generateSummaryCellHTML('col_C', 'Adopción Baja');
    html += window.App.matrix.generateSummaryCellHTML('col_B', 'Adopción Media');
    html += window.App.matrix.generateSummaryCellHTML('col_A', 'Adopción Alta');
    html += `<div class="summary-element hidden bg-slate-100 rounded-3xl items-center justify-center text-xs text-slate-500 font-display font-bold uppercase tracking-widest border border-slate-200">Universo<br>Total</div>`;

    container.innerHTML = html;
};

window.App.matrix.generateSingleCellHTML = function(c) {
    const key = c.id.replace('cell_', '');
    const [pot, loy] = key.split('_');
    return `
    <div class="matrix-cell group cell-${key}" id="${c.id}" role="button" tabindex="0" aria-label="Cuadrante ${c.label}: ${c.title}"
         onclick="filterByMatrix('${pot}', '${loy}')" onkeydown="if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); filterByMatrix('${pot}', '${loy}'); }">
        <div class="cell-tooltip" id="tooltip_${key}">Top: Cargando...</div>
        <div class="celda-cabecera flex justify-between items-center pointer-events-none">
            <span class="font-bold text-[11px] uppercase tracking-widest opacity-80">${c.title}</span>
            <button onclick="toggleStats(event, '${key}')" class="pointer-events-auto opacity-60 w-9 h-9 -m-2 rounded-full flex items-center justify-center" title="Ver promedios"><span class="material-symbols-outlined text-[18px]">query_stats</span></button>
        </div>
        <div class="flex-1 flex flex-col items-center justify-center py-2 pointer-events-none">
            <div class="celda-letra letter-display">${c.label}</div>
            <div class="celda-cuenta mt-1 flex items-center gap-1"><span class="material-symbols-outlined text-[20px] opacity-70">groups</span><span id="count_${key}">0</span><span class="text-[11px] font-semibold opacity-70">méd.</span></div>
        </div>
        <div class="celda-detalle grid grid-cols-3 gap-1 text-[10px] font-medium text-center opacity-90 pointer-events-none">
            <div title="Recetas del mercado"><div class="opacity-70 flex items-center justify-center gap-0.5"><span class="material-symbols-outlined text-[13px]">receipt_long</span>Recetas</div><div class="font-bold font-mono text-[12px]" id="rx_${key}">0</div></div>
            <div title="Recetas La Santé"><div class="opacity-70 flex items-center justify-center gap-0.5"><span class="material-symbols-outlined text-[13px]">pill</span>La Santé</div><div class="font-bold font-mono text-[12px]" id="phq_${key}">0</div></div>
            <div title="Participación"><div class="opacity-70 flex items-center justify-center gap-0.5"><span class="material-symbols-outlined text-[13px]">donut_large</span>Part.</div><div class="font-bold text-[12px]" id="ms_${key}">0%</div></div>
        </div>
        <div class="stats-drawer text-[10px] flex justify-between px-3 bg-black/5 rounded-xl pointer-events-auto" id="drawer_${key}">
            <div class="flex flex-col items-center py-2 opacity-80"><span class="uppercase tracking-wide text-[8px] font-bold">Media Tot</span><span class="font-bold text-xs font-mono" id="avg_tot_${key}">0</span></div>
            <div class="flex flex-col items-center py-2 opacity-80"><span class="uppercase tracking-wide text-[8px] font-bold">Media Lab</span><span class="font-bold text-xs font-mono" id="avg_phq_${key}">0</span></div>
        </div>
        <div class="celda-barra pointer-events-none" title="Porcentaje de médicos en este cuadrante"><span id="barra_${key}" style="width:0%"></span></div>
        <div class="celda-pct text-center text-[10px] font-bold opacity-70 mt-1 pointer-events-none"><span id="pct_drs_${key}">0%</span> de los médicos</div>
    </div>`;
};

window.App.matrix.generateSummaryCellHTML = function(id, title) {
    return `
    <div class="matrix-cell-summary summary-element hidden" id="sum_${id}">
         <div class="text-center mb-4"><span class="font-bold text-[10px] uppercase tracking-widest text-slate-500 border-b border-slate-300 pb-2 block">${title}</span></div>
         <div class="space-y-3 text-xs font-medium">
            <div class="flex justify-between items-center"><span class="text-slate-500 flex items-center gap-1"><span class="material-symbols-outlined text-[14px]">receipt_long</span>Total</span> <span class="font-bold text-slate-700 font-mono text-[13px]" id="${id}_rx">0</span></div>
            <div class="flex justify-between items-center"><span class="text-blue-600 flex items-center gap-1"><span class="material-symbols-outlined text-[14px]">pill</span>Lab</span> <span class="font-bold text-blue-700 font-mono text-[13px]" id="${id}_phq">0</span></div>
            <div class="flex justify-between items-center"><span class="text-green-600 flex items-center gap-1"><span class="material-symbols-outlined text-[14px]">donut_large</span>Share</span> <span class="font-bold text-green-700 text-[13px]" id="${id}_share">0%</span></div>
            <div class="w-full h-px bg-slate-300 my-3"></div>
            <div class="flex justify-between items-center"><span class="font-bold text-slate-600 uppercase tracking-widest text-[10px]">Médicos</span> <span class="font-display font-black text-xl text-slate-800" id="${id}_count">0</span></div>
         </div>
    </div>`;
};

/* ============================================================
   SLIDERS DE UMBRALES (admin)
============================================================ */
window.App.matrix.updateThresholds = function() {
    const st = window.App.state;
    const ui = window.App.ui;

    const low     = parseInt(document.getElementById('sliderLow').value);
    const high    = parseInt(document.getElementById('sliderHigh').value);
    const potLow  = parseInt(document.getElementById('sliderPotLow').value);
    const potHigh = parseInt(document.getElementById('sliderPotHigh').value);
    if (low >= high || potLow >= potHigh) return;

    st.TH_LOY_LOW = low;   st.TH_LOY_HIGH = high;
    st.TH_POT_LOW = potLow; st.TH_POT_HIGH = potHigh;

    ui.safeSetText('lblThLow', low + '%');
    ui.safeSetText('lblThHigh', high + '%');
    ui.safeSetText('lblPotLow', potLow + '%');
    ui.safeSetText('lblPotHigh', potHigh + '%');
    ui.safeSetText('header_label_C', `≤ ${low}%`);
    ui.safeSetText('header_label_B', `${low}% - ${high}%`);
    ui.safeSetText('header_label_A', `≥ ${high}%`);
    ui.safeSetText('row_label_A', `Top ${potLow}%`);
    ui.safeSetText('row_label_B', `${potLow}% - ${potHigh}%`);
    ui.safeSetText('row_label_C', `> ${potHigh}%`);

    if (st.PROCESSED_DATA.length > 0) window.App.filters.applyFilters();
};

/* ============================================================
   TOGGLE CLOSEUP / ENCUESTA
============================================================ */
window.App.matrix.switchMatrixMode = function(mode) {
    window.App.state.currentMatrixMode = mode;
    const btnData   = document.getElementById('btnMatrixData');
    const btnSurvey = document.getElementById('btnMatrixSurvey');

    // Botón segmentado: el elegido queda relleno (primary) y el otro sin fondo
    [[btnData, mode === 'closeup'], [btnSurvey, mode !== 'closeup']].forEach(([btn, activo]) => {
        btn.classList.toggle('bg-blue-600', activo);
        btn.classList.toggle('text-white', activo);
        btn.classList.toggle('shadow-sm', activo);
        btn.classList.toggle('text-slate-500', !activo);
        btn.setAttribute('aria-pressed', activo ? 'true' : 'false');
    });

    window.App.ui.showToast(mode === 'closeup' ? 'Viendo Matriz: Datos de Rx' : 'Viendo Matriz: Encuestas Asesor');
    window.App.matrix.aggregateAndCalculate();
};

/* ============================================================
   AGGREGATE AND CALCULATE — el cálculo más pesado de la app
============================================================ */
/* ------------------------------------------------------------
   CÁLCULO (sin dibujar nada): de las filas de recetas a la lista de
   médicos con su cuadrante. Se usa para los datos actuales y, con la
   misma regla, para la versión anterior (movimientos y tendencias).
   usarCache: solo para los datos actuales.
------------------------------------------------------------ */
window.App.matrix.calcularMedicos = function(filasFuente, usarCache = false) {
    const st = window.App.state;
    const d  = window.App.data;

    const fStatus  = document.getElementById('filterStatus').value;
    const fGeneric = document.getElementById('filterGeneric')?.value || 'all';

    // Generar firma del estado de filtros (para detectar cambios)
    const filterSignature = JSON.stringify({
        Market: st.FILTER_STATE.Market,
        Region: st.FILTER_STATE.Region,
        Spec: st.FILTER_STATE.Spec,
        Molecule: st.FILTER_STATE.Molecule,
        Class: st.FILTER_STATE.Class,
        Lab: st.FILTER_STATE.Lab,
        Generic: fGeneric
    });

    // Si los filtros pesados no cambiaron, usar el universo cacheado.
    // Se recuerdan los últimos 4 universos (con su agrupación por médico): ir y
    // volver entre un mercado y "Todos" ya no repite el trabajo con 28 mil médicos.
    if (!st._cacheUniversos || st._cacheUniversosDatos !== filasFuente) { st._cacheUniversos = new Map(); st._cacheUniversosDatos = filasFuente; }
    const recordado = usarCache && st._lastUniverseSignature !== null ? st._cacheUniversos.get(filterSignature) : null;
    let universeRows;
    if (usarCache && st._lastUniverseSignature === filterSignature && st._lastUniverseRows) {
        universeRows = st._lastUniverseRows;
    } else if (recordado) {
        universeRows = recordado.filas;
        st._lastUniverseSignature = filterSignature;
        st._lastUniverseRows = universeRows;
        st._lastGroupsRows = universeRows;
        st._lastGroups = recordado.grupos;
    } else {
        // Recalcular universo desde cero
        // Conjuntos (búsqueda instantánea) en vez de recorrer cada lista por fila
        const fs = st.FILTER_STATE;
        const mk = new Set(fs.Market), rg = new Set(fs.Region), sp = new Set(fs.Spec),
              mo = new Set(fs.Molecule), cl = new Set(fs.Class), lb = new Set(fs.Lab);
        universeRows = filasFuente.filter(row => {
            if (!mk.has(row.market))   return false;
            if (!rg.has(row.region))   return false;
            if (!sp.has(row.spec))     return false;
            if (!mo.has(row.molecule)) return false;
            if (!cl.has(row.class))    return false;
            if (!lb.has(row.lab))      return false;
            if (fGeneric !== 'all' && row.generic !== fGeneric)   return false;
            return true;
        });
        // Guardar en cache para próximas llamadas
        if (usarCache) {
            st._lastUniverseSignature = filterSignature;
            st._lastUniverseRows = universeRows;
        }
    }

    // Agrupación por médico (ID único = matrícula + nombre).
    // Solo depende del universo: si cambian productos, visitadores, umbrales
    // o el modo de la matriz, se reutiliza la agrupación anterior.
    let grupos;
    if (usarCache && st._lastGroupsRows === universeRows && st._lastGroups) {
        grupos = st._lastGroups;
    } else {
        const docMap = {};
        universeRows.forEach(row => {
            // El id no cambia entre filtros: se calcula una vez y se guarda en la fila
            let id = row._id;
            if (id === undefined) {
                const cleanLicense = row.license ? String(row.license).trim().replace(/^0+/, '') : "";
                id = row._id = cleanLicense + "_" + row.doc.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
                row._clave = d.normalizeKey(id);
            }
            let g = docMap[id];
            if (!g) g = docMap[id] = { id, clave: row._clave, name: row.doc, address: row.address, spec: row.spec, rows: [], uniqueProds: {} };
            g.rows.push(row);
            g.uniqueProds[row.prod] = Math.max(g.uniqueProds[row.prod] || 0, row.rx);
        });
        grupos = Object.values(docMap);
        grupos.forEach(g => { g.prodsLista = Object.entries(g.uniqueProds); });
        if (usarCache) {
            st._lastGroupsRows = universeRows;
            st._lastGroups = grupos;
            if (st._lastUniverseSignature === filterSignature) {
                st._cacheUniversos.delete(filterSignature);
                st._cacheUniversos.set(filterSignature, { filas: universeRows, grupos });
                if (st._cacheUniversos.size > 4) st._cacheUniversos.delete(st._cacheUniversos.keys().next().value);
            }
        }
    }

    // Totales reales por producto (para "Principal Competidor")
    const realProductTotals = {};
    const todosLosProductos = st.FILTER_STATE.Product.length === st.FILTER_OPTIONS.Product.length;
    const productosElegidos = new Set(st.FILTER_STATE.Product);
    const docMap = grupos.map(g => {
        const doc = { id: g.id, _clave: g.clave, name: g.name, address: g.address, spec: g.spec, rxPhq: 0, rxTotalSum: 0, rows: g.rows, uniqueProds: g.uniqueProds };
        g.prodsLista.forEach(([prod, rx]) => {
            doc.rxTotalSum += rx;
            if (d.isPhq(prod) && (todosLosProductos || productosElegidos.has(prod))) {
                doc.rxPhq += rx;
            }
            realProductTotals[prod] = (realProductTotals[prod] || 0) + rx;
        });
        return doc;
    });
    const compBreakdown = Object.entries(realProductTotals)
        .map(([k, v]) => ({ prod: k, rx: v, type: d.isPhq(k) ? 'PHQ' : 'Comp' }))
        .sort((a, b) => b.rx - a.rx);

    // Cálculo de share, gap y categoría de adopción
    let doctors = docMap.map(doc => {
        const denominator = doc.rxTotalSum;
        const share = denominator > 0 ? (doc.rxPhq / denominator) * 100 : 0;
        let catLoyalty = 'C';
        if      (share >= st.TH_LOY_HIGH) catLoyalty = 'A';
        else if (share >  st.TH_LOY_LOW)  catLoyalty = 'B';

        let targetLabel = "", gap = 0;
        if (share < st.TH_LOY_LOW) {
            gap = Math.ceil(denominator * (st.TH_LOY_LOW / 100)) - doc.rxPhq;
            targetLabel = `para ser B (${st.TH_LOY_LOW}%)`;
        } else if (share < st.TH_LOY_HIGH) {
            gap = Math.ceil(denominator * (st.TH_LOY_HIGH / 100)) - doc.rxPhq;
            targetLabel = `para ser A (${st.TH_LOY_HIGH}%)`;
        }
        if (gap < 0) gap = 0;

        return {
            ...doc, totalRx: denominator, share, catLoyalty, gap, targetLabel,
            ficheroData: st.FICHERO_MAP.get(doc._clave) || [],
            isZeroRx: false
        };
    });

    // Solo los médicos de los visitadores permitidos (VM: los suyos; GD: los de su distrito)
    let visTotalFichero = 0, visTotalCruzados = 0;
    const repsPermitidos = st.REPS_PERMITIDOS ||
        (st.currentUserRole === 'visitador' ? new Set([String(st.currentVisitadorName).toUpperCase().trim()]) : null);
    if (repsPermitidos) {
        const assignedDocsMap = new Map();
        st.FICHERO_MAP.forEach((rows, docId) => {
            const isAssigned = rows.some(fRow => {
                const repKey = d.getFicheroRepKey(fRow);
                return repKey && fRow[repKey] && repsPermitidos.has(String(fRow[repKey]).toUpperCase().trim());
            });
            if (isAssigned) { visTotalFichero++; assignedDocsMap.set(docId, rows); }
        });
        doctors = doctors.filter(doc => {
            const hasAssigned = assignedDocsMap.has(doc._clave);
            if (hasAssigned) visTotalCruzados++;
            return hasAssigned;
        });
        // Agregar médicos del fichero sin Rx
        const conRx = new Set(doctors.map(x => x._clave));
        assignedDocsMap.forEach((rows, docId) => {
            if (!conRx.has(docId)) {
                const baseRow = rows[0];
                let nameKey = Object.keys(baseRow).find(k => /^(nombre|medico|médico|doctor|doc)$/i.test(k.trim().toLowerCase()));
                if (!nameKey) nameKey = Object.keys(baseRow).find(k => /nombre|med|doc/i.test(k) && !/visit|rep|agente|promotor|asesor/i.test(k));
                const specKey = Object.keys(baseRow).find(k => /esp|spec/i.test(k));
                const addrKey = Object.keys(baseRow).find(k => /dir|address|inst/i.test(k));
                doctors.push({
                    id: docId, _clave: docId,
                    name: (nameKey && baseRow[nameKey]) ? String(baseRow[nameKey]).trim() : `Médico no mapeado (${docId})`,
                    spec: (specKey && baseRow[specKey]) ? String(baseRow[specKey]).trim() : "S/E",
                    address: (addrKey && baseRow[addrKey]) ? String(baseRow[addrKey]).trim() : "",
                    rxPhq: 0, totalRx: 0, rxTotalSum: 0, share: 0, catLoyalty: 'C', gap: 0,
                    targetLabel: "", ficheroData: rows, rows: [], isZeroRx: true
                });
            }
        });
    }

    // Filtro de asesores (no aplica en modo visitador)
    if (st.FILTER_STATE.Rep.length < st.FILTER_OPTIONS.Rep.length && st.currentUserRole !== 'visitador') {
        doctors = doctors.filter(doc => doc.ficheroData.some(row => {
            const repKey = d.getFicheroRepKey(row);
            return repKey && st.FILTER_STATE.Rep.includes(String(row[repKey]).trim().toUpperCase());
        }));
    }

    if (fStatus !== 'all') {
        doctors = doctors.filter(doc => {
            const isFichado = doc.ficheroData && doc.ficheroData.length > 0;
            return fStatus === 'fichados' ? isFichado : !isFichado;
        });
    }

    const grandTotalRx = doctors.reduce((s, x) => s + x.totalRx, 0);
    doctors.sort((a, b) => b.totalRx - a.totalRx);

    // Pareto de potencialidad + etiqueta final
    let runningTotal = 0;
    doctors = doctors.map(doc => {
        runningTotal += doc.totalRx;
        const cumPct = grandTotalRx > 0 ? (runningTotal / grandTotalRx) : 1;
        doc.closeupPotency = (cumPct * 100) <= st.TH_POT_LOW
            ? 'A'
            : ((cumPct * 100) <= st.TH_POT_HIGH ? 'B' : 'C');
        doc.closeupLoyalty = doc.catLoyalty;
        doc.closeupLabel = doc.closeupPotency + (doc.closeupLoyalty === 'C' ? '-' : (doc.closeupLoyalty === 'A' ? '+' : ''));

        // Matriz Encuesta
        doc.surveyPotency = null; doc.surveyLoyalty = null; doc.surveyLabel = "N/A";
        const evals = window.App.evaluation ? window.App.evaluation.getEvaluationsForDoc(doc.id, doc._clave) : [];
        if (evals && evals.length > 0) {
            const obj = window.App.matrix.calculateObjectiveScore(evals[0].survey);
            if (obj.pot) {
                doc.surveyPotency = obj.pot; doc.surveyLoyalty = obj.loy; doc.surveyLabel = obj.label;
            }
        }
        if (st.currentMatrixMode === 'survey') {
            doc.catPotency = doc.surveyPotency || 'Sin Eval';
            doc.catLoyalty = doc.surveyLoyalty || 'Sin Eval';
            doc.matrixLabel = doc.surveyLabel;
        } else {
            doc.catPotency = doc.closeupPotency;
            doc.catLoyalty = doc.closeupLoyalty;
            doc.matrixLabel = doc.closeupLabel;
        }
        return doc;
    });

    return { doctors, compBreakdown, grandTotalRx, visTotalFichero, visTotalCruzados };
};

window.App.matrix.aggregateAndCalculate = function() {
    const st = window.App.state;
    const r = window.App.matrix.calcularMedicos(st.RAW_DATA, true);
    const doctors = r.doctors;
    st.CURRENT_COMP_BREAKDOWN = r.compBreakdown;
    st.PROCESSED_DATA = doctors;
    // Comparación con la versión anterior (movimientos y tendencias), si está cargada
    if (window.App.comparar) window.App.comparar.alRecalcular();

    // Principal competidor
    let topCompName = "N/A", topCompRx = 0;
    const competitorsOnly = st.CURRENT_COMP_BREAKDOWN.filter(c => c.type === 'Comp');
    if (competitorsOnly.length > 0) { topCompName = competitorsOnly[0].prod; topCompRx = competitorsOnly[0].rx; }

    window.App.matrix.renderDashboard(r.grandTotalRx, topCompName, topCompRx);
    window.App.matrix.updateImpactSimulator(doctors);
    if (st.currentUserRole === 'visitador') {
        if (typeof updateVisitadorDashboard === 'function') updateVisitadorDashboard(r.visTotalFichero, r.visTotalCruzados);
    }
};

/* ============================================================
   SIMULADOR DE IMPACTO (B → A)
============================================================ */
window.App.matrix.updateImpactSimulator = function(doctors) {
    const st = window.App.state;
    let rxGain = 0;
    const targetPercent = st.TH_LOY_HIGH / 100;
    doctors.forEach(doc => {
        if (doc.catLoyalty === 'B') {
            const targetRx = Math.ceil(doc.totalRx * targetPercent);
            const diff = targetRx - doc.rxPhq;
            if (diff > 0) rxGain += diff;
        }
    });
    window.App.ui.safeSetText('simImpactRx', `+${window.App.ui.formatNumber(rxGain)} Rx`);
};

/* ============================================================
   RENDER DEL DASHBOARD (KPIs + Celdas + Competencia)
============================================================ */
window.App.matrix.renderDashboard = function(grandTotal, topCompName, topCompRx) {
    const st = window.App.state;
    const ui = window.App.ui;
    const cruzadosData = st.PROCESSED_DATA.filter(doc => !doc.isZeroRx);

    ui.safeSetText('statTotalDocs', ui.formatNumber(cruzadosData.length));
    ui.safeSetText('statTotalMkt',  ui.formatNumber(grandTotal));
    const totalMyRx = cruzadosData.reduce((s, doc) => s + doc.rxPhq, 0);
    ui.safeSetText('statMyRx', ui.formatNumber(totalMyRx));
    ui.safeSetText('statShare', ui.formatNumber(grandTotal > 0 ? (totalMyRx / grandTotal) * 100 : 0, 2) + "%");
    ui.safeSetText('topCompName', topCompName);
    ui.safeSetText('topCompRx', ui.formatNumber(topCompRx));
    const compTitle = document.getElementById('compCardTitle');
    if (compTitle) compTitle.innerText = `Principal Competidor`;

    const restRx = grandTotal - totalMyRx - topCompRx;
    const pctPhq  = grandTotal > 0 ? (totalMyRx / grandTotal) * 100 : 0;
    const pctComp = grandTotal > 0 ? (topCompRx / grandTotal) * 100 : 0;
    const pctRest = grandTotal > 0 ? (restRx    / grandTotal) * 100 : 0;

    const elBarPhq  = document.getElementById('barPhq');  if (elBarPhq)  elBarPhq.style.width  = pctPhq  + "%";
    const elBarComp = document.getElementById('barComp'); if (elBarComp) elBarComp.style.width = pctComp + "%";
    const elBarRest = document.getElementById('barRest'); if (elBarRest) elBarRest.style.width = pctRest + "%";

    ui.safeSetText('labelPhq',  `PHQ: ${ui.formatNumber(pctPhq, 2)}%`);
    ui.safeSetText('labelComp', `${topCompName.substring(0, 8)}..: ${ui.formatNumber(pctComp, 2)}%`);
    ui.safeSetText('labelRest', `Resto: ${ui.formatNumber(pctRest, 2)}%`);

    // Llenado de cada celda + subtotales fila/col
    const summaries = {
        row_A: { rx: 0, phq: 0, count: 0 }, row_B: { rx: 0, phq: 0, count: 0 }, row_C: { rx: 0, phq: 0, count: 0 },
        col_C: { rx: 0, phq: 0, count: 0 }, col_B: { rx: 0, phq: 0, count: 0 }, col_A: { rx: 0, phq: 0, count: 0 }
    };
    ['A_C', 'A_B', 'A_A', 'B_C', 'B_B', 'B_A', 'C_C', 'C_B', 'C_A'].forEach(key => {
        const [pot, loy] = key.split('_');
        const subset = cruzadosData.filter(doc => doc.catPotency === pot && doc.catLoyalty === loy);
        const count  = subset.length;
        const sumRx  = subset.reduce((s, doc) => s + doc.totalRx, 0);
        const sumPhq = subset.reduce((s, doc) => s + doc.rxPhq, 0);

        window.App.ux ? window.App.ux.animarNumero(`count_${key}`, count) : ui.safeSetText(`count_${key}`, ui.formatNumber(count));
        const proporcion = cruzadosData.length > 0 ? count / cruzadosData.length : 0;
        const celda = document.getElementById(`cell_${key}`);
        if (celda) celda.style.setProperty('--intensidad', Math.min(1, proporcion * 2.5).toFixed(3));
        const barra = document.getElementById(`barra_${key}`);
        if (barra) barra.style.width = `${(proporcion * 100).toFixed(1)}%`;
        ui.safeSetText(`rx_${key}`,    ui.compactNum(sumRx));
        ui.safeSetText(`phq_${key}`,   ui.compactNum(sumPhq));
        ui.safeSetText(`ms_${key}`,    ui.formatNumber(sumRx > 0 ? (sumPhq / sumRx) * 100 : 0, 2) + '%');
        ui.safeSetText(`avg_tot_${key}`, ui.formatNumber(count > 0 ? Math.round(sumRx / count) : 0));
        ui.safeSetText(`avg_phq_${key}`, ui.formatNumber(count > 0 ? Math.round(sumPhq / count) : 0));
        ui.safeSetText(`pct_drs_${key}`, ui.formatNumber(cruzadosData.length > 0 ? (count / cruzadosData.length) * 100 : 0, 2) + '%');

        const tooltip = document.getElementById(`tooltip_${key}`);
        if (tooltip) {
            if (count > 0) {
                const topDoc = subset.reduce((prev, cur) => {
                    if (prev.totalRx > cur.totalRx) return prev;
                    if (cur.totalRx > prev.totalRx) return cur;
                    return (prev.rxPhq >= cur.rxPhq) ? prev : cur;
                });
                tooltip.innerHTML = `<span class="opacity-80">Médico con más recetas:</span><br><b>${ui.escapeHtml(topDoc.name.substring(0, 22))}</b><br>Recetas: ${ui.formatNumber(topDoc.totalRx)} · La Santé: ${ui.formatNumber(topDoc.rxPhq)}`;
            } else {
                tooltip.innerHTML = `Sin datos`;
            }
        }
        if (summaries[`row_${pot}`]) { summaries[`row_${pot}`].rx += sumRx; summaries[`row_${pot}`].phq += sumPhq; summaries[`row_${pot}`].count += count; }
        if (summaries[`col_${loy}`]) { summaries[`col_${loy}`].rx += sumRx; summaries[`col_${loy}`].phq += sumPhq; summaries[`col_${loy}`].count += count; }
    });
    Object.keys(summaries).forEach(k => {
        const s = summaries[k];
        const share = s.rx > 0 ? (s.phq / s.rx) * 100 : 0;
        ui.safeSetText(`${k}_rx`,    ui.compactNum(s.rx));
        ui.safeSetText(`${k}_phq`,   ui.compactNum(s.phq));
        ui.safeSetText(`${k}_count`, ui.formatNumber(s.count));
        ui.safeSetText(`${k}_share`, ui.formatNumber(share, 2) + '%');
    });

    window.App.filters.resetPaginationAndRender();
};

/* ============================================================
   FILTRO POR CLIC EN CELDA DE LA MATRIZ
============================================================ */
window.App.matrix.filterByMatrix = function(pot, loy) {
    const st = window.App.state;
    st.MATRIX_FILTER = { pot, loy };
    document.querySelectorAll('.matrix-cell').forEach(c => c.classList.remove('selected'));
    const cell = document.getElementById(`cell_${pot}_${loy}`);
    if (cell) cell.classList.add('selected');
    document.getElementById('clearFilterBtn').classList.remove('hidden');
    window.App.ui.safeSetText('tableSubtitle', `Filtrado: Cuadrante ${pot}${(loy === 'C' ? '-' : (loy === 'A' ? '+' : ''))}`);
    window.App.filters.resetPaginationAndRender();
    if (window.App.ux) window.App.ux.alElegirCuadrante(pot, loy);
};

window.App.matrix.clearMatrixFilter = function() {
    window.App.state.MATRIX_FILTER = null;
    document.querySelectorAll('.matrix-cell').forEach(c => c.classList.remove('selected'));
    document.getElementById('clearFilterBtn').classList.add('hidden');
    window.App.ui.safeSetText('tableSubtitle', 'Mostrando todos los registros');
    window.App.filters.resetPaginationAndRender();
};

/* ============================================================
   TABLA PRINCIPAL — paginación y render
============================================================ */
window.App.matrix.prevPage = function() {
    if (window.App.state.currentPage > 1) {
        window.App.state.currentPage--;
        window.App.matrix.renderTable();
    }
};

window.App.matrix.nextPage = function() {
    const st = window.App.state;
    const totalItems = st.CURRENT_TABLE_DATA.length;
    if (st.currentPage * window.App.config.ROWS_PER_PAGE < totalItems) {
        st.currentPage++;
        window.App.matrix.renderTable();
    }
};

window.App.matrix.toggleInstitutionView = function() {
    window.App.state.groupByInstitution = document.getElementById('instToggle').checked;
    window.App.ui.safeSetText('thNameCol', window.App.state.groupByInstitution ? "Dirección / Institución" : "Médico");
    window.App.filters.resetPaginationAndRender();
};

window.App.matrix.handleRowClick = function(isInst, realIndex, docId) {
    if (isInst === 'true' || isInst === true) {
        if (typeof openInstitutionModal === 'function') openInstitutionModal(realIndex);
    } else {
        if (typeof openDoctorModal === 'function') openDoctorModal(docId);
    }
};

window.App.matrix.renderTable = function() {
    const st = window.App.state;
    const d  = window.App.data;
    const ui = window.App.ui;
    const ROWS_PER_PAGE = window.App.config.ROWS_PER_PAGE;

    const tbody = document.getElementById('dataTable');
    if (!tbody) return;
    tbody.innerHTML = '';

    const searchText = document.getElementById('globalSearch').value.toLowerCase();
    let data = st.PROCESSED_DATA;

    if (st.MATRIX_FILTER) {
        data = data.filter(doc => doc.catPotency === st.MATRIX_FILTER.pot && doc.catLoyalty === st.MATRIX_FILTER.loy && !doc.isZeroRx);
    }
    if (searchText) {
        data = data.filter(doc =>
            doc.name.toLowerCase().includes(searchText) ||
            String(doc.id).toLowerCase().includes(searchText) ||
            (doc.address && doc.address.toLowerCase().includes(searchText))
        );
    }

    // Filtro rápido (pendientes, evaluados, mayor oportunidad, sin recetas): solo la lista
    if (window.App.ux) data = window.App.ux.aplicarFiltroRapido(data);

    // Vista institucional
    if (st.groupByInstitution) {
        const grouped = {};
        data.forEach(doc => {
            const addr = doc.address ? String(doc.address).trim().toUpperCase() : "SIN DIRECCIÓN ESPECIFICADA";
            if (!grouped[addr]) grouped[addr] = { name: addr, totalRx: 0, rxPhq: 0, docCount: 0, spec: "Múltiple", gapSum: 0, doctors: [] };
            grouped[addr].totalRx += doc.totalRx;
            grouped[addr].rxPhq   += doc.rxPhq;
            grouped[addr].gapSum  += doc.gap;
            grouped[addr].docCount += 1;
            grouped[addr].doctors.push(doc);
        });
        data = Object.values(grouped).map(g => {
            const share = g.totalRx > 0 ? (g.rxPhq / g.totalRx) * 100 : 0;
            let cLoy = 'C';
            if      (share >= st.TH_LOY_HIGH) cLoy = 'A';
            else if (share >  st.TH_LOY_LOW)  cLoy = 'B';
            return { ...g, share, catLoyalty: cLoy, matrixLabel: `Inst ${cLoy}`, isInst: true, gap: g.gapSum, closeupLabel: `Inst ${cLoy}` };
        });
        data.sort((a, b) => b.totalRx - a.totalRx);
    }

    st.CURRENT_TABLE_DATA = data;
    const totalItems = data.length;
    const totalPages = Math.ceil(totalItems / ROWS_PER_PAGE);
    if (st.currentPage > totalPages && totalPages > 0) st.currentPage = totalPages;
    if (st.currentPage === 0 && totalPages > 0)        st.currentPage = 1;
    const startIdx = (st.currentPage - 1) * ROWS_PER_PAGE;
    const pageData = data.slice(startIdx, Math.min(startIdx + ROWS_PER_PAGE, totalItems));

    // Mostrar/ocultar columna de evaluación
    const evalHeader = document.getElementById('thEvalCol');
    if (!st.groupByInstitution && (st.currentUserRole === 'visitador' || st.currentUserRole === 'admin')) {
        if (evalHeader) evalHeader.classList.remove('hidden');
    } else {
        if (evalHeader) evalHeader.classList.add('hidden');
    }

    ui.safeSetText('pageInfo', totalItems > 0
        ? `Página ${st.currentPage} de ${totalPages} (${ui.formatNumber(totalItems)} médicos)`
        : "Mostrando 0 de 0"
    );
    const prev = document.getElementById('btnPrevPage');
    const next = document.getElementById('btnNextPage');
    if (prev) prev.disabled = st.currentPage <= 1;
    if (next) next.disabled = st.currentPage >= totalPages;

    // Construcción del HTML de todas las filas en buffer (mejor performance en iPad)
    const htmlBuffer = [];
    const mostrarEval = !st.groupByInstitution && (st.currentUserRole === 'visitador' || st.currentUserRole === 'admin');
    pageData.forEach((doc, idxInPage) => {
        const realIndex = startIdx + idxInPage;
        const atenuado = doc.isZeroRx ? 'opacity-75' : '';

        // Cuadrante con el mismo color de la matriz
        let renderLabel = doc.matrixLabel;
        if (st.currentMatrixMode === 'survey' && !doc.isInst) renderLabel = doc.surveyLabel;
        const colorClass = (window.App.ux && window.App.ux.claseCuadrante(doc)) || "bg-slate-100 text-slate-500";
        const cuadrante = `<div class="flex flex-col items-start gap-0.5"><span class="inline-flex items-center justify-center min-w-[44px] h-9 px-2 rounded-xl font-display font-extrabold text-sm ${colorClass}">${doc.isZeroRx ? '—' : ui.escapeHtml(renderLabel)}</span>${doc.antes && doc.antes !== doc.closeupLabel ? `<span class="text-[10px] font-semibold ${doc.movimiento === 'mejor' ? 'text-green-700' : 'text-rose-700'}">${doc.movimiento === 'mejor' ? '▲' : '▼'} antes ${ui.escapeHtml(doc.antes)}</span>` : ''}</div>`;

        // Médico: nombre, especialidad y si está fichado, juntos
        const fichado = doc.ficheroData && doc.ficheroData.length > 0 && !doc.isInst;
        const etiquetas = [
            fichado ? '<span class="text-[11px] font-semibold text-blue-800 bg-blue-50 px-2 py-0.5 rounded-full">Fichado</span>' : '',
            doc.isZeroRx ? '<span class="text-[11px] font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full">Sin recetas</span>' : '',
            doc.isInst ? `<span class="text-[11px] font-semibold text-blue-800 bg-blue-50 px-2 py-0.5 rounded-full">${doc.docCount} médicos</span>` : ''
        ].join('');
        const medico = `<div class="min-w-0">
                <div class="font-semibold text-[15px] text-slate-800 truncate max-w-[340px]" title="${ui.escapeHtml(ui.nombreVisible(doc.name))}">${ui.escapeHtml(ui.nombreVisible(doc.name))}</div>
                <div class="flex items-center gap-2 mt-0.5 text-xs text-slate-500"><span class="truncate max-w-[200px]">${ui.escapeHtml(doc.spec || '')}</span>${etiquetas}</div>
            </div>`;

        // Participación: número + barrita
        // Tendencia frente a la versión anterior (si se cargó)
        const tendencia = doc.deltaShare == null || Math.abs(doc.deltaShare) < 0.05 ? ''
            : `<span class="tendencia ${doc.deltaShare > 0 ? 'sube' : 'baja'} ml-1">${doc.deltaShare > 0 ? '▲' : '▼'}${ui.formatNumber(Math.abs(doc.deltaShare), 1)}</span>`;
        const part = doc.isZeroRx ? '<span class="text-slate-400">—</span>' : `<span class="font-semibold text-slate-700">${ui.formatNumber(doc.share, 1)}%</span>${tendencia}`;

        const gapHtml = doc.isZeroRx
            ? '<span class="text-slate-400">—</span>'
            : (doc.gap > 0
                ? `<span class="badge-gap">+${ui.formatNumber(doc.gap)} Rx</span>`
                : `<span class="inline-flex items-center gap-1 text-xs font-semibold text-green-800 bg-green-50 px-2 py-1 rounded-full"><span class="material-symbols-outlined text-[16px]">task_alt</span> En meta</span>`);

        let evalCellHtml = "";
        if (mostrarEval && !doc.isInst) {
            evalCellHtml = `<td class="px-4 py-3 text-center" onclick="event.stopPropagation()">${window.App.ux ? window.App.ux.estadoEvaluacion(doc) : ''}</td>`;
        }

        htmlBuffer.push(`
            <tr class="cursor-pointer md-estado" onclick="handleRowClick(${!!doc.isInst}, ${realIndex}, '${ui.escapeHtml(doc.id)}')">
                <td class="px-4 py-3 ${atenuado}">${cuadrante}</td>
                <td class="px-4 py-3 ${atenuado}">${medico}</td>
                <td class="px-4 py-3 text-right font-mono text-sm text-slate-700 ${atenuado}">${doc.isZeroRx ? '<span class="text-slate-400">—</span>' : ui.formatNumber(doc.totalRx)}</td>
                <td class="px-4 py-3 text-right font-mono text-sm font-semibold text-blue-700 ${atenuado}">${doc.isZeroRx ? '<span class="text-slate-400">—</span>' : ui.formatNumber(doc.rxPhq)}</td>
                <td class="px-4 py-3 text-right text-sm ${atenuado}">${part}</td>
                <td class="px-4 py-3 text-center ${atenuado}">${gapHtml}</td>
                ${evalCellHtml}
            </tr>
        `);
    });
    // Solo se dibuja la forma que se ve: tabla (computadora) o tarjetas (teléfono y tablet).
    // Dibujar las dos en cada página era la mitad del tiempo de la lista.
    const forma = window.App.matrix.formaLista();
    tbody.innerHTML = forma !== 'tarjetas' ? htmlBuffer.join('') : '';

    if (window.App.ux) {
        if (forma !== 'tabla') window.App.ux.renderTarjetas(pageData, startIdx);
        else { const z = document.getElementById('dataCards'); if (z) z.innerHTML = ''; }
        window.App.ux.trasRenderTabla();
    }
};

// 'tabla' (pantalla ancha), 'tarjetas' (angosta) o 'ambas' (sin medidas, p. ej. pruebas)
const CONSULTA_ANCHA = typeof window.matchMedia === 'function' ? window.matchMedia('(min-width: 1024px)') : null;
window.App.matrix.formaLista = () => !CONSULTA_ANCHA ? 'ambas' : (CONSULTA_ANCHA.matches ? 'tabla' : 'tarjetas');
// Al girar la tablet o cambiar el tamaño de la ventana, se dibuja la otra forma
if (CONSULTA_ANCHA && CONSULTA_ANCHA.addEventListener) {
    CONSULTA_ANCHA.addEventListener('change', () => { if ((window.App.state.PROCESSED_DATA || []).length) window.App.matrix.renderTable(); });
}

/* ============================================================
   ALIAS GLOBALES
============================================================ */
window.parseSurveyRange              = window.App.matrix.parseSurveyRange;
window.calculateObjectiveScore       = window.App.matrix.calculateObjectiveScore;
window.getDoctorMarketClassification = window.App.matrix.getDoctorMarketClassification;
window.generateMatrixGridHTML        = window.App.matrix.generateMatrixGridHTML;
window.generateSingleCellHTML        = window.App.matrix.generateSingleCellHTML;
window.generateSummaryCellHTML       = window.App.matrix.generateSummaryCellHTML;
window.updateThresholds              = window.App.matrix.updateThresholds;
window.switchMatrixMode              = window.App.matrix.switchMatrixMode;
window.aggregateAndCalculate         = window.App.matrix.aggregateAndCalculate;
window.updateImpactSimulator         = window.App.matrix.updateImpactSimulator;
window.renderDashboard               = window.App.matrix.renderDashboard;
window.filterByMatrix                = window.App.matrix.filterByMatrix;
window.clearMatrixFilter             = window.App.matrix.clearMatrixFilter;
window.prevPage                      = window.App.matrix.prevPage;
window.nextPage                      = window.App.matrix.nextPage;
window.toggleInstitutionView         = window.App.matrix.toggleInstitutionView;
window.handleRowClick                = window.App.matrix.handleRowClick;
window.renderTable                   = window.App.matrix.renderTable;

console.log('[SegmentApp] matrix.js cargado.');

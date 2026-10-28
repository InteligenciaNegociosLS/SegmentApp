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

    html += `<div class="matrix-header-row border-r-2 pr-4 border-slate-100">
        <span class="text-blue-700 text-center font-bold">Medio Potencial (B)</span>
        <span class="text-[10px] font-medium text-slate-400 mt-2" id="row_label_B">33% - 66%</span>
    </div>`;
    cellIds.slice(3, 6).forEach(c => html += window.App.matrix.generateSingleCellHTML(c));
    html += window.App.matrix.generateSummaryCellHTML('row_B', 'Potencial B');

    html += `<div class="matrix-header-row border-r-2 pr-4 border-slate-100">
        <span class="text-slate-400 text-center font-bold">Bajo Potencial (C)</span>
        <span class="text-[10px] font-medium text-slate-300 mt-2" id="row_label_C">> 66%</span>
    </div>`;
    cellIds.slice(6, 9).forEach(c => html += window.App.matrix.generateSingleCellHTML(c));
    html += window.App.matrix.generateSummaryCellHTML('row_C', 'Potencial C');

    html += `<div class="summary-element hidden items-center justify-end font-bold text-xs text-slate-500 uppercase tracking-wide pr-4">Resumen Adopción</div>`;
    html += window.App.matrix.generateSummaryCellHTML('col_C', 'Adopción Baja');
    html += window.App.matrix.generateSummaryCellHTML('col_B', 'Adopción Media');
    html += window.App.matrix.generateSummaryCellHTML('col_A', 'Adopción Alta');
    html += `<div class="summary-element hidden bg-slate-100 rounded-[24px] items-center justify-center text-xs text-slate-500 font-display font-bold uppercase tracking-widest border border-slate-200">Universo<br>Total</div>`;

    container.innerHTML = html;
};

window.App.matrix.generateSingleCellHTML = function(c) {
    const key = c.id.replace('cell_', '');
    return `
    <div class="matrix-cell group cell-${key}" id="${c.id}" onclick="filterByMatrix('${key.split('_')[0]}', '${key.split('_')[1]}')">
        <div class="cell-tooltip" id="tooltip_${key}">Top: Cargando...</div>
        <div class="flex justify-between items-start mb-2 pointer-events-none">
            <span class="font-bold text-[11px] uppercase tracking-widest opacity-80">${c.title}</span>
            <button onclick="toggleStats(event, '${key}')" class="pointer-events-auto opacity-40 hover:opacity-100 transition p-2 -m-2" title="Ver Promedios"><span class="material-symbols-outlined text-[18px]">visibility</span></button>
        </div>
        <div class="grid grid-cols-2 gap-y-2 gap-x-2 text-[10px] mb-2 pointer-events-none opacity-90 font-medium">
            <div title="Rx Total"><span class="material-symbols-outlined icon-inline opacity-60">receipt_long</span> Total: <span class="font-bold font-mono text-[11px]" id="rx_${key}">0</span></div>
            <div title="Rx PHQ" class="text-right"><span class="material-symbols-outlined icon-inline opacity-60">pill</span> Lab: <span class="font-bold font-mono text-[11px]" id="phq_${key}">0</span></div>
            <div title="Market Share" class="col-span-2 text-center pt-2 mt-1 border-t border-black/5"><span class="material-symbols-outlined icon-inline opacity-60">donut_large</span> MS: <span class="font-bold text-[12px]" id="ms_${key}">0%</span></div>
        </div>
        <div class="stats-drawer text-[10px] flex justify-between px-3 bg-black/5 rounded-xl pointer-events-auto" id="drawer_${key}">
            <div class="flex flex-col items-center py-2 opacity-80"><span class="uppercase tracking-wide text-[8px] font-bold">Media Tot</span><span class="font-bold text-xs font-mono" id="avg_tot_${key}">0</span></div>
            <div class="flex flex-col items-center py-2 opacity-80"><span class="uppercase tracking-wide text-[8px] font-bold">Media Lab</span><span class="font-bold text-xs font-mono" id="avg_phq_${key}">0</span></div>
        </div>
        <div class="flex-1 flex flex-col items-center justify-center my-3 pointer-events-none drop-shadow-sm"><div class="text-6xl font-display font-black tracking-tighter letter-display transition-transform duration-300 group-hover:scale-110">${c.label}</div></div>
        <div class="flex items-center justify-center gap-1 text-xl font-display font-bold leading-none mb-1 mt-auto border-t border-black/5 pt-3 pointer-events-none"><span class="material-symbols-outlined opacity-60 text-[22px]" style="vertical-align: -3px;">groups</span><span id="count_${key}">0</span></div>
        <div class="text-center pointer-events-none"><div class="text-[11px] font-bold opacity-70"><span id="pct_drs_${key}">0%</span></div></div>
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

    if (mode === 'closeup') {
        btnData.classList.replace('text-slate-500', 'text-white');
        btnData.classList.replace('hover:text-slate-700', 'bg-blue-600');
        btnData.classList.replace('hover:bg-white', 'shadow-sm');
        btnData.classList.add('bg-blue-600');

        btnSurvey.classList.replace('bg-blue-600', 'hover:bg-white');
        btnSurvey.classList.replace('text-white', 'text-slate-500');
        btnSurvey.classList.remove('shadow-sm');
    } else {
        btnSurvey.classList.replace('text-slate-500', 'text-white');
        btnSurvey.classList.replace('hover:bg-white', 'bg-blue-600');
        btnSurvey.classList.add('shadow-sm', 'bg-blue-600');

        btnData.classList.replace('bg-blue-600', 'hover:bg-white');
        btnData.classList.replace('text-white', 'text-slate-500');
        btnData.classList.remove('shadow-sm');
    }

    window.App.ui.showToast(mode === 'closeup' ? 'Viendo Matriz: Datos de Rx' : 'Viendo Matriz: Encuestas Asesor');
    window.App.matrix.aggregateAndCalculate();
};

/* ============================================================
   AGGREGATE AND CALCULATE — el cálculo más pesado de la app
============================================================ */
window.App.matrix.aggregateAndCalculate = function() {
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

    // Si los filtros pesados no cambiaron, usar el universo cacheado
    let universeRows;
    if (st._lastUniverseSignature === filterSignature && st._lastUniverseRows) {
        universeRows = st._lastUniverseRows;
    } else {
        // Recalcular universo desde cero
        universeRows = st.RAW_DATA.filter(row => {
            if (!st.FILTER_STATE.Market.includes(row.market))     return false;
            if (!st.FILTER_STATE.Region.includes(row.region))     return false;
            if (!st.FILTER_STATE.Spec.includes(row.spec))         return false;
            if (!st.FILTER_STATE.Molecule.includes(row.molecule)) return false;
            if (!st.FILTER_STATE.Class.includes(row.class))       return false;
            if (!st.FILTER_STATE.Lab.includes(row.lab))           return false;
            if (fGeneric !== 'all' && row.generic !== fGeneric)   return false;
            return true;
        });
        // Guardar en cache para próximas llamadas
        st._lastUniverseSignature = filterSignature;
        st._lastUniverseRows = universeRows;
    }

    // Agrupación por médico (ID único = matrícula + nombre)
    const docMap = {};
    universeRows.forEach(row => {
        const cleanLicense = row.license ? String(row.license).trim().replace(/^0+/, '') : "";
        const id = cleanLicense + "_" + row.doc.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
        if (!docMap[id]) {
            docMap[id] = { id, name: row.doc, address: row.address, spec: row.spec, rxPhq: 0, rxTotalSum: 0, rows: [], uniqueProds: {} };
        }
        docMap[id].rows.push(row);
        docMap[id].uniqueProds[row.prod] = Math.max(docMap[id].uniqueProds[row.prod] || 0, row.rx);
    });

    // Totales reales por producto (para "Principal Competidor")
    const realProductTotals = {};
    Object.values(docMap).forEach(doc => {
        Object.entries(doc.uniqueProds).forEach(([prod, rx]) => {
            doc.rxTotalSum += rx;
            if (d.isPhq(prod) && (st.FILTER_STATE.Product.length === st.FILTER_OPTIONS.Product.length || st.FILTER_STATE.Product.includes(prod))) {
                doc.rxPhq += rx;
            }
            realProductTotals[prod] = (realProductTotals[prod] || 0) + rx;
        });
    });
    st.CURRENT_COMP_BREAKDOWN = Object.entries(realProductTotals)
        .map(([k, v]) => ({ prod: k, rx: v, type: d.isPhq(k) ? 'PHQ' : 'Comp' }))
        .sort((a, b) => b.rx - a.rx);

    // Cálculo de share, gap y categoría de adopción
    let doctors = Object.values(docMap).map(doc => {
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
            ficheroData: st.FICHERO_MAP.get(d.normalizeKey(doc.id)) || [],
            isZeroRx: false
        };
    });

    // Vista de visitador: filtrar solo médicos asignados
    let visTotalFichero = 0, visTotalCruzados = 0;
    if (st.currentUserRole === 'visitador') {
        const assignedDocsMap = new Map();
        st.FICHERO_MAP.forEach((rows, docId) => {
            const isAssigned = rows.some(fRow => {
                const repKey = d.getFicheroRepKey(fRow);
                return repKey && fRow[repKey] && String(fRow[repKey]).toUpperCase().trim() === st.currentVisitadorName.toUpperCase();
            });
            if (isAssigned) { visTotalFichero++; assignedDocsMap.set(docId, rows); }
        });
        doctors = doctors.filter(doc => {
            const hasAssigned = assignedDocsMap.has(d.normalizeKey(doc.id));
            if (hasAssigned) visTotalCruzados++;
            return hasAssigned;
        });
        // Agregar médicos del fichero sin Rx
        assignedDocsMap.forEach((rows, docId) => {
            if (!doctors.find(x => d.normalizeKey(x.id) === docId)) {
                const baseRow = rows[0];
                let nameKey = Object.keys(baseRow).find(k => /^(nombre|medico|médico|doctor|doc)$/i.test(k.trim().toLowerCase()));
                if (!nameKey) nameKey = Object.keys(baseRow).find(k => /nombre|med|doc/i.test(k) && !/visit|rep|agente|promotor|asesor/i.test(k));
                const specKey = Object.keys(baseRow).find(k => /esp|spec/i.test(k));
                const addrKey = Object.keys(baseRow).find(k => /dir|address|inst/i.test(k));
                doctors.push({
                    id: docId,
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
        const evals = (typeof getEvaluationsForDoc === 'function') ? getEvaluationsForDoc(doc.id) : [];
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

    st.PROCESSED_DATA = doctors;
    Object.keys(docMap).forEach(k => delete docMap[k]);

    // Principal competidor
    let topCompName = "N/A", topCompRx = 0;
    const competitorsOnly = st.CURRENT_COMP_BREAKDOWN.filter(c => c.type === 'Comp');
    if (competitorsOnly.length > 0) { topCompName = competitorsOnly[0].prod; topCompRx = competitorsOnly[0].rx; }

    window.App.matrix.renderDashboard(grandTotalRx, topCompName, topCompRx);
    window.App.matrix.updateImpactSimulator(doctors);
    if (st.currentUserRole === 'visitador') {
        if (typeof updateVisitadorDashboard === 'function') updateVisitadorDashboard(visTotalFichero, visTotalCruzados);
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

        ui.safeSetText(`count_${key}`, ui.formatNumber(count));
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
                tooltip.innerHTML = `<span class="text-blue-300">Top Doc:</span><br><b>${topDoc.name.substring(0, 18)}</b><br>Rx Mercado: ${ui.formatNumber(topDoc.totalRx)}<br>Rx Lab: ${ui.formatNumber(topDoc.rxPhq)}`;
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
    pageData.forEach((doc, idxInPage) => {
        const realIndex = startIdx + idxInPage;
        let colorClass = "bg-slate-100 text-slate-600";
        if (doc.catPotency === 'A' || (doc.isInst && doc.catLoyalty === 'A')) colorClass = "bg-purple-100 text-purple-700 border border-purple-200";
        if (doc.isZeroRx) colorClass = "bg-slate-100 text-slate-400 border border-slate-200 opacity-70";

        let gapHtml = doc.isZeroRx
            ? `<span class="text-xs text-slate-400 font-bold">-</span>`
            : (doc.gap > 0
                ? `<span class="badge-gap">+${ui.formatNumber(doc.gap)} Rx</span>`
                : `<span class="text-xs text-green-600 font-bold flex items-center justify-center gap-1"><span class="material-symbols-outlined text-[14px]">task_alt</span> Objetivo</span>`);

        const fichClass = (doc.ficheroData && doc.ficheroData.length > 0 && !doc.isInst) ? "" : "opacity-80";
        const fichIcon = (doc.ficheroData && doc.ficheroData.length > 0 && !doc.isInst)
            ? `<span class="bg-blue-100 text-blue-700 text-[10px] px-2 py-0.5 rounded-full font-bold border border-blue-200 shadow-sm flex items-center gap-1"><span class="material-symbols-outlined text-[12px]">how_to_reg</span> Fichado</span>`
            : "";
        const instIconHtml = doc.isInst
            ? `<span class="bg-indigo-100 text-indigo-700 text-[10px] px-2 py-0.5 rounded-full font-bold ml-2 border border-indigo-200">${doc.docCount} Docs</span>`
            : "";

        let evalCellHtml = "";
        if (!doc.isInst && (st.currentUserRole === 'visitador' || st.currentUserRole === 'admin')) {
            if (st.currentUserRole === 'visitador') {
                const evalsMap = st.EVALUACIONES_VISITADOR[d.normalizeKey(doc.id)];
                const evalsList = evalsMap ? Object.values(evalsMap) : [];
                if (evalsList.length > 0) {
                    const hasNotes = evalsList.some(e => e.notas && String(e.notas).trim() !== '');
                    const countText = evalsList.length > 1 ? `${evalsList.length} Mercados` : `${evalsList.length} Mercado`;
                    evalCellHtml = `<td class="p-4 text-center" onclick="event.stopPropagation(); openEvalModal('${doc.id}', '${doc.name.replace(/'/g, "\\'")}')"><button class="bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 font-bold px-3 py-1.5 rounded-xl shadow-sm transition flex flex-col items-center justify-center gap-0.5 mx-auto"><div class="flex items-center gap-1"><span class="material-symbols-outlined text-[16px] text-emerald-500">check_circle</span><span class="font-display">EVALUADO</span>${hasNotes ? '<span class="material-symbols-outlined text-[14px] text-amber-500">speaker_notes</span>' : ''}</div><span class="text-[9px] font-medium text-indigo-500">${countText}</span></button></td>`;
                } else {
                    evalCellHtml = `<td class="p-4 text-center" onclick="event.stopPropagation(); openEvalModal('${doc.id}', '${doc.name.replace(/'/g, "\\'")}')"><button class="bg-white hover:bg-blue-50 border border-slate-300 hover:border-blue-400 text-slate-600 hover:text-blue-700 font-bold px-3 py-1.5 rounded-xl shadow-sm transition flex items-center justify-center gap-1 mx-auto group-hover:bg-blue-600 group-hover:text-white group-hover:border-blue-600"><span class="material-symbols-outlined text-[16px]">touch_app</span><span class="text-xs">Evaluar</span></button></td>`;
                }
            } else if (st.currentUserRole === 'admin') {
                const evalsForDoc = (typeof getEvaluationsForDoc === 'function') ? getEvaluationsForDoc(doc.id) : [];
                if (evalsForDoc.length > 0) {
                    const evalSummary = evalsForDoc.map(e => `<span class="bg-indigo-50 text-indigo-700 border border-indigo-200 px-2.5 py-1 rounded-md text-[10px] font-bold whitespace-nowrap shadow-sm" title="Eval de: ${e.visitador} en ${e.mercado || 'General'}">${e.cuadrante}</span>`).join(' ');
                    evalCellHtml = `<td class="p-4 text-center"><div class="flex flex-wrap items-center justify-center gap-1">${evalSummary}</div></td>`;
                } else {
                    evalCellHtml = `<td class="p-4 text-center"><span class="text-[10px] text-slate-400 font-medium bg-slate-100 px-2 py-1 rounded-md border border-slate-200">Pendiente</span></td>`;
                }
            }
        }

        let renderLabel = doc.matrixLabel;
        if (st.currentMatrixMode === 'survey' && !doc.isInst) renderLabel = doc.surveyLabel;

        htmlBuffer.push(`
            <tr class="hover:bg-slate-50 transition border-b border-slate-100 cursor-pointer group" onclick="handleRowClick(${!!doc.isInst}, ${realIndex}, '${doc.id}')">
                <td class="p-4 ${fichClass}"><span class="font-bold font-display text-xs px-2 py-1.5 rounded-lg ${colorClass}">${doc.isZeroRx ? 'N/A' : renderLabel}</span></td>
                <td class="p-4 ${fichClass}"><div class="flex flex-col sm:flex-row sm:items-center gap-2 group-hover:text-blue-600 transition"><div class="font-bold text-sm text-slate-700 truncate max-w-[150px] md:max-w-[250px]" title="${doc.name}">${doc.name} ${doc.isZeroRx ? '<span class="text-[9px] bg-slate-200 text-slate-500 px-1 rounded ml-1">Sin Rx</span>' : ''}</div><div class="flex flex-shrink-0 items-center gap-1">${fichIcon} ${instIconHtml}</div></div></td>
                <td class="p-4 text-xs font-medium text-slate-500 ${fichClass}">${doc.spec}</td>
                <td class="p-4 text-right font-mono font-medium text-sm text-slate-600 ${fichClass}">${doc.isZeroRx ? '-' : ui.formatNumber(doc.totalRx)}</td>
                <td class="p-4 text-right font-mono text-sm font-bold text-blue-600 ${fichClass}">${doc.isZeroRx ? '-' : ui.formatNumber(doc.rxPhq)}</td>
                <td class="p-4 text-center text-xs font-bold text-slate-700 ${fichClass}">${doc.isZeroRx ? '-' : ui.formatNumber(doc.share, 2)}%</td>
                <td class="p-4 text-center ${fichClass}">${gapHtml}</td>
                ${evalCellHtml}
            </tr>
        `);
    });
    tbody.innerHTML = htmlBuffer.join('');
};

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

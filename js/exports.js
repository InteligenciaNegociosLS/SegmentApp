/* ============================================================
   SegmentApp - Exportaciones (Excel, PDF, PNG)
   Archivo: js/exports.js
   Responsable de:
   - Captura PNG de la matriz (html2canvas)
   - Export Excel de tabla filtrada (XLSX)
   - Export PDF de tabla filtrada (jsPDF + autotable)
   - Export Excel consolidado de evaluaciones (admin)
   - Modal de selección de columnas para exportar
============================================================ */

window.App = window.App || {};
window.App.exports = {};

/* ============================================================
   MODAL DE SELECCIÓN DE COLUMNAS PARA EXPORTAR
============================================================ */
window.App.exports.showExportModal = function(targetType) {
    const st = window.App.state;
    const cfg = window.App.config;
    const ui = window.App.ui;

    if (st.CURRENT_TABLE_DATA.length === 0) {
        ui.showToast("No hay datos para exportar.");
        return;
    }

    st.currentExportTarget = targetType;

    const btnAct = document.getElementById('exportModalActionBtn');
    btnAct.innerHTML = targetType === 'excel'
        ? '<span class="material-symbols-outlined text-[18px]">download</span> Descargar Excel'
        : '<span class="material-symbols-outlined text-[18px]">picture_as_pdf</span> Descargar PDF';
    btnAct.className = targetType === 'excel'
        ? 'bg-green-600 hover:bg-green-700 text-white px-6 py-2.5 rounded-full text-sm font-bold shadow-md transition flex items-center gap-2'
        : 'bg-red-600 hover:bg-red-700 text-white px-6 py-2.5 rounded-full text-sm font-bold shadow-md transition flex items-center gap-2';

    const container = document.getElementById('exportCheckboxContainer');
    container.innerHTML = '';
    cfg.EXPORT_COLUMNS.forEach(col => {
        const isChecked = col.default ? 'checked' : '';
        const checkedClass = col.default ? 'checked-style' : '';
        let label = col.label;
        if (st.groupByInstitution && col.id === 'col_name') label = 'Institución / Dirección';
        container.innerHTML += `
            <label class="export-cb-label ${checkedClass}" id="label_${col.id}">
                <input type="checkbox" id="cb_${col.id}" value="${col.id}" ${isChecked} onchange="updateCbStyle('label_${col.id}', this.checked)">
                <span class="text-sm font-medium text-slate-700">${label}</span>
            </label>
        `;
    });
    document.getElementById('exportColumnsModal').classList.remove('hidden');
};

window.App.exports.updateCbStyle = function(labelId, isChecked) {
    const label = document.getElementById(labelId);
    if (!label) return;
    if (isChecked) label.classList.add('checked-style');
    else           label.classList.remove('checked-style');
};

window.App.exports.toggleAllExportCB = function(state) {
    const cfg = window.App.config;
    cfg.EXPORT_COLUMNS.forEach(col => {
        const cb = document.getElementById(`cb_${col.id}`);
        if (cb) {
            cb.checked = state;
            window.App.exports.updateCbStyle(`label_${col.id}`, state);
        }
    });
};

window.App.exports.executeExport = function() {
    if (window.App.state.currentExportTarget === 'excel') {
        window.App.exports.executeExcelExport();
    } else {
        window.App.exports.executePDFExport();
    }
};

/* ============================================================
   CAPTURA PNG DE LA MATRIZ
============================================================ */
window.App.exports.exportMatrixToPNG = async function() {
    const ui = window.App.ui;
    const d  = window.App.data;
    await d.loadLibrary('html2canvas');
    const target = document.getElementById('matrixCaptureTarget');
    ui.showToast("Generando imagen de la matriz...");

    const origWidth    = target.style.width;
    const origMinWidth = target.style.minWidth;
    const origOverflow = target.style.overflow;
    target.style.width    = target.scrollWidth + 'px';
    target.style.minWidth = target.scrollWidth + 'px';
    target.style.overflow = 'visible';

    setTimeout(() => {
        html2canvas(target, { scale: 2, backgroundColor: '#ffffff', useCORS: true })
            .then(canvas => {
                target.style.width    = origWidth;
                target.style.minWidth = origMinWidth;
                target.style.overflow = origOverflow;
                const link = document.createElement('a');
                link.download = 'SegmentApp_Matriz.png';
                link.href = canvas.toDataURL('image/png');
                link.click();
                ui.showToast("Imagen descargada exitosamente.");
            })
            .catch(err => {
                target.style.width    = origWidth;
                target.style.minWidth = origMinWidth;
                target.style.overflow = origOverflow;
                console.error("Error generando PNG:", err);
                ui.showToast("Error al generar la imagen.");
            });
    }, 200);
};

/* ============================================================
   EXCEL — EVALUACIONES CONSOLIDADAS (ADMIN)
============================================================ */
window.App.exports.exportAdminEvaluationsExcel = async function() {
    const st = window.App.state;
    const d  = window.App.data;
    const m  = window.App.matrix;
    const ui = window.App.ui;

    if (!st.ALL_EVALUATIONS || st.ALL_EVALUATIONS.length === 0) {
        ui.showToast("No hay evaluaciones registradas para exportar.");
        return;
    }
    await d.loadLibrary('xlsx');
    ui.showToast("Preparando el Excel de evaluaciones...");
    // Dar un respiro a la pantalla para que se vea el aviso
    await new Promise(r => setTimeout(r, 50));

    // Índices: una sola pasada por los datos (antes se recorría todo por cada evaluación)
    const docsByKey = new Map();
    st.PROCESSED_DATA.forEach(x => {
        const k = d.normalizeKey(x.id);
        if (!docsByKey.has(k)) docsByKey.set(k, x);
    });
    const neededKeys = new Set(st.ALL_EVALUATIONS.map(ev => d.normalizeKey(ev.medico_id)));
    const specByKey = new Map();
    for (const r of st.RAW_DATA) {
        const k = d.normalizeKey(r.license);
        if (neededKeys.has(k) && !specByKey.has(k)) specByKey.set(k, r.spec);
    }

    const exportData = st.ALL_EVALUATIONS.map(ev => {
        const docIdNorm = d.normalizeKey(ev.medico_id);
        const docObj = docsByKey.get(docIdNorm);
        let spec = "-", matrixLabel = "No visible (Fuera de filtro)";
        if (docObj) {
            spec = docObj.spec;
            matrixLabel = docObj.closeupLabel || docObj.matrixLabel;
        } else if (specByKey.has(docIdNorm)) {
            spec = specByKey.get(docIdNorm);
        }
        const objScoreClass = m.calculateObjectiveScore(ev.survey).label;
        const mktClass = m.getDoctorMarketClassification(ev.medico_id, ev.mercado);
        let dateStr = "N/A";
        if (ev.timestamp) {
            const dt = new Date(ev.timestamp);
            dateStr = dt.toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' });
        }
        return {
            "Asesor Consultivo": ev.visitador || "-",
            "Médico": ev.medico_name || (docObj ? docObj.name : "-"),
            "Matrícula": ev.medico_id || "-",
            "Especialidad": spec,
            "Mercado Evaluado": ev.mercado || "General",
            "Clasificación Final (CloseUp General)": matrixLabel,
            "Clasificación (CloseUp) Mercado Evaluado": mktClass,
            "Clasificación Asesor (Subjetiva)": ev.cuadrante || "-",
            "Clasificación Objetiva (Encuesta)": objScoreClass,
            "P1: Pacientes Total/Semana": ev.survey?.q1 || "-",
            "P2: Pacientes Patología/Semana": ev.survey?.q2 || "-",
            "P3: Pacientes Ntro Prod/Semana": ev.survey?.q3 || "-",
            "P4: Otros Productos (Comp)": ev.survey?.q4 || "-",
            "P5: Costo Consulta": ev.survey?.q5 || "-",
            "Notas del Asesor": ev.notas || "",
            "Fecha y Hora": dateStr
        };
    });

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(exportData), "Evaluaciones Consolidado");
    XLSX.writeFile(wb, "SegmentApp_Evaluaciones_Asesores.xlsx");
    ui.showToast("Reporte de Evaluaciones descargado exitosamente.");
};

/* ============================================================
   EXCEL — TABLA FILTRADA (con selección de columnas)
============================================================ */
window.App.exports.executeExcelExport = async function() {
    const st = window.App.state;
    const cfg = window.App.config;
    const d  = window.App.data;
    const m  = window.App.matrix;
    const ui = window.App.ui;
    const ev = window.App.evaluation;

    const selectedCols = [];
    cfg.EXPORT_COLUMNS.forEach(col => {
        const cb = document.getElementById(`cb_${col.id}`);
        if (cb && cb.checked) selectedCols.push(col.id);
    });
    if (selectedCols.length === 0) {
        ui.showToast("Debes seleccionar al menos una columna.");
        return;
    }
    await d.loadLibrary('xlsx');

    const exportData = st.CURRENT_TABLE_DATA.map(doc => {
        const rowObj = {};
        const baseRow = doc.rows && doc.rows.length > 0 ? doc.rows[0] : {};
        const evalsForDoc = ev.getEvaluationsForDoc(doc.id);

        if (selectedCols.includes('col_matrix')) rowObj["Clasificación Final (CloseUp General)"] = doc.closeupLabel || doc.matrixLabel;

        if (selectedCols.includes('col_market_closeup')) {
            rowObj["Clasificación (CloseUp) Mercado Evaluado"] = evalsForDoc.length > 0
                ? evalsForDoc.map(e => `${e.visitador}: ${m.getDoctorMarketClassification(doc.id, e.mercado) || '-'}`).join(' | ')
                : '-';
        }
        if (selectedCols.includes('col_eval')) {
            rowObj["Clasificación Asesor (Subjetiva)"] = evalsForDoc.length > 0
                ? evalsForDoc.map(e => `${e.visitador}: ${e.cuadrante}`).join(' | ')
                : 'Pendiente';
        }
        if (selectedCols.includes('col_obj_eval')) {
            rowObj["Clasificación Objetiva (Encuesta)"] = evalsForDoc.length > 0
                ? evalsForDoc.map(e => `${e.visitador}: ${m.calculateObjectiveScore(e.survey).label}`).join(' | ')
                : '-';
        }
        if (selectedCols.includes('col_market_eval')) {
            rowObj["Mercado Evaluado"] = evalsForDoc.length > 0
                ? evalsForDoc.map(e => `${e.visitador}: ${e.mercado || 'General'}`).join(' | ')
                : '-';
        }
        if (selectedCols.includes('col_sur_q1')) rowObj["Pacientes/Sem (Total)"]      = evalsForDoc.length > 0 ? evalsForDoc.map(e => `${e.visitador}: ${e.survey?.q1 || '-'}`).join(' | ') : '';
        if (selectedCols.includes('col_sur_q2')) rowObj["Pacientes/Sem (Patología)"]  = evalsForDoc.length > 0 ? evalsForDoc.map(e => `${e.visitador}: ${e.survey?.q2 || '-'}`).join(' | ') : '';
        if (selectedCols.includes('col_sur_q3')) rowObj["Pacientes/Sem (Nuestro Prod)"] = evalsForDoc.length > 0 ? evalsForDoc.map(e => `${e.visitador}: ${e.survey?.q3 || '-'}`).join(' | ') : '';
        if (selectedCols.includes('col_sur_q4')) rowObj["Otros Productos Rx"]         = evalsForDoc.length > 0 ? evalsForDoc.map(e => `${e.visitador}: ${e.survey?.q4 || '-'}`).join(' | ') : '';
        if (selectedCols.includes('col_sur_q5')) rowObj["Costo Consulta"]             = evalsForDoc.length > 0 ? evalsForDoc.map(e => `${e.visitador}: ${e.survey?.q5 || '-'}`).join(' | ') : '';
        if (selectedCols.includes('col_eval_notes')) {
            rowObj["Notas Asesor"] = evalsForDoc.length > 0 ? evalsForDoc.map(e => `${e.visitador}: ${e.notas || '-'}`).join(' | ') : '';
        }
        if (selectedCols.includes('col_name'))    rowObj[st.groupByInstitution ? "Institución" : "Médico"] = doc.name;
        if (selectedCols.includes('col_spec'))    rowObj["Especialidad"] = doc.spec || baseRow.spec || "-";
        if (selectedCols.includes('col_mat'))     rowObj["Matrícula"]    = doc.id;
        if (selectedCols.includes('col_address')) rowObj["Dirección"]    = doc.address || baseRow.address || "-";
        if (selectedCols.includes('col_city'))    rowObj["Ciudad"]       = baseRow.city || "-";
        if (selectedCols.includes('col_region'))  rowObj["Región"]       = baseRow.region || "-";
        if (selectedCols.includes('col_gap'))     rowObj["Rx Faltantes"] = doc.gap;
        if (selectedCols.includes('col_rxTot'))   rowObj["Recetas Totales"] = doc.totalRx;
        if (selectedCols.includes('col_rxPhq'))   rowObj["Recetas Lab"]     = doc.rxPhq;
        if (selectedCols.includes('col_share'))   rowObj["Share %"]         = parseFloat(doc.share.toFixed(2));
        return rowObj;
    });

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(exportData), "Matriz Consolidada");
    XLSX.writeFile(wb, "Data_SegmentApp_Definitiva.xlsx");
    document.getElementById('exportColumnsModal').classList.add('hidden');
    ui.showToast("Excel exportado correctamente.");
};

/* ============================================================
   PDF — TABLA FILTRADA
============================================================ */
window.App.exports.executePDFExport = async function() {
    const st = window.App.state;
    const cfg = window.App.config;
    const d  = window.App.data;
    const m  = window.App.matrix;
    const ui = window.App.ui;
    const ev = window.App.evaluation;

    const selectedCols = [];
    cfg.EXPORT_COLUMNS.forEach(col => {
        const cb = document.getElementById(`cb_${col.id}`);
        if (cb && cb.checked) selectedCols.push(col);
    });
    if (selectedCols.length === 0) {
        ui.showToast("Debes seleccionar al menos una columna.");
        return;
    }
    await d.loadLibrary('jspdf');
    await d.loadLibrary('autotable');

    try {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF(selectedCols.length > 6 ? 'landscape' : 'portrait');
        doc.setFontSize(18);
        doc.text("Reporte de Matriz Estratégica", 14, 20);
        doc.setFontSize(10);
        doc.setTextColor(100);
        doc.text(`Fecha: ${new Date().toLocaleDateString()}`, 14, 28);
        if (st.MATRIX_FILTER) {
            doc.text(`Filtro: Cuadrante ${st.MATRIX_FILTER.pot}${(st.MATRIX_FILTER.loy === 'C' ? '-' : (st.MATRIX_FILTER.loy === 'A' ? '+' : ''))}`, 14, 34);
        } else {
            doc.text("Filtro: Todos los registros", 14, 34);
        }

        const head = [selectedCols.map(c => (st.groupByInstitution && c.id === 'col_name') ? 'Institución' : c.label)];

        const tableBody = st.CURRENT_TABLE_DATA.map(row => {
            const baseRow = row.rows && row.rows.length > 0 ? row.rows[0] : {};
            const evalsForDoc = ev.getEvaluationsForDoc(row.id);
            return selectedCols.map(c => {
                if (c.id === 'col_matrix')         return row.closeupLabel || row.matrixLabel;
                if (c.id === 'col_market_closeup') return evalsForDoc.length > 0 ? evalsForDoc.map(e => m.getDoctorMarketClassification(row.id, e.mercado)).join(', ') : '-';
                if (c.id === 'col_eval')           return evalsForDoc.length > 0 ? evalsForDoc.map(e => e.cuadrante).join(', ') : 'Pend.';
                if (c.id === 'col_obj_eval')       return evalsForDoc.length > 0 ? evalsForDoc.map(e => m.calculateObjectiveScore(e.survey).label).join(', ') : '-';
                if (c.id === 'col_market_eval')    return evalsForDoc.length > 0 ? evalsForDoc.map(e => e.mercado || 'Gen').join(', ') : '-';
                if (c.id.startsWith('col_sur_'))   return evalsForDoc.length > 0 ? "En Excel" : "-";
                if (c.id === 'col_eval_notes')     return evalsForDoc.length > 0 ? evalsForDoc.map(e => e.notas || '').join(' ') : '';
                if (c.id === 'col_name')           return row.name;
                if (c.id === 'col_spec')           return row.spec || baseRow.spec || "-";
                if (c.id === 'col_mat')            return row.id;
                if (c.id === 'col_address')        return row.address || baseRow.address || "-";
                if (c.id === 'col_city')           return baseRow.city || "-";
                if (c.id === 'col_region')         return baseRow.region || "-";
                if (c.id === 'col_gap')            return row.gap > 0 ? `+${ui.formatNumber(row.gap)}` : '-';
                if (c.id === 'col_rxTot')          return ui.formatNumber(row.totalRx);
                if (c.id === 'col_rxPhq')          return ui.formatNumber(row.rxPhq);
                if (c.id === 'col_share')          return ui.formatNumber(row.share, 2) + '%';
                return "";
            });
        });

        const columnStyles = {};
        selectedCols.forEach((col, index) => {
            if (col.id === 'col_rxTot' || col.id === 'col_rxPhq') columnStyles[index] = { halign: 'right' };
            if (col.id === 'col_share' || col.id === 'col_gap')   columnStyles[index] = { halign: 'center' };
        });

        doc.autoTable({
            startY: 40,
            head: head,
            body: tableBody,
            theme: 'grid',
            headStyles: { fillColor: [10, 86, 209] },
            styles: { fontSize: 8 },
            columnStyles: columnStyles
        });
        doc.save("Reporte_Analisis.pdf");
        document.getElementById('exportColumnsModal').classList.add('hidden');
        ui.showToast("PDF exportado correctamente.");
    } catch (error) {
        alert("Error al generar PDF.");
        console.error(error);
    }
};

/* ============================================================
   ALIAS GLOBALES (compatibilidad con onclick del HTML)
============================================================ */
window.showExportModal             = window.App.exports.showExportModal;
window.updateCbStyle               = window.App.exports.updateCbStyle;
window.toggleAllExportCB           = window.App.exports.toggleAllExportCB;
window.executeExport               = window.App.exports.executeExport;
window.exportMatrixToPNG           = window.App.exports.exportMatrixToPNG;
window.exportAdminEvaluationsExcel = window.App.exports.exportAdminEvaluationsExcel;
window.executeExcelExport          = window.App.exports.executeExcelExport;
window.executePDFExport            = window.App.exports.executePDFExport;

console.log('[SegmentApp] exports.js cargado.');

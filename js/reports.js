/* ============================================================
   SegmentApp - Módulo de Reportes Avanzados
   Archivo: js/reports.js
   v2: optimizado para iPad + agrupación por Línea (OTC/Pharmetique)
============================================================ */

window.App = window.App || {};
window.App.reports = {};

// Estado interno del módulo
window.App.reports.state = {
    activeReps: new Set(),         // Representantes activos seleccionados
    allRepsDetected: [],            // Todos los reps detectados
    currentView: 'manager',         // 'manager' | 'linea' | 'rep'
    chartInstance: null,
    _statsCache: null,              // Cache de cálculos (memoización)
    _statsCacheKey: null,           // Firma del estado para invalidar cache
    _renderDebounceTimer: null,     // Debounce de re-render
    _repLineaMap: {}                // Mapa visitador -> línea (OTC/Pharmetique)
};

/* ============================================================
   INICIALIZAR — detecta reps + línea de cada uno
============================================================ */
window.App.reports.init = function() {
    const st = window.App.state;
    const rs = window.App.reports.state;
    const d = window.App.data;

    const repsSet = new Set();
    rs._repLineaMap = {};

    st.FICHERO_MAP.forEach(rows => {
        rows.forEach(row => {
            const repKey = d.getFicheroRepKey(row);
            if (!repKey || !row[repKey]) return;
            const repName = String(row[repKey]).trim().toUpperCase();
            if (st.REPS_PERMITIDOS && !st.REPS_PERMITIDOS.has(repName)) return;
            repsSet.add(repName);

            // Detectar línea desde campo 'Equipo'
            const equipoKey = Object.keys(row).find(k => /^equipo$/i.test(k.trim()));
            if (equipoKey && row[equipoKey] !== undefined && row[equipoKey] !== '') {
                const equipoVal = String(row[equipoKey]).trim();
                const linea = (equipoVal === '7') ? 'OTC' : 'Pharmetique';
                rs._repLineaMap[repName] = linea;
            }
        });
    });

    rs.allRepsDetected = Array.from(repsSet).sort();
    rs.activeReps = new Set(rs.allRepsDetected);
    rs._statsCache = null;
    rs._statsCacheKey = null;
};

/* ============================================================
   FIRMA DEL ESTADO — para invalidar cache
============================================================ */
window.App.reports._signature = function() {
    const rs = window.App.reports.state;
    return Array.from(rs.activeReps).sort().join('|') + '::' + window.App.state.ALL_EVALUATIONS.length;
};

/* ============================================================
   CALCULAR ESTADÍSTICAS — con memoización
============================================================ */
window.App.reports.calculateStats = function() {
    const st = window.App.state;
    const rs = window.App.reports.state;
    const d = window.App.data;

    // Cache hit: si la firma no cambió, devolvemos lo cacheado
    const sig = window.App.reports._signature();
    if (rs._statsCache && rs._statsCacheKey === sig) {
        return rs._statsCache;
    }

    const repStats = {};
    const managerStats = {};
    const lineaStats = {
        'OTC': { name: 'OTC', totalDocs: 0, evaluatedDocs: 0, totalSurveys: 0, reps: new Set() },
        'Pharmetique': { name: 'Pharmetique', totalDocs: 0, evaluatedDocs: 0, totalSurveys: 0, reps: new Set() }
    };
// Primera pasada: contar médicos asignados por rep
    // FIX: deduplicar (médico, rep) — si un médico tiene varias filas en el fichero del MISMO rep
    // (ej. distintos sectores), debe contarse 1 sola vez. Mismo criterio que renderAdminDashboard.
    st.FICHERO_MAP.forEach((rows, docId) => {
        const repsInDoc = new Set();
        rows.forEach(row => {
            const repKey = d.getFicheroRepKey(row);
            if (!repKey || !row[repKey]) return;
            const repName = String(row[repKey]).trim().toUpperCase();
            if (!rs.activeReps.has(repName)) return;
            repsInDoc.add(repName);
        });
        repsInDoc.forEach(repName => {
            if (!repStats[repName]) {
                repStats[repName] = {
                    name: repName,
                    totalDocs: 0,
                    evaluatedDocIds: new Set(),
                    totalSurveys: 0,
                    manager: st.REP_MANAGER_MAP[repName] || 'Sin Gerente',
                    linea: rs._repLineaMap[repName] || 'Sin Línea'
                };
            }
            repStats[repName].totalDocs++;
        });
    });


    // Segunda pasada: evaluaciones por rep
    st.ALL_EVALUATIONS.forEach(ev => {
        const repName = String(ev.visitador || '').toUpperCase();
        if (!rs.activeReps.has(repName)) return;
        if (!repStats[repName]) {
            repStats[repName] = {
                name: repName,
                totalDocs: 0,
                evaluatedDocIds: new Set(),
                totalSurveys: 0,
                manager: st.REP_MANAGER_MAP[repName] || 'Sin Gerente',
                linea: rs._repLineaMap[repName] || 'Sin Línea'
            };
        }
        repStats[repName].evaluatedDocIds.add(d.normalizeKey(ev.medico_id));
        repStats[repName].totalSurveys++;
    });

    // Tercera pasada: agregar por gerente
    Object.values(repStats).forEach(rep => {
        const mgr = rep.manager;
        if (!managerStats[mgr]) {
            managerStats[mgr] = {
                name: mgr,
                totalDocs: 0,
                evaluatedDocs: 0,
                totalSurveys: 0,
                reps: []
            };
        }
        managerStats[mgr].totalDocs += rep.totalDocs;
        managerStats[mgr].evaluatedDocs += rep.evaluatedDocIds.size;
        managerStats[mgr].totalSurveys += rep.totalSurveys;
        managerStats[mgr].reps.push(rep.name);
    });

    // Cuarta pasada: agregar por LÍNEA (cada visitador a UNA línea)
    Object.values(repStats).forEach(rep => {
        const linea = rep.linea;
        if (!lineaStats[linea]) {
            lineaStats[linea] = {
                name: linea, totalDocs: 0, evaluatedDocs: 0, totalSurveys: 0, reps: new Set()
            };
        }
        lineaStats[linea].totalDocs += rep.totalDocs;
        lineaStats[linea].evaluatedDocs += rep.evaluatedDocIds.size;
        lineaStats[linea].totalSurveys += rep.totalSurveys;
        lineaStats[linea].reps.add(rep.name);
    });

    // Eliminar líneas sin datos (si OTC o Pharmetique queda vacío por filtros)
    Object.keys(lineaStats).forEach(k => {
        if (lineaStats[k].totalDocs === 0 && lineaStats[k].reps.size === 0) {
            delete lineaStats[k];
        }
    });

    // Totales globales
    const global = {
        totalDocs: 0, evaluatedDocs: 0, totalSurveys: 0, totalReps: Object.keys(repStats).length
    };
    Object.values(repStats).forEach(rep => {
        global.totalDocs += rep.totalDocs;
        global.evaluatedDocs += rep.evaluatedDocIds.size;
        global.totalSurveys += rep.totalSurveys;
    });

    const result = { repStats, managerStats, lineaStats, global };

    // Guardar en cache
    rs._statsCache = result;
    rs._statsCacheKey = sig;

    return result;
};

/* ============================================================
   RENDER GENERAL (con debounce para iPad)
============================================================ */
window.App.reports.render = function(skipRepSelector = false) {
    const rs = window.App.reports.state;
    if (rs._renderDebounceTimer) clearTimeout(rs._renderDebounceTimer);
    rs._renderDebounceTimer = setTimeout(() => {
        const stats = window.App.reports.calculateStats();
        window.App.reports.renderKPIs(stats.global);
        if (!skipRepSelector) window.App.reports.renderRepSelector();
        window.App.reports.renderChart(stats);
    }, 100);
};

/* ============================================================
   KPIs (4 tarjetas)
============================================================ */
window.App.reports.renderKPIs = function(global) {
    const ui = window.App.ui;
    const pctAvance = global.totalDocs > 0
        ? ((global.evaluatedDocs / global.totalDocs) * 100).toFixed(1)
        : 0;

    ui.safeSetText('rpt_kpi_avance', pctAvance + '%');
    ui.safeSetText('rpt_kpi_docs', ui.formatNumber(global.totalDocs));
    ui.safeSetText('rpt_kpi_evaluados', ui.formatNumber(global.evaluatedDocs));
    ui.safeSetText('rpt_kpi_encuestas', ui.formatNumber(global.totalSurveys));
    ui.safeSetText('rpt_kpi_reps_activos', global.totalReps + ' reps');

    const kpiEl = document.getElementById('rpt_kpi_avance');
    if (kpiEl) {
        kpiEl.classList.remove('text-emerald-600', 'text-amber-500', 'text-rose-600');
        if (pctAvance >= 75) kpiEl.classList.add('text-emerald-600');
        else if (pctAvance >= 40) kpiEl.classList.add('text-amber-500');
        else kpiEl.classList.add('text-rose-600');
    }
};

/* ============================================================
   SELECTOR DE REPRESENTANTES (se renderiza UNA VEZ)
============================================================ */
window.App.reports.renderRepSelector = function() {
    const rs = window.App.reports.state;
    const container = document.getElementById('rpt_rep_selector');
    if (!container) return;

    // Solo renderiza si está vacío (mejora performance)
    if (container.dataset.rendered === 'true') {
        // Actualizar solo el contador
        window.App.ui.safeSetText('rpt_reps_count', `${rs.activeReps.size} de ${rs.allRepsDetected.length}`);
        return;
    }

    let html = '';
    rs.allRepsDetected.forEach(rep => {
        const checked = rs.activeReps.has(rep) ? 'checked' : '';
        const linea = rs._repLineaMap[rep] || '';
        const lineaTag = linea ? `<span class="text-[8px] font-bold px-1.5 py-0.5 rounded ${linea === 'OTC' ? 'bg-amber-100 text-amber-700' : 'bg-indigo-100 text-indigo-700'}">${linea}</span>` : '';
        const safeId = `rpt_rep_${rep.replace(/[^a-zA-Z0-9]/g, '_')}`;
        html += `
            <label class="flex items-center gap-2 px-3 py-1.5 bg-white hover:bg-indigo-50 rounded-lg border border-slate-200 cursor-pointer transition text-xs">
                <input type="checkbox" id="${safeId}" ${checked} data-rep="${rep}" class="rpt-rep-cb accent-indigo-600 w-4 h-4">
                <span class="truncate font-medium text-slate-700 flex-1" title="${rep}">${rep}</span>
                ${lineaTag}
            </label>
        `;
    });

    container.innerHTML = html;
    container.dataset.rendered = 'true';

    // Event delegation (más rápido que un listener por checkbox)
    container.addEventListener('change', (e) => {
        if (!e.target.classList.contains('rpt-rep-cb')) return;
        const repName = e.target.dataset.rep;
        if (e.target.checked) rs.activeReps.add(repName);
        else rs.activeReps.delete(repName);
        window.App.reports.render(true); // skip rep selector re-render
    });

    window.App.ui.safeSetText('rpt_reps_count', `${rs.activeReps.size} de ${rs.allRepsDetected.length}`);
};

window.App.reports.selectAllReps = function() {
    const rs = window.App.reports.state;
    rs.activeReps = new Set(rs.allRepsDetected);
    // Marca todos los checkboxes
    document.querySelectorAll('.rpt-rep-cb').forEach(cb => cb.checked = true);
    window.App.reports.render(true);
};

window.App.reports.deselectAllReps = function() {
    window.App.reports.state.activeReps = new Set();
    document.querySelectorAll('.rpt-rep-cb').forEach(cb => cb.checked = false);
    window.App.reports.render(true);
};

/* ============================================================
   CAMBIAR VISTA
============================================================ */
window.App.reports.switchView = function(view) {
    window.App.reports.state.currentView = view;

    ['manager', 'linea', 'rep'].forEach(v => {
        const btn = document.getElementById(`rpt_btn_view_${v}`);
        if (!btn) return;
        if (v === view) {
            btn.classList.add('bg-indigo-600', 'text-white');
            btn.classList.remove('bg-slate-100', 'text-slate-600');
        } else {
            btn.classList.remove('bg-indigo-600', 'text-white');
            btn.classList.add('bg-slate-100', 'text-slate-600');
        }
    });

    window.App.reports.render(true);
};

/* ============================================================
   GRÁFICO PRINCIPAL — usa update() en lugar de destroy+create
============================================================ */
window.App.reports.renderChart = function(stats) {
    const rs = window.App.reports.state;
    const ctx = document.getElementById('rpt_chart_canvas');
    if (!ctx) return;

    let dataSource = [];
    let title = '';

    if (rs.currentView === 'manager') {
        dataSource = Object.values(stats.managerStats);
        title = 'Avance por Gerente de Distrito';
    } else if (rs.currentView === 'linea') {
        dataSource = Object.values(stats.lineaStats);
        title = 'Avance por Línea';
    } else {
        dataSource = Object.values(stats.repStats).map(r => ({
            name: r.name,
            totalDocs: r.totalDocs,
            evaluatedDocs: r.evaluatedDocIds.size,
            totalSurveys: r.totalSurveys,
            reps: [r.name]
        }));
        title = 'Avance por Representante';
    }

    // Calcular % avance y ordenar
    dataSource = dataSource.map(d => ({
        ...d,
        pct: d.totalDocs > 0 ? (d.evaluatedDocs / d.totalDocs) * 100 : 0
    })).sort((a, b) => b.pct - a.pct);

    // Limitar top 25 para vista representante
    if (rs.currentView === 'rep' && dataSource.length > 25) {
        dataSource = dataSource.slice(0, 25);
    }

    // Renderizar tarjetas resumen abajo del gráfico (para Línea y Gerente principalmente)
    window.App.reports.renderSummaryCards(dataSource, rs.currentView);

    const labels = dataSource.map(d => d.name.length > 25 ? d.name.substring(0, 22) + '...' : d.name);
    const pcts = dataSource.map(d => d.pct);
    const bgColors = pcts.map(p => {
        if (p >= 75) return '#10b981';
        if (p >= 40) return '#f59e0b';
        return '#ef4444';
    });

    // Si ya hay chart, hacer update (mucho más rápido que destroy+create)
    if (rs.chartInstance) {
        rs.chartInstance.data.labels = labels;
        rs.chartInstance.data.datasets[0].data = pcts;
        rs.chartInstance.data.datasets[0].backgroundColor = bgColors;
        rs.chartInstance.options.plugins.title.text = title;
        // Guardamos dataSource en el chart para los tooltips
        rs.chartInstance._dataSource = dataSource;
        rs.chartInstance.update('none'); // 'none' = sin animación, más rápido
        return;
    }

    // Primera creación
    rs.chartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: '% Avance',
                data: pcts,
                backgroundColor: bgColors,
                borderRadius: 6,
                borderSkipped: false
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            animation: { duration: 300 }, // animación corta
            plugins: {
                legend: { display: false },
                title: { display: true, text: title, font: { size: 14, weight: 'bold' } },
                datalabels: {
                    color: '#ffffff',
                    font: { weight: 'bold', size: 11 },
                    formatter: v => v.toFixed(0) + '%'
                },
                tooltip: {
                    callbacks: {
                        label: function(ctx) {
                            const ds = ctx.chart._dataSource || dataSource;
                            const d = ds[ctx.dataIndex];
                            const lines = [
                                `Avance: ${d.pct.toFixed(1)}%`,
                                `Evaluados: ${d.evaluatedDocs} / ${d.totalDocs}`,
                                `Encuestas: ${d.totalSurveys}`
                            ];
                            if (d.reps) {
                                const nReps = Array.isArray(d.reps) ? d.reps.length : d.reps.size;
                                lines.push(`Visitadores: ${nReps}`);
                            }
                            return lines;
                        }
                    }
                }
            },
            scales: {
                x: { beginAtZero: true, max: 100, ticks: { callback: v => v + '%' } }
            }
        }
    });
    rs.chartInstance._dataSource = dataSource;
};

/* ============================================================
   TARJETAS RESUMEN bajo el gráfico (detalle visible para capturas)
============================================================ */
window.App.reports.renderSummaryCards = function(dataSource, view) {
    const container = document.getElementById('rpt_summary_cards');
    if (!container) return;

    // Para vista "rep" no mostramos tarjetas (demasiadas, ya está el gráfico)
    if (view === 'rep') {
        container.innerHTML = '';
        container.classList.add('hidden');
        return;
    }

    container.classList.remove('hidden');

    const ui = window.App.ui;
    let html = '';

    dataSource.forEach(item => {
        const pct = item.pct;
        let badgeColor = 'bg-rose-50 border-rose-200 text-rose-700';
        let barColor = 'bg-rose-500';
        let statusText = 'Atención';
        let icon = '⚠️';
        if (pct >= 75) {
            badgeColor = 'bg-emerald-50 border-emerald-200 text-emerald-700';
            barColor = 'bg-emerald-500';
            statusText = 'Excelente';
            icon = '🎯';
        } else if (pct >= 40) {
            badgeColor = 'bg-amber-50 border-amber-200 text-amber-700';
            barColor = 'bg-amber-500';
            statusText = 'En progreso';
            icon = '📈';
        }

        const nReps = item.reps ? (Array.isArray(item.reps) ? item.reps.length : item.reps.size) : 0;
        const repsBadge = nReps > 0 ? `<span class="text-[10px] font-bold bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full">${nReps} ${nReps === 1 ? 'visitador' : 'visitadores'}</span>` : '';

        html += `
            <div class="bg-white rounded-2xl border-2 ${badgeColor} p-5 shadow-sm">
                <div class="flex items-start justify-between mb-3">
                    <div class="flex items-center gap-2">
                        <span class="text-2xl">${icon}</span>
                        <div>
                            <h4 class="font-display font-bold text-slate-800 text-lg leading-tight">${item.name}</h4>
                            <span class="text-[10px] font-bold uppercase tracking-widest ${badgeColor.split(' ')[2]}">${statusText}</span>
                        </div>
                    </div>
                    ${repsBadge}
                </div>
                <div class="grid grid-cols-3 gap-2 mb-3">
                    <div class="bg-slate-50 rounded-lg p-2 text-center">
                        <div class="text-[9px] font-bold text-slate-500 uppercase">Médicos</div>
                        <div class="text-lg font-display font-black text-slate-700">${ui.formatNumber(item.totalDocs)}</div>
                    </div>
                    <div class="bg-indigo-50 rounded-lg p-2 text-center">
                        <div class="text-[9px] font-bold text-indigo-500 uppercase">Evaluados</div>
                        <div class="text-lg font-display font-black text-indigo-700">${ui.formatNumber(item.evaluatedDocs)}</div>
                    </div>
                    <div class="bg-purple-50 rounded-lg p-2 text-center">
                        <div class="text-[9px] font-bold text-purple-500 uppercase">Encuestas</div>
                        <div class="text-lg font-display font-black text-purple-700">${ui.formatNumber(item.totalSurveys)}</div>
                    </div>
                </div>
                <div class="relative">
                    <div class="flex justify-between text-[10px] font-bold mb-1">
                        <span class="text-slate-500">Progreso</span>
                        <span class="text-slate-700">${pct.toFixed(1)}%</span>
                    </div>
                    <div class="w-full bg-slate-100 rounded-full h-3 overflow-hidden">
                        <div class="${barColor} h-3 rounded-full transition-all duration-500" style="width: ${Math.min(pct, 100)}%"></div>
                    </div>
                </div>
            </div>
        `;
    });

    container.innerHTML = html;
};

/* ============================================================
   ABRIR / CERRAR MODAL
============================================================ */
window.App.reports.openModal = function() {
    // Reset cache + flags al abrir (por si cambiaron datos externos)
    const rs = window.App.reports.state;
    rs._statsCache = null;
    rs._statsCacheKey = null;
    const container = document.getElementById('rpt_rep_selector');
    if (container) container.dataset.rendered = 'false';

    window.App.reports.init();
    document.getElementById('reportsModal').classList.remove('hidden');
    setTimeout(() => window.App.reports.render(), 100);
};

window.App.reports.closeModal = function() {
    document.getElementById('reportsModal').classList.add('hidden');
    if (window.App.reports.state.chartInstance) {
        window.App.reports.state.chartInstance.destroy();
        window.App.reports.state.chartInstance = null;
    }
    // Resetear flag de renderizado del selector
    const container = document.getElementById('rpt_rep_selector');
    if (container) container.dataset.rendered = 'false';
};

/* ============================================================
   EXPORTAR EXCEL
============================================================ */
window.App.reports.exportToExcel = async function() {
    await window.App.data.loadLibrary('xlsx');
    const stats = window.App.reports.calculateStats();

    const wb = XLSX.utils.book_new();

    // Hoja 1: Por Representante
    const repsData = Object.values(stats.repStats).map(r => ({
        'Representante': r.name,
        'Línea': r.linea,
        'Gerente': r.manager,
        'Total Médicos': r.totalDocs,
        'Médicos Evaluados': r.evaluatedDocIds.size,
        '% Avance': r.totalDocs > 0 ? ((r.evaluatedDocIds.size / r.totalDocs) * 100).toFixed(1) + '%' : '0%',
        'Total Encuestas': r.totalSurveys
    })).sort((a, b) => parseFloat(b['% Avance']) - parseFloat(a['% Avance']));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(repsData), 'Por Representante');

    // Hoja 2: Por Gerente
    const mgrData = Object.values(stats.managerStats).map(m => ({
        'Gerente': m.name,
        'Cantidad Representantes': m.reps.length,
        'Total Médicos': m.totalDocs,
        'Médicos Evaluados': m.evaluatedDocs,
        '% Avance': m.totalDocs > 0 ? ((m.evaluatedDocs / m.totalDocs) * 100).toFixed(1) + '%' : '0%',
        'Total Encuestas': m.totalSurveys
    })).sort((a, b) => parseFloat(b['% Avance']) - parseFloat(a['% Avance']));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(mgrData), 'Por Gerente');

    // Hoja 3: Por Línea
    const lineaData = Object.values(stats.lineaStats).map(l => ({
        'Línea': l.name,
        'Cantidad Representantes': l.reps.size,
        'Total Médicos': l.totalDocs,
        'Médicos Evaluados': l.evaluatedDocs,
        '% Avance': l.totalDocs > 0 ? ((l.evaluatedDocs / l.totalDocs) * 100).toFixed(1) + '%' : '0%',
        'Total Encuestas': l.totalSurveys
    })).sort((a, b) => parseFloat(b['% Avance']) - parseFloat(a['% Avance']));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(lineaData), 'Por Línea');

    XLSX.writeFile(wb, `SegmentApp_Reporte_Avance_${new Date().toISOString().split('T')[0]}.xlsx`);
    window.App.ui.showToast('Reporte descargado correctamente.');
};

/* ============================================================
   ALIAS GLOBALES
============================================================ */
window.openReportsModal      = window.App.reports.openModal;
window.closeReportsModal     = window.App.reports.closeModal;
window.reportsSwitchView     = window.App.reports.switchView;
window.reportsSelectAllReps  = window.App.reports.selectAllReps;
window.reportsDeselectAllReps = window.App.reports.deselectAllReps;
window.exportReportsExcel    = window.App.reports.exportToExcel;

console.log('[SegmentApp] reports.js v2 cargado (optimizado iPad + Línea).');

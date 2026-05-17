/* ============================================================
   SegmentApp - Modales de detalle (Médico, Institución, Mercado)
   Archivo: js/modals.js
   Responsable de:
   - Modal de detalle del médico (Chart.js + breakdown mercados)
   - Modal institucional (agrupación por dirección)
   - Modal de composición del mercado (ranking de productos)
============================================================ */

window.App = window.App || {};
window.App.modals = {};

/* ============================================================
   MODAL: COMPOSICIÓN DEL MERCADO
   Muestra el ranking global de productos en el universo filtrado.
============================================================ */
window.App.modals.showMarketDetails = function() {
    const st = window.App.state;
    const ui = window.App.ui;

    let html = `
        <div class="mb-4 text-sm text-slate-600">Ranking completo de productos (Tu Portafolio vs Competencia) en la selección actual.</div>
        <div class="border border-slate-200 rounded-2xl overflow-hidden max-h-[60vh] overflow-y-auto">
        <table class="w-full text-sm text-left">
            <thead class="bg-slate-100 font-bold text-slate-500 uppercase sticky top-0 shadow-sm text-xs">
                <tr><th class="p-3">Producto</th><th class="p-3 text-right">Rx</th><th class="p-3 text-center">MS %</th></tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
    `;
    const totalMkt = st.CURRENT_COMP_BREAKDOWN.reduce((s, i) => s + i.rx, 0);

    st.CURRENT_COMP_BREAKDOWN.forEach((item, idx) => {
        const share = totalMkt > 0 ? (item.rx / totalMkt) * 100 : 0;
        let rowStyle  = "text-slate-600 hover:bg-slate-50 transition";
        let nameStyle = "";
        let shareStyle = "text-slate-500";
        if (item.type === 'PHQ') {
            rowStyle = "bg-blue-50/50 text-blue-900";
            nameStyle = "font-bold text-blue-700";
            shareStyle = "font-bold text-blue-700";
        } else if (idx === 0) {
            rowStyle = "bg-rose-50/50 text-rose-900";
        }
        html += `
            <tr class="${rowStyle}">
                <td class="p-3 ${nameStyle}">${item.prod} ${item.type === 'PHQ' ? '<span class="text-[9px] bg-blue-100 px-1 rounded ml-1 uppercase">PHQ</span>' : ''}</td>
                <td class="p-3 text-right font-mono font-medium">${ui.formatNumber(item.rx)}</td>
                <td class="p-3 text-center ${shareStyle}">${ui.formatNumber(share, 2)}%</td>
            </tr>
        `;
    });
    html += `</tbody></table></div>`;

    ui.safeSetText('modalDocName', "Composición de Mercado");
    ui.safeSetText('modalDocSpec', "Ranking de Productos");
    ui.safeSetText('modalDocLic',  "Global");
    ui.safeSetText('modalDocShare', "-");
    document.getElementById('modalBadges').innerHTML = '<span class="material-symbols-outlined text-blue-500 text-3xl">analytics</span>';
    document.getElementById('tabContentFichaje').classList.add('hidden');
    document.getElementById('tabContentMercado').classList.remove('hidden');
    document.getElementById('tabBtnFichaje').classList.add('hidden');
    document.getElementById('tabBtnMercado').classList.add('hidden');
    document.getElementById('modalContent').innerHTML = html;
    document.getElementById('doctorDetailModal').classList.remove('hidden');
};

/* ============================================================
   MODAL: DETALLE DEL MÉDICO
   Incluye Chart.js, breakdown por mercados y datos del fichero.
============================================================ */
window.App.modals.openDoctorModal = function(docId) {
    const st = window.App.state;
    const d  = window.App.data;
    const ui = window.App.ui;

    const doc = st.PROCESSED_DATA.find(x => x.id === docId);
    if (!doc) return;

    document.getElementById('tabBtnFichaje').classList.remove('hidden');
    document.getElementById('tabBtnMercado').classList.remove('hidden');
    ui.switchDocTab('fichaje');

    ui.safeSetText('modalDocName', doc.name);
    ui.safeSetText('modalDocSpec', doc.spec);
    ui.safeSetText('modalDocLic',  doc.id);
    ui.safeSetText('modalDocShare', `Share Lab: ${ui.formatNumber(doc.share, 2)}%`);

    const badgesContainer = document.getElementById('modalBadges');
    let potLabel = `Potencial ${doc.catPotency}`;
    if (doc.catPotency === 'A') potLabel = `Alto Potencial (A)`;
    if (doc.catPotency === 'B') potLabel = `Medio Potencial (B)`;
    if (doc.catPotency === 'C') potLabel = `Bajo Potencial (C)`;
    let loyLabel = `Adopción ${doc.catLoyalty}`;
    if (doc.catLoyalty === 'A') loyLabel = `Alta Adopción (+)`;
    if (doc.catLoyalty === 'B') loyLabel = `Media Adopción`;
    if (doc.catLoyalty === 'C') loyLabel = `Baja Adopción (-)`;

    const labelToDisplay = (st.currentMatrixMode === 'survey' && !doc.isInst) ? doc.surveyLabel : doc.closeupLabel;
    badgesContainer.innerHTML = `
        <span class="modal-badge bg-blue-100 text-blue-800">${potLabel}</span>
        <span class="modal-badge bg-teal-100 text-teal-800">${loyLabel}</span>
        <span class="modal-badge bg-slate-800 text-white font-display">Clasificación ${labelToDisplay}</span>
    `;

    // Tarjeta de oportunidad (GAP)
    const gapContainer = document.getElementById('modalGapContainer');
    if (doc.gap > 0 && st.currentMatrixMode === 'closeup') {
        gapContainer.className = "bg-rose-50 border border-rose-100 p-3 rounded-xl mb-6 flex justify-between items-center shadow-sm";
        gapContainer.innerHTML = `
            <div class="flex items-center gap-2">
                <span class="material-symbols-outlined text-rose-500 bg-rose-100 p-1.5 rounded-full text-[14px]">trending_up</span>
                <span class="text-xs font-bold text-rose-800 font-display">Oportunidad de Crecimiento</span>
            </div>
            <div class="text-xs text-rose-900 font-medium">Faltan
                <span class="font-display font-black text-sm text-rose-600 bg-white px-2 py-0.5 rounded-lg border border-rose-200 shadow-sm">${ui.formatNumber(doc.gap)} Rx</span>
            </div>
        `;
        gapContainer.classList.remove('hidden');
    } else {
        gapContainer.classList.add('hidden');
    }

    // Datos del fichero médico (si existen)
    const fichDiv = document.getElementById('modalFicheroData');
    const fichContainer = document.getElementById('modalFicheroContainer');
    const fichHeader = document.getElementById('ficheroSummaryHeader');

    if (doc.ficheroData && doc.ficheroData.length > 0) {
        fichDiv.classList.remove('hidden');
        fichContainer.innerHTML = '';

        const repCount = doc.ficheroData.length;
        const repLabel = repCount === 1 ? '1 Asesor' : `${repCount} Asesores`;
        const repColor = repCount > 1 ? 'bg-purple-600 text-white' : 'bg-purple-200 text-purple-800';
        const repTitle = repCount > 1 ? 'COMPARTIDO' : 'EXCLUSIVO';

        fichHeader.innerHTML = `
            <div class="flex items-center gap-2">
                <span class="material-symbols-outlined text-purple-600">contact_page</span>
                <span>Datos de Fichado</span>
                <span class="${repColor} text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ml-3 shadow-sm" title="${repTitle}">${repLabel}</span>
            </div>
            <span class="material-symbols-outlined text-purple-400 transition-transform group-open:rotate-180">expand_more</span>
        `;

        doc.ficheroData.forEach((repData, idx) => {
            let html = `<div class="mb-4 bg-slate-50 rounded-[1.5rem] border border-slate-200 shadow-sm relative group overflow-hidden transition hover:border-purple-300">`;
            const lat = d.getValueCaseInsensitive(repData, 'GPS_LAT');
            const lon = d.getValueCaseInsensitive(repData, 'GPS_LON');
            let mapBtn = '';
            if (lat && lon) {
                mapBtn = `<a href="https://www.google.com/maps/search/?api=1&query=${lat},${lon}" target="_blank" class="flex items-center gap-1 bg-white border border-slate-200 text-slate-600 px-3 py-1.5 rounded-xl text-xs font-bold hover:text-blue-600 hover:border-blue-300 transition shadow-sm"><span class="material-symbols-outlined text-[16px] text-rose-500">location_on</span> Ver Ubicación</a>`;
            }
            html += `<div class="flex justify-between items-center p-4 border-b border-slate-200 bg-white"><div class="flex items-center gap-2"><span class="bg-purple-100 text-purple-700 text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-wider border border-purple-200">Asesor #${idx + 1}</span></div>${mapBtn}</div>`;
            html += `<div class="p-5 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 text-center">`;
            Object.entries(repData).forEach(([k, v]) => {
                if (v && !k.toUpperCase().includes('GPS')) {
                    html += `
                        <div class="bg-white p-3 rounded-xl border border-slate-100 shadow-sm flex flex-col items-center justify-center transition hover:border-purple-200">
                            <span class="block text-slate-400 font-mono uppercase text-[9px] tracking-widest truncate w-full mb-1" title="${k}">${k}</span>
                            <span class="font-semibold text-slate-700 break-words text-sm text-center">${v}</span>
                        </div>
                    `;
                }
            });
            html += `</div></div>`;
            fichContainer.innerHTML += html;
        });
        fichDiv.querySelector('details').open = false;
    } else {
        fichDiv.classList.add('hidden');
    }

    // Chart.js (Doughnut del Share)
    if (st.docChartInstance) { st.docChartInstance.destroy(); }
    const ctx = document.getElementById('docShareChart').getContext('2d');
    const restRx = doc.totalRx - doc.rxPhq;
    ui.safeSetText('chartStatPhq',  ui.formatNumber(doc.rxPhq));
    ui.safeSetText('chartStatRest', ui.formatNumber(restRx));
    st.docChartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Lab (PHQ)', 'Resto'],
            datasets: [{
                data: [doc.rxPhq, restRx],
                backgroundColor: ['#0A56D1', '#E2E8F0'],
                borderWidth: 2,
                borderColor: '#ffffff',
                hoverOffset: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '60%',
            plugins: {
                legend: { display: false },
                datalabels: {
                    color: (context) => context.dataIndex === 0 ? '#ffffff' : '#64748b',
                    font: { weight: 'bold', size: 12 },
                    formatter: (value, ctx) => {
                        let sum = ctx.chart.data.datasets[0].data.reduce((a, b) => a + b, 0);
                        if (sum === 0 || value === 0) return '';
                        return (value * 100 / sum).toFixed(1) + "%";
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            let label = context.label || '';
                            if (label) label += ': ';
                            if (context.parsed !== null) label += ui.formatNumber(context.parsed) + ' Rx';
                            return label;
                        }
                    }
                }
            }
        }
    });

    // Breakdown por mercados (tab "Mercado")
    const content = document.getElementById('modalContent');
    content.innerHTML = '';
    const markets = {};
    doc.rows.forEach(r => {
        if (!markets[r.market]) markets[r.market] = [];
        markets[r.market].push(r);
    });
    for (const [mkt, rows] of Object.entries(markets)) {
        const mktDiv = document.createElement('div');
        mktDiv.className = "mb-6 border border-slate-200 rounded-[1.5rem] overflow-hidden shadow-sm";
        const mktTotal = rows.reduce((s, r) => s + r.rx, 0);
        const mktPhq   = rows.reduce((s, r) => s + (d.isPhq(r.prod) ? r.rx : 0), 0);
        const mktShare = mktTotal > 0 ? (mktPhq / mktTotal) * 100 : 0;
        let mktClass = 'C';
        if      (mktShare >= st.TH_LOY_HIGH) mktClass = 'A';
        else if (mktShare >  st.TH_LOY_LOW)  mktClass = 'B';
        let mktClassBadge = `<span class="text-[10px] font-bold text-slate-500 border border-slate-300 px-2 py-0.5 rounded-md bg-white">Adopción ${mktClass}</span>`;
        if (mktClass === 'A') mktClassBadge = `<span class="text-[10px] font-bold text-green-700 border border-green-200 bg-green-50 px-2 py-0.5 rounded-md">Alta Adopción (+)</span>`;
        if (mktClass === 'B') mktClassBadge = `<span class="text-[10px] font-bold text-yellow-700 border border-yellow-200 bg-yellow-50 px-2 py-0.5 rounded-md">Media Adopción</span>`;
        if (mktClass === 'C') mktClassBadge = `<span class="text-[10px] font-bold text-red-700 border border-red-200 bg-red-50 px-2 py-0.5 rounded-md">Baja Adopción (-)</span>`;

        mktDiv.innerHTML = `
            <table class="w-full text-sm table-fixed">
                <thead>
                    <tr class="bg-slate-50 border-b border-slate-200">
                        <td class="p-4 w-[46%]"><div class="flex items-center gap-2"><span class="font-display font-bold text-slate-800 text-base">${mkt}</span>${mktClassBadge}</div></td>
                        <td class="p-4 text-right w-[18%]"><span class="text-slate-500 block text-[9px] font-bold uppercase tracking-widest">Total Rx</span><b class="text-slate-800 text-base font-mono">${ui.formatNumber(mktTotal)}</b></td>
                        <td class="p-4 text-right w-[18%]"><span class="text-blue-600 block text-[9px] font-bold uppercase tracking-widest">Rx Lab</span><b class="text-blue-700 text-base font-mono">${ui.formatNumber(mktPhq)}</b></td>
                        <td class="p-4 text-center w-[18%]"><span class="text-slate-500 block text-[9px] font-bold uppercase tracking-widest">Share</span><b class="text-slate-800 text-base">${ui.formatNumber(mktShare, 2)}%</b></td>
                    </tr>
                    <tr class="bg-white text-slate-400 border-b border-slate-100 text-[11px] uppercase tracking-wider">
                        <th class="p-3 text-left font-bold">Producto</th>
                        <th class="p-3 text-right font-bold">Rx Total</th>
                        <th class="p-3 text-right font-bold">Rx Lab</th>
                        <th class="p-3 text-center font-bold">Tipo</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-slate-100">
                    ${rows.sort((a, b) => b.rx - a.rx).map(r => {
                        const isMyProd = d.isPhq(r.prod);
                        const rowClass = isMyProd ? 'bg-blue-50/40' : '';
                        const rxLabVal = isMyProd ? `<span class="font-bold text-blue-600 font-mono">${ui.formatNumber(r.rx)}</span>` : '<span class="text-slate-300">-</span>';
                        const typeBadge = isMyProd ? '<span class="text-[9px] bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full font-bold">PHQ</span>' : '<span class="text-[9px] text-slate-400">Comp</span>';
                        return `
                            <tr class="${rowClass} hover:bg-slate-50 transition">
                                <td class="p-3 text-slate-700 font-medium truncate" title="${r.prod}">${r.prod}</td>
                                <td class="p-3 text-right font-mono text-slate-600">${ui.formatNumber(r.rx)}</td>
                                <td class="p-3 text-right font-mono">${rxLabVal}</td>
                                <td class="p-3 text-center">${typeBadge}</td>
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
        `;
        content.appendChild(mktDiv);
    }

    document.getElementById('doctorDetailModal').classList.remove('hidden');
};

/* ============================================================
   ALIAS GLOBALES (compatibilidad con onclick del HTML)
============================================================ */
window.showMarketDetails = window.App.modals.showMarketDetails;
window.openDoctorModal   = window.App.modals.openDoctorModal;

console.log('[SegmentApp] modals.js cargado.');

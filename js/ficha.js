/* ============================================================
   SegmentApp - Ficha del médico
   Archivo: js/ficha.js
   Todo lo importante de un médico en un solo lugar:
   - Encabezado: nombre, cuadrante, matrícula, cédula, especialidad
   - Indicadores: recetas, La Santé, participación (con tendencia), oportunidad
   - Pestañas: Resumen · Mercados · Productos · Historial · Datos del fichero
   - Descargar la ficha en PDF
   Reemplaza la ventana anterior del detalle del médico.
============================================================ */

window.App = window.App || {};
window.App.ficha = { doc: null, pestana: 'resumen', historial: null };

const escF = (v) => window.App.ui.escapeHtml(v);
const fmtF = (n, d = 0) => window.App.ui.formatNumber(n || 0, d);
const nomF = (n) => window.App.ui.nombreVisible(n);
const SIGNO_F = { A: '+', B: '', C: '-' };
const ESTRATEGIA = { C: 'Conquistar', B: 'Desarrollar', A: 'Defender' };

// Primer valor no vacío de una fila del fichero, buscando por nombre de columna
function campo(fila, ...nombres) {
    if (!fila) return '';
    const claves = Object.keys(fila);
    for (const n of nombres) {
        const k = claves.find(c => c.trim().toLowerCase() === n.toLowerCase());
        const v = k ? String(fila[k] || '').trim() : '';
        if (v && v !== '0') return v;
    }
    return '';
}
function cedulaDe(fila) {
    const directa = campo(fila, 'IDENT01');
    if (directa) return directa;
    const m = campo(fila, 'Identificación').match(/CI:\s*([0-9.]+)/i);
    return m ? m[1] : '';
}
const etiquetaDeCuadrante = (pot, loy) => pot + (SIGNO_F[loy] || '');
const estrategiaDe = (pot, loy) => (pot === 'C' && loy === 'C') ? 'Revisar' : ESTRATEGIA[loy] || '';

/* ---------- Cálculos de la ficha (sobre sus filas de recetas) ---------- */
function resumenRecetas(doc) {
    const d = window.App.data;
    const porMercado = {}, porProducto = {};
    (doc.rows || []).forEach(r => {
        const m = porMercado[r.market] || (porMercado[r.market] = { mercado: r.market, total: 0, phq: 0 });
        m.total += r.rx; if (d.isPhq(r.prod)) m.phq += r.rx;
        const p = porProducto[r.prod] || (porProducto[r.prod] = { producto: r.prod, rx: 0, phq: d.isPhq(r.prod), molecula: r.molecule, lab: r.lab, mercado: r.market });
        p.rx += r.rx;
    });
    const mercados = Object.values(porMercado).sort((a, b) => b.total - a.total);
    const productos = Object.values(porProducto).sort((a, b) => b.rx - a.rx);
    return {
        mercados, productos,
        favorito: mercados[0] || null,
        topProducto: productos[0] || null,
        topPhq: productos.find(p => p.phq) || null,
        topCompetidor: productos.find(p => !p.phq) || null
    };
}

function lugares(doc) {
    const vistos = new Set(), lista = [];
    (doc.ficheroData || []).forEach(f => {
        const nombre = campo(f, 'Nombre de Fantasía', 'Razón Social', 'LOCAL_TRABAJO');
        const dir = [campo(f, 'Dirección'), campo(f, 'Número'), campo(f, 'Complemento')].filter(Boolean).join(' ');
        const zona = [campo(f, 'MunicipioDescripcion'), campo(f, 'EstadoDescripcion')].filter(Boolean).join(', ');
        const k = (nombre + dir).toUpperCase();
        if ((nombre || dir) && !vistos.has(k)) { vistos.add(k); lista.push({ nombre, dir, zona, origen: 'Fichero' }); }
    });
    (doc.rows || []).forEach(r => {
        const k = String(r.address || '').toUpperCase();
        if (r.address && !vistos.has(k) && ![...vistos].some(v => v.includes(k))) {
            vistos.add(k); lista.push({ nombre: '', dir: r.address, zona: [r.city, r.region].filter(Boolean).join(', '), origen: 'CloseUp' });
        }
    });
    return lista;
}

function evaluacionesDe(doc) {
    const st = window.App.state;
    if (st.currentUserRole === 'visitador') return Object.values(st.EVALUACIONES_VISITADOR[window.App.data.normalizeKey(doc.id)] || {});
    return window.getEvaluationsForDoc ? window.getEvaluationsForDoc(doc.id) : [];
}

/* ============================================================
   ABRIR / CERRAR
============================================================ */
window.App.ficha.abrir = function(docId) {
    const st = window.App.state;
    const d = window.App.data;
    const doc = (st.PROCESSED_DATA || []).find(x => x.id === docId) || (st.PROCESSED_DATA || []).find(x => d.normalizeKey(x.id) === d.normalizeKey(docId));
    if (!doc) return;
    window.App.ficha.doc = doc;
    window.App.ficha.historial = null;
    window.App.ficha.pestana = 'resumen';
    window.App.ficha.renderEncabezado();
    window.App.ficha.mostrar('resumen');
    const m = document.getElementById('fichaMedico');
    m.classList.remove('hidden');
    m.querySelector('.ficha-cuerpo').scrollTop = 0;
};
window.App.ficha.cerrar = function() {
    document.getElementById('fichaMedico')?.classList.add('hidden');
};
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') window.App.ficha.cerrar(); });

/* ============================================================
   ENCABEZADO E INDICADORES
============================================================ */
window.App.ficha.renderEncabezado = function() {
    const st = window.App.state;
    const doc = window.App.ficha.doc;
    const f0 = (doc.ficheroData || [])[0];
    const pot = doc.closeupPotency, loy = doc.closeupLoyalty;
    const tieneCuadrante = !doc.isZeroRx && pot && loy;
    const cuadrante = tieneCuadrante ? `
        <div class="cell-${pot}_${loy} rounded-3xl px-4 py-3 text-center shrink-0 min-w-[96px]">
            <div class="text-4xl font-display font-extrabold leading-none">${etiquetaDeCuadrante(pot, loy)}</div>
            <div class="text-[11px] font-bold uppercase tracking-wider mt-1 opacity-80">${estrategiaDe(pot, loy)}</div>
            ${doc.antes && doc.antes !== doc.closeupLabel ? `<div class="text-[10px] font-semibold mt-1">${doc.movimiento === 'mejor' ? '▲' : '▼'} antes ${escF(doc.antes)}</div>` : ''}
        </div>` : `<div class="bg-slate-100 text-slate-600 rounded-3xl px-4 py-3 text-center shrink-0"><div class="text-sm font-bold">Sin recetas</div><div class="text-[11px]">en CloseUp</div></div>`;
    const visitadores = [...new Set((doc.ficheroData || []).map(f => campo(f, 'Nombre del sector')).filter(Boolean))];
    const chips = [
        ['badge', 'Matrícula ' + window.App.data.normalizeKey(doc.id)],
        cedulaDe(f0) && ['id_card', 'C.I. ' + cedulaDe(f0)],
        (campo(f0, 'ESPEC1_FICHERO_DESC') || doc.spec) && ['stethoscope', campo(f0, 'ESPEC1_FICHERO_DESC') || doc.spec],
        visitadores.length && ['person', visitadores.join(', ')]
    ].filter(Boolean);
    document.getElementById('fichaEncabezado').innerHTML = `
        <div class="flex items-start gap-4">
            <div class="flex-1 min-w-0">
                <div class="text-[11px] font-bold text-blue-700 uppercase tracking-widest">Ficha del médico</div>
                <h2 class="text-2xl sm:text-3xl font-display font-bold text-slate-800 leading-tight mt-1">${escF(nomF(doc.name))}</h2>
            </div>
            ${cuadrante}
        </div>
        <div class="flex flex-wrap gap-1.5 sm:gap-2 mt-3">${chips.map(([i, t]) => `<span class="chip !h-auto min-h-[30px] py-1 !px-2.5 !text-xs !whitespace-normal"><span class="material-symbols-outlined text-[16px]">${i}</span>${escF(t)}</span>`).join('')}</div>`;
    const tendencia = doc.deltaShare == null || Math.abs(doc.deltaShare) < 0.05 ? ''
        : `<span class="tendencia ${doc.deltaShare > 0 ? 'sube' : 'baja'}">${doc.deltaShare > 0 ? '▲' : '▼'} ${fmtF(Math.abs(doc.deltaShare), 1)} pts</span>`;
    const kpi = (titulo, valor, extra, clase = '') => `<div class="rounded-2xl p-3 ${clase || 'bg-slate-50'}"><div class="text-[11px] font-semibold opacity-80">${titulo}</div><div class="text-xl font-display font-extrabold mt-0.5">${valor}</div><div class="text-[11px] mt-0.5 min-h-[16px]">${extra || ''}</div></div>`;
    document.getElementById('fichaIndicadores').innerHTML = doc.isZeroRx
        ? `<p class="text-sm text-slate-600 bg-slate-50 rounded-2xl p-3">Este médico está en el fichero pero no tiene recetas en CloseUp para los filtros actuales.</p>`
        : [
            kpi('Recetas del mercado', fmtF(doc.totalRx), '', 'bg-slate-50 text-slate-800'),
            kpi('Recetas La Santé', fmtF(doc.rxPhq), '', 'bg-blue-50 text-blue-900'),
            kpi('Participación', fmtF(doc.share, 1) + '%', tendencia, 'bg-green-50 text-green-900'),
            kpi('Oportunidad', doc.gap > 0 ? '+' + fmtF(doc.gap) + ' Rx' : 'En meta', doc.gap > 0 ? escF(doc.targetLabel) : '', doc.gap > 0 ? 'bg-rose-50 text-rose-900' : 'bg-green-50 text-green-900')
        ].join('');
    const esVm = st.currentUserRole === 'visitador';
    const evaluar = document.getElementById('fichaEvaluar');
    evaluar.classList.toggle('hidden', !esVm);
    evaluar.dataset.id = doc.id; evaluar.dataset.nombre = doc.name;
};

/* ============================================================
   PESTAÑAS
============================================================ */
window.App.ficha.mostrar = function(pestana) {
    window.App.ficha.pestana = pestana;
    document.querySelectorAll('#fichaPestanas [data-pestana]').forEach(b => {
        const activa = b.dataset.pestana === pestana;
        b.setAttribute('aria-selected', String(activa));
        // En el teléfono las pestañas se desplazan: la elegida queda a la vista
        if (activa && b.parentElement) b.parentElement.scrollLeft = Math.max(0, b.offsetLeft - (b.parentElement.clientWidth - b.offsetWidth) / 2);
    });
    const zona = document.getElementById('fichaContenido');
    const doc = window.App.ficha.doc;
    const r = resumenRecetas(doc);
    const render = { resumen: renderResumen, mercados: renderMercados, productos: renderProductos, historial: renderHistorial, datos: renderDatos }[pestana];
    zona.innerHTML = render(doc, r);
    zona.classList.remove('animate-fade-in'); void zona.offsetWidth; zona.classList.add('animate-fade-in');
    if (pestana === 'historial') window.App.ficha.cargarHistorial();
};

function tarjetaDato(icono, titulo, principal, detalle, clase = 'bg-slate-50') {
    return `<div class="rounded-2xl p-4 ${clase}">
        <div class="text-xs font-semibold text-slate-600 flex items-center gap-1.5"><span class="material-symbols-outlined text-[18px]">${icono}</span>${titulo}</div>
        <div class="text-base font-bold text-slate-800 mt-1 break-words">${principal}</div>
        <div class="text-xs text-slate-500 mt-0.5">${detalle || ''}</div></div>`;
}

function renderResumen(doc, r) {
    const pct = (n) => doc.totalRx ? fmtF(n / doc.totalRx * 100, 1) + '%' : '';
    const dona = doc.isZeroRx ? '' : `
        <div class="flex items-center gap-4 rounded-2xl bg-slate-50 p-4">
            <div class="dona-caja"><div class="dona" style="--p:${Math.min(100, doc.share).toFixed(1)}"></div><span>${fmtF(doc.share, 1)}%</span></div>
            <div class="text-sm text-slate-700"><div class="font-bold text-slate-800">Participación de La Santé</div>
            <div class="text-xs text-slate-500 mt-1">${fmtF(doc.rxPhq)} de ${fmtF(doc.totalRx)} recetas en los mercados elegidos.</div></div>
        </div>`;
    const destacados = doc.isZeroRx ? '' : `<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        ${r.topProducto ? tarjetaDato('star', 'Producto más recetado', escF(r.topProducto.producto), `${fmtF(r.topProducto.rx)} recetas · ${pct(r.topProducto.rx)}${r.topProducto.phq ? ' · La Santé' : ''}`) : ''}
        ${r.favorito ? tarjetaDato('favorite', 'Mercado favorito', escF(r.favorito.mercado), `${fmtF(r.favorito.total)} recetas · ${pct(r.favorito.total)}`) : ''}
        ${r.topPhq ? tarjetaDato('pill', 'Producto La Santé más recetado', escF(r.topPhq.producto), `${fmtF(r.topPhq.rx)} recetas`, 'bg-blue-50') : tarjetaDato('pill', 'Productos La Santé', 'Todavía ninguno', 'Es una oportunidad para presentar el portafolio', 'bg-blue-50')}
        ${r.topCompetidor ? tarjetaDato('swords', 'Principal competidor', escF(r.topCompetidor.producto), `${fmtF(r.topCompetidor.rx)} recetas · ${escF(r.topCompetidor.lab || '')}`, 'bg-rose-50') : ''}
    </div>`;
    const ls = lugares(doc);
    const dondeTrabaja = `<section><h3 class="text-sm font-bold text-slate-800 mb-2 flex items-center gap-2"><span class="material-symbols-outlined text-[18px] text-blue-700">location_on</span> Dónde atiende ${ls.length > 1 ? `<span class="text-xs font-medium text-slate-500">(${ls.length} lugares)</span>` : ''}</h3>
        ${ls.length ? `<ul class="space-y-2">${ls.map(l => `<li class="flex gap-3 items-start rounded-2xl border border-slate-200 p-3">
            <span class="material-symbols-outlined text-slate-500 mt-0.5">${l.nombre ? 'local_hospital' : 'home_pin'}</span>
            <div class="min-w-0"><div class="text-sm font-semibold text-slate-800">${escF(l.nombre || l.dir)}</div>
            <div class="text-xs text-slate-500">${escF([l.nombre ? l.dir : '', l.zona].filter(Boolean).join(' · '))}</div></div>
            <span class="ml-auto text-[10px] font-semibold text-slate-500 shrink-0">${l.origen}</span></li>`).join('')}</ul>`
            : '<p class="text-sm text-slate-500">Sin dirección registrada.</p>'}</section>`;
    return `<div class="space-y-5">${dona}${destacados}${dondeTrabaja}</div>`;
}

function renderMercados(doc, r) {
    const st = window.App.state;
    if (!r.mercados.length) return '<p class="text-sm text-slate-500">Sin recetas en los mercados elegidos.</p>';
    const evals = evaluacionesDe(doc);
    return `<p class="text-xs text-slate-500 mb-3">Clasificación nacional del médico en cada mercado y tu evaluación, si la hay.</p>
        <ul class="space-y-2">${r.mercados.map(m => {
            const etiqueta = window.App.matrix.getDoctorMarketClassification(doc.id, m.mercado);
            const ev = evals.find(e => e.mercado === m.mercado);
            const share = m.total ? m.phq / m.total * 100 : 0;
            return `<li class="flex items-center gap-3 rounded-2xl border border-slate-200 p-3">
                <span class="eval-cuadrante ${window.App.ux.claseDeEtiqueta(etiqueta)} !h-10 !min-w-[44px] !rounded-xl text-sm">${escF(etiqueta || '—')}</span>
                <div class="flex-1 min-w-0"><div class="text-sm font-semibold text-slate-800 truncate">${escF(m.mercado)}</div>
                <div class="text-xs text-slate-500">${fmtF(m.total)} recetas · ${fmtF(m.phq)} La Santé · ${fmtF(share, 1)}%</div></div>
                ${ev ? `<span class="text-[11px] font-semibold text-green-800 bg-green-50 rounded-full px-2 py-1 flex items-center gap-1 shrink-0"><span class="material-symbols-outlined text-[14px]">check_circle</span>Evaluado ${escF(ev.cuadrante)}</span>`
                     : (st.currentUserRole === 'visitador' ? '<span class="text-[11px] text-slate-500 shrink-0">Sin evaluar</span>' : '')}
            </li>`;
        }).join('')}</ul>`;
}

function renderProductos(doc, r) {
    if (!r.productos.length) return '<p class="text-sm text-slate-500">Sin recetas en los mercados elegidos.</p>';
    const max = r.productos[0].rx || 1;
    return `<div class="flex gap-3 text-xs text-slate-600 mb-3"><span class="flex items-center gap-1"><span class="w-3 h-3 rounded bg-blue-600"></span>La Santé</span><span class="flex items-center gap-1"><span class="w-3 h-3 rounded bg-slate-400"></span>Competencia</span></div>
        <ul class="space-y-3">${r.productos.slice(0, 12).map(p => `<li>
            <div class="flex items-baseline justify-between gap-3 text-sm"><span class="font-semibold text-slate-800 truncate">${escF(p.producto)}</span><span class="font-mono font-bold ${p.phq ? 'text-blue-700' : 'text-slate-700'} shrink-0">${fmtF(p.rx)}</span></div>
            <div class="h-2 rounded-full bg-slate-100 mt-1 overflow-hidden"><div class="h-full rounded-full ${p.phq ? 'bg-blue-600' : 'bg-slate-400'}" style="width:${(p.rx / max * 100).toFixed(1)}%"></div></div>
            <div class="text-[11px] text-slate-500 mt-0.5">${escF([p.molecula, p.lab, p.mercado].filter(Boolean).join(' · '))}</div>
        </li>`).join('')}</ul>
        ${r.productos.length > 12 ? `<p class="text-xs text-slate-500 mt-3">Y ${r.productos.length - 12} productos más con menos recetas.</p>` : ''}`;
}

function renderHistorial(doc) {
    const evals = evaluacionesDe(doc);
    return `<div class="space-y-6">
        <section><h3 class="text-sm font-bold text-slate-800 mb-2 flex items-center gap-2"><span class="material-symbols-outlined text-[18px] text-blue-700">bar_chart</span> Recetas por versión de datos</h3>
            <div id="fichaHistRecetas" class="text-sm text-slate-500">Cargando…</div></section>
        <section><h3 class="text-sm font-bold text-slate-800 mb-2 flex items-center gap-2"><span class="material-symbols-outlined text-[18px] text-blue-700">timeline</span> Clasificación por mercado en el tiempo</h3>
            <div id="fichaHistClasif" class="text-sm text-slate-500">Cargando…</div></section>
        <section><h3 class="text-sm font-bold text-slate-800 mb-2 flex items-center gap-2"><span class="material-symbols-outlined text-[18px] text-blue-700">fact_check</span> Evaluaciones</h3>
            ${evals.length ? `<ul class="space-y-2">${evals.map(e => `<li class="rounded-2xl border border-slate-200 p-3">
                <div class="flex items-center gap-2"><span class="eval-cuadrante ${window.App.ux.claseDeEtiqueta(e.cuadrante)}">${escF(e.cuadrante)}</span>
                <span class="text-sm font-semibold text-slate-800 truncate">${escF(e.mercado || 'General')}</span>
                <span class="ml-auto text-xs text-slate-500">${e.timestamp ? new Date(e.timestamp).toLocaleDateString('es-VE', { day: '2-digit', month: 'short', year: 'numeric' }) : ''}</span></div>
                ${e.notas ? `<p class="text-xs text-slate-600 mt-1">“${e.notas}”</p>` : ''}
                ${e.id ? `<button class="text-xs font-bold text-blue-700 mt-1 px-2 py-1 rounded-full" onclick="App.ficha.verCambios(this, '${escF(e.id)}')">Ver cambios anteriores</button><div class="hidden"></div>` : ''}
            </li>`).join('')}</ul>` : '<p class="text-sm text-slate-500">Todavía no tiene evaluaciones.</p>'}</section>
    </div>`;
}

window.App.ficha.cargarHistorial = async function() {
    const st = window.App.state;
    const doc = window.App.ficha.doc;
    const zr = () => document.getElementById('fichaHistRecetas'), zc = () => document.getElementById('fichaHistClasif');
    try {
        if (!window.App.ficha.historial) window.App.ficha.historial = await window.App.sb.historialMedico(window.App.data.normalizeKey(doc.id));
        if (window.App.ficha.doc !== doc || window.App.ficha.pestana !== 'historial') return;
        const h = window.App.ficha.historial || [];
        if (!h.length) { zr().innerHTML = zc().innerHTML = '<p class="text-sm text-slate-500">Sin datos de versiones para este médico.</p>'; return; }
        const max = Math.max(...h.map(v => Number(v.total))) || 1;
        zr().innerHTML = `<div class="flex items-end gap-3 h-40 border-b border-slate-200 pb-1 overflow-x-auto">${h.map(v => `
            <div class="flex flex-col items-center gap-1 min-w-[56px] h-full justify-end" title="${escF(v.nombre)}: ${fmtF(v.total)} recetas, ${fmtF(v.phq)} La Santé">
                <span class="text-[11px] font-bold text-slate-700">${fmtF(v.total)}</span>
                <div class="w-9 rounded-t-lg bg-slate-300 relative" style="height:${Math.max(4, Number(v.total) / max * 100)}%">
                    <div class="absolute bottom-0 inset-x-0 rounded-t-lg bg-blue-600" style="height:${Number(v.total) ? Number(v.phq) / Number(v.total) * 100 : 0}%"></div>
                </div></div>`).join('')}</div>
            <div class="flex gap-3 overflow-x-auto mt-1">${h.map(v => `<div class="min-w-[56px] text-center text-[10px] text-slate-500 leading-tight">${escF(v.nombre)}</div>`).join('')}</div>
            ${h.length === 1 ? '<p class="text-xs text-slate-500 mt-2">Hay una sola versión de datos. Cuando se publiquen más meses verás aquí cómo evolucionan sus recetas.</p>' : ''}`;
        // Clasificación nacional por mercado en cada versión (mismos umbrales que la app)
        const etiqueta = (total, phq, acum, totMk) => {
            const pct = totMk > 0 ? acum / totMk * 100 : 100;
            const p = pct <= st.TH_POT_LOW ? 'A' : (pct <= st.TH_POT_HIGH ? 'B' : 'C');
            const share = total > 0 ? phq / total * 100 : 0;
            const l = share >= st.TH_LOY_HIGH ? 'A' : (share > st.TH_LOY_LOW ? 'B' : 'C');
            return etiquetaDeCuadrante(p, l);
        };
        const mercados = [...new Set(h.flatMap(v => v.mercados.map(m => m[0])))];
        zc().innerHTML = mercados.length ? `<div class="overflow-x-auto"><table class="text-xs w-full"><thead><tr class="text-slate-500"><th class="text-left font-semibold py-1 pr-3">Mercado</th>${h.map(v => `<th class="font-semibold px-2">${escF(v.nombre)}</th>`).join('')}</tr></thead>
            <tbody class="divide-y divide-slate-100">${mercados.map(mk => `<tr><td class="py-2 pr-3 text-slate-700 font-medium">${escF(mk)}</td>${h.map(v => {
                const m = v.mercados.find(x => x[0] === mk);
                const e = m ? etiqueta(Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])) : '';
                return `<td class="px-2 text-center">${e ? `<span class="eval-cuadrante ${window.App.ux.claseDeEtiqueta(e)}">${e}</span>` : '<span class="text-slate-400">—</span>'}</td>`;
            }).join('')}</tr>`).join('')}</tbody></table></div>` : '<p class="text-sm text-slate-500">Sin clasificación por mercado.</p>';
    } catch (e) {
        console.error('[SegmentApp] Historial del médico:', e);
        if (zr()) zr().innerHTML = '<p class="text-sm text-rose-700">No se pudo leer el historial. Revisa tu conexión.</p>';
        if (zc()) zc().innerHTML = '';
    }
};

window.App.ficha.verCambios = async function(boton, id) {
    const zona = boton.nextElementSibling;
    if (!zona.classList.contains('hidden')) { zona.classList.add('hidden'); return; }
    zona.classList.remove('hidden');
    zona.innerHTML = '<p class="text-xs text-slate-500 mt-1">Cargando…</p>';
    try {
        const cambios = await window.App.sb.historialEvaluacion(id);
        zona.innerHTML = cambios.length ? `<ol class="mt-2 space-y-1">${cambios.map(c => `<li class="text-xs text-slate-600 flex items-center gap-2">
            <span class="eval-cuadrante ${window.App.ux.claseDeEtiqueta(c.evaluacion.cuadrante)}">${escF(c.evaluacion.cuadrante)}</span>
            ${new Date(c.evaluacion.timestamp || c.hecho_en).toLocaleDateString('es-VE', { day: '2-digit', month: 'short', year: 'numeric' })}</li>`).join('')}</ol>`
            : '<p class="text-xs text-slate-500 mt-1">Sin cambios anteriores.</p>';
    } catch (e) {
        zona.innerHTML = '<p class="text-xs text-rose-700 mt-1">No se pudo leer.</p>';
    }
};

function renderDatos(doc) {
    const filas = doc.ficheroData || [];
    if (!filas.length) return '<p class="text-sm text-slate-500">Este médico no está en el fichero.</p>';
    const linea = (icono, titulo, valor) => valor ? `<div class="flex gap-3 py-2"><span class="material-symbols-outlined text-[20px] text-slate-500">${icono}</span><div class="min-w-0"><div class="text-[11px] text-slate-500">${titulo}</div><div class="text-sm font-medium text-slate-800 break-words">${escF(valor)}</div></div></div>` : '';
    return filas.map((f, i) => `<section class="rounded-3xl border border-slate-200 p-4 ${i ? 'mt-3' : ''}">
        <div class="flex items-center justify-between gap-2 mb-1"><h3 class="text-sm font-bold text-slate-800">${escF(campo(f, 'Nombre de Fantasía', 'Razón Social', 'LOCAL_TRABAJO') || 'Registro del fichero')}</h3>
            <span class="text-[11px] font-semibold ${/activo/i.test(campo(f, 'ATIVO')) ? 'text-green-800 bg-green-50' : 'text-slate-600 bg-slate-100'} rounded-full px-2 py-0.5">${escF(campo(f, 'ATIVO') || '')}</span></div>
        <div class="grid sm:grid-cols-2 gap-x-6 divide-y sm:divide-y-0 divide-slate-100">
            ${linea('id_card', 'Cédula', cedulaDe(f))}
            ${linea('badge', 'Matrícula', campo(f, 'Matricula'))}
            ${linea('stethoscope', 'Especialidad', [campo(f, 'ESPEC1_FICHERO_DESC'), campo(f, 'ESPEC2_FICHERO_DESC')].filter(Boolean).join(' · '))}
            ${linea('wc', 'Sexo', ({ M: 'Masculino', F: 'Femenino' })[campo(f, 'Sexo')] || campo(f, 'Sexo'))}
            ${linea('mail', 'Correo', campo(f, 'E-mail'))}
            ${linea('call', 'Teléfono', [campo(f, 'Celular'), campo(f, 'Teléfono'), campo(f, 'Teléfono 2')].filter(Boolean).join(' · '))}
            ${linea('location_on', 'Dirección', [campo(f, 'Dirección'), campo(f, 'MunicipioDescripcion'), campo(f, 'EstadoDescripcion')].filter(Boolean).join(', '))}
            ${linea('map', 'Brick', campo(f, 'UTC/Brickdescripcion'))}
            ${linea('person', 'Visitador', campo(f, 'Nombre del sector'))}
            ${linea('supervisor_account', 'Gerente de distrito', campo(f, 'NOME_GER_DIS'))}
            ${linea('event_repeat', 'Frecuencia de visita', campo(f, 'Frecuencia'))}
            ${linea('schedule', 'Días sin visita', campo(f, 'Días sin visita'))}
            ${linea('update', 'Actualizado en el fichero', campo(f, 'FECHA_ACTUALIZACIÓN'))}
        </div>
        <details class="mt-2"><summary class="text-xs font-bold text-blue-700 cursor-pointer px-2 py-1 rounded-full inline-block">Ver todos los campos del fichero</summary>
            <dl class="grid sm:grid-cols-2 gap-x-6 gap-y-1 mt-2 text-xs">${Object.entries(f).filter(([, v]) => String(v || '').trim() && String(v).trim() !== '0')
                .map(([k, v]) => `<div class="flex gap-2 border-b border-slate-100 py-1"><dt class="text-slate-500 shrink-0">${escF(k)}</dt><dd class="text-slate-800 font-medium break-words">${escF(v)}</dd></div>`).join('')}</dl>
        </details>
    </section>`).join('');
}

/* ============================================================
   FICHA EN PDF
============================================================ */
window.App.ficha.pdf = async function() {
    const ui = window.App.ui;
    const doc = window.App.ficha.doc;
    if (!doc) return;
    ui.showToast('Generando la ficha en PDF...');
    try {
        await window.App.data.loadLibrary('jspdf');
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
        const r = resumenRecetas(doc);
        const f0 = (doc.ficheroData || [])[0];
        let y = 18;
        const linea = (texto, tam = 10, estilo = 'normal', color = [25, 28, 32]) => {
            pdf.setFont('helvetica', estilo); pdf.setFontSize(tam); pdf.setTextColor(...color);
            pdf.splitTextToSize(String(texto), 180).forEach(t => { if (y > 280) { pdf.addPage(); y = 18; } pdf.text(t, 15, y); y += tam * 0.45; });
        };
        const titulo = (t) => { y += 3; linea(t, 12, 'bold', [11, 87, 208]); y += 1; };
        pdf.setFillColor(11, 87, 208); pdf.rect(0, 0, 210, 6, 'F');
        linea('Ficha del médico · SegmentApp · La Santé', 9, 'normal', [93, 96, 104]);
        linea(nomF(doc.name), 18, 'bold');
        linea([`Matrícula ${window.App.data.normalizeKey(doc.id)}`, cedulaDe(f0) && `C.I. ${cedulaDe(f0)}`, campo(f0, 'ESPEC1_FICHERO_DESC') || doc.spec].filter(Boolean).join('   ·   '), 10, 'normal', [68, 71, 78]);
        if (!doc.isZeroRx) {
            linea(`Cuadrante ${doc.closeupLabel} (${estrategiaDe(doc.closeupPotency, doc.closeupLoyalty)})${doc.antes && doc.antes !== doc.closeupLabel ? ` · antes ${doc.antes}` : ''}`, 12, 'bold');
            titulo('Indicadores');
            linea(`Recetas del mercado: ${fmtF(doc.totalRx)}   ·   Recetas La Santé: ${fmtF(doc.rxPhq)}   ·   Participación: ${fmtF(doc.share, 1)}%   ·   Oportunidad: ${doc.gap > 0 ? '+' + fmtF(doc.gap) + ' Rx ' + doc.targetLabel : 'en meta'}`);
            titulo('Lo más destacado');
            if (r.topProducto) linea(`Producto más recetado: ${r.topProducto.producto} (${fmtF(r.topProducto.rx)} recetas)`);
            if (r.favorito) linea(`Mercado favorito: ${r.favorito.mercado} (${fmtF(r.favorito.total)} recetas)`);
            if (r.topPhq) linea(`Producto La Santé más recetado: ${r.topPhq.producto} (${fmtF(r.topPhq.rx)})`);
            if (r.topCompetidor) linea(`Principal competidor: ${r.topCompetidor.producto} (${fmtF(r.topCompetidor.rx)})`);
            titulo('Mercados');
            r.mercados.forEach(m => linea(`${window.App.matrix.getDoctorMarketClassification(doc.id, m.mercado) || '—'}   ${m.mercado}: ${fmtF(m.total)} recetas, ${fmtF(m.phq)} La Santé (${fmtF(m.total ? m.phq / m.total * 100 : 0, 1)}%)`));
            titulo('Productos más recetados');
            r.productos.slice(0, 10).forEach(p => linea(`${p.producto}${p.phq ? ' (La Santé)' : ''}: ${fmtF(p.rx)} recetas`));
        }
        const evals = evaluacionesDe(doc);
        if (evals.length) {
            titulo('Evaluaciones');
            evals.forEach(e => linea(`${e.cuadrante}   ${e.mercado || 'General'}${e.timestamp ? ' · ' + new Date(e.timestamp).toLocaleDateString('es-VE') : ''}${e.notas ? ' · ' + String(e.notas).replace(/&lt;/g, '<').replace(/&gt;/g, '>') : ''}`));
        }
        const ls = lugares(doc);
        if (ls.length) { titulo('Dónde atiende'); ls.forEach(l => linea([l.nombre, l.dir, l.zona].filter(Boolean).join(' · '))); }
        y = Math.max(y + 6, 285);
        pdf.setFontSize(8); pdf.setTextColor(115, 119, 127);
        pdf.text(`Generado el ${new Date().toLocaleDateString('es-VE')} con SegmentApp`, 15, 290);
        pdf.save(`Ficha_${nomF(doc.name).replace(/[^A-Za-z0-9ÑñÁÉÍÓÚáéíóú]+/g, '_')}.pdf`);
        ui.showToast('Ficha descargada.');
    } catch (e) {
        console.error('[SegmentApp] PDF de la ficha:', e);
        ui.showToast('No se pudo generar el PDF.');
    }
};

// La ficha reemplaza a la ventana anterior del detalle del médico
window.App.modals.openDoctorModal = window.App.ficha.abrir;
window.openDoctorModal = window.App.ficha.abrir;

console.log('[SegmentApp] ficha.js cargado.');

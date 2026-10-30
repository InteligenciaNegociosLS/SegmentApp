/* ============================================================
   SegmentApp - Pantalla "Ajustes" (solo administrador, Fase 9A)
   Archivo: js/ajustes.js
   - Umbrales de la matriz: al mover un control solo cambian las
     etiquetas y la vista previa ("N médicos cambiarían de cuadrante").
     La matriz se recalcula y se guarda para todos al tocar "Aplicar".
     (Antes se recalculaba todo en cada milímetro del control: tirones.)
   - Ponderación de la encuesta: en la misma pantalla, con un ejemplo
     de puntaje que se actualiza al cambiar los puntos.
   - Accesos a carga de datos, versiones, productos, usuarios,
     registro de fallas y reportes.
============================================================ */

window.App = window.App || {};
window.App.ajustes = {};

const escA = (v) => window.App.ui.escapeHtml(v);
const fmtA = (n, d = 0) => window.App.ui.formatNumber(n || 0, d);
const CONTROLES = { TH_LOY_LOW: 'sliderLow', TH_LOY_HIGH: 'sliderHigh', TH_POT_LOW: 'sliderPotLow', TH_POT_HIGH: 'sliderPotHigh' };
const CELDAS = ['A_A', 'A_B', 'A_C', 'B_A', 'B_B', 'B_C', 'C_A', 'C_B', 'C_C'];
const SIGNO_AJ = { A: '+', B: '', C: '-' };

window.App.ajustes.irA = function(id) {
    const el = document.getElementById(id);
    if (el && el.scrollIntoView) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

// Se llama cada vez que se muestra la pantalla
window.App.ajustes.render = function() {
    window.App.ajustes.descartarUmbrales();
    window.App.ajustes.renderEncuesta();
};

/* ============================================================
   UMBRALES
============================================================ */
const leerControles = () => Object.fromEntries(Object.entries(CONTROLES).map(([k, id]) => [k, parseInt(document.getElementById(id).value, 10)]));
const guardados = () => { const st = window.App.state; return { TH_LOY_LOW: st.TH_LOY_LOW, TH_LOY_HIGH: st.TH_LOY_HIGH, TH_POT_LOW: st.TH_POT_LOW, TH_POT_HIGH: st.TH_POT_HIGH }; };

function pintarEtiquetas(u) {
    const ui = window.App.ui;
    ui.safeSetText('lblThLow', u.TH_LOY_LOW + '%');
    ui.safeSetText('lblThHigh', u.TH_LOY_HIGH + '%');
    ui.safeSetText('lblPotLow', u.TH_POT_LOW + '%');
    ui.safeSetText('lblPotHigh', u.TH_POT_HIGH + '%');
    const ancho = (id, v) => { const el = document.getElementById(id); if (el) el.style.width = v + '%'; };
    ancho('segLoyC', u.TH_LOY_LOW); ancho('segLoyB', u.TH_LOY_HIGH - u.TH_LOY_LOW); ancho('segLoyA', 100 - u.TH_LOY_HIGH);
    ancho('segPotA', u.TH_POT_LOW); ancho('segPotB', u.TH_POT_HIGH - u.TH_POT_LOW); ancho('segPotC', 100 - u.TH_POT_HIGH);
}

const iguales = (a, b) => Object.keys(CONTROLES).every(k => a[k] === b[k]);
let esperaVistaPrevia = null;

window.App.ajustes.alMoverUmbral = function() {
    const u = leerControles();
    pintarEtiquetas(u);
    const cambio = !iguales(u, guardados());
    document.getElementById('btnAplicarUmbrales').disabled = !cambio;
    document.getElementById('btnDescartarUmbrales').disabled = !cambio;
    // La vista previa se calcula cuando la persona deja de mover el control
    clearTimeout(esperaVistaPrevia);
    esperaVistaPrevia = setTimeout(() => window.App.ajustes.vistaPrevia(u), 250);
};

// Clasifica a los médicos con umbrales de prueba, sin cambiar nada de lo que se ve
window.App.ajustes.simular = function(u) {
    const st = window.App.state;
    const antes = guardados();
    Object.assign(st, u);
    try {
        return window.App.matrix.calcularMedicos(st.RAW_DATA, true).doctors;
    } finally {
        Object.assign(st, antes);
    }
};

const contarCeldas = (docs, clave) => {
    const c = Object.fromEntries(CELDAS.map(k => [k, 0]));
    docs.forEach(d => { if (!d.isZeroRx) c[clave(d)] = (c[clave(d)] || 0) + 1; });
    return c;
};

window.App.ajustes.vistaPrevia = function(u = leerControles()) {
    const st = window.App.state;
    const zona = document.getElementById('ajVistaPrevia');
    if (!zona) return;
    if (u.TH_LOY_LOW >= u.TH_LOY_HIGH || u.TH_POT_LOW >= u.TH_POT_HIGH) {
        zona.innerHTML = '<p class="text-sm text-rose-700">El valor "bajo" debe ser menor que el "alto".</p>';
        return;
    }
    const actuales = st.PROCESSED_DATA || [];
    if (!actuales.length) { zona.innerHTML = ''; return; }
    const sinCambio = iguales(u, guardados());
    const nuevos = sinCambio ? actuales : window.App.ajustes.simular(u);
    const antesPorId = new Map(actuales.map(d => [d.id, d.closeupLabel]));
    const puntaje = window.App.comparar ? window.App.comparar.puntaje : () => 0;
    let suben = 0, bajan = 0;
    nuevos.forEach(d => {
        if (d.isZeroRx) return;
        const a = antesPorId.get(d.id);
        if (!a || a === d.closeupLabel) return;
        if (puntaje(d.closeupLabel) > puntaje(a)) suben++; else bajan++;
    });
    const antes = contarCeldas(actuales, d => `${d.closeupPotency}_${d.closeupLoyalty}`);
    const despues = contarCeldas(nuevos, d => `${d.closeupPotency}_${d.closeupLoyalty}`);
    const celda = (k) => {
        const [p, l] = k.split('_');
        const dif = despues[k] - antes[k];
        return `<div class="cell-${p}_${l} rounded-xl px-2 py-1.5 text-center">
            <div class="text-xs font-display font-extrabold">${p}${SIGNO_AJ[l]}</div>
            <div class="text-sm font-bold">${fmtA(despues[k])}</div>
            <div class="text-[10px] font-semibold min-h-[14px]">${dif ? (dif > 0 ? '+' : '−') + fmtA(Math.abs(dif)) : ''}</div></div>`;
    };
    zona.innerHTML = `
        <div class="flex flex-col sm:flex-row gap-4 sm:items-center">
            <div class="flex-1">
                <div class="text-sm font-bold text-slate-800 flex items-center gap-2"><span class="material-symbols-outlined text-[20px] text-blue-700">preview</span> Vista previa</div>
                <p class="text-sm text-slate-600 mt-1">${sinCambio
                    ? 'Estos son los valores que usa hoy todo el equipo.'
                    : `Con estos valores, <b>${fmtA(suben + bajan)}</b> médicos cambiarían de cuadrante: <span class="tendencia sube">▲ ${fmtA(suben)} suben</span> · <span class="tendencia baja">▼ ${fmtA(bajan)} bajan</span>.`}</p>
                <p class="text-[11px] text-slate-500 mt-2">Con los filtros que tienes elegidos ahora. Todavía no se aplica a nadie.</p>
            </div>
            <div class="grid grid-cols-3 gap-1.5 w-full sm:w-[260px] shrink-0" aria-label="Médicos por cuadrante con estos valores">${CELDAS.map(celda).join('')}</div>
        </div>`;
};

window.App.ajustes.descartarUmbrales = function() {
    const g = guardados();
    Object.entries(CONTROLES).forEach(([k, id]) => { const el = document.getElementById(id); if (el) el.value = g[k]; });
    pintarEtiquetas(g);
    const a = document.getElementById('btnAplicarUmbrales'), d = document.getElementById('btnDescartarUmbrales');
    if (a) a.disabled = true;
    if (d) d.disabled = true;
    window.App.ajustes.vistaPrevia(g);
};

window.App.ajustes.aplicarUmbrales = async function() {
    const u = leerControles();
    if (u.TH_LOY_LOW >= u.TH_LOY_HIGH || u.TH_POT_LOW >= u.TH_POT_HIGH) return;
    window.App.matrix.updateThresholds();     // recalcula la matriz con los valores nuevos
    const ok = await window.App.admin.guardarConfig({ umbrales_matriz: guardados() }, 'Umbrales aplicados para todo el equipo.');
    if (!ok) return;
    document.getElementById('btnAplicarUmbrales').disabled = true;
    document.getElementById('btnDescartarUmbrales').disabled = true;
    window.App.ajustes.vistaPrevia(guardados());
};

/* ============================================================
   PONDERACIÓN DE LA ENCUESTA
============================================================ */
let borradorEncuesta = null;

window.App.ajustes.renderEncuesta = function() {
    const st = window.App.state;
    const cfg = window.App.config;
    const zona = document.getElementById('ajEncuestaCuerpo');
    if (!zona) return;
    borradorEncuesta = { pesos: JSON.parse(JSON.stringify(st.SURVEY_WEIGHTS)), umbrales: { ...st.SURVEY_THRESHOLDS } };
    const preguntas = Object.entries(cfg.SURVEY_QUESTION_LABELS).filter(([q]) => borradorEncuesta.pesos[q]);
    zona.innerHTML = `
        <div class="grid sm:grid-cols-2 gap-3 mb-4">
            <label class="rounded-2xl bg-slate-50 p-3 flex items-center justify-between gap-3"><span class="text-sm font-semibold text-slate-700">Puntaje mínimo para <b>A</b></span>
                <input type="number" inputmode="numeric" id="ajThA" value="${borradorEncuesta.umbrales.A}" class="w-20 h-10 rounded-xl border border-slate-300 text-center font-bold" oninput="App.ajustes.alCambiarEncuesta()"></label>
            <label class="rounded-2xl bg-slate-50 p-3 flex items-center justify-between gap-3"><span class="text-sm font-semibold text-slate-700">Puntaje mínimo para <b>B</b></span>
                <input type="number" inputmode="numeric" id="ajThB" value="${borradorEncuesta.umbrales.B}" class="w-20 h-10 rounded-xl border border-slate-300 text-center font-bold" oninput="App.ajustes.alCambiarEncuesta()"></label>
        </div>
        <div class="grid md:grid-cols-2 gap-3">${preguntas.map(([q, titulo], i) => `
            <details class="rounded-2xl border border-slate-200 group/preg" ${i < 2 ? 'open' : ''}>
                <summary class="list-none cursor-pointer flex items-center gap-3 p-3 rounded-2xl">
                    <span class="w-8 h-8 rounded-full bg-purple-50 text-purple-800 text-xs font-bold flex items-center justify-center shrink-0">${i + 1}</span>
                    <span class="flex-1 min-w-0 text-sm font-semibold text-slate-800">${escA(String(titulo).replace(/^\d+\)\s*/, ''))}</span>
                    <span class="text-[11px] text-slate-500 shrink-0 hidden sm:inline">${['q1', 'q2', 'q5'].includes(q) ? 'Suma al potencial' : 'Para la adopción'}</span>
                    <span class="material-symbols-outlined text-slate-500 transition group-open/preg:rotate-180">expand_more</span>
                </summary>
                <div class="px-3 pb-3 space-y-1.5">${Object.entries(borradorEncuesta.pesos[q]).map(([opcion, pts]) => `
                    <label class="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-1.5">
                        <span class="text-sm text-slate-700 min-w-0 truncate" title="${escA(opcion)}">${escA(opcion)}</span>
                        <input type="number" inputmode="numeric" data-q="${escA(q)}" data-opt="${escA(opcion)}" value="${Number(pts)}" class="w-16 h-9 rounded-lg border border-slate-300 text-center text-sm font-mono" oninput="App.ajustes.alCambiarEncuesta()">
                    </label>`).join('')}</div>
            </details>`).join('')}</div>
        <div id="ajEjemplo" class="mt-4 rounded-2xl bg-purple-50 text-purple-950 p-4 text-sm" aria-live="polite"></div>`;
    document.getElementById('btnGuardarEncuesta').disabled = true;
    window.App.ajustes.ejemplo();
};

window.App.ajustes.leerEncuesta = function() {
    const pesos = JSON.parse(JSON.stringify(borradorEncuesta.pesos));
    document.querySelectorAll('#ajEncuestaCuerpo input[data-q]').forEach(input => {
        const q = input.dataset.q, opcion = input.dataset.opt;
        if (pesos[q] && pesos[q][opcion] !== undefined) pesos[q][opcion] = parseInt(input.value, 10) || 0;
    });
    return { pesos, umbrales: { A: parseInt(document.getElementById('ajThA').value, 10) || 0, B: parseInt(document.getElementById('ajThB').value, 10) || 0 } };
};

window.App.ajustes.alCambiarEncuesta = function() {
    document.getElementById('btnGuardarEncuesta').disabled = false;
    window.App.ajustes.ejemplo();
};

// Ejemplo con la respuesta de más puntos en cada pregunta que suma al potencial
window.App.ajustes.ejemplo = function() {
    const zona = document.getElementById('ajEjemplo');
    if (!zona || !borradorEncuesta) return;
    const { pesos, umbrales } = window.App.ajustes.leerEncuesta();
    const mejor = (q) => Object.entries(pesos[q] || {}).sort((a, b) => b[1] - a[1])[0];
    const medio = (q) => { const o = Object.entries(pesos[q] || {}).sort((a, b) => a[1] - b[1]); return o[Math.floor(o.length / 2)]; };
    const caso = (elegir) => {
        const r = ['q1', 'q2', 'q5'].map(q => elegir(q)).filter(Boolean);
        const total = r.reduce((s, [, p]) => s + Number(p), 0);
        const letra = total >= umbrales.A ? 'A' : (total >= umbrales.B ? 'B' : 'C');
        return { r, total, letra };
    };
    const alto = caso(mejor), med = caso(medio);
    const linea = (c, titulo) => `<li class="flex flex-wrap items-center gap-2"><span class="font-semibold">${titulo}:</span> ${c.r.map(([o, p]) => `<span class="bg-white/70 rounded-full px-2 py-0.5 text-xs">${escA(o)} · ${p} pts</span>`).join('')}
        <span>= <b>${fmtA(c.total)} puntos</b> → potencial <b class="cell-${c.letra}_B rounded-lg px-2">${c.letra}</b></span></li>`;
    const error = umbrales.B >= umbrales.A ? '<p class="text-rose-700 font-semibold mb-2">El puntaje para A debe ser mayor que el de B.</p>' : '';
    zona.innerHTML = `${error}<div class="font-bold mb-2 flex items-center gap-2"><span class="material-symbols-outlined text-[20px]">calculate</span> Ejemplo con estos puntos</div>
        <ul class="space-y-2">${linea(alto, 'Respuestas más altas')}${linea(med, 'Respuestas intermedias')}</ul>`;
};

window.App.ajustes.valoresOriginales = function() {
    const cfg = window.App.config;
    borradorEncuesta = { pesos: JSON.parse(JSON.stringify(cfg.DEFAULT_SURVEY_WEIGHTS)), umbrales: { ...cfg.DEFAULT_SURVEY_THRESHOLDS } };
    document.querySelectorAll('#ajEncuestaCuerpo input[data-q]').forEach(input => {
        const v = borradorEncuesta.pesos[input.dataset.q] && borradorEncuesta.pesos[input.dataset.q][input.dataset.opt];
        if (v !== undefined) input.value = v;
    });
    document.getElementById('ajThA').value = borradorEncuesta.umbrales.A;
    document.getElementById('ajThB').value = borradorEncuesta.umbrales.B;
    window.App.ajustes.alCambiarEncuesta();
    window.App.ui.showToast('Valores originales puestos. Toca "Guardar" para aplicarlos.');
};

window.App.ajustes.guardarEncuesta = async function() {
    const st = window.App.state;
    const { pesos, umbrales } = window.App.ajustes.leerEncuesta();
    if (umbrales.B >= umbrales.A) { window.App.ui.showToast('El puntaje para A debe ser mayor que el de B.'); return; }
    const ok = await window.App.admin.guardarConfig({ ponderacion_encuesta: pesos, umbrales_encuesta: umbrales }, 'Ponderación guardada para todo el equipo.');
    if (!ok) return;
    st.SURVEY_WEIGHTS = pesos;
    st.SURVEY_THRESHOLDS = umbrales;
    borradorEncuesta = { pesos: JSON.parse(JSON.stringify(pesos)), umbrales: { ...umbrales } };
    document.getElementById('btnGuardarEncuesta').disabled = true;
    st._lastUniverseSignature = null;
    window.App.matrix.aggregateAndCalculate();
};

console.log('[SegmentApp] ajustes.js cargado.');

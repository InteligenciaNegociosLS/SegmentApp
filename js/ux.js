/* ============================================================
   SegmentApp - Experiencia de uso (Fase 6B)
   Archivo: js/ux.js
   Todo lo que hace la app más fácil y fluida, sin tocar ningún
   cálculo:
   - Pantalla de inicio animada
   - Menú "Más", hoja de filtros, menú de exportar
   - Filtros rápidos (Pendientes, Evaluados, Mayor oportunidad, Sin recetas)
     y filtros activos como pastillas con ✕
   - Matriz: números animados y lista de médicos del cuadrante elegido
   - Lista de médicos en tarjetas (teléfono)
   - Evaluación con respuestas de un toque y "Guardar y siguiente"
   - Barra de navegación inferior (teléfono)
   - Aviso cuando hay una versión nueva de la app
============================================================ */

window.App = window.App || {};
window.App.ux = {};

const escUx = (v) => window.App.ui.escapeHtml(v);
const fmtN = (n, d = 0) => window.App.ui.formatNumber(n || 0, d);
const sinMovimiento = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const INICIO_APP = Date.now();

/* ============================================================
   PANTALLA DE INICIO
============================================================ */
window.App.ux.ocultarSplash = function() {
    const s = document.getElementById('splash');
    if (!s || s.dataset.saliendo) return;
    s.dataset.saliendo = '1';
    // Se deja ver la animación completa (al menos ~1 s) la primera vez
    const espera = Math.max(0, 1000 - (Date.now() - INICIO_APP));
    setTimeout(() => {
        s.classList.add('salir');
        setTimeout(() => s.remove(), 320);
    }, sinMovimiento() ? 0 : espera);
};

/* ============================================================
   NAVEGACIÓN
============================================================ */
window.App.ux.irA = function(id) {
    const destino = id === 'inicio' ? null : document.getElementById(id);
    const opciones = { behavior: sinMovimiento() ? 'auto' : 'smooth' };
    if (destino) destino.scrollIntoView({ ...opciones, block: 'start' });
    else window.scrollTo({ top: 0, ...opciones });
    window.App.ux.marcarNav(id);
};

window.App.ux.marcarNav = function(id) {
    document.querySelectorAll('#navInferior .nav-item').forEach(b => {
        b.setAttribute('aria-current', b.dataset.seccion === id ? 'true' : 'false');
    });
};

window.App.ux.alEntrar = function() {
    const st = window.App.state;
    const nombres = { admin: 'Administrador', gte_nacional: 'Gerente Nacional', gd: 'Gerente de Distrito', vm: 'Visitador médico' };
    const nav = document.getElementById('navInferior');
    if (nav) nav.classList.remove('hidden');
    window.App.ux.marcarNav('inicio');
    window.App.ui.safeSetText('masNombre', st.currentVisitadorName || 'SegmentApp');
    window.App.ui.safeSetText('masRol', nombres[st.rolReal] || '');
    document.querySelectorAll('#menuMas .solo-admin').forEach(e => e.classList.toggle('hidden', st.rolReal !== 'admin'));
    document.querySelectorAll('#menuMas .con-sesion').forEach(e => e.classList.remove('hidden'));
    // "Guardar y siguiente" es para quien evalúa a sus médicos (VM)
    const sig = document.getElementById('btnGuardarSiguiente');
    if (sig) sig.classList.toggle('hidden', st.rolReal !== 'vm');
    window.App.ux.ocultarSplash();
};

window.App.ux.alSalir = function() {
    const nav = document.getElementById('navInferior');
    if (nav) nav.classList.add('hidden');
    document.querySelectorAll('#menuMas .solo-admin, #menuMas .con-sesion').forEach(e => e.classList.add('hidden'));
    window.App.ux.cerrarMas();
    window.App.ux.cerrarFiltros();
    window.App.state.FILTRO_RAPIDO = 'todos';
    window.App.ux.ocultarSplash();
};

/* ---------- Menú "Más" ---------- */
window.App.ux.abrirMas = function() {
    const m = document.getElementById('menuMas');
    if (!m) return;
    m.classList.remove('hidden');
    document.getElementById('btnMas')?.setAttribute('aria-expanded', 'true');
    window.App.ux.marcarNav('mas');
};
window.App.ux.cerrarMas = function() {
    const m = document.getElementById('menuMas');
    if (m) m.classList.add('hidden');
    document.getElementById('btnMas')?.setAttribute('aria-expanded', 'false');
};

/* ---------- Hoja de filtros ---------- */
window.App.ux.abrirFiltros = function() {
    document.getElementById('hojaFiltros')?.classList.remove('hidden');
    window.App.ux.actualizarBotonResultados();
};
window.App.ux.cerrarFiltros = function() {
    document.getElementById('hojaFiltros')?.classList.add('hidden');
    document.querySelectorAll('.filter-dropdown-panel').forEach(p => p.classList.add('hidden'));
};
window.App.ux.actualizarBotonResultados = function() {
    const n = (window.App.state.PROCESSED_DATA || []).length;
    window.App.ui.safeSetText('btnVerResultados', n ? `Ver ${fmtN(n)} médicos` : 'Ver resultados');
};

/* ---------- Menú de exportar ---------- */
window.App.ux.abrirExportar = function() {
    const m = document.getElementById('menuExportar');
    if (!m) return;
    const abrir = m.classList.contains('hidden');
    m.classList.toggle('hidden', !abrir);
    document.getElementById('btnExportar')?.setAttribute('aria-expanded', abrir ? 'true' : 'false');
};
window.App.ux.exportar = function(tipo) {
    document.getElementById('menuExportar')?.classList.add('hidden');
    if (tipo === 'imagen') return window.exportMatrixToPNG && window.exportMatrixToPNG();
    if (window.showExportModal) window.showExportModal(tipo);
};

// Cerrar menús con Escape o tocando fuera
document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    window.App.ux.cerrarMas();
    window.App.ux.cerrarFiltros();
    document.getElementById('menuExportar')?.classList.add('hidden');
});
document.addEventListener('click', (e) => {
    const m = document.getElementById('menuExportar');
    if (m && !m.classList.contains('hidden') && !m.contains(e.target) && !document.getElementById('btnExportar')?.contains(e.target)) {
        m.classList.add('hidden');
    }
});

/* ============================================================
   BÚSQUEDA (espera a que se termine de escribir)
============================================================ */
let temporizadorBusqueda = null;
window.App.ux.alBuscar = function() {
    clearTimeout(temporizadorBusqueda);
    temporizadorBusqueda = setTimeout(() => window.App.filters.resetPaginationAndRender(), 200);
};

/* ============================================================
   FILTROS RÁPIDOS (solo cambian la LISTA, nunca los cálculos)
============================================================ */
const FILTROS_RAPIDOS = [
    { id: 'todos', texto: 'Todos', icono: 'apps' },
    { id: 'pendientes', texto: 'Pendientes', icono: 'pending_actions' },
    { id: 'evaluados', texto: 'Evaluados', icono: 'task_alt' },
    { id: 'oportunidad', texto: 'Mayor oportunidad', icono: 'trending_up' },
    { id: 'sinrx', texto: 'Sin recetas', icono: 'person_off' }
];

window.App.ux.estaEvaluado = function(doc) {
    const st = window.App.state;
    if (doc.isInst) return false;
    if (st.currentUserRole === 'visitador') {
        const m = st.EVALUACIONES_VISITADOR[window.App.data.normalizeKey(doc.id)];
        return !!m && Object.keys(m).length > 0;
    }
    return (window.getEvaluationsForDoc ? window.getEvaluationsForDoc(doc.id) : []).length > 0;
};

const CUMPLE = {
    todos: () => true,
    pendientes: (d) => !window.App.ux.estaEvaluado(d),
    evaluados: (d) => window.App.ux.estaEvaluado(d),
    oportunidad: (d) => !d.isZeroRx && d.gap > 0,
    sinrx: (d) => !!d.isZeroRx
};

window.App.ux.aplicarFiltroRapido = function(datos) {
    const tipo = window.App.state.FILTRO_RAPIDO || 'todos';
    if (tipo === 'todos') return datos;
    const r = datos.filter(CUMPLE[tipo]);
    if (tipo === 'oportunidad') r.sort((a, b) => b.gap - a.gap);
    return r;
};

window.App.ux.filtroRapido = function(tipo, irALista = false) {
    const st = window.App.state;
    st.FILTRO_RAPIDO = (st.FILTRO_RAPIDO === tipo && tipo !== 'todos' && !irALista) ? 'todos' : tipo;
    window.App.filters.resetPaginationAndRender();
    if (irALista) {
        window.App.ux.irA('seccionMedicos');
        window.App.ux.marcarNav(tipo === 'pendientes' ? 'pendientes' : 'seccionMedicos');
    }
};

window.App.ux.renderChipsRapidos = function() {
    const st = window.App.state;
    const zona = document.getElementById('chipsRapidos');
    if (!zona) return;
    const base = st.PROCESSED_DATA || [];
    const actual = st.FILTRO_RAPIDO || 'todos';
    const cuentas = {};
    FILTROS_RAPIDOS.forEach(f => { cuentas[f.id] = f.id === 'todos' ? base.length : base.filter(CUMPLE[f.id]).length; });
    zona.innerHTML = FILTROS_RAPIDOS.map(f => `
        <button type="button" class="chip" aria-pressed="${actual === f.id}" onclick="App.ux.filtroRapido('${f.id}')">
            ${actual === f.id ? '' : `<span class="material-symbols-outlined text-[18px]">${f.icono}</span>`}${f.texto}
            <span class="cuenta">${fmtN(cuentas[f.id])}</span>
        </button>`).join('');
    const ins = document.getElementById('insigniaPendientes');
    if (ins) {
        ins.textContent = cuentas.pendientes > 999 ? '999+' : String(cuentas.pendientes);
        ins.classList.toggle('hidden', !cuentas.pendientes);
    }
};

/* ---------- Filtros activos (pastillas con ✕) ---------- */
const NOMBRES_FILTRO = { Market: 'Mercados', Product: 'Productos', Rep: 'Visitadores', Region: 'Región', Spec: 'Especialidad', Molecule: 'Molécula', Class: 'Clase', Lab: 'Laboratorio' };

window.App.ux.renderChipsActivos = function() {
    const st = window.App.state;
    const zona = document.getElementById('chipsActivos');
    if (!zona) return;
    const chips = [];
    Object.keys(NOMBRES_FILTRO).forEach(k => {
        const total = (st.FILTER_OPTIONS[k] || []).length, elegidos = (st.FILTER_STATE[k] || []).length;
        if (total && elegidos < total) {
            const texto = elegidos === 1 ? st.FILTER_STATE[k][0] : `${elegidos} de ${total}`;
            chips.push({ texto: `${NOMBRES_FILTRO[k]}: ${texto}`, quitar: `toggleAllGeneric('${k}', true)` });
        }
    });
    const status = document.getElementById('filterStatus');
    if (status && status.value !== 'all') chips.push({ texto: status.options[status.selectedIndex].text, quitar: `document.getElementById('filterStatus').value='all'; applyFilters()` });
    const gen = document.getElementById('filterGeneric');
    if (gen && gen.value !== 'all') chips.push({ texto: `Genérico: ${gen.value}`, quitar: `document.getElementById('filterGeneric').value='all'; applyFilters()` });
    if (st.MATRIX_FILTER) {
        const { pot, loy } = st.MATRIX_FILTER;
        chips.push({ texto: `Cuadrante ${pot}${loy === 'C' ? '-' : (loy === 'A' ? '+' : '')}`, quitar: 'clearMatrixFilter()' });
    }
    zona.innerHTML = chips.map(c => `<button type="button" class="chip chip-cerrar" onclick="${c.quitar}" title="Quitar filtro">${escUx(c.texto)}<span class="material-symbols-outlined text-[18px]">close</span></button>`).join('');
    zona.classList.toggle('hidden', !chips.length);
    zona.classList.toggle('flex', !!chips.length);
    const cont = document.getElementById('contadorFiltros');
    const nFiltros = chips.filter(c => !c.quitar.startsWith('clearMatrix')).length;
    if (cont) { cont.textContent = String(nFiltros); cont.classList.toggle('hidden', !nFiltros); cont.classList.toggle('flex', !!nFiltros); }
};

window.App.ux.trasRenderTabla = function() {
    window.App.ux.renderChipsRapidos();
    window.App.ux.renderChipsActivos();
    window.App.ux.actualizarBotonResultados();
    const st = window.App.state;
    const titulos = { pendientes: 'Médicos pendientes por evaluar', evaluados: 'Médicos evaluados', oportunidad: 'Mayor oportunidad', sinrx: 'Médicos sin recetas' };
    window.App.ui.safeSetText('tableTitle', st.groupByInstitution ? 'Instituciones' : (titulos[st.FILTRO_RAPIDO] || 'Médicos'));
};

/* ============================================================
   MATRIZ
============================================================ */
// Los números de la matriz "cuentan" hasta su valor nuevo
window.App.ux.animarNumero = function(id, valor) {
    const el = document.getElementById(id);
    if (!el) return;
    const final = Number(valor) || 0;
    const inicial = Number(el.dataset.valor || 0);
    el.dataset.valor = String(final);
    if (sinMovimiento() || inicial === final || typeof requestAnimationFrame !== 'function' || document.hidden) {
        el.textContent = fmtN(final);
        return;
    }
    const t0 = performance.now(), dur = 450;
    const paso = (t) => {
        if (el.dataset.valor !== String(final)) return;   // llegó un valor más nuevo
        const p = Math.min(1, (t - t0) / dur);
        const suave = 1 - Math.pow(1 - p, 3);
        el.textContent = fmtN(Math.round(inicial + (final - inicial) * suave));
        if (p < 1) requestAnimationFrame(paso);
    };
    el.textContent = fmtN(inicial);
    requestAnimationFrame(paso);
};

const LOY_SIGNO = { A: '+', B: '', C: '-' };
window.App.ux.claseCuadrante = function(doc) {
    if (!doc || doc.isZeroRx || doc.isInst) return '';
    const p = doc.catPotency, l = doc.catLoyalty;
    return /^[ABC]$/.test(p) && /^[ABC]$/.test(l) ? `cell-${p}_${l}` : '';
};

window.App.ux.mostrarPanelCelda = function(pot, loy) {
    const st = window.App.state;
    const panel = document.getElementById('panelCelda');
    if (!panel) return;
    const docs = (st.PROCESSED_DATA || []).filter(d => d.catPotency === pot && d.catLoyalty === loy && !d.isZeroRx);
    const top = [...docs].sort((a, b) => b.gap - a.gap || b.totalRx - a.totalRx).slice(0, 5);
    const etiqueta = pot + LOY_SIGNO[loy];
    const esVm = st.currentUserRole === 'visitador';
    panel.innerHTML = `
        <div class="flex items-center justify-between gap-3 mb-3">
            <div class="flex items-center gap-3 min-w-0">
                <span class="cell-${pot}_${loy} w-11 h-11 rounded-2xl flex items-center justify-center font-display font-extrabold text-lg shrink-0">${etiqueta}</span>
                <div class="min-w-0"><div class="font-bold text-slate-800">${fmtN(docs.length)} médicos en ${etiqueta}</div>
                <div class="text-xs text-slate-500">Los de mayor oportunidad primero</div></div>
            </div>
            <button class="w-10 h-10 rounded-full flex items-center justify-center text-slate-700 shrink-0" onclick="clearMatrixFilter()" title="Cerrar"><span class="material-symbols-outlined">close</span></button>
        </div>
        ${top.length ? `<ul class="divide-y divide-slate-100">${top.map(d => `
            <li class="flex items-center gap-3 py-2.5 px-2 rounded-xl cursor-pointer md-estado" onclick="handleRowClick(false, 0, '${escUx(d.id)}')">
                <div class="flex-1 min-w-0"><div class="text-sm font-semibold text-slate-800 truncate">${escUx(d.name)}</div>
                <div class="text-xs text-slate-500">${fmtN(d.totalRx)} recetas · ${fmtN(d.share, 1)}% La Santé</div></div>
                ${d.gap > 0 ? `<span class="badge-gap">+${fmtN(d.gap)}</span>` : ''}
                ${esVm ? `<button class="px-3 py-1.5 rounded-full bg-blue-50 text-blue-800 text-xs font-bold" onclick="event.stopPropagation(); App.ux.evaluar(this)" data-id="${escUx(d.id)}" data-nombre="${escUx(d.name)}">Evaluar</button>` : ''}
            </li>`).join('')}</ul>` : '<p class="text-sm text-slate-500 py-2">No hay médicos en este cuadrante con los filtros actuales.</p>'}
        ${docs.length > top.length ? `<button class="mt-2 w-full py-2.5 rounded-full text-sm font-bold text-blue-700" onclick="App.ux.irA('seccionMedicos')">Ver los ${fmtN(docs.length)} en la lista</button>` : ''}`;
    panel.classList.remove('hidden');
    panel.classList.remove('animate-fade-in'); void panel.offsetWidth; panel.classList.add('animate-fade-in');
    if (panel.scrollIntoView) panel.scrollIntoView({ behavior: sinMovimiento() ? 'auto' : 'smooth', block: 'nearest' });
};
window.App.ux.ocultarPanelCelda = function() {
    document.getElementById('panelCelda')?.classList.add('hidden');
};

/* ============================================================
   LISTA DE MÉDICOS EN TARJETAS (teléfono)
============================================================ */
window.App.ux.renderTarjetas = function(pageData, startIdx) {
    const st = window.App.state;
    const zona = document.getElementById('dataCards');
    if (!zona) return;
    if (!pageData.length) {
        zona.innerHTML = `<div class="p-8 text-center text-slate-500"><span class="material-symbols-outlined text-4xl block mb-2">search_off</span>
            <div class="font-bold text-slate-700">No hay médicos con estos filtros</div>
            <button class="mt-3 chip" onclick="App.ux.filtroRapido('todos'); resetAllFilters()">Quitar filtros</button></div>`;
        return;
    }
    const esVm = st.currentUserRole === 'visitador';
    zona.innerHTML = pageData.map((d, i) => {
        if (d.isInst) {
            return `<article class="p-4 flex gap-3 items-center cursor-pointer md-estado" onclick="handleRowClick(true, ${startIdx + i}, '')">
                <span class="w-11 h-11 rounded-2xl bg-blue-50 text-blue-800 flex items-center justify-center shrink-0"><span class="material-symbols-outlined">apartment</span></span>
                <div class="flex-1 min-w-0"><div class="font-bold text-sm text-slate-800 truncate">${escUx(d.name)}</div>
                <div class="text-xs text-slate-500">${fmtN(d.docCount)} médicos · ${fmtN(d.totalRx)} recetas · ${fmtN(d.share, 1)}%</div></div></article>`;
        }
        const etiqueta = d.isZeroRx ? '—' : (st.currentMatrixMode === 'survey' ? d.surveyLabel : d.matrixLabel);
        const evaluado = window.App.ux.estaEvaluado(d);
        const accion = esVm
            ? `<button class="px-4 py-2 rounded-full text-xs font-bold ${evaluado ? 'bg-green-50 text-green-800' : 'bg-blue-600 text-white'}" onclick="event.stopPropagation(); App.ux.evaluar(this)" data-id="${escUx(d.id)}" data-nombre="${escUx(d.name)}">${evaluado ? 'Evaluado ✓' : 'Evaluar'}</button>`
            : `<span class="text-[11px] font-bold ${evaluado ? 'text-green-700' : 'text-slate-500'}">${evaluado ? 'Evaluado' : 'Pendiente'}</span>`;
        return `<article class="p-4 flex gap-3 items-start cursor-pointer md-estado" onclick="handleRowClick(false, ${startIdx + i}, '${escUx(d.id)}')">
            <span class="${window.App.ux.claseCuadrante(d) || 'bg-slate-100 text-slate-500'} w-11 h-11 rounded-2xl flex items-center justify-center font-display font-extrabold shrink-0">${escUx(etiqueta)}</span>
            <div class="flex-1 min-w-0">
                <div class="font-bold text-sm text-slate-800 truncate">${escUx(d.name)}</div>
                <div class="text-xs text-slate-500 truncate">${escUx(d.spec || '')}${d.ficheroData && d.ficheroData.length ? ' · Fichado' : ''}</div>
                <div class="flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-600 mt-1.5">
                    ${d.isZeroRx ? '<span>Sin recetas en CloseUp</span>' : `<span><b>${fmtN(d.totalRx)}</b> recetas</span><span class="text-blue-700"><b>${fmtN(d.rxPhq)}</b> La Santé</span><span>${fmtN(d.share, 1)}%</span>`}
                    ${!d.isZeroRx && d.gap > 0 ? `<span class="badge-gap">+${fmtN(d.gap)} Rx</span>` : ''}
                </div>
            </div>
            <div class="shrink-0 self-center">${accion}</div>
        </article>`;
    }).join('');
};

window.App.ux.evaluar = function(el) {
    if (window.openEvalModal) window.openEvalModal(el.dataset.id, el.dataset.nombre);
};

/* ============================================================
   EVALUACIÓN: respuestas de un toque
   Las listas (select) siguen existiendo y guardan el valor; los
   botones solo las llenan. Así lo que se guarda es lo mismo de siempre.
============================================================ */
window.App.ux.construirChips = function(selectId) {
    const sel = document.getElementById(selectId);
    const zona = document.getElementById(selectId + '_chips');
    if (!sel || !zona) return;
    const opciones = [...sel.options].filter(o => o.value !== '');
    zona.innerHTML = opciones.map(o => {
        const evaluado = /✅/.test(o.text);
        const texto = o.text.replace(/\s*✅\s*Evaluado/, '');
        return `<button type="button" class="chip" aria-pressed="${sel.value === o.value}" data-valor="${escUx(o.value)}">${evaluado ? '<span class="material-symbols-outlined text-[18px] text-green-700">task_alt</span>' : ''}${escUx(texto)}</button>`;
    }).join('');
    zona.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
        sel.value = b.dataset.valor;
        zona.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
        sel.dispatchEvent(new Event('change'));
        if (selectId === 'surveyQ1' || selectId === 'surveyQ5') window.App.ux.actualizarResumenMedico();
    }));
};

window.App.ux.sincronizarEvaluacion = function() {
    ['evalMarketSelect', 'surveyQ1', 'surveyQ5', 'surveyQ2', 'surveyQ3'].forEach(window.App.ux.construirChips);
    window.App.ux.actualizarResumenMedico();
};

window.App.ux.actualizarResumenMedico = function() {
    const q1 = document.getElementById('surveyQ1')?.value, q5 = document.getElementById('surveyQ5')?.value;
    const resumen = document.getElementById('resumenMedico');
    if (resumen) resumen.innerHTML = q1 && q5
        ? `<span class="chip" aria-pressed="false">${escUx(q1)} pacientes/semana</span><span class="chip" aria-pressed="false">Consulta: ${escUx(q5)}</span>`
        : '';
};

// Si ya se respondió en otro mercado, se muestra el resumen con "Cambiar"
window.App.ux.editarDatosMedico = function(abrir) {
    const preguntas = document.getElementById('preguntasMedico');
    const resumen = document.getElementById('resumenMedico');
    const btn = document.getElementById('btnCambiarMedico');
    if (!preguntas || !resumen || !btn) return;
    preguntas.classList.toggle('hidden', !abrir);
    resumen.classList.toggle('hidden', abrir);
    resumen.classList.toggle('flex', !abrir);
    btn.classList.toggle('hidden', abrir);
};

window.App.ux.alAbrirEvaluacion = function(docKey) {
    const st = window.App.state;
    window.App.ux.sincronizarEvaluacion();
    const yaRespondido = !!(document.getElementById('surveyQ1').value && document.getElementById('surveyQ5').value);
    window.App.ux.editarDatosMedico(!yaRespondido);
    const mercados = (st.FILTER_OPTIONS.Market || []).length;
    const hechos = Object.keys(st.EVALUACIONES_VISITADOR[docKey] || {}).length;
    window.App.ui.safeSetText('evalProgresoMedico', mercados > 1 ? `${hechos} de ${mercados} mercados evaluados` : '');
    const sig = document.getElementById('btnGuardarSiguiente');
    if (sig) sig.classList.toggle('hidden', st.rolReal !== 'vm');
};

window.App.ux.guardarYSiguiente = async function() {
    const st = window.App.state;
    st._irAlSiguiente = true;
    try {
        await window.App.evaluation.saveEvaluation();
    } finally {
        st._irAlSiguiente = false;
    }
};

// Abre el próximo médico sin evaluar (en el orden de la lista que se está viendo)
window.App.ux.abrirSiguientePendiente = function(docKeyActual, mercadoGuardado) {
    const st = window.App.state;
    const d = window.App.data;
    const lista = (st.CURRENT_TABLE_DATA && st.CURRENT_TABLE_DATA.length && !st.groupByInstitution ? st.CURRENT_TABLE_DATA : st.PROCESSED_DATA) || [];
    const i = lista.findIndex(x => d.normalizeKey(x.id) === docKeyActual);
    const orden = [...lista.slice(i + 1), ...lista.slice(0, Math.max(0, i))];
    const siguiente = orden.find(x => !x.isInst && !window.App.ux.estaEvaluado(x));
    if (!siguiente) {
        window.App.ui.showToast(`${mercadoGuardado ? mercadoGuardado + ' guardado. ' : ''}¡Listo! No quedan médicos pendientes en esta lista.`);
        return;
    }
    window.App.ui.showToast(`${mercadoGuardado ? mercadoGuardado + ' guardado. ' : ''}Siguiente: ${siguiente.name}`);
    window.openEvalModal(siguiente.id, siguiente.name);
};

/* ============================================================
   VERSIÓN NUEVA DE LA APP
   Cada 15 minutos revisa si se publicó una versión nueva y ofrece
   actualizar (así nadie se queda con una versión vieja abierta).
============================================================ */
window.App.ux.vigilarVersion = function() {
    const actual = window.App.env && window.App.env.VERSION;
    if (!actual || actual === 'local') return;
    setInterval(async () => {
        try {
            const r = await fetch('js/env.js', { cache: 'no-store' });
            const texto = await r.text();
            const m = texto.match(/"VERSION":"([^"]+)"/);
            if (m && m[1] !== actual) {
                window.App.ui.showToast('Hay una versión nueva de la app.', { accion: 'Actualizar', alAccionar: () => location.reload() });
            }
        } catch (e) { /* sin conexión: se intenta más tarde */ }
    }, 15 * 60 * 1000);
};

// Seguridad: si algo falla al iniciar, la pantalla de inicio no queda pegada
setTimeout(() => window.App.ux.ocultarSplash(), 12000);

console.log('[SegmentApp] ux.js cargado.');

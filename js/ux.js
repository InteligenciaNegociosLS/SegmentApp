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
    if (destino && destino.scrollIntoView) destino.scrollIntoView({ ...opciones, block: 'start' });
    else if (window.scrollTo) window.scrollTo({ top: 0, ...opciones });
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
    // La primera vez de cada persona: guía rápida (cuando ya se ve el tablero)
    // (las pruebas automáticas la desactivan con window.__SIN_GUIA)
    setTimeout(() => { if (!window.__SIN_GUIA && window.App.state.currentUserRole !== 'guest') window.App.ux.iniciarGuia(); }, 1400);
};

window.App.ux.alSalir = function() {
    const nav = document.getElementById('navInferior');
    if (nav) nav.classList.add('hidden');
    document.querySelectorAll('#menuMas .solo-admin, #menuMas .con-sesion').forEach(e => e.classList.add('hidden'));
    window.App.ux.cerrarMas();
    window.App.ux.cerrarFiltros();
    document.getElementById('guia')?.classList.add('hidden');
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
    window.App.ux.cerrarMatrizCompleta();
    window.App.ux.cerrarAyudaMatriz();
    if (!document.getElementById('guia')?.classList.contains('hidden')) window.App.ux.terminarGuia();
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
    // "Evaluar pendientes" sin pendientes: avisar en vez de llevar a una lista vacía
    if (tipo === 'pendientes' && irALista && !(st.PROCESSED_DATA || []).some(CUMPLE.pendientes)) {
        window.App.ui.showToast('¡Excelente! Ya evaluaste a todos tus médicos. 🎉');
        return;
    }
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

// Matriz en pantalla completa (ideal en iPad y teléfono).
// Se usa solo el modo de la app: la pantalla completa del navegador hacía
// "parpadear" la página al entrar y al salir.
window.App.ux.abrirMatrizCompleta = function() {
    const sec = document.getElementById('seccionMatriz');
    if (!sec || sec.classList.contains('matriz-completa')) return;
    sec.classList.add('matriz-completa');
    document.body.classList.add('sin-desplazar');
};
window.App.ux.cerrarMatrizCompleta = function() {
    const sec = document.getElementById('seccionMatriz');
    if (!sec || !sec.classList.contains('matriz-completa')) return;
    sec.classList.remove('matriz-completa');
    document.body.classList.remove('sin-desplazar');
};

// Al tocar un cuadrante: la lista de abajo queda filtrada y se baja hasta ella
window.App.ux.alElegirCuadrante = function(pot, loy) {
    window.App.ux.cerrarMatrizCompleta();
    const lista = document.getElementById('seccionMedicos');
    if (!lista) return;
    window.App.ux.irA('seccionMedicos');
    lista.classList.remove('resaltar'); void lista.offsetWidth; lista.classList.add('resaltar');
    const n = (window.App.state.CURRENT_TABLE_DATA || []).length;
    window.App.ui.showToast(`Cuadrante ${pot}${LOY_SIGNO[loy]}: ${fmtN(n)} médicos`);
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
        const accion = window.App.ux.estadoEvaluacion(d);
        return `<article class="p-4 flex gap-3 items-start cursor-pointer md-estado" onclick="handleRowClick(false, ${startIdx + i}, '${escUx(d.id)}')">
            <span class="${window.App.ux.claseCuadrante(d) || 'bg-slate-100 text-slate-500'} w-11 h-11 rounded-2xl flex items-center justify-center font-display font-extrabold shrink-0">${escUx(etiqueta)}</span>
            <div class="flex-1 min-w-0">
                <div class="font-bold text-sm text-slate-800 truncate">${escUx(window.App.ui.nombreVisible(d.name))}</div>
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

// Color de una etiqueta de cuadrante ("A-", "B+", "C"…) igual que en la matriz
window.App.ux.claseDeEtiqueta = function(etiqueta) {
    const m = String(etiqueta || '').trim().match(/^([ABC])([+-]?)$/);
    if (!m) return 'bg-slate-100 text-slate-600';
    return `cell-${m[1]}_${m[2] === '+' ? 'A' : (m[2] === '-' ? 'C' : 'B')}`;
};

// Estado de evaluación de un médico (tabla y tarjetas)
window.App.ux.estadoEvaluacion = function(d) {
    const st = window.App.state;
    if (st.currentUserRole === 'visitador') {
        const evals = Object.values(st.EVALUACIONES_VISITADOR[window.App.data.normalizeKey(d.id)] || {});
        const datos = `data-id="${escUx(d.id)}" data-nombre="${escUx(d.name)}"`;
        if (!evals.length) {
            return `<button class="eval-estado eval-pendiente" onclick="event.stopPropagation(); App.ux.evaluar(this)" ${datos}><span class="material-symbols-outlined">rate_review</span>Evaluar</button>`;
        }
        const ordenadas = [...evals].sort((a, b) => String(b.timestamp || '').localeCompare(String(a.timestamp || '')));
        const ultima = ordenadas[0];
        const conNotas = evals.some(e => e.notas && String(e.notas).trim());
        // Al pasar el mouse (o mantener presionado): la clasificación de cada mercado
        const detalle = ordenadas.map(e => `${e.mercado}: ${e.cuadrante}`).join('\n');
        return `<button class="eval-estado eval-hecha" onclick="event.stopPropagation(); App.ux.evaluar(this)" ${datos} title="Última clasificación: ${escUx(ultima.cuadrante || '')}&#10;${escUx(detalle)}">
            <span class="material-symbols-outlined icono-relleno">check_circle</span>
            <span class="text-left leading-tight"><span class="block">Evaluado</span><span class="block text-[11px] font-medium opacity-80">${evals.length} ${evals.length === 1 ? 'mercado' : 'mercados'}${conNotas ? ' · con nota' : ''}</span></span>
            <span class="eval-cuadrante ${window.App.ux.claseDeEtiqueta(ultima.cuadrante)}">${escUx(ultima.cuadrante || '')}</span>
        </button>`;
    }
    const evals = window.getEvaluationsForDoc ? window.getEvaluationsForDoc(d.id) : [];
    if (!evals.length) return '<span class="text-xs font-semibold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full">Pendiente</span>';
    return `<div class="flex flex-wrap items-center justify-center gap-1">${evals.slice(0, 4).map(e =>
        `<span class="eval-cuadrante ${window.App.ux.claseDeEtiqueta(e.cuadrante)}" title="${escUx(e.visitador)} · ${escUx(e.mercado || 'General')}">${escUx(e.cuadrante)}</span>`).join('')}${evals.length > 4 ? `<span class="text-[11px] text-slate-500">+${evals.length - 4}</span>` : ''}</div>`;
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
    window.App.ux.mostrarEvaluacionAnterior();
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

// Si el mercado ya tiene evaluación: sus respuestas se ven resumidas, con "Cambiar"
window.App.ux.editarDatosMercado = function(abrir) {
    const preguntas = document.getElementById('preguntasMercado');
    const resumen = document.getElementById('resumenMercado');
    const btn = document.getElementById('btnCambiarMercado');
    if (!preguntas || !resumen || !btn) return;
    preguntas.classList.toggle('hidden', !abrir);
    resumen.classList.toggle('hidden', abrir);
    resumen.classList.toggle('flex', !abrir);
    btn.classList.toggle('hidden', abrir);
};

const FECHA_CORTA = { day: '2-digit', month: 'short', year: 'numeric' };
const fechaCorta = (f) => { const d = new Date(f); return isNaN(d) ? '' : d.toLocaleDateString('es-VE', FECHA_CORTA); };
const segunEncuesta = (survey) => {
    const r = window.App.matrix.calculateObjectiveScore(survey || {});
    return r && r.pot ? r.label : '';
};

// Muestra la evaluación anterior del mercado elegido y permite ver su historial
window.App.ux.mostrarEvaluacionAnterior = function() {
    const st = window.App.state;
    const caja = document.getElementById('evalAnterior');
    if (!caja) return;
    const docKey = document.getElementById('evalDocId').value;
    const mercado = document.getElementById('evalMarketSelect').value;
    const previa = st.currentUserRole === 'visitador' && mercado ? (st.EVALUACIONES_VISITADOR[docKey] || {})[mercado] : null;
    if (!previa) {
        caja.classList.add('hidden');
        window.App.ux.editarDatosMercado(true);
        return;
    }
    const s = previa.survey || {};
    const encuesta = segunEncuesta(s);
    caja.innerHTML = `
        <div class="flex items-center gap-3">
            <span class="eval-cuadrante ${window.App.ux.claseDeEtiqueta(previa.cuadrante)} !h-11 !min-w-[44px] !rounded-2xl text-lg">${escUx(previa.cuadrante)}</span>
            <div class="flex-1 min-w-0">
                <div class="text-sm font-bold text-slate-800">Evaluación anterior${previa.timestamp ? ' · ' + fechaCorta(previa.timestamp) : ''}</div>
                <div class="text-xs text-slate-500">Tu clasificación: <b>${escUx(previa.cuadrante)}</b>${encuesta ? ` · Según la encuesta: <b>${escUx(encuesta)}</b>` : ''}</div>
            </div>
            ${previa.id ? `<button type="button" class="text-xs font-bold text-blue-700 px-3 py-1.5 rounded-full shrink-0" onclick="App.ux.verHistorial('${escUx(previa.id)}')">Historial</button>` : ''}
        </div>
        ${previa.notas ? `<p class="text-xs text-slate-600 mt-2 bg-slate-50 rounded-xl p-2">“${previa.notas}”</p>` : ''}
        <div id="listaHistorial" class="hidden mt-3"></div>`;
    caja.classList.remove('hidden');
    const resumen = document.getElementById('resumenMercado');
    if (resumen) resumen.innerHTML = [
        s.q2 && `Clase terapéutica: ${s.q2}`, s.q3 && `Nuestro producto: ${s.q3}`, s.q4 && `Otros: ${s.q4}`
    ].filter(Boolean).map(t => `<span class="chip" aria-pressed="false">${escUx(t)}</span>`).join('');
    window.App.ux.editarDatosMercado(false);
};

window.App.ux.verHistorial = async function(id) {
    const zona = document.getElementById('listaHistorial');
    if (!zona) return;
    if (!zona.classList.contains('hidden')) { zona.classList.add('hidden'); return; }
    zona.classList.remove('hidden');
    zona.innerHTML = '<div class="text-xs text-slate-500">Cargando historial…</div>';
    try {
        const cambios = await window.App.sb.historialEvaluacion(id);
        if (!cambios.length) { zona.innerHTML = '<div class="text-xs text-slate-500">Es la primera evaluación de este mercado: todavía no hay cambios anteriores.</div>'; return; }
        const textos = { modificada: 'Antes del cambio', eliminada: 'Antes de eliminarse', restaurada: 'Antes de restaurarse' };
        zona.innerHTML = `<div class="text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1">Clasificaciones anteriores</div>
            <ol class="relative border-l-2 border-slate-200 ml-2 space-y-3">${cambios.map(c => {
                const e = c.evaluacion, enc = segunEncuesta(e.survey);
                return `<li class="ml-4">
                    <span class="absolute -left-[7px] mt-1.5 w-3 h-3 rounded-full bg-slate-300"></span>
                    <div class="flex items-center gap-2 text-xs"><span class="eval-cuadrante ${window.App.ux.claseDeEtiqueta(e.cuadrante)}">${escUx(e.cuadrante)}</span>
                    <span class="text-slate-700 font-semibold">${fechaCorta(e.timestamp || c.hecho_en)}</span>
                    ${enc ? `<span class="text-slate-500">· encuesta ${escUx(enc)}</span>` : ''}</div>
                    <div class="text-[11px] text-slate-500 mt-0.5">${textos[c.accion] || ''}${e.notas ? ' · “' + e.notas + '”' : ''}</div>
                </li>`;
            }).join('')}</ol>`;
    } catch (e) {
        console.error('[SegmentApp] Historial:', e);
        zona.innerHTML = '<div class="text-xs text-rose-700">No se pudo leer el historial. Revisa tu conexión.</div>';
    }
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

/* ============================================================
   AYUDA: CÓMO LEER LA MATRIZ
============================================================ */
window.App.ux.abrirAyudaMatriz = function() {
    const st = window.App.state;
    const zona = document.getElementById('contenidoAyuda');
    if (!zona) return;
    const fila = (clase, etiqueta, titulo, texto) => `<div class="flex gap-3 items-start">
        <span class="${clase} w-12 h-12 rounded-2xl flex items-center justify-center font-display font-extrabold text-lg shrink-0">${etiqueta}</span>
        <div><div class="font-bold text-slate-800">${titulo}</div><div class="text-slate-600">${texto}</div></div></div>`;
    zona.innerHTML = `
        <p>Cada médico se ubica según dos preguntas:</p>
        <div class="grid sm:grid-cols-2 gap-3">
            <div class="rounded-2xl bg-slate-50 p-3"><div class="font-bold text-slate-800 flex items-center gap-1"><span class="material-symbols-outlined text-[18px]">arrow_upward</span> Potencial (filas)</div>
            <div class="text-xs text-slate-600 mt-1">¿Cuántas recetas hace en el mercado? <b>A</b> = los que suman el primer ${st.TH_POT_LOW}% de las recetas; <b>B</b> hasta el ${st.TH_POT_HIGH}%; <b>C</b> el resto.</div></div>
            <div class="rounded-2xl bg-slate-50 p-3"><div class="font-bold text-slate-800 flex items-center gap-1"><span class="material-symbols-outlined text-[18px]">arrow_forward</span> Adopción (columnas)</div>
            <div class="text-xs text-slate-600 mt-1">¿Qué parte de sus recetas son de La Santé? <b>-</b> hasta ${st.TH_LOY_LOW}%; <b>media</b> entre ${st.TH_LOY_LOW}% y ${st.TH_LOY_HIGH}%; <b>+</b> desde ${st.TH_LOY_HIGH}%.</div></div>
        </div>
        <div class="space-y-3">
            ${fila('cell-A_C', 'A-', 'Conquistar', 'Recetan mucho pero casi nada nuestro: la mayor oportunidad.')}
            ${fila('cell-A_B', 'A', 'Desarrollar', 'Recetan mucho y ya nos conocen: hay que crecer la participación.')}
            ${fila('cell-A_A', 'A+', 'Defender', 'Recetan mucho y son fieles: cuidarlos y mantenerlos.')}
            ${fila('cell-C_C', 'C-', 'Revisar', 'Recetan poco y casi nada nuestro: evaluar si conviene invertir tiempo.')}
        </div>
        <p class="text-xs text-slate-500">Las filas B y C siguen la misma lógica con menos volumen. <b>Oportunidad</b> = recetas que faltan para subir al siguiente nivel de adopción.
        El modo <b>Encuestas</b> ubica a cada médico según lo que respondió en la evaluación.</p>`;
    document.getElementById('ayudaMatriz').classList.remove('hidden');
};
window.App.ux.cerrarAyudaMatriz = function() {
    document.getElementById('ayudaMatriz')?.classList.add('hidden');
};

/* ============================================================
   GUÍA RÁPIDA (la primera vez que cada persona entra)
============================================================ */
const PASOS_GUIA = {
    vm: [
        ['#chipsRapidos', 'Tus filtros rápidos', 'Toca "Pendientes" para ver los médicos que te faltan por evaluar. El número te dice cuántos son.'],
        ['#visitadorDashboard', 'Tu avance', 'Aquí ves cuántos médicos llevas evaluados. "Evaluar pendientes" te lleva directo al trabajo.'],
        ['#matrixCaptureTarget', 'La matriz', 'Toca un cuadrante para ver sus médicos. El botón "?" explica qué significa cada uno.'],
        ['#dataTable tr:first-child .eval-estado, #dataCards article:first-child .eval-estado, #seccionMedicos', 'Evaluar', 'Toca "Evaluar" en un médico. Las respuestas son de un toque y "Guardar y siguiente" te lleva al próximo.']
    ],
    equipo: [
        ['#filterBar', 'Buscar y filtrar', 'Busca un médico o usa los filtros rápidos. En "Filtros" están todos los demás.'],
        ['#matrixCaptureTarget', 'La matriz', 'Toca un cuadrante para ver sus médicos. Usa pantalla completa para presentarla.'],
        ['#dataTable tr:first-child, #dataCards article:first-child, #seccionMedicos', 'La lista', 'Cada médico con su cuadrante, recetas, participación y estado de evaluación.'],
        ['#btnMas', 'Más opciones', 'Versiones de datos, exportar, la guía y cerrar sesión están aquí.']
    ]
};
let pasoActual = 0;
const pasosGuia = () => PASOS_GUIA[window.App.state.rolReal === 'vm' ? 'vm' : 'equipo'];
const claveGuia = () => `SEGMENTAPP_GUIA_${window.App.state.usuarioId || 'x'}`;

window.App.ux.iniciarGuia = function(forzar = false) {
    try { if (!forzar && localStorage.getItem(claveGuia())) return; } catch (e) { /* sin almacenamiento */ }
    pasoActual = 0;
    document.getElementById('guia')?.classList.remove('hidden');
    window.App.ux.pasoGuia(0);
};

// El primero de la lista de selectores que esté visible en pantalla
const primeroVisible = (lista) => lista.split(',').map(x => document.querySelector(x.trim())).find(e => e && e.offsetParent !== null) || null;

window.App.ux.pasoGuia = function(delta) {
    const pasos = pasosGuia();
    pasoActual += delta;
    if (pasoActual >= pasos.length) return window.App.ux.terminarGuia();
    const [selector, titulo, texto] = pasos[pasoActual];
    const el = primeroVisible(selector);
    if (!el && delta === 0 && pasoActual < pasos.length - 1) return window.App.ux.pasoGuia(1);
    const foco = document.getElementById('guiaFoco'), tarjeta = document.getElementById('guiaTarjeta');
    const ARRIBA = 76, TARJETA = 210, m = 8;   // barra superior, alto de la tarjeta, margen
    // Llevar lo que se explica justo debajo de la barra superior
    if (el && window.scrollTo) {
        const r0 = el.getBoundingClientRect();
        window.scrollTo({ top: Math.max(0, window.scrollY + r0.top - ARRIBA - m), behavior: 'auto' });
    }
    const r = el ? el.getBoundingClientRect() : { top: ARRIBA + 10, left: 16, width: Math.min(360, window.innerWidth - 32), height: 60, bottom: ARRIBA + 70 };
    // Si es más alto que la pantalla, se resalta la parte visible y la tarjeta va abajo
    const top = Math.max(r.top, ARRIBA) - m;
    const cabeDebajo = r.bottom + m + TARJETA + 12 <= window.innerHeight;
    const bottom = cabeDebajo ? r.bottom + m : Math.min(r.bottom + m, window.innerHeight - TARJETA - 24);
    Object.assign(foco.style, { top: `${top}px`, left: `${Math.max(4, r.left - m)}px`, width: `${Math.min(window.innerWidth - 8, r.width + m * 2)}px`, height: `${Math.max(48, bottom - top)}px` });
    tarjeta.style.top = `${Math.min(bottom + 12, window.innerHeight - TARJETA - 12)}px`;
    window.App.ui.safeSetText('guiaPaso', `Paso ${pasoActual + 1} de ${pasos.length}`);
    window.App.ui.safeSetText('guiaTitulo', titulo);
    window.App.ui.safeSetText('guiaTexto', texto);
    window.App.ui.safeSetText('guiaSiguiente', pasoActual === pasos.length - 1 ? '¡Listo!' : 'Siguiente');
};

window.App.ux.terminarGuia = function() {
    document.getElementById('guia')?.classList.add('hidden');
    try { localStorage.setItem(claveGuia(), '1'); } catch (e) { /* sin almacenamiento */ }
    window.scrollTo({ top: 0 });
};

// Seguridad: si algo falla al iniciar, la pantalla de inicio no queda pegada
setTimeout(() => window.App.ux.ocultarSplash(), 12000);

console.log('[SegmentApp] ux.js cargado.');

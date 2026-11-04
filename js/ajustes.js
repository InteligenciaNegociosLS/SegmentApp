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
// Mismo orden que la matriz: filas = potencial A, B, C; columnas = adopción baja (−), media, alta (+)
const CELDAS = ['A_C', 'A_B', 'A_A', 'B_C', 'B_B', 'B_A', 'C_C', 'C_B', 'C_A'];
const SIGNO_AJ = { A: '+', B: '', C: '-' };

window.App.ajustes.irA = function(id) {
    const el = document.getElementById(id);
    if (el && el.scrollIntoView) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

// Se llama cada vez que se muestra la pantalla
window.App.ajustes.render = function() {
    window.App.ajustes.descartarUmbrales();
    window.App.ajustes.renderEncuesta();
    window.App.ajustes.renderSalud();
    window.App.ajustes.renderVerComo();
    window.App.ajustes.cargarBitacora();
    if (window.App.usuarios) window.App.usuarios.cargar();
    if (window.App.catalogos) window.App.catalogos.cargar();
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

/* ============================================================
   SALUD DE LOS DATOS (Fase 9B)
============================================================ */
window.App.ajustes.renderSalud = async function() {
    const st = window.App.state;
    const zona = document.getElementById('ajSaludLista');
    if (!zona) return;
    const v = st.VERSIONES_EN_USO || {};
    const fecha = (x) => x ? new Date(x + (String(x).length === 10 ? 'T12:00:00' : '')).toLocaleDateString('es-VE', { day: '2-digit', month: 'short', year: 'numeric' }) : '';
    const c = window.App.tableros ? window.App.tableros.calcular() : { embudo: {} };
    const e = c.embudo;
    const evals = st.ALL_EVALUATIONS || [];
    const cruces = evals.filter(x => x.cruceErrado).length;
    const fila = (estado, titulo, detalle) => {
        const icono = { ok: ['check_circle', 'text-green-700'], aviso: ['warning', 'text-amber-600'], info: ['info', 'text-blue-700'] }[estado];
        return `<li class="flex gap-3 py-3"><span class="material-symbols-outlined ${icono[1]}">${icono[0]}</span>
            <div class="min-w-0"><div class="text-sm font-semibold text-slate-800">${titulo}</div><div class="text-xs text-slate-500">${detalle}</div></div></li>`;
    };
    const filas = [
        v.recetas ? fila('ok', `Recetas: ${escA(v.recetas.nombre)}`, `Datos al ${fecha(v.recetas.fecha)} · ${fmtA(v.recetas.filas)} filas · publicada ${fecha(String(v.recetas.publicado_en || '').slice(0, 10))}`)
                  : fila('aviso', 'No hay versión de recetas en uso', 'Carga y publica una versión desde "Cargar datos".'),
        v.fichero ? fila('ok', `Fichero: ${escA(v.fichero.nombre)}`, `Datos al ${fecha(v.fichero.fecha)} · ${fmtA(v.fichero.filas)} filas · <b>${fmtA(st.FICHERO_MAP.size)} médicos únicos</b> · ${fmtA(Object.keys(st.REP_MANAGER_MAP || {}).length)} visitadores · ${fmtA(new Set(Object.values(st.REP_MANAGER_MAP || {})).size)} distritos (compáralo con el CRM)`)
                  : fila('aviso', 'No hay fichero en uso', 'Sin fichero no se sabe qué médicos atiende cada visitador.'),
        fila(e.sinFichero ? 'info' : 'ok', `${fmtA(e.sinFichero)} médicos con recetas no están en el fichero`, 'Están en CloseUp pero ningún visitador los tiene asignados.'),
        fila('info', `${fmtA(Math.max(0, (e.fichados || 0) - (e.conRx || 0)))} médicos del fichero sin recetas en CloseUp`, 'Con los filtros elegidos ahora (mercados, productos).'),
        fila(cruces ? 'aviso' : 'ok', `${fmtA(cruces)} evaluaciones marcadas como "cruce errado"`, `De ${fmtA(evals.length)} evaluaciones activas. El médico de CloseUp no coincide con el del fichero.`),
        (() => {
            // Fase 12I: evaluaciones de mercados que ya no vienen en la versión de hoy (se conservan, no se borran)
            const hoy = new Set((st.RAW_DATA || []).map(r => r.market));
            const fuera = evals.filter(x => x.mercado && x.mercado !== 'General' && hoy.size && !hoy.has(x.mercado));
            const cuales = [...new Set(fuera.map(x => x.mercado))];
            return fila(fuera.length ? 'info' : 'ok', `${fmtA(fuera.length)} evaluaciones de mercados que no están en la versión de hoy`,
                fuera.length ? `${escA(cuales.slice(0, 4).join(', '))}${cuales.length > 4 ? '…' : ''}. Siguen guardadas y vuelven a verse si el mercado regresa en una carga (o vuelve a la versión anterior).`
                    : 'Todas las evaluaciones son de mercados de la versión de hoy.');
        })(),
        (() => {
            const n = window.App.data.nombresDistintos();
            const distintos = n.filter(x => x.nivel === 'distinto').length, parecidos = n.length - distintos;
            return fila(distintos ? 'aviso' : (parecidos ? 'info' : 'ok'), `${fmtA(distintos)} médicos con la misma matrícula y otro nombre (CloseUp vs fichero)`,
                n.length ? `${fmtA(parecidos)} más con un nombre parecido, por revisar. Puede ser otro médico con esa matrícula o un error en el CRM. · <button type="button" class="font-bold text-blue-700 underline" onclick="App.ajustes.verNombres()">Ver la lista</button>`
                    : 'Los nombres coinciden (sin contar orden, iniciales ni tildes).');
        })(),
        '<li id="ajSaludUsuarios" class="py-3 text-xs text-slate-500">Revisando qué visitadores tienen usuario…</li>',
        '<li id="ajSaludEspacio" class="py-3 text-xs text-slate-500">Revisando el espacio usado en Supabase…</li>'
    ];
    zona.innerHTML = filas.join('');
    window.App.ajustes.renderEspacio();
    try {
        const lista = await window.App.sb.visitadoresConUsuario();
        // Solo los visitadores del fichero de HOY (igual que "Sin acceso" en Usuarios). Los de ficheros
        // anteriores que ya no están no necesitan usuario: se informan aparte.
        const delFichero = window.App.data.lineasDelFichero().porVm;
        const enFichero = (x) => !delFichero.size || delFichero.has(String(x.nombre_sector || '').trim().toUpperCase());
        const activos = lista.filter(x => x.activo && enFichero(x));
        const sin = activos.filter(x => !x.perfiles || !x.perfiles.activo);
        const viejos = lista.filter(x => x.activo && !enFichero(x) && (!x.perfiles || !x.perfiles.activo)).length;
        const li = document.getElementById('ajSaludUsuarios');
        const notaViejos = viejos ? ` <span class="text-slate-400">· ${fmtA(viejos)} de ficheros anteriores sin usuario (ya no están en el de hoy; no hace falta crearles acceso).</span>` : '';
        if (li) li.outerHTML = fila(sin.length ? 'aviso' : 'ok', `${fmtA(sin.length)} de ${fmtA(activos.length)} visitadores del fichero de hoy todavía no tienen usuario`,
            (sin.length ? escA(sin.slice(0, 6).map(x => x.nombre_sector).join(', ') + (sin.length > 6 ? '…' : '')) + ' · <button type="button" class="font-bold text-blue-700 underline" onclick="App.ajustes.irA(\'ajUsuarios\')">Crear sus accesos</button>' : 'Todos pueden entrar.') + notaViejos);
    } catch (err) {
        const li = document.getElementById('ajSaludUsuarios');
        if (li) li.textContent = 'No se pudo revisar los usuarios (¿sin conexión?).';
    }
};

// Lista de nombres distintos (Fase 12I): misma matrícula, otro nombre en CloseUp y en el fichero
window.App.ajustes.verNombres = function() {
    const lista = window.App.data.nombresDistintos();
    const zona = document.getElementById('nombresCuerpo');
    const etiqueta = (n) => n === 'distinto' ? '<span class="usuario-etiqueta aviso">Distinto</span>' : '<span class="usuario-etiqueta">Parecido</span>';
    zona.innerHTML = lista.length ? `<p class="text-xs text-slate-600 mb-3"><b>Distinto</b>: no tienen ninguna palabra en común (probablemente otro médico con esa matrícula, o un error en el CRM).
        <b>Parecido</b>: comparten una sola palabra (puede ser un error de tipeo). El visitador puede marcar "Cruce errado" al evaluar si no es el mismo médico.</p>
        <ul class="divide-y divide-slate-100">${lista.slice(0, 300).map(x => `<li class="py-2 flex items-start gap-2">
            <div class="min-w-0 flex-1"><div class="text-sm text-slate-800"><b>CloseUp:</b> ${escA(x.closeup)} · <b>Fichero:</b> ${escA(x.fichero)}</div>
                <div class="text-[11px] text-slate-500">Matrícula ${escA(x.matricula)} · ${escA(window.App.ui.nombreVisible(x.visitador))}${x.distrito ? ' · ' + escA(x.distrito) : ''} · ${fmtA(x.rx)} Rx</div></div>
            ${etiqueta(x.nivel)}
            <button type="button" class="boton-icono" aria-label="Abrir la ficha" onclick="App.ajustes.cerrarNombres(); App.ficha.abrir(${escA(JSON.stringify(x.id))})"><span class="material-symbols-outlined">open_in_new</span></button></li>`).join('')}</ul>
        ${lista.length > 300 ? `<p class="text-xs text-slate-500 mt-2">Se muestran 300 de ${fmtA(lista.length)}. Descarga la lista completa.</p>` : ''}`
        : '<p class="text-sm text-slate-600">✅ No hay médicos con nombre distinto.</p>';
    document.getElementById('nombresModal').classList.remove('hidden');
};
window.App.ajustes.cerrarNombres = function() { document.getElementById('nombresModal').classList.add('hidden'); };
window.App.ajustes.descargarNombres = function() {
    const celda = (v) => { const t = v == null ? '' : String(v); return /[;"\r\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; };
    const filas = [['Matricula', 'Nombre en CloseUp', 'Nombre en fichero', 'Nivel', 'Visitador', 'Distrito', 'Rx']]
        .concat(window.App.data.nombresDistintos().map(x => [x.matricula, x.closeup, x.fichero, x.nivel === 'distinto' ? 'Distinto' : 'Parecido', x.visitador, x.distrito, x.rx]));
    const url = URL.createObjectURL(new Blob(['\ufeff' + filas.map(f => f.map(celda).join(';')).join('\r\n') + '\r\n'], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url; a.download = `segmentapp-nombres-distintos-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
};

// Espacio usado en Supabase (migración 20): base de datos y archivos guardados, frente al plan gratis
const mbA = (b) => `${fmtA(Math.round((b || 0) / 1048576))} MB`;
window.App.ajustes.renderEspacio = async function() {
    const li = document.getElementById('ajSaludEspacio');
    if (!li) return;
    let e;
    try { e = await window.App.sb.espacio(); }
    catch (err) {
        const m = String((err && err.original && err.original.message) || (err && err.message) || '');
        li.textContent = /admin_espacio|does not exist|could not find/i.test(m) ? 'Espacio usado: falta aplicar la migración 20.' : 'No se pudo revisar el espacio usado (¿sin conexión?).';
        return;
    }
    window.App.avisos._espacio = e;
    const L = window.App.avisos.LIMITES, u = window.App.avisos.usoEspacio(e);
    const barra = (pct, titulo, usado, limite) => {
        const color = pct >= 95 ? 'bg-rose-600' : pct >= 80 ? 'bg-amber-500' : 'bg-green-600';
        return `<div class="mt-2"><div class="flex justify-between text-xs text-slate-700"><span>${titulo}</span><span><b>${mbA(usado)}</b> de ${mbA(limite)} · ${Math.round(pct)}%</span></div>
            <div class="h-2 rounded-full bg-slate-100 overflow-hidden mt-1" role="progressbar" aria-valuenow="${Math.round(pct)}" aria-valuemin="0" aria-valuemax="100" aria-label="${titulo}">
            <div class="h-full ${color} rounded-full" style="width:${Math.min(100, pct).toFixed(1)}%"></div></div></div>`;
    };
    const estado = u.mayor >= 80 ? ['warning', 'text-amber-600'] : ['check_circle', 'text-green-700'];
    li.outerHTML = `<li class="flex gap-3 py-3" id="ajSaludEspacio"><span class="material-symbols-outlined ${estado[1]}">${estado[0]}</span>
        <div class="min-w-0 flex-1"><div class="text-sm font-semibold text-slate-800">Espacio en Supabase (plan gratis)</div>
            ${barra(u.base, 'Base de datos', e.base_bytes, L.base)}
            ${barra(u.archivos, `Archivos guardados (${fmtA(e.archivos)})`, e.archivos_bytes, L.archivos)}
            <div class="text-[11px] text-slate-500 mt-2">Lo que más ocupa: ${(e.tablas || []).slice(0, 3).map(t => `${escA(t.nombre)} ${mbA(t.bytes)}`).join(' · ')}.
                ${u.mayor >= 80 ? '<b class="text-amber-800">Está cerca del límite: avísame para archivar versiones viejas (sin borrar nada).</b>' : 'Hay espacio de sobra.'}</div></div></li>`;
};

/* ============================================================
   VER LA APP COMO OTRA PERSONA (solo consulta, Fase 9B)
============================================================ */
window.App.ajustes.renderVerComo = function() {
    const st = window.App.state;
    const vm = document.getElementById('ajVerComoVm'), gd = document.getElementById('ajVerComoGd');
    if (!vm || !gd) return;
    const reps = [...(st.FILTER_OPTIONS.Rep || [])].sort();
    const gerentes = [...new Set(Object.values(st.REP_MANAGER_MAP || {}))].filter(Boolean).sort();
    vm.innerHTML = reps.map(r => `<option value="${escA(r)}">${escA(window.App.ui.nombreVisible(r))}</option>`).join('');
    gd.innerHTML = gerentes.map(g => `<option value="${escA(g)}">${escA(g)}</option>`).join('');
};

window.App.ajustes.verComo = function(tipo, nombre) {
    const st = window.App.state;
    if (!nombre || st.rolReal !== 'admin') return;
    if (!st.verComo) {
        st._antesDeVerComo = { REPS: st.REPS_PERMITIDOS, rol: st.currentUserRole, nombre: st.currentVisitadorName, isAdmin: st.isAdmin, solo: st.soloLectura, visitadorId: st.visitadorId };
    }
    const reps = tipo === 'vm' ? [nombre] : Object.keys(st.REP_MANAGER_MAP).filter(r => st.REP_MANAGER_MAP[r] === nombre);
    st.verComo = { tipo, nombre, rol: tipo === 'vm' ? 'vm' : 'gd' };
    st.REPS_PERMITIDOS = new Set(reps);
    st.soloLectura = true;
    st.visitadorId = null;
    if (tipo === 'vm') {
        st.currentUserRole = 'visitador';
        st.currentVisitadorName = nombre;
        st.isAdmin = false;
        window.App.evaluation.armarMapaVisitador((st.ALL_EVALUATIONS || []).filter(e => String(e.visitador || '').trim().toUpperCase() === nombre));
    } else {
        st.currentUserRole = 'admin';
        st.currentVisitadorName = nombre;
        st.isAdmin = true;
    }
    aplicarVista();
    document.getElementById('bannerVerComoNombre').textContent = tipo === 'vm' ? window.App.ui.nombreVisible(nombre) : `GD ${nombre}`;
    document.getElementById('bannerVerComo').classList.remove('hidden');
    window.App.ui.showToast(`Viendo la app como ${tipo === 'vm' ? 'el visitador' : 'el gerente'} ${window.App.ui.nombreVisible(nombre)}.`);
};

window.App.ajustes.salirVerComo = function() {
    const st = window.App.state;
    const a = st._antesDeVerComo;
    if (!st.verComo || !a) return;
    st.verComo = null;
    st.REPS_PERMITIDOS = a.REPS; st.currentUserRole = a.rol; st.currentVisitadorName = a.nombre;
    st.isAdmin = a.isAdmin; st.soloLectura = a.solo; st.visitadorId = a.visitadorId;
    st.EVALUACIONES_VISITADOR = {};
    document.getElementById('bannerVerComo').classList.add('hidden');
    aplicarVista();
    window.App.ux.irA('ajustes');
};

// Vuelve a armar filtros, matriz, navegación y paneles con la vista elegida
function aplicarVista() {
    const st = window.App.state;
    st._lastUniverseSignature = null;
    st.MATRIX_FILTER = null;
    st.FILTRO_RAPIDO = 'todos';
    window.App.filters.populateFilters();
    window.App.matrix.aggregateAndCalculate();
    document.getElementById('adminDashboard')?.classList.toggle('hidden', !st.isAdmin);
    document.getElementById('visitadorDashboard')?.classList.toggle('hidden', st.currentUserRole !== 'visitador');
    window.App.ux.armarNavegacion();
    st.PANTALLA = null;
    window.App.ux.irA('inicio', { historial: false });
}

/* ============================================================
   BITÁCORA DE CAMBIOS (migración 11)
============================================================ */
const NOMBRES_CONFIG = { umbrales_matriz: 'los umbrales de la matriz', umbrales_encuesta: 'los puntajes de la encuesta', ponderacion_encuesta: 'la ponderación de la encuesta', productos_phq: 'los productos del laboratorio', equipos_otc: 'los equipos OTC', nombres_mercado: 'los nombres de mercado', filtros_closeup: 'los filtros de CloseUp', laboratorios_propios: 'mis laboratorios', recordatorio_cargas: 'el recordatorio de carga', instructivos_descarga: 'cómo descargar los datos' };
const ETIQUETAS_UMBRAL = { TH_LOY_LOW: 'Adopción baja hasta', TH_LOY_HIGH: 'Adopción alta desde', TH_POT_LOW: 'Potencial A hasta', TH_POT_HIGH: 'Potencial B hasta' };

function detalleCambio(b) {
    if (b.accion === 'renombrar_mercado') return `${b.despues && b.despues.deshecho ? 'Deshizo el renombre' : 'Renombró el mercado'} ${escA(b.antes && b.antes.nombre)} → <b>${escA(b.despues && b.despues.nombre)}</b>`;
    if (b.accion === 'publicar_version') return `Publicó la versión de ${b.clave === 'fichero' ? 'fichero' : 'recetas'} <b>${escA(b.despues && b.despues.nombre)}</b>`;
    const antes = b.antes || {}, despues = b.despues || {};
    let detalle = '';
    if (b.clave === 'umbrales_matriz' || b.clave === 'umbrales_encuesta') {
        detalle = Object.keys(despues).filter(k => antes[k] !== despues[k])
            .map(k => `${ETIQUETAS_UMBRAL[k] || 'Puntaje ' + k}: ${escA(antes[k])} → <b>${escA(despues[k])}</b>`).join(' · ');
    } else if (Array.isArray(despues) && Array.isArray(antes)) {
        const mas = despues.filter(x => !antes.includes(x)), menos = antes.filter(x => !despues.includes(x));
        detalle = [mas.length ? `agregó ${escA(mas.slice(0, 3).join(', '))}${mas.length > 3 ? '…' : ''}` : '', menos.length ? `quitó ${escA(menos.slice(0, 3).join(', '))}${menos.length > 3 ? '…' : ''}` : ''].filter(Boolean).join(' · ');
    }
    return `Cambió ${NOMBRES_CONFIG[b.clave] || escA(b.clave)}${detalle ? `<div class="text-xs text-slate-600 mt-0.5">${detalle}</div>` : ''}`;
}

window.App.ajustes.cargarBitacora = async function() {
    const zona = document.getElementById('ajBitacoraLista');
    if (!zona) return;
    zona.innerHTML = '<li class="py-3 text-sm text-slate-500">Cargando…</li>';
    try {
        const lista = await window.App.sb.bitacora(30);
        zona.innerHTML = lista.length ? lista.map(b => `<li class="flex gap-3 py-3">
            <span class="material-symbols-outlined ${b.accion === 'publicar_version' ? 'text-blue-700' : 'text-amber-700'}">${b.accion === 'publicar_version' ? 'publish' : b.accion === 'renombrar_mercado' ? 'drive_file_rename_outline' : 'tune'}</span>
            <div class="min-w-0 flex-1"><div class="text-sm text-slate-800">${detalleCambio(b)}</div>
                <div class="text-[11px] text-slate-500 mt-0.5">${escA(b.quien)} · ${new Date(b.hecho_en).toLocaleString('es-VE', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</div></div></li>`).join('')
            : '<li class="py-3 text-sm text-slate-500">Todavía no hay cambios registrados. Desde hoy se anota cada cambio.</li>';
    } catch (e) {
        zona.innerHTML = `<li class="py-3 text-sm text-slate-500">${/does not exist|bitacora_reciente|desconocida/i.test(String(e && e.message)) ? 'Falta aplicar la migración 11 en Supabase.' : 'No se pudo leer la bitácora (¿sin conexión?).'}</li>`;
    }
};

console.log('[SegmentApp] ajustes.js cargado.');

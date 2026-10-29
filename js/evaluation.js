/* ============================================================
   SegmentApp - Modal de Evaluación y Encuesta
   Archivo: js/evaluation.js
   Responsable de:
   - Abrir/cerrar el modal de evaluación
   - Cargar encuesta por mercado (pre-llenado si existe)
   - Seleccionar cuadrante subjetivo
   - Guardar evaluación en Supabase o en cola offline
   - Traer evaluaciones desde Firestore (visitador y admin)
   - Dashboard de progreso del visitador
============================================================ */

window.App = window.App || {};
window.App.evaluation = {};

/* ============================================================
   TRAER EVALUACIONES DEL VISITADOR
   - Muestra al instante la copia guardada en el dispositivo
   - Luego trae de Supabase SOLO las suyas (las reglas de la base
     no le dejan ver las de otros) y actualiza la copia
============================================================ */
window.App.evaluation.armarMapaVisitador = function(lista) {
    const st = window.App.state;
    st.EVALUACIONES_VISITADOR = {};
    lista.forEach(data => {
        const key = window.App.data.normalizeKey(data.medico_id);
        if (!st.EVALUACIONES_VISITADOR[key]) st.EVALUACIONES_VISITADOR[key] = {};
        st.EVALUACIONES_VISITADOR[key][data.mercado || 'General'] = data;
    });
};

window.App.evaluation.fetchEvaluacionesYCalcular = async function() {
    const st = window.App.state;
    const ui = window.App.ui;
    const refrescar = () => {
        window.App.filters.resetPaginationAndRender();
        window.App.matrix.aggregateAndCalculate();
    };
    if (st.currentUserRole !== 'visitador') { refrescar(); return; }

    const cacheKey = `VISITADOR_EVALS_${st.visitadorId || st.currentVisitadorName}`;
    try {
        const enCache = window.localforage ? (await localforage.getItem(cacheKey)) || [] : [];
        if (enCache.length) { window.App.evaluation.armarMapaVisitador(enCache); refrescar(); }

        const propias = await window.App.sb.evaluaciones();
        window.App.evaluation.armarMapaVisitador(propias);
        if (window.localforage) await localforage.setItem(cacheKey, propias);
        refrescar();
    } catch (e) {
        console.error('[SegmentApp] Error cargando evaluaciones visitador:', e);
        ui.showToast('Sin conexión con el servidor. Se muestran tus datos guardados en este dispositivo.');
        refrescar();
    }
};


/* ============================================================
   OBTENER EVALUACIONES DE UN MÉDICO (según rol)
============================================================ */
window.App.evaluation.getEvaluationsForDoc = function(docId) {
    const st = window.App.state;
    const d  = window.App.data;
    if (st.currentUserRole === 'visitador') {
        const evMap = st.EVALUACIONES_VISITADOR[d.normalizeKey(docId)];
        return evMap ? Object.values(evMap) : [];
    } else {
        // Índice por médico; se reconstruye solo si cambia la lista de evaluaciones
        const idx = window.App.evaluation._adminIndex;
        if (!idx || idx.source !== st.ALL_EVALUATIONS || idx.length !== st.ALL_EVALUATIONS.length) {
            const byDoc = new Map();
            st.ALL_EVALUATIONS.forEach(e => {
                const k = d.normalizeKey(e.medico_id);
                if (!byDoc.has(k)) byDoc.set(k, []);
                byDoc.get(k).push(e);
            });
            window.App.evaluation._adminIndex = { source: st.ALL_EVALUATIONS, length: st.ALL_EVALUATIONS.length, byDoc };
        }
        return window.App.evaluation._adminIndex.byDoc.get(d.normalizeKey(docId)) || [];
    }
};
/* ============================================================
   TRAER TODAS LAS EVALUACIONES (vista de equipo)
   admin y Gte. Nacional reciben todas; el GD, solo las de su
   distrito (lo decide la base con sus reglas por fila).
============================================================ */
window.App.evaluation.fetchAllEvaluacionesAdmin = async function() {
    const st = window.App.state;
    const ui = window.App.ui;
    const refrescar = () => {
        if (typeof renderAdminDashboard === 'function') renderAdminDashboard();
        window.App.filters.resetPaginationAndRender();
    };
    if (!st.isAdmin) { refrescar(); return; }

    const CACHE_KEY = 'EQUIPO_EVALS_CACHE';
    try {
        const enCache = window.localforage ? (await localforage.getItem(CACHE_KEY)) || [] : [];
        if (enCache.length) { st.ALL_EVALUATIONS = enCache; refrescar(); }

        st.ALL_EVALUATIONS = await window.App.sb.evaluaciones();
        st._lastUniverseSignature = null;
        if (window.localforage) await localforage.setItem(CACHE_KEY, st.ALL_EVALUATIONS);
        console.log(`[SegmentApp] ${st.ALL_EVALUATIONS.length} evaluaciones del equipo.`);
        refrescar();
        window.App.matrix.aggregateAndCalculate();
    } catch (e) {
        console.error('[SegmentApp] Error en sincronización:', e);
        ui.showToast('Sin conexión con el servidor. Se muestran los datos guardados en este dispositivo.');
        refrescar();
    }
};

/* ============================================================
   ABRIR MODAL DE EVALUACIÓN
============================================================ */
window.App.evaluation.openEvalModal = function(docId, docName) {
    const st = window.App.state;
    const d  = window.App.data;
    const doc = st.PROCESSED_DATA.find(x => d.normalizeKey(x.id) === d.normalizeKey(docId));
    if (!doc) return;

    const docKey = d.normalizeKey(docId);

    // Set evalDocId PRIMERO (lo necesita toggleCruceErradoMode para buscar el fichero)
    document.getElementById('evalDocId').value = docKey;
    window.App.ui.safeSetText('evalModalDocName', docName);

    // Pedido 2 — Persistencia: si ALGUNA evaluación previa de este médico tiene cruceErrado=true,
    // auto-activar el modo para mantener consistencia entre todos los mercados.
    const docEvalsMap = st.EVALUACIONES_VISITADOR[docKey] || {};
    const prevCruceErrado = Object.values(docEvalsMap).find(ev => ev && ev.cruceErrado === true);
    if (prevCruceErrado) {
        // Auto-activar con fallback al nombre guardado (por si los datos del fichero cambiaron)
        window.App.evaluation.toggleCruceErradoMode(true, {
            silent: true,
            fallbackName: prevCruceErrado.nombreFichero || null
        });
    } else {
        window.App.evaluation.toggleCruceErradoMode(false);
    }

    const globalMarkets = st.FILTER_OPTIONS['Market'] || [];
    const marketSelect = document.getElementById('evalMarketSelect');
    marketSelect.innerHTML = '<option value="">Seleccione un mercado...</option>';
    globalMarkets.forEach(m => {
        const markText = docEvalsMap[m] ? ' ✅ Evaluado' : '';
        marketSelect.innerHTML += `<option value="${m}">${m}${markText}</option>`;
    });
    if (globalMarkets.length === 1) {
        marketSelect.value = globalMarkets[0];
    } else {
        marketSelect.value = "";
    }
    window.App.evaluation.loadEvalForMarket();
    document.getElementById('evalModal').classList.remove('hidden');
    if (window.App.ux) window.App.ux.alAbrirEvaluacion(docKey);
};

/* ============================================================
   CARGAR ENCUESTA DEL MERCADO SELECCIONADO
   - Pre-llena Q1 y Q5 desde cualquier evaluación previa (globales)
   - Carga Q2, Q3, Q4 y cuadrante desde el mercado actual
============================================================ */
window.App.evaluation.loadEvalForMarket = function() {
    const st = window.App.state;
    const d  = window.App.data;
    const docId = document.getElementById('evalDocId').value;
    const selectedMarket = document.getElementById('evalMarketSelect').value;

    // Limpiar estado visual
    document.querySelectorAll('.eval-btn').forEach(btn => {
        btn.classList.remove('ring-4', 'ring-offset-2', 'ring-indigo-500', 'scale-105', 'z-10');
        btn.style.opacity = "1";
    });
    document.getElementById('evalSelectedQuadrant').value = "";
    document.getElementById('evalNotas').value = "";
    document.getElementById('surveyQ1').value = "";
    document.getElementById('surveyQ2').value = "";
    document.getElementById('surveyQ3').value = "";
    document.getElementById('surveyQ4').value = "";
    document.getElementById('surveyQ5').value = "";

    const docEvalsMap = st.EVALUACIONES_VISITADOR[d.normalizeKey(docId)] || {};

    // Pre-cargar datos globales (Q1 y Q5) de cualquier evaluación previa
    let globalQ1 = "", globalQ5 = "";
    for (const mkt in docEvalsMap) {
        if (docEvalsMap[mkt].survey) {
            if (docEvalsMap[mkt].survey.q1) globalQ1 = docEvalsMap[mkt].survey.q1;
            if (docEvalsMap[mkt].survey.q5) globalQ5 = docEvalsMap[mkt].survey.q5;
        }
    }
    document.getElementById('surveyQ1').value = globalQ1;
    document.getElementById('surveyQ5').value = globalQ5;
    const sincronizar = () => { if (window.App.ux) window.App.ux.sincronizarEvaluacion(); };

    // Si no hay mercado seleccionado, salir (no hay datos específicos que cargar)
    if (!selectedMarket) { sincronizar(); return; }

    if (docEvalsMap[selectedMarket]) {
        const prev = docEvalsMap[selectedMarket];
        document.getElementById('evalNotas').value = prev.notas || "";
        for (const btn of document.querySelectorAll('.eval-btn')) {
            if (btn.innerText.includes(prev.cuadrante)) {
                window.App.evaluation.selectEvalQuadrant(btn, prev.cuadrante);
                break;
            }
        }
        if (prev.survey) {
            document.getElementById('surveyQ2').value = prev.survey.q2 || "";
            document.getElementById('surveyQ3').value = prev.survey.q3 || "";
            document.getElementById('surveyQ4').value = prev.survey.q4 || "";
        }
    }
    sincronizar();
};

/* ============================================================
   CERRAR MODAL DE EVALUACIÓN
============================================================ */
window.App.evaluation.closeEvalModal = function() {
    document.getElementById('evalModal').classList.add('hidden');
    document.getElementById('evalFirebaseId').value = "";
    document.getElementById('evalRepName').value = "";
};

/* ============================================================
   SELECCIONAR CUADRANTE SUBJETIVO
============================================================ */
window.App.evaluation.selectEvalQuadrant = function(element, quadrant) {
    document.getElementById('evalSelectedQuadrant').value = quadrant;
    document.querySelectorAll('.eval-btn').forEach(btn => {
        btn.classList.remove('ring-4', 'ring-offset-2', 'ring-indigo-500', 'scale-105', 'z-10');
        btn.style.opacity = "0.5";
    });
    element.classList.add('ring-4', 'ring-offset-2', 'ring-indigo-500', 'scale-105', 'z-10');
    element.style.opacity = "1";
};

/* ============================================================
   GUARDAR EVALUACIÓN (Supabase o cola sin conexión)
============================================================ */
window.App.evaluation.saveEvaluation = async function() {
    const st = window.App.state;
    const ui = window.App.ui;

    const docId           = document.getElementById('evalDocId').value;
    const selectedMarket  = document.getElementById('evalMarketSelect').value;
    const quadrant        = document.getElementById('evalSelectedQuadrant').value;
    const notas           = document.getElementById('evalNotas').value.trim();
    const q1 = document.getElementById('surveyQ1').value;
    const q2 = document.getElementById('surveyQ2').value;
    const q3 = document.getElementById('surveyQ3').value;
    const q4 = document.getElementById('surveyQ4').value.trim();
    const q5 = document.getElementById('surveyQ5').value;

// --- Validaciones visuales (resaltado + scroll + toast) ---
    const flashError = (elementId, message) => {
        // Si la pregunta se responde con botones, se resalta el grupo de botones
        const el = document.getElementById(elementId + '_chips') || document.getElementById(elementId);
        if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            const originalStyle = el.style.cssText;
            el.style.cssText = originalStyle + 'border: 2px solid #ba1a1a !important; box-shadow: 0 0 0 4px rgba(186, 26, 26, 0.16) !important; background-color: #fff0ee !important;';
            setTimeout(() => { el.style.cssText = originalStyle; }, 3000);
        }
        ui.showToast(message);
    };

    if (!selectedMarket) {
        flashError('evalMarketSelect', '⚠️ Debes seleccionar un mercado para continuar');
        return;
    }
    const faltaMedico = (id, msg) => { if (window.App.ux) window.App.ux.editarDatosMedico(true); flashError(id, msg); };
    if (!q1) { faltaMedico('surveyQ1', 'Falta: pacientes por semana'); return; }
    if (!q5) { faltaMedico('surveyQ5', 'Falta: costo de la consulta'); return; }
    const faltaMercado = (id, msg) => { if (window.App.ux) window.App.ux.editarDatosMercado(true); flashError(id, msg); };
    if (!q2) { faltaMercado('surveyQ2', 'Falta: pacientes con esta clase terapéutica'); return; }
    if (!q3) { faltaMercado('surveyQ3', 'Falta: pacientes con nuestro producto'); return; }
    if (!quadrant) {
        flashError('evalGrid', 'Falta: elige tu clasificación');
        return;
    }
    if (!notas) {
        flashError('evalNotas', 'Falta: cuéntanos por qué (es obligatorio)');
        return;
    }

    const btnSave = document.getElementById('btnSaveEval');
    btnSave.disabled = true;
    btnSave.innerHTML = '<span class="material-symbols-outlined animate-spin-reverse">sync</span> Guardando...';

    try {
        if (st.soloLectura) throw new Error("Tu rol es de solo consulta.");
        const adminEvalId = document.getElementById('evalFirebaseId').value;
        const previa = st.isAdmin
            ? st.ALL_EVALUATIONS.find(e => e.firebaseId === adminEvalId)
            : (st.EVALUACIONES_VISITADOR[docId] || {})[selectedMarket];
        const visitadorId = st.isAdmin ? (previa && previa.visitador_id) : st.visitadorId;
        if (!visitadorId) throw new Error("No se encontró el visitador de esta evaluación.");

        const sanitizedNotas = notas.replace(/</g, "&lt;").replace(/>/g, "&gt;");
        // Cruce Errado — leer estado actual del modal
        const isCruceErrado = document.getElementById('evalModal').dataset.cruceErrado === 'true';
        const nombreFichero = isCruceErrado ? window.App.evaluation.getFicheroNameForDoc(docId) : null;
        let payload = {
            id:            previa ? previa.id : undefined,
            firebaseId:    previa ? previa.firebaseId : undefined,
            visitador_id:  visitadorId,
            visitador:     previa ? previa.visitador : st.currentVisitadorName,
            medico_id:     docId,
            medico_name:   document.getElementById('evalModalDocName').innerText,
            mercado:       selectedMarket,
            cuadrante:     quadrant,
            notas:         sanitizedNotas,
            survey:        { q1, q2, q3, q4, q5 },
            timestamp:     new Date().toISOString(),
            _user_role:    st.rolReal,
            cruceErrado:   isCruceErrado,
            nombreFichero: nombreFichero
        };

        payload = await window.App.evaluation.guardarOEncolar(payload, "Evaluación guardada correctamente.");

        // --- Actualizar memoria local ---
        if (!st.isAdmin) {
            if (!st.EVALUACIONES_VISITADOR[docId]) st.EVALUACIONES_VISITADOR[docId] = {};
            st.EVALUACIONES_VISITADOR[docId][selectedMarket] = payload;

            // Propagar Q1 y Q5 a otros mercados ya evaluados del mismo médico
            for (const mkt in st.EVALUACIONES_VISITADOR[docId]) {
                const otra = st.EVALUACIONES_VISITADOR[docId][mkt];
                if (mkt !== selectedMarket && otra.survey && (otra.survey.q1 !== q1 || otra.survey.q5 !== q5)) {
                    otra.survey.q1 = q1;
                    otra.survey.q5 = q5;
                    window.App.evaluation.guardarOEncolar(otra, null)
                        .then(guardada => { st.EVALUACIONES_VISITADOR[docId][mkt] = guardada; })
                        .catch(e => console.error('[SegmentApp] No se pudo actualizar otro mercado:', e));
                }
            }
            if (window.localforage) {
                const todas = Object.values(st.EVALUACIONES_VISITADOR).flatMap(m => Object.values(m));
                localforage.setItem(`VISITADOR_EVALS_${st.visitadorId || st.currentVisitadorName}`, todas);
            }
        }
   if (st.isAdmin) {
            // Admin: cerrar modal inmediatamente (modo edición)
            window.App.evaluation.closeEvalModal();
            // En lugar de re-leer todo desde Firestore (lecturas costosas),
            // actualizamos el array en memoria con el payload local
            const existingIdx = st.ALL_EVALUATIONS.findIndex(e => e.firebaseId === adminEvalId);
            if (existingIdx >= 0) st.ALL_EVALUATIONS[existingIdx] = payload;
            else st.ALL_EVALUATIONS.push(payload);
            if (window.localforage) localforage.setItem('EQUIPO_EVALS_CACHE', st.ALL_EVALUATIONS);
            // Re-renderizar sin tocar Firestore
            if (typeof renderAdminDashboard === 'function') renderAdminDashboard();
            window.App.filters.resetPaginationAndRender();
            // Invalidar cache de universo para que tome la nueva eval
            st._lastUniverseSignature = null;
        } else {
            // Visitador: actualizar UI primero (NO cerrar modal todavía)
            window.App.filters.resetPaginationAndRender();
            // Invalidar cache de universo (la eval afecta clasificaciones)
            st._lastUniverseSignature = null;
            window.App.matrix.aggregateAndCalculate();
            const totF = parseInt(document.getElementById('visTotalFichero').innerText.replace(/\./g, '')) || 0;
            const totC = parseInt(document.getElementById('visTotalCruzados').innerText.replace(/\./g, '')) || 0;
            window.App.evaluation.updateVisitadorDashboard(totF, totC);
            // Pedido 1: Ofrecer continuar con otro mercado del mismo médico, o cerrar si terminó
            window.App.evaluation.continueOrCloseAfterSave();
        }
      
    } catch (e) {
        console.error('[SegmentApp] Error al guardar evaluación:', e);
        ui.showToast(e && /solo consulta|visitador de esta/i.test(e.message) ? e.message : "Hubo un error al guardar. Intenta de nuevo.");
} finally {
        btnSave.disabled = false;
        // Pedido 2: respetar el modo Cruce Errado al restaurar el botón
        window.App.evaluation.updateSaveButtonLabel();
    }
};

/* ============================================================
   GUARDAR EN SUPABASE, O EN LA COLA SI NO HAY CONEXIÓN
   Devuelve la evaluación (con su id si ya quedó en el servidor).
============================================================ */
window.App.evaluation.guardarOEncolar = async function(evaluacion, mensajeOk) {
    const st = window.App.state;
    const ui = window.App.ui;
    const encolar = async () => {
        st.OFFLINE_QUEUE.push({ tipo: 'evaluacion', evaluacion });
        if (window.localforage) await localforage.setItem('OFFLINE_QUEUE', st.OFFLINE_QUEUE);
        if (mensajeOk) ui.showToast("Sin conexión: evaluación guardada en este dispositivo. Se subirá sola al volver internet.");
        return evaluacion;
    };
    if (!navigator.onLine) return encolar();
    try {
        const guardada = await window.App.sb.guardarEvaluacion(evaluacion);
        if (mensajeOk) ui.showToast(mensajeOk);
        return guardada;
    } catch (e) {
        // Falla de red: no se pierde, queda en la cola
        if (/failed to fetch|network|load failed/i.test(String(e && (e.original && e.original.message || e.message)))) return encolar();
        throw e;
    }
};

/* ============================================================
   DASHBOARD DE PROGRESO DEL VISITADOR
============================================================ */
window.App.evaluation.updateVisitadorDashboard = function(totalFichero, totalCruzados) {
    const st = window.App.state;
    const ui = window.App.ui;
    ui.safeSetText('visTotalFichero',  ui.formatNumber(totalFichero));
    ui.safeSetText('visTotalCruzados', ui.formatNumber(totalCruzados));

    const pctCruzados = totalFichero > 0 ? (totalCruzados / totalFichero) * 100 : 0;
    const barCruz = document.getElementById('visBarCruzados');
    if (barCruz) barCruz.style.width = `${pctCruzados}%`;

    const evaluados = Object.keys(st.EVALUACIONES_VISITADOR).length;
    ui.safeSetText('visTotalEvaluados', ui.formatNumber(evaluados) + "");

    const pctEvaluados = totalFichero > 0 ? (evaluados / totalFichero) * 100 : 0;
    const barEval = document.getElementById('visBarEvaluados');
    if (barEval) barEval.style.width = `${pctEvaluados}%`;
    ui.safeSetText('visPctEvaluados', `${ui.formatNumber(pctEvaluados, 0)}%`);
    const anillo = document.getElementById('anilloProgreso');
    if (anillo) anillo.style.setProperty('--p', Math.min(100, pctEvaluados).toFixed(1));
};

/* ============================================================
   ALIAS GLOBALES
============================================================ */
window.fetchEvaluacionesYCalcular  = window.App.evaluation.fetchEvaluacionesYCalcular;
window.fetchAllEvaluacionesAdmin   = window.App.evaluation.fetchAllEvaluacionesAdmin;
window.getEvaluationsForDoc        = window.App.evaluation.getEvaluationsForDoc;
window.openEvalModal               = window.App.evaluation.openEvalModal;
window.loadEvalForMarket           = window.App.evaluation.loadEvalForMarket;
window.closeEvalModal              = window.App.evaluation.closeEvalModal;
window.selectEvalQuadrant          = window.App.evaluation.selectEvalQuadrant;
window.saveEvaluation              = window.App.evaluation.saveEvaluation;
window.updateVisitadorDashboard    = window.App.evaluation.updateVisitadorDashboard;

/* ============================================================
   CONTINUAR EVALUANDO O CERRAR (Pedido 1: multi-mercado)
   Después de guardar, muestra un banner verde prominente
   dentro del modal indicando qué mercado se guardó y cuál
   sigue. Auto-scroll al top para que sea imposible no verlo.
============================================================ */
window.App.evaluation.continueOrCloseAfterSave = function() {
    const st = window.App.state;
    const marketSelect = document.getElementById('evalMarketSelect');

    // Capturar el mercado recién guardado ANTES de cambiar el dropdown
    const savedMarket = marketSelect.value;

    // "Guardar y siguiente": pasar directo al próximo médico pendiente
    if (st._irAlSiguiente) {
        st._irAlSiguiente = false;
        window.App.evaluation.closeEvalModal();
        if (window.App.ux) window.App.ux.abrirSiguientePendiente(document.getElementById('evalDocId').value, savedMarket);
        return;
    }

    const docId = document.getElementById('evalDocId').value;
    const allMarkets = st.FILTER_OPTIONS['Market'] || [];
    const docEvalsMap = st.EVALUACIONES_VISITADOR[normalizeKey(docId)] || {};
    const pendingMarkets = allMarkets.filter(m => !docEvalsMap[m]);

    // Scroll al top del modal ANTES de mostrar el banner (clave para que se vea)
    const modalBody = document.querySelector('#evalModal .overflow-y-auto');
    if (modalBody) modalBody.scrollTop = 0;

    if (pendingMarkets.length === 0) {
        // Todos los mercados evaluados: banner final + cerrar
        showSaveBanner({ savedMarket: savedMarket, allDone: true });
        setTimeout(() => window.App.evaluation.closeEvalModal(), 2500);
        return;
    }

    const nextMarket = pendingMarkets[0];
    const pendingCount = pendingMarkets.length;

    // Refrescar dropdown con marcas ✅ actualizadas
    marketSelect.innerHTML = '<option value="">Seleccione un mercado...</option>';
    allMarkets.forEach(m => {
        const markText = docEvalsMap[m] ? ' ✅ Evaluado' : '';
        marketSelect.innerHTML += `<option value="${m}">${m}${markText}</option>`;
    });

    // Auto-seleccionar el siguiente mercado pendiente y cargar form
    marketSelect.value = nextMarket;
    window.App.evaluation.loadEvalForMarket();
    if (window.App.ux) window.App.ux.alAbrirEvaluacion(normalizeKey(docId));

    // Mostrar banner prominente
    showSaveBanner({
        savedMarket: savedMarket,
        nextMarket: nextMarket,
        pendingCount: pendingCount,
        allDone: false
    });

    // Resaltar visualmente el mercado que sigue
    const chipsMercado = document.getElementById('evalMarketSelect_chips') || marketSelect;
    chipsMercado.classList.add('ring-2', 'ring-emerald-400', 'rounded-xl');
    setTimeout(() => chipsMercado.classList.remove('ring-2', 'ring-emerald-400', 'rounded-xl'), 2000);
};

/* ------------------------------------------------------------
   Helper interno: banner verde prominente dentro del modal.
   Inyecta sus propios estilos la primera vez que se llama.
------------------------------------------------------------ */
function showSaveBanner({ savedMarket, nextMarket, pendingCount, allDone }) {
    // Inyectar estilos una sola vez
    if (!document.getElementById('saveBannerStyles')) {
        const style = document.createElement('style');
        style.id = 'saveBannerStyles';
        style.textContent = `
            @keyframes saveBannerIn {
                0%   { opacity: 0; transform: translateY(-14px) scale(0.94); }
                55%  { opacity: 1; transform: translateY(0) scale(1.03); }
                100% { opacity: 1; transform: translateY(0) scale(1); }
            }
            @keyframes saveBannerOut {
                0%   { opacity: 1; transform: translateY(0); }
                100% { opacity: 0; transform: translateY(-8px); }
            }
            #saveSuccessBanner {
                position: sticky;
                top: 0;
                z-index: 50;
                margin: 0 0 16px 0;
                padding: 14px 18px;
                background: #146c3c;
                color: #ffffff;
                border-radius: 16px;
                box-shadow: 0 1px 3px 0 rgba(0,0,0,.15), 0 4px 8px 3px rgba(0,0,0,.10);
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 12px;
                animation: saveBannerIn var(--md-motion-long) var(--md-ease-emphasized);
            }
            #saveSuccessBanner.is-hiding {
                animation: saveBannerOut var(--md-motion-medium) var(--md-ease-exit) forwards;
            }
            #saveSuccessBanner .sb-text  { flex: 1; line-height: 1.45; }
            #saveSuccessBanner .sb-saved { font-size: 15px; font-weight: 700; letter-spacing: 0.2px; }
            #saveSuccessBanner .sb-next  { font-size: 13px; opacity: 0.95; margin-top: 3px; }
            #saveSuccessBanner .sb-btn {
                background: rgba(255,255,255,0.22);
                border: 1px solid rgba(255,255,255,0.45);
                color: white;
                padding: 7px 16px;
                border-radius: 9999px;
                font-size: 13px;
                font-weight: 600;
                cursor: pointer;
                transition: background var(--md-motion-short) var(--md-ease-standard), transform var(--md-motion-short) var(--md-ease-standard);
                white-space: nowrap;
            }
            #saveSuccessBanner .sb-btn:hover  { background: rgba(255,255,255,0.34); }
            #saveSuccessBanner .sb-btn:active { transform: scale(0.96); }
        `;
        document.head.appendChild(style);
    }

    // Quitar banner previo si existe (evita duplicados si se guarda rápido varias veces)
    const existing = document.getElementById('saveSuccessBanner');
    if (existing) existing.remove();

    const banner = document.createElement('div');
    banner.id = 'saveSuccessBanner';

    if (allDone) {
        banner.innerHTML = `
            <div class="sb-text">
                <div class="sb-saved">✅ ${savedMarket} guardado</div>
                <div class="sb-next">🎉 ¡Todos los mercados de este médico fueron evaluados!</div>
            </div>
        `;
    } else {
        const pendingTxt = pendingCount === 1
            ? '(último mercado pendiente)'
            : `(${pendingCount} mercados pendientes)`;
        banner.innerHTML = `
            <div class="sb-text">
                <div class="sb-saved">✅ ${savedMarket} guardado</div>
                <div class="sb-next">Continúa con <strong>${nextMarket}</strong> ${pendingTxt}</div>
            </div>
            <button class="sb-btn" id="saveBannerEndBtn" type="button">Terminar</button>
        `;
    }

    // Insertar al inicio del cuerpo del modal (sticky top, siempre visible)
    const modalBody = document.querySelector('#evalModal .overflow-y-auto');
    if (modalBody) {
        modalBody.insertBefore(banner, modalBody.firstChild);
    }

    // Wire botón Terminar
    const endBtn = document.getElementById('saveBannerEndBtn');
    if (endBtn) {
        endBtn.addEventListener('click', () => {
            banner.classList.add('is-hiding');
            setTimeout(() => window.App.evaluation.closeEvalModal(), 280);
        });
    }

    // Auto-ocultar a los 5s (solo cuando hay continuación; el allDone cierra el modal)
    if (!allDone) {
        setTimeout(() => {
            const b = document.getElementById('saveSuccessBanner');
            if (b) {
                b.classList.add('is-hiding');
                setTimeout(() => b.remove(), 300);
            }
        }, 5000);
    }
}
/* ============================================================
   PEDIDO 2 — CRUCE ERRADO (visitador)
   Permite marcar evaluaciones donde la matrícula de Closeup
   no coincide con la del fichero del visitador. Auto-rellena
   el nombre que tiene el fichero (no es texto libre).
============================================================ */

// Devuelve el nombre del médico tal como aparece en el fichero del visitador actual.
// Los datos del fichero están en doc.ficheroData (array, un item por asesor que lo tiene fichado).
// Prioriza la entrada que corresponde al visitador logueado; si no la encuentra, toma la primera con Nombre.
window.App.evaluation.getFicheroNameForDoc = function(docId) {
    const st = window.App.state;
    const d  = window.App.data;
    const doc = st.PROCESSED_DATA.find(x => d.normalizeKey(x.id) === d.normalizeKey(docId));
    if (!doc || !Array.isArray(doc.ficheroData) || doc.ficheroData.length === 0) return null;

    const currentVisitor = (st.currentVisitadorName || '').toUpperCase().trim();

    // 1) Intentar primero la entrada del visitador actual (match por "Nombre del sector")
    let entry = doc.ficheroData.find(f =>
        f && f['Nombre del sector'] &&
        String(f['Nombre del sector']).toUpperCase().trim() === currentVisitor
    );

    // 2) Fallback: primera entrada con Nombre (útil para admin o casos sin match exacto)
    if (!entry) {
        entry = doc.ficheroData.find(f => f && f.Nombre);
    }

    return entry && entry.Nombre ? String(entry.Nombre).trim() : null;
};

// Activar/desactivar el modo Cruce Errado dentro del modal.
// opts.silent: true → no muestra alert si no encuentra ficheroName (para auto-activación)
// opts.fallbackName: string → nombre a usar si getFicheroNameForDoc retorna null
window.App.evaluation.toggleCruceErradoMode = function(activate, opts) {
    opts = opts || {};
    const modal           = document.getElementById('evalModal');
    const banner          = document.getElementById('cruceErradoBanner');
    const btnCruceErrado  = document.getElementById('btnCruceErrado');
    const ficheroNameSpan = document.getElementById('cruceErradoFicheroName');
    if (!modal || !banner || !btnCruceErrado) return;

    if (activate) {
        const docId = document.getElementById('evalDocId').value;
        // Intentar primero leer el nombre del fichero actual; si falla, usar fallback
        let ficheroName = window.App.evaluation.getFicheroNameForDoc(docId);
        if (!ficheroName && opts.fallbackName) {
            ficheroName = opts.fallbackName;
        }
        if (!ficheroName) {
            if (!opts.silent) {
                alert("⚠️ No se encontró el nombre de este médico en el fichero.\n\nEste médico aparece en Closeup pero no tiene un registro en el fichero del visitador con su matrícula.");
            }
            return;
        }
        modal.dataset.cruceErrado = 'true';
        if (ficheroNameSpan) ficheroNameSpan.textContent = ficheroName;
        banner.classList.remove('hidden');
        btnCruceErrado.classList.add('hidden');
        const modalBody = modal.querySelector('.overflow-y-auto');
        if (modalBody) modalBody.scrollTop = 0;
    } else {
        delete modal.dataset.cruceErrado;
        banner.classList.add('hidden');
        btnCruceErrado.classList.remove('hidden');
    }
    window.App.evaluation.updateSaveButtonLabel();
};

// Refresca color y texto del botón Guardar según el modo activo.
window.App.evaluation.updateSaveButtonLabel = function() {
    const btnSave = document.getElementById('btnSaveEval');
    if (!btnSave) return;
    const isCruceErrado = document.getElementById('evalModal').dataset.cruceErrado === 'true';
    btnSave.classList.toggle('bg-rose-600', isCruceErrado);
    btnSave.classList.toggle('text-white', isCruceErrado);
    btnSave.classList.toggle('bg-blue-50', !isCruceErrado);
    btnSave.classList.toggle('text-blue-800', !isCruceErrado);
    btnSave.innerHTML = isCruceErrado
        ? '<span class="material-symbols-outlined text-[18px]">block</span> Confirmar Cruce Errado'
        : '<span class="material-symbols-outlined text-[18px]">save</span> Guardar';
};
console.log('[SegmentApp] evaluation.js cargado.');

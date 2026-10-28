/* ============================================================
   SegmentApp - Modal de Evaluación y Encuesta
   Archivo: js/evaluation.js
   Responsable de:
   - Abrir/cerrar el modal de evaluación
   - Cargar encuesta por mercado (pre-llenado si existe)
   - Seleccionar cuadrante subjetivo
   - Guardar evaluación en Firebase o en cola offline
   - Traer evaluaciones desde Firestore (visitador y admin)
   - Dashboard de progreso del visitador
============================================================ */

window.App = window.App || {};
window.App.evaluation = {};

/* ============================================================
   TRAER EVALUACIONES DEL VISITADOR — OPTIMIZADO
   - Caché local instantáneo (0 lecturas en visitas siguientes)
   - Query filtrada SOLO por sus evaluaciones (no descarga las de otros)
   - Sincronización incremental por timestamp
   Reducción esperada: ~98% de lecturas Firebase
============================================================ */
window.App.evaluation.fetchEvaluacionesYCalcular = async function() {
    const st = window.App.state;
    const ui = window.App.ui;

    if (st.currentUserRole !== 'visitador' || !window.firebaseAuth || !window.firebaseAuth.currentUser) {
        window.App.filters.resetPaginationAndRender();
        window.App.matrix.aggregateAndCalculate();
        return;
    }

    const cacheKey = `VISITADOR_EVALS_${st.currentVisitadorName}`;
    const lastSyncKey = `VISITADOR_SYNC_${st.currentVisitadorName}`;

    try {
        // PASO 1: Cargar caché local instantáneamente (0 lecturas Firebase)
        let cachedEvals = [];
        let lastSync = null;

        if (window.localforage) {
            cachedEvals = (await localforage.getItem(cacheKey)) || [];
            lastSync = await localforage.getItem(lastSyncKey);
        }

        // PASO 2: Reconstruir el mapa desde caché (UX rápida)
        if (cachedEvals.length > 0) {
            st.EVALUACIONES_VISITADOR = {};
            cachedEvals.forEach(data => {
                if (!st.EVALUACIONES_VISITADOR[data.medico_id]) {
                    st.EVALUACIONES_VISITADOR[data.medico_id] = {};
                }
                const mkt = data.mercado || 'General';
                st.EVALUACIONES_VISITADOR[data.medico_id][mkt] = data;
            });
            // Renderizar de inmediato con datos cacheados
            window.App.filters.resetPaginationAndRender();
            window.App.matrix.aggregateAndCalculate();
            console.log(`[SegmentApp] Caché visitador cargado: ${cachedEvals.length} evals (sync: ${lastSync || 'nunca'})`);
        }

        // PASO 3: Consultar Firestore SOLO las evaluaciones de este visitador
        const appId = typeof __app_id !== 'undefined' ? __app_id : 'segmentapp-local';
        const { query, where } = await import("https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js");
        const colRef = window.firebaseCollection(
            window.firebaseDb, 'artifacts', appId, 'public', 'data', 'evaluaciones_matriz'
        );

        // Si no hay caché previo, descarga TODAS las del visitador (no las de otros)
        if (cachedEvals.length === 0 || !lastSync) {
            const fullQuery = query(colRef, where('visitador', '==', st.currentVisitadorName));
            const snapshot = await window.firebaseGetDocs(fullQuery);

            const myEvals = [];
            st.EVALUACIONES_VISITADOR = {};
            snapshot.forEach(doc => {
                const data = { firebaseId: doc.id, ...doc.data() };
                myEvals.push(data);
                if (!st.EVALUACIONES_VISITADOR[data.medico_id]) {
                    st.EVALUACIONES_VISITADOR[data.medico_id] = {};
                }
                const mkt = data.mercado || 'General';
                st.EVALUACIONES_VISITADOR[data.medico_id][mkt] = data;
            });

            if (window.localforage) {
                await localforage.setItem(cacheKey, myEvals);
                await localforage.setItem(lastSyncKey, new Date().toISOString());
            }
            console.log(`[SegmentApp] Carga COMPLETA visitador: ${myEvals.length} evaluaciones (${snapshot.size} lecturas — solo las suyas)`);

            window.App.filters.resetPaginationAndRender();
            window.App.matrix.aggregateAndCalculate();
            return;
        }

        // PASO 4: Sincronización incremental — solo lo nuevo desde lastSync
        const incrementalQuery = query(
            colRef,
            where('visitador', '==', st.currentVisitadorName),
            where('timestamp', '>', lastSync)
        );
        const snapshot = await window.firebaseGetDocs(incrementalQuery);

        if (snapshot.empty) {
            console.log(`[SegmentApp] Sin cambios desde ${lastSync}. 0 lecturas adicionales. ✅`);
            if (window.localforage) {
                await localforage.setItem(lastSyncKey, new Date().toISOString());
            }
            return;
        }

        // Mergear cambios
        const updates = [];
        snapshot.forEach(doc => updates.push({ firebaseId: doc.id, ...doc.data() }));
        console.log(`[SegmentApp] Sincronización incremental visitador: ${updates.length} cambios (${snapshot.size} lecturas)`);

        // Aplicar updates en memoria + caché
        const mergedMap = new Map(cachedEvals.map(e => [e.firebaseId, e]));
        updates.forEach(u => mergedMap.set(u.firebaseId, u));
        const merged = Array.from(mergedMap.values());

        // Reconstruir el mapa de evaluaciones
        st.EVALUACIONES_VISITADOR = {};
        merged.forEach(data => {
            if (!st.EVALUACIONES_VISITADOR[data.medico_id]) {
                st.EVALUACIONES_VISITADOR[data.medico_id] = {};
            }
            const mkt = data.mercado || 'General';
            st.EVALUACIONES_VISITADOR[data.medico_id][mkt] = data;
        });

        if (window.localforage) {
            await localforage.setItem(cacheKey, merged);
            await localforage.setItem(lastSyncKey, new Date().toISOString());
        }

        window.App.filters.resetPaginationAndRender();
        window.App.matrix.aggregateAndCalculate();

    } catch (e) {
        console.error('[SegmentApp] Error cargando evaluaciones visitador:', e);
        ui.showToast('Error al sincronizar. Usando datos en caché.');
        window.App.filters.resetPaginationAndRender();
        window.App.matrix.aggregateAndCalculate();
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
   TRAER TODAS LAS EVALUACIONES (modo admin) — CACHÉ INTELIGENTE
   - Carga caché local instantáneo (0 lecturas)
   - Sincroniza SOLO los cambios desde la última visita
   - Reduce drásticamente el consumo de cuota
============================================================ */
window.App.evaluation.fetchAllEvaluacionesAdmin = async function(forceFullReload = false) {
    const st = window.App.state;
    const ui = window.App.ui;

    if (!st.isAdmin || !window.firebaseAuth || !window.firebaseAuth.currentUser) {
        if (typeof renderAdminDashboard === 'function') renderAdminDashboard();
        window.App.filters.resetPaginationAndRender();
        return;
    }

    const CACHE_KEY = 'ADMIN_EVALS_CACHE';
    const LAST_SYNC_KEY = 'ADMIN_EVALS_LAST_SYNC';

    try {
        // PASO 1: Cargar caché local instantáneo
        let cachedEvals = [];
        let lastSync = null;

        if (!forceFullReload && window.localforage) {
            cachedEvals = (await localforage.getItem(CACHE_KEY)) || [];
            lastSync = await localforage.getItem(LAST_SYNC_KEY);
        }

        // PASO 2: Mostrar caché inmediatamente (UX rápida)
        if (cachedEvals.length > 0) {
            st.ALL_EVALUATIONS = cachedEvals;
            if (typeof renderAdminDashboard === 'function') renderAdminDashboard();
            window.App.filters.resetPaginationAndRender();
            console.log(`[SegmentApp] Caché cargado: ${cachedEvals.length} evaluaciones (sync: ${lastSync || 'nunca'})`);
        }

        // PASO 3: Sincronizar SOLO los cambios desde lastSync
        const appId = typeof __app_id !== 'undefined' ? __app_id : 'segmentapp-local';
        const colRef = window.firebaseCollection(
            window.firebaseDb, 'artifacts', appId, 'public', 'data', 'evaluaciones_matriz'
        );

        // Si NO hay caché o se forzó reload → descargar TODO
        if (forceFullReload || cachedEvals.length === 0 || !lastSync) {
            const snapshot = await window.firebaseGetDocs(colRef);
            const allFromServer = [];
            snapshot.forEach(doc => allFromServer.push({ firebaseId: doc.id, ...doc.data() }));

            st.ALL_EVALUATIONS = allFromServer;
            if (window.localforage) {
                await localforage.setItem(CACHE_KEY, allFromServer);
                await localforage.setItem(LAST_SYNC_KEY, new Date().toISOString());
            }
            console.log(`[SegmentApp] Carga COMPLETA desde Firestore: ${allFromServer.length} evaluaciones (${snapshot.size} lecturas)`);

            if (typeof renderAdminDashboard === 'function') renderAdminDashboard();
            window.App.filters.resetPaginationAndRender();
            return;
        }

        // PASO 4: SINCRONIZACIÓN INCREMENTAL (solo nuevos/modificados desde lastSync)
        // Importamos query y where dinámicamente
        const { query, where } = await import("https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js");
        const incrementalQuery = query(colRef, where('timestamp', '>', lastSync));
        const snapshot = await window.firebaseGetDocs(incrementalQuery);

        if (snapshot.empty) {
            console.log(`[SegmentApp] Sin cambios desde ${lastSync}. 0 lecturas adicionales. ✅`);
            // Actualizar lastSync para futuras comparaciones
            if (window.localforage) {
                await localforage.setItem(LAST_SYNC_KEY, new Date().toISOString());
            }
            return;
        }

        // Hay cambios: mergear con el caché existente
        const updates = [];
        snapshot.forEach(doc => updates.push({ firebaseId: doc.id, ...doc.data() }));
        console.log(`[SegmentApp] Sincronización incremental: ${updates.length} evaluaciones nuevas/modificadas (${snapshot.size} lecturas)`);

        // Merge: actualiza existentes, agrega nuevas
        const mergedMap = new Map(cachedEvals.map(e => [e.firebaseId, e]));
        updates.forEach(u => mergedMap.set(u.firebaseId, u));
        const merged = Array.from(mergedMap.values());

        st.ALL_EVALUATIONS = merged;
        if (window.localforage) {
            await localforage.setItem(CACHE_KEY, merged);
            await localforage.setItem(LAST_SYNC_KEY, new Date().toISOString());
        }

        if (typeof renderAdminDashboard === 'function') renderAdminDashboard();
        window.App.filters.resetPaginationAndRender();

    } catch (e) {
        console.error('[SegmentApp] Error en sincronización:', e);
        ui.showToast('Error al sincronizar. Usando datos en caché.');
        if (typeof renderAdminDashboard === 'function') renderAdminDashboard();
        window.App.filters.resetPaginationAndRender();
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

    // Si no hay mercado seleccionado, salir (no hay datos específicos que cargar)
    if (!selectedMarket) return;

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
   GUARDAR EVALUACIÓN (Firebase o cola offline)
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
        const el = document.getElementById(elementId);
        if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            const originalStyle = el.style.cssText;
            el.style.cssText = originalStyle + 'border: 2px solid #ef4444 !important; box-shadow: 0 0 0 4px rgba(239, 68, 68, 0.2) !important; background-color: #fef2f2 !important;';
            setTimeout(() => { el.style.cssText = originalStyle; }, 3000);
        }
        ui.showToast(message);
    };

    if (!selectedMarket) {
        flashError('evalMarketSelect', '⚠️ Debes seleccionar un mercado para continuar');
        return;
    }
    if (!q1) { flashError('surveyQ1', '⚠️ Pregunta 1 sin responder'); return; }
    if (!q5) { flashError('surveyQ5', '⚠️ Pregunta 2 (costo) sin responder'); return; }
    if (!q2) { flashError('surveyQ2', '⚠️ Pregunta 3 sin responder'); return; }
    if (!q3) { flashError('surveyQ3', '⚠️ Pregunta 4 sin responder'); return; }
    if (!quadrant) {
        flashError('evalGrid', '⚠️ Selecciona un cuadrante en la matriz (Paso 2)');
        return;
    }
    if (!notas) {
        flashError('evalNotas', '⚠️ La justificación es obligatoria (Paso 3)');
        return;
    }

    const btnSave = document.getElementById('btnSaveEval');
    btnSave.disabled = true;
    btnSave.innerHTML = '<span class="material-symbols-outlined animate-spin-reverse">sync</span> Guardando...';

    try {
        const appId = typeof __app_id !== 'undefined' ? __app_id : 'segmentapp-local';

        let actualRepName = st.currentVisitadorName;
        const adminRepNameInput = document.getElementById('evalRepName').value;
        if (st.isAdmin && adminRepNameInput) actualRepName = adminRepNameInput;

        // Un visitador solo guarda a su nombre (las reglas de Firestore lo exigen)
        if (!st.isAdmin && actualRepName !== st.currentVisitadorName) {
            throw new Error("Violación de seguridad de sesión.");
        }

const sanitizedNotas = notas.replace(/</g, "&lt;").replace(/>/g, "&gt;");
        // Pedido 2: Cruce Errado — leer estado actual del modal
        const isCruceErrado = document.getElementById('evalModal').dataset.cruceErrado === 'true';
        const nombreFichero = isCruceErrado ? window.App.evaluation.getFicheroNameForDoc(docId) : null;
        const payload = {
            visitador:   actualRepName,
            medico_id:   docId,
            medico_name: document.getElementById('evalModalDocName').innerText,
            mercado:     selectedMarket,
            cuadrante:   quadrant,
            notas:       sanitizedNotas,
            survey:      { q1, q2, q3, q4, q5 },
            timestamp:   new Date().toISOString(),
            _user_role:  st.currentUserRole,
            // Pedido 2: campos de Cruce Errado
            cruceErrado:   isCruceErrado,
            nombreFichero: nombreFichero
        };

        let docRefId = "";
        const adminFirebaseId = document.getElementById('evalFirebaseId').value;
        if (st.isAdmin && adminFirebaseId) {
            docRefId = adminFirebaseId;
        } else {
            const safeRepName = actualRepName.replace(/[^a-zA-Z0-9_-]/g, "");
            const cleanMarket = selectedMarket.replace(/[^a-zA-Z0-9_-]/g, "");
            docRefId = `${safeRepName}_${docId}_${cleanMarket}`;
        }

        // --- Online vs Offline ---
        if (navigator.onLine && window.firebaseAuth && window.firebaseAuth.currentUser) {
            await window.firebaseSetDoc(
                window.firebaseDoc(window.firebaseDb, 'artifacts', appId, 'public', 'data', 'evaluaciones_matriz', docRefId),
                payload
            );
            ui.showToast("Evaluación guardada en Firebase correctamente.");
        } else {
            st.OFFLINE_QUEUE.push({ docRefId, payload });
            await localforage.setItem('OFFLINE_QUEUE', st.OFFLINE_QUEUE);
            ui.showToast("Sin conexión: Evaluación guardada localmente. Se sincronizará al tener internet.");
        }

        // --- Actualizar memoria local ---
        if (!st.isAdmin) {
            if (!st.EVALUACIONES_VISITADOR[docId]) st.EVALUACIONES_VISITADOR[docId] = {};
            st.EVALUACIONES_VISITADOR[docId][selectedMarket] = payload;

            // Propagar Q1 y Q5 a otros mercados ya evaluados del mismo médico
            for (const mkt in st.EVALUACIONES_VISITADOR[docId]) {
                if (mkt !== selectedMarket && st.EVALUACIONES_VISITADOR[docId][mkt].survey) {
                    st.EVALUACIONES_VISITADOR[docId][mkt].survey.q1 = q1;
                    st.EVALUACIONES_VISITADOR[docId][mkt].survey.q5 = q5;

                    const otherRefId = `${actualRepName.replace(/[^a-zA-Z0-9_-]/g, "")}_${docId}_${mkt.replace(/[^a-zA-Z0-9_-]/g, "")}`;
                    if (navigator.onLine && window.firebaseAuth) {
                        window.firebaseSetDoc(
                            window.firebaseDoc(window.firebaseDb, 'artifacts', appId, 'public', 'data', 'evaluaciones_matriz', otherRefId),
                            st.EVALUACIONES_VISITADOR[docId][mkt]
                        );
                    } else {
                        st.OFFLINE_QUEUE.push({ docRefId: otherRefId, payload: st.EVALUACIONES_VISITADOR[docId][mkt] });
                        localforage.setItem('OFFLINE_QUEUE', st.OFFLINE_QUEUE);
                    }
                }
            }
        }
   if (st.isAdmin) {
            // Admin: cerrar modal inmediatamente (modo edición)
            window.App.evaluation.closeEvalModal();
            // En lugar de re-leer todo desde Firestore (lecturas costosas),
            // actualizamos el array en memoria con el payload local
            const existingIdx = st.ALL_EVALUATIONS.findIndex(e => e.firebaseId === docRefId);
            const newEvalInMemory = { firebaseId: docRefId, ...payload };
            if (existingIdx >= 0) {
                st.ALL_EVALUATIONS[existingIdx] = newEvalInMemory;
            } else {
                st.ALL_EVALUATIONS.push(newEvalInMemory);
            }
            // Actualizar también el cache local de evaluaciones admin
            if (window.localforage) {
                localforage.setItem('ADMIN_EVALS_CACHE', st.ALL_EVALUATIONS);
                localforage.setItem('ADMIN_EVALS_LAST_SYNC', new Date().toISOString());
            }
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
        ui.showToast("Hubo un error al guardar. Revisa tu conexión.");
} finally {
        btnSave.disabled = false;
        // Pedido 2: respetar el modo Cruce Errado al restaurar el botón
        window.App.evaluation.updateSaveButtonLabel();
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

    // Mostrar banner prominente
    showSaveBanner({
        savedMarket: savedMarket,
        nextMarket: nextMarket,
        pendingCount: pendingCount,
        allDone: false
    });

    // Resaltar visualmente el dropdown
    marketSelect.classList.add('ring-2', 'ring-emerald-400');
    setTimeout(() => marketSelect.classList.remove('ring-2', 'ring-emerald-400'), 2000);
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
                background: linear-gradient(135deg, #10b981 0%, #059669 100%);
                color: white;
                border-radius: 10px;
                box-shadow: 0 10px 28px rgba(16, 185, 129, 0.38);
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 12px;
                animation: saveBannerIn 0.45s cubic-bezier(0.34, 1.56, 0.64, 1);
            }
            #saveSuccessBanner.is-hiding {
                animation: saveBannerOut 0.3s ease-in forwards;
            }
            #saveSuccessBanner .sb-text  { flex: 1; line-height: 1.45; }
            #saveSuccessBanner .sb-saved { font-size: 15px; font-weight: 700; letter-spacing: 0.2px; }
            #saveSuccessBanner .sb-next  { font-size: 13px; opacity: 0.95; margin-top: 3px; }
            #saveSuccessBanner .sb-btn {
                background: rgba(255,255,255,0.22);
                border: 1px solid rgba(255,255,255,0.45);
                color: white;
                padding: 7px 16px;
                border-radius: 7px;
                font-size: 13px;
                font-weight: 600;
                cursor: pointer;
                transition: background 0.15s, transform 0.1s;
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
    if (isCruceErrado) {
        btnSave.classList.remove('bg-indigo-600', 'hover:bg-indigo-700');
        btnSave.classList.add('bg-rose-600', 'hover:bg-rose-700');
        btnSave.innerHTML = '<span class="material-symbols-outlined text-[18px]">block</span> Confirmar Cruce Errado';
    } else {
        btnSave.classList.remove('bg-rose-600', 'hover:bg-rose-700');
        btnSave.classList.add('bg-indigo-600', 'hover:bg-indigo-700');
        btnSave.innerHTML = '<span class="material-symbols-outlined text-[18px]">save</span> Guardar Evaluación';
    }
};
console.log('[SegmentApp] evaluation.js cargado.');

/* ============================================================
   SegmentApp - Módulo de Administración
   Archivo: js/admin.js
   Responsable de:
   - Autenticación y modo admin
   - Dashboard del equipo (progreso por asesor)
   - Alertas de discrepancia (Rx vs Subjetivo)
   - Gestión de accesos de visitadores
   - Configuración de ponderación de la encuesta
   - Productos PHQ
   - Limpieza masiva de evaluaciones
============================================================ */

window.App = window.App || {};
window.App.admin = {};

/* ============================================================
   AUTENTICACIÓN ADMIN
============================================================ */
window.App.admin.showAdminAuthModal = function() {
    const st = window.App.state;
    if (st.isAdmin || st.currentUserRole === 'admin') {
        window.App.auth.logoutSession();
        return;
    }
    // El admin entra por el mismo formulario (correo + clave). La base
    // decide el rol; ya no existe una clave de admin aparte ni por defecto.
    window.App.auth.openLoginModal();
};

window.App.admin.processAdminAuth = function() {
    document.getElementById('adminAuthModal').classList.add('hidden');
    window.App.auth.openLoginModal();
};

/* ============================================================
   UI DEL MODO ADMIN (mostrar/ocultar paneles)
============================================================ */
window.App.admin.updateAdminUI = function() {
    const st = window.App.state;
    const esAdmin = st.rolReal === 'admin';
    const tools    = document.getElementById('analysisTools');
    const uploadBtn = document.getElementById('btnUploadData');
    const prodBtn  = document.getElementById('btnProductsNav');
    // Ajustes, productos y carga de datos: solo el administrador
    tools.classList.toggle('hidden', !esAdmin);
    if (uploadBtn) { uploadBtn.classList.toggle('hidden', !esAdmin); uploadBtn.classList.toggle('flex', esAdmin); }
    if (prodBtn) prodBtn.classList.toggle('hidden', !esAdmin);
    // Versión de datos: cualquiera con sesión
    const verBtn = document.getElementById('btnVersionDatos');
    if (verBtn) verBtn.classList.toggle('hidden', st.currentUserRole === 'guest');
};

/* ============================================================
   DASHBOARD DEL EQUIPO (progreso + discrepancias)
============================================================ */
window.App.admin.renderAdminDashboard = function() {
    const st = window.App.state;
    const d  = window.App.data;
    if (!st.isAdmin) return;

console.time('[Admin] renderAdminDashboard');

    // Pedido 2 Entrega 2: Filtro de Cruce Errado
    window.App.admin._ensureCruceErradoFilter();
    const ceFilter = (document.getElementById('adminCruceErradoFilter') || { value: 'all' }).value;
    let filteredEvals = st.ALL_EVALUATIONS;
    if (ceFilter === 'valid') {
        filteredEvals = st.ALL_EVALUATIONS.filter(ev => !ev.cruceErrado);
    } else if (ceFilter === 'cruce') {
        filteredEvals = st.ALL_EVALUATIONS.filter(ev => ev.cruceErrado === true);
    }
    // Para discrepancias: nunca contamos cruce errado (cuadrante no es comparable)
    const validEvalsForDiscrepancy = filteredEvals.filter(ev => !ev.cruceErrado);

    // ✨ PERF #1: Índice O(1) de PROCESSED_DATA por id normalizada
    // (evita el .find() dentro del bucle de discrepancias)
    const docByKey = new Map();
    for (const x of st.PROCESSED_DATA) {
        docByKey.set(d.normalizeKey(x.id), x);
    }

    // ✨ PERF #2: Cache de normalización de medico_id (evita normalizar el mismo valor 2 veces)
    const normCache = new Map();
    const normId = (id) => {
        if (normCache.has(id)) return normCache.get(id);
        const n = d.normalizeKey(id);
        normCache.set(id, n);
        return n;
    };

    // 1) Cálculo de stats por asesor
    const repStats = {};
    st.FICHERO_MAP.forEach((rows, docId) => {
        const repsInDoc = new Set();
        rows.forEach(r => {
            const repKey = d.getFicheroRepKey(r);
            if (repKey && r[repKey]) repsInDoc.add(String(r[repKey]).trim().toUpperCase());
        });
        repsInDoc.forEach(rep => {
            if (st.REPS_PERMITIDOS && !st.REPS_PERMITIDOS.has(rep)) return;
            if (!repStats[rep]) repStats[rep] = { name: rep, totalDocs: 0, evaluatedDocIds: new Set(), totalSurveys: 0, evals: [] };
            repStats[rep].totalDocs++;
        });
    });
filteredEvals.forEach(ev => {
        const repName = String(ev.visitador).toUpperCase();
        if (!repStats[repName]) repStats[repName] = { name: repName, totalDocs: 0, evaluatedDocIds: new Set(), totalSurveys: 0, evals: [] };
        repStats[repName].evaluatedDocIds.add(normId(ev.medico_id));
        repStats[repName].totalSurveys++;
        repStats[repName].evals.push(ev);
    });

    // ✨ PERF #3: Guardar el cache para que toggleRepDetails arme el detalle SOLO cuando el usuario expanda
    window.App.admin._repStatsCache = repStats;

    // 2) Select de gerentes (poblar una sola vez)
    const managerSelect = document.getElementById('adminManagerFilter');
    if (managerSelect) {
        const uniqueManagers = [...new Set(Object.values(st.REP_MANAGER_MAP))].sort();
        if (managerSelect.options.length <= 1 && uniqueManagers.length > 0) {
            managerSelect.innerHTML = '<option value="all">Todos los Gerentes</option>';
            uniqueManagers.forEach(m => { managerSelect.innerHTML += `<option value="${m}">${m}</option>`; });
        }
    }
    const selectedManager = managerSelect ? managerSelect.value : 'all';
    let filteredStats = Object.values(repStats);
    if (selectedManager !== 'all') {
        filteredStats = filteredStats.filter(stat => st.REP_MANAGER_MAP[stat.name] === selectedManager);
    }

    // 3) KPIs agregados del gerente seleccionado
    let mgrTotalDocs = 0, mgrEvalDocs = 0, mgrSurveys = 0;
    filteredStats.forEach(s => {
        mgrTotalDocs += s.totalDocs;
        mgrEvalDocs  += s.evaluatedDocIds.size;
        mgrSurveys   += s.totalSurveys;
    });
    const mgrDocsStat = document.getElementById('mgrDocsStat');
    const mgrSurStat  = document.getElementById('mgrSurveysStat');
    if (mgrDocsStat) mgrDocsStat.innerText = `${mgrEvalDocs} / ${mgrTotalDocs}`;
    if (mgrSurStat)  mgrSurStat.innerText  = mgrSurveys;

    // 4) Tabla de progreso por asesor (SIN pre-renderizar detalles — lazy load en toggleRepDetails)
    const progressContainer = document.getElementById('adminProgressTable');
    const progressParts = [];
    filteredStats
        .sort((a, b) => {
            const pctA = a.totalDocs > 0 ? a.evaluatedDocIds.size / a.totalDocs : 0;
            const pctB = b.totalDocs > 0 ? b.evaluatedDocIds.size / b.totalDocs : 0;
            return pctB - pctA;
        })
        .forEach(stat => {
            const pctDocs = stat.totalDocs > 0 ? (stat.evaluatedDocIds.size / stat.totalDocs) * 100 : 0;
            const barColor = pctDocs >= 100 ? 'bg-emerald-500' : (pctDocs > 50 ? 'bg-blue-500' : 'bg-amber-400');
            const safeName = stat.name.replace(/'/g, "\\'");
            progressParts.push(`
                <div class="bg-slate-50 rounded-xl border border-slate-200 overflow-hidden mb-2 shadow-sm">
                    <div class="flex items-center justify-between p-3 cursor-pointer transition" onclick="toggleRepDetails('${safeName}')">
                        <div class="w-1/3 font-bold text-xs text-slate-700 truncate pr-2" title="${stat.name}">${stat.name}</div>
                        <div class="w-1/3 px-2 flex flex-col gap-1.5 flex-1">
                            <div class="flex items-center gap-2" title="Total Médicos">
                                <span class="text-[9px] uppercase font-bold text-slate-400 w-12 text-right">Médicos</span>
                                <div class="w-full bg-slate-200 rounded-full h-1.5"><div class="${barColor} h-1.5 rounded-full" style="width: ${pctDocs > 100 ? 100 : pctDocs}%"></div></div>
                                <span class="text-[10px] font-mono font-bold ${pctDocs >= 100 ? 'text-emerald-600' : 'text-slate-600'} w-8 text-right">${stat.evaluatedDocIds.size}/${stat.totalDocs}</span>
                            </div>
                            <div class="flex items-center gap-2" title="Total Encuestas Realizadas">
                                <span class="text-[9px] uppercase font-bold text-slate-400 w-12 text-right">Encuestas</span>
                                <span class="text-[10px] font-mono font-bold text-purple-700 bg-purple-100 px-2 py-0.5 rounded-full">${stat.totalSurveys}</span>
                            </div>
                        </div>
                        <div class="w-8 flex justify-end items-center gap-1"><span class="material-symbols-outlined text-[18px] text-slate-400 transition-transform" id="icon_rep_${stat.name}">expand_more</span></div>
                    </div>
                    <!-- Detalle LAZY: vacío hasta que el usuario lo expanda -->
                    <div class="hidden border-t border-slate-200 bg-white p-3" id="detail_rep_${stat.name}" data-loaded="false"></div>
                </div>
            `);
        });
    const progressHtml = progressParts.length > 0
        ? progressParts.join('')
        : '<div class="p-4 text-center text-xs text-slate-500">No hay datos de asesores en el filtro.</div>';
    if (progressContainer) progressContainer.innerHTML = progressHtml;
   
   // 5) Alertas de discrepancia (Rx vs Subjetivo) — ahora con lookup O(1)
    // No incluye cruce errado (el cuadrante no es comparable cuando el médico está mal cruzado)
    const discContainer = document.getElementById('adminDiscrepancyTable');
    const discParts = [];
    let discCount = 0;
    validEvalsForDiscrepancy.forEach(ev => {
        const doc = docByKey.get(normId(ev.medico_id));   // ⚡ era .find() O(n)

        if (!doc) return;
        const objPot = doc.closeupPotency;
        const subPot = ev.cuadrante ? ev.cuadrante.charAt(0) : '';
        if (subPot && objPot !== subPot) {
            discCount++;
            discParts.push(`
                <div class="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 mb-2 bg-white rounded-xl border border-rose-100 transition shadow-sm gap-2 group cursor-pointer" onclick="openDoctorModal('${doc.id}')">
                    <div class="flex flex-col"><span class="text-xs font-bold text-slate-800">${doc.name}</span><span class="text-[10px] text-slate-500">Evaluado por: <b class="text-indigo-600">${ev.visitador}</b> en <b class="text-indigo-600">${ev.mercado || 'General'}</b></span></div>
                    <div class="flex items-center gap-3 text-[10px] font-bold">
                        <div class="flex flex-col items-center bg-slate-50 border border-slate-200 px-2.5 py-1.5 rounded-lg shadow-sm"><span class="text-slate-400 uppercase tracking-widest text-[8px]">Datos (Rx)</span><span class="text-slate-700 text-xs">${doc.closeupLabel}</span></div>
                        <span class="material-symbols-outlined text-rose-300 text-[16px] group-hover:rotate-180 transition">sync_problem</span>
                        <div class="flex flex-col items-center bg-rose-50 border border-rose-200 px-2.5 py-1.5 rounded-lg shadow-sm"><span class="text-rose-400 uppercase tracking-widest text-[8px]">Subjetivo</span><span class="text-rose-700 text-xs">${ev.cuadrante}</span></div>
                    </div>
                </div>
            `);
        }
    });
    const discHtml = discParts.length > 0
        ? discParts.join('')
        : '<div class="p-8 text-center text-xs text-emerald-600 flex flex-col items-center gap-2 font-medium bg-emerald-50 rounded-2xl border border-emerald-100"><span class="material-symbols-outlined text-emerald-400 text-4xl">verified</span>No hay discrepancias críticas de potencial detectadas.</div>';
    if (discContainer) discContainer.innerHTML = discHtml;

    const discBadge = document.getElementById('discCountBadge');
    if (discBadge) {
        discBadge.innerText = discCount;
        if (discCount > 0) {
            discBadge.classList.replace('bg-slate-100', 'bg-rose-100');
            discBadge.classList.replace('text-slate-600', 'text-rose-600');
        } else {
            discBadge.classList.replace('bg-rose-100', 'bg-slate-100');
            discBadge.classList.replace('text-rose-600', 'text-slate-600');
        }
    }

    console.timeEnd('[Admin] renderAdminDashboard');
};

/* ============================================================
   TOGGLE DETALLE DE UN ASESOR
============================================================ */
window.App.admin.toggleRepDetails = function(repName) {
    const detailDiv = document.getElementById(`detail_rep_${repName}`);
    const icon = document.getElementById(`icon_rep_${repName}`);
    if (!detailDiv || !icon) return;

    // ✨ PERF: Construir el HTML del detalle SOLO la primera vez que se expande
    if (detailDiv.dataset.loaded === 'false') {
        const cache = window.App.admin._repStatsCache || {};
        const stat = cache[repName];
        if (stat) {
            const evalsHtml = stat.evals.map(e => {
                // Pedido 2 Entrega 2: estilo distintivo para evaluaciones de Cruce Errado
                const isCE = e.cruceErrado === true;
                const rowClasses = isCE ? 'bg-amber-50 border-amber-300' : 'bg-slate-50 border-slate-100';
                const ceBadge = isCE ? '<span class="text-amber-600 font-bold mr-1" title="Cruce Errado">⚠️</span>' : '';
                const ceFicheroHtml = (isCE && e.nombreFichero)
                    ? `<div class="text-[9px] text-amber-700 font-medium mt-0.5">📋 Fichero: <span class="font-bold">${e.nombreFichero}</span></div>`
                    : '';
                return `
                    <div class="flex justify-between items-center p-2.5 mb-1.5 rounded-lg border ${rowClasses}">
                        <div class="truncate pr-2">
                            <div class="text-[11px] font-bold text-slate-700 truncate" title="${e.medico_name}">${ceBadge}${e.medico_name}</div>
                            <div class="text-[9px] text-slate-500">Mercado: <span class="font-bold text-indigo-600">${e.mercado}</span> | Mat: ${e.medico_id}</div>
                            ${ceFicheroHtml}
                        </div>
                        <div class="flex gap-1 shrink-0 ${window.App.state.soloLectura ? 'hidden' : ''}">
                            <button onclick="adminEditEval('${e.firebaseId}')" class="text-blue-500 p-1 rounded-full transition" title="Editar"><span class="material-symbols-outlined text-[14px]">edit</span></button>
                            <button onclick="adminDeleteEval('${e.firebaseId}')" class="text-rose-500 p-1 rounded-full transition" title="Eliminar"><span class="material-symbols-outlined text-[14px]">delete</span></button>
                        </div>
                    </div>
                `;
            }).join('');
            detailDiv.innerHTML = `
                <div class="text-[10px] uppercase font-bold text-slate-400 mb-2">Detalle de Encuestas (${stat.evals.length})</div>
                ${evalsHtml || '<div class="text-xs text-slate-400 italic">Sin encuestas registradas.</div>'}
            `;
            detailDiv.dataset.loaded = 'true';
        }
    }

    if (detailDiv.classList.contains('hidden')) {
        detailDiv.classList.remove('hidden');
        icon.style.transform = "rotate(180deg)";
    } else {
        detailDiv.classList.add('hidden');
        icon.style.transform = "rotate(0deg)";
    }
};

/* ============================================================
   EDITAR / ELIMINAR EVALUACIÓN INDIVIDUAL (ADMIN)
============================================================ */
window.App.admin.adminEditEval = function(firebaseId) {
    const st = window.App.state;
    const evalData = st.ALL_EVALUATIONS.find(e => e.firebaseId === firebaseId);
    if (!evalData) return;

    document.getElementById('evalDocId').value = evalData.medico_id;
    document.getElementById('evalModalDocName').innerText = evalData.medico_name;
    const marketSelect = document.getElementById('evalMarketSelect');
    marketSelect.innerHTML = `<option value="${evalData.mercado}">${evalData.mercado}</option>`;
    marketSelect.value = evalData.mercado;
    document.getElementById('evalNotas').value = evalData.notas || "";

    document.querySelectorAll('.eval-btn').forEach(btn => {
        btn.classList.remove('ring-4', 'ring-offset-2', 'ring-indigo-500', 'scale-105', 'z-10');
        btn.style.opacity = "0.5";
    });
    for (const btn of document.querySelectorAll('.eval-btn')) {
        if (btn.innerText.includes(evalData.cuadrante)) {
            window.App.evaluation.selectEvalQuadrant(btn, evalData.cuadrante);
            break;
        }
    }
    if (evalData.survey) {
        document.getElementById('surveyQ1').value = evalData.survey.q1 || "";
        document.getElementById('surveyQ2').value = evalData.survey.q2 || "";
        document.getElementById('surveyQ3').value = evalData.survey.q3 || "";
        document.getElementById('surveyQ4').value = evalData.survey.q4 || "";
        document.getElementById('surveyQ5').value = evalData.survey.q5 || "";
    }
    document.getElementById('evalFirebaseId').value = firebaseId;
    document.getElementById('evalRepName').value = evalData.visitador;

    // Pedido 2 Entrega 2: si la eval era cruce errado, activar el modo automáticamente
    // (usa el nombreFichero guardado como fallback porque admin no es el visitador)
    if (evalData.cruceErrado === true) {
        window.App.evaluation.toggleCruceErradoMode(true, {
            silent: true,
            fallbackName: evalData.nombreFichero || null
        });
    } else {
        window.App.evaluation.toggleCruceErradoMode(false);
    }

    document.getElementById('evalModal').classList.remove('hidden');
};
window.App.admin.adminDeleteEval = async function(firebaseId) {
    const st = window.App.state;
    if (st.soloLectura) return;
    if (!confirm("¿Eliminar esta evaluación?\n\nNo se borra: queda guardada en el historial y se puede recuperar.")) return;
    try {
        await window.App.sb.eliminarEvaluacion(firebaseId);
        window.App.ui.showToast("Evaluación eliminada (queda en el historial)");
        st.ALL_EVALUATIONS = st.ALL_EVALUATIONS.filter(e => e.firebaseId !== firebaseId);
        if (window.localforage) await localforage.setItem('EQUIPO_EVALS_CACHE', st.ALL_EVALUATIONS);
        st._lastUniverseSignature = null;
        window.App.admin.renderAdminDashboard();
        window.App.filters.resetPaginationAndRender();
    } catch (e) {
        console.error(e);
        window.App.ui.showToast("Error al eliminar. Revisa tu conexión.");
    }
};

/* ============================================================
   LIMPIEZA MASIVA DE EVALUACIONES
============================================================ */
// Desactivado por seguridad: borrar evaluaciones en bloque no se puede
// deshacer. Solo se permite eliminar una evaluación a la vez.
window.App.admin.confirmClearAllEvals = function() {
    window.App.ui.showToast("Función desactivada por seguridad. Elimina las evaluaciones una por una.");
};
window.App.admin.executeClearAllEvals = window.App.admin.confirmClearAllEvals;
window.App.admin.clearRepEvaluations  = window.App.admin.confirmClearAllEvals;
window.App.admin.executeClearRepEvals = window.App.admin.confirmClearAllEvals;

/* ============================================================
   CONFIGURACIÓN DE PONDERACIÓN DE LA ENCUESTA
============================================================ */
window.App.admin.openSurveyConfigModal = function() {
    window.App.admin.renderSurveyConfigForm();
    document.getElementById('surveyConfigModal').classList.remove('hidden');
};

window.App.admin.renderSurveyConfigForm = function() {
    const st = window.App.state;
    const cfg = window.App.config;
    const container = document.getElementById('surveyConfigBody');
    let html = `
        <div class="bg-blue-50 border border-blue-100 p-5 rounded-2xl mb-6 flex flex-col sm:flex-row gap-4 justify-between items-center">
            <div>
                <h4 class="font-bold text-blue-800 text-sm flex items-center gap-2"><span class="material-symbols-outlined text-[18px]">rule</span> Umbrales de Potencial</h4>
                <p class="text-xs text-blue-600 mt-1">Define el puntaje mínimo requerido en la encuesta para alcanzar A o B.</p>
            </div>
            <div class="flex gap-4 shrink-0">
                <div class="flex flex-col">
                    <label class="text-[10px] font-bold text-blue-800 uppercase tracking-widest mb-1">Puntaje para A</label>
                    <input type="number" inputmode="numeric" pattern="[0-9]*" id="th_A" value="${st.SURVEY_THRESHOLDS.A}" class="w-24 px-3 py-2 border border-blue-200 rounded-xl text-sm font-bold text-center focus:ring-2 focus:ring-blue-500 outline-none">
                </div>
                <div class="flex flex-col">
                    <label class="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Puntaje para B</label>
                    <input type="number" inputmode="numeric" pattern="[0-9]*" id="th_B" value="${st.SURVEY_THRESHOLDS.B}" class="w-24 px-3 py-2 border border-slate-300 rounded-xl text-sm font-bold text-center focus:ring-2 focus:ring-slate-500 outline-none">
                </div>
            </div>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
    `;
    for (const [qKey, qLabel] of Object.entries(cfg.SURVEY_QUESTION_LABELS)) {
        html += `<div class="bg-slate-50 border border-slate-200 p-4 rounded-2xl shadow-sm transition"><h4 class="font-bold text-slate-700 text-xs mb-3 truncate" title="${qLabel}">${qLabel}</h4><div class="space-y-2">`;
        for (const [option, score] of Object.entries(st.SURVEY_WEIGHTS[qKey])) {
            const safeId = `w_${qKey}_${option.replace(/[^a-zA-Z0-9]/g, "_")}`;
            html += `
                <div class="flex justify-between items-center bg-white px-3 py-2 rounded-lg border border-slate-100 shadow-sm transition">
                    <span class="text-xs font-medium text-slate-600 truncate mr-2" title="${option}">${option}</span>
                    <input type="number" inputmode="numeric" pattern="[0-9]*" id="${safeId}" data-q="${qKey}" data-opt="${option}" value="${score}" class="w-16 px-2 py-1 border border-slate-200 rounded-lg text-xs font-mono text-center focus:ring-1 focus:ring-emerald-500 outline-none transition">
                </div>
            `;
        }
        html += `</div></div>`;
    }
    html += `</div>`;
    container.innerHTML = html;
};

window.App.admin.saveSurveyConfig = function() {
    const st = window.App.state;
    const thA = parseInt(document.getElementById('th_A').value) || 70;
    const thB = parseInt(document.getElementById('th_B').value) || 35;

    if (thB >= thA) {
        window.App.ui.showToast("Error: El puntaje para A debe ser mayor al de B.");
        return;
    }
    st.SURVEY_THRESHOLDS.A = thA;
    st.SURVEY_THRESHOLDS.B = thB;

    const inputs = document.querySelectorAll('#surveyConfigBody input[data-q]');
    inputs.forEach(input => {
        const q = input.getAttribute('data-q');
        const opt = input.getAttribute('data-opt');
        const val = parseInt(input.value) || 0;
        if (st.SURVEY_WEIGHTS[q] && st.SURVEY_WEIGHTS[q][opt] !== undefined) {
            st.SURVEY_WEIGHTS[q][opt] = val;
        }
    });

    window.App.admin.guardarConfig({
        ponderacion_encuesta: st.SURVEY_WEIGHTS,
        umbrales_encuesta: st.SURVEY_THRESHOLDS
    }, "Ponderación guardada para todo el equipo.").then(ok => {
        if (!ok) return;
        document.getElementById('surveyConfigModal').classList.add('hidden');
        st._lastUniverseSignature = null;
        window.App.matrix.aggregateAndCalculate();
    });
};

window.App.admin.restoreDefaultWeights = function() {
    if (confirm("¿Estás seguro de restaurar los valores por defecto? Se perderán los cambios actuales.")) {
        const cfg = window.App.config;
        const st = window.App.state;
        st.SURVEY_WEIGHTS = JSON.parse(JSON.stringify(cfg.DEFAULT_SURVEY_WEIGHTS));
        st.SURVEY_THRESHOLDS = JSON.parse(JSON.stringify(cfg.DEFAULT_SURVEY_THRESHOLDS));
        window.App.admin.renderSurveyConfigForm();
        window.App.ui.showToast("Valores restaurados. No olvides guardar.");
    }
};

/* ============================================================
   PRODUCTOS PHQ (modal Productos)
============================================================ */
window.App.admin.openProductModal = function() {
    window.App.admin.renderProductCheckboxes();
    document.getElementById('productModal').classList.remove('hidden');

    const csvInput = document.getElementById('productCsvInput');
    csvInput.onchange = (e) => {
        if (!e.target.files.length) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            const newProds = ev.target.result.split(/[\n,;]+/).map(s => s.trim().toUpperCase()).filter(s => s);
            if (newProds.length > 0) {
                window.App.state.PHQ_PRODUCTS = [...new Set([...window.App.state.PHQ_PRODUCTS, ...newProds])];
                window.App.admin.renderProductCheckboxes();
                window.App.ui.showToast(`${newProds.length} productos agregados`);
            }
        };
        reader.readAsText(e.target.files[0]);
    };
};

window.App.admin.renderProductCheckboxes = function() {
    const st = window.App.state;
    const container = document.getElementById('productChecklist');
    const allProds = st.RAW_DATA.length > 0 ? [...new Set(st.RAW_DATA.map(d => d.prod).filter(x => x))] : [];
    const combined = [...new Set([...allProds, ...st.PHQ_PRODUCTS])].map(p => p.toUpperCase()).sort();
    container.innerHTML = combined.map(p => `
        <label class="flex items-center gap-3 p-3 bg-white rounded-xl border border-slate-200 cursor-pointer transition shadow-sm">
            <input type="checkbox" value="${p}" ${st.PHQ_PRODUCTS.includes(p) ? 'checked' : ''} class="phq-prod-cb accent-blue-600 w-5 h-5 rounded">
            <span class="text-sm font-semibold text-slate-700 truncate" title="${p}">${p}</span>
        </label>
    `).join('');
};

window.App.admin.saveProductsConfig = async function() {
    const lista = Array.from(document.querySelectorAll('.phq-prod-cb:checked')).map(cb => cb.value.toUpperCase());
    const ok = await window.App.admin.guardarConfig({ productos_phq: lista }, "Productos guardados para todo el equipo.");
    if (!ok) return;
    window.App.state.PHQ_PRODUCTS = lista;
    window.App.state._lastUniverseSignature = null;
    document.getElementById('productModal').classList.add('hidden');
    if (window.App.state.RAW_DATA.length > 0) window.App.main.processData();
};

/* ------------------------------------------------------------
   Guardar configuración compartida (solo admin)
------------------------------------------------------------ */
window.App.admin.guardarConfig = async function(cambios, mensajeOk) {
    if (window.App.state.rolReal !== 'admin') return false;
    try {
        for (const [clave, valor] of Object.entries(cambios)) {
            await window.App.sb.guardarConfiguracion(clave, valor);
        }
        if (window.localforage) {
            const cfg = (await localforage.getItem('CONFIG_CACHE')) || {};
            await localforage.setItem('CONFIG_CACHE', { ...cfg, ...cambios });
        }
        if (mensajeOk) window.App.ui.showToast(mensajeOk);
        return true;
    } catch (e) {
        console.error('[SegmentApp] No se pudo guardar la configuración:', e);
        window.App.ui.showToast("No se pudo guardar. Revisa tu conexión e intenta de nuevo.");
        return false;
    }
};

// Umbrales de la matriz: se guardan para todos al soltar el control (solo admin)
window.addEventListener('DOMContentLoaded', () => {
    ['sliderLow', 'sliderHigh', 'sliderPotLow', 'sliderPotHigh'].forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener('change', () => {
            const st = window.App.state;
            if (st.rolReal !== 'admin') return;
            window.App.admin.guardarConfig({ umbrales_matriz: {
                TH_LOY_LOW: st.TH_LOY_LOW, TH_LOY_HIGH: st.TH_LOY_HIGH, TH_POT_LOW: st.TH_POT_LOW, TH_POT_HIGH: st.TH_POT_HIGH
            } }, "Umbrales guardados para todo el equipo.");
        });
    });
});

/* ============================================================
   GESTIÓN DE ACCESOS DE VISITADORES
============================================================ */
window.App.admin.openAccessManager = async function() {
    document.getElementById('accessModal').classList.remove('hidden');
    const container = document.getElementById('accessListContainer');
    container.innerHTML = '<div class="text-center py-8 text-indigo-600 flex flex-col items-center gap-3"><span class="material-symbols-outlined animate-spin-reverse text-4xl">sync</span><span class="text-sm font-bold">Conectando con la base de datos...</span></div>';
    let filas = [];
    try {
        filas = await window.App.sb.visitadoresConUsuario();
    } catch (e) {
        console.error("Error leyendo visitadores:", e);
        container.innerHTML = '<div class="text-center py-8 text-rose-500 font-bold bg-rose-50 rounded-2xl border border-rose-100">No se pudo conectar. Intenta de nuevo.</div>';
        return;
    }
    document.getElementById('visitadoresCount').innerText = `${filas.length} visitadores`;
    const esc = window.App.ui.escapeHtml;
    container.innerHTML = filas.map((v, idx) => {
        const p = v.perfiles;
        const estado = p && p.correo
            ? `<span class="text-xs font-mono ${p.activo ? 'text-emerald-700 bg-emerald-50 border-emerald-200' : 'text-slate-500 bg-slate-50 border-slate-200'} border px-3 py-1.5 rounded-xl truncate">${esc(p.correo)}${p.activo ? '' : ' (desactivado)'}</span>`
            : `<span class="text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-xl">Sin usuario</span>`;
        return `
        <div class="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 bg-white rounded-2xl border border-slate-200 shadow-sm gap-3 ${v.activo ? '' : 'opacity-60'}">
            <span class="text-sm font-bold text-slate-700 truncate flex-1 flex items-center gap-2" title="${esc(v.nombre_sector)}"><span class="bg-indigo-100 text-indigo-700 w-6 h-6 flex items-center justify-center rounded-full text-[10px]">${idx + 1}</span>${esc(v.nombre_sector)}${v.activo ? '' : ' · inactivo'}</span>
            ${estado}
        </div>`;
    }).join('');
};

window.App.admin.saveRepPwd = function() {
    window.App.ui.showToast("Las claves ya no se asignan aquí. Cada persona usa \"¿Olvidaste tu clave?\" en el ingreso.");
};

/* ============================================================
   PEDIDO 2 ENTREGA 2 — FILTRO CRUCE ERRADO (admin)
   Se inyecta dinámicamente al lado del filtro de Gerente.
============================================================ */
window.App.admin._ensureCruceErradoFilter = function() {
    if (document.getElementById('adminCruceErradoFilter')) return;
    const managerSelect = document.getElementById('adminManagerFilter');
    if (!managerSelect) return;

    const wrapper = document.createElement('div');
    wrapper.className = 'inline-flex items-center';
    wrapper.innerHTML = `
        <select id="adminCruceErradoFilter" class="px-3 py-1.5 border border-amber-300 rounded-lg text-xs font-medium bg-white focus:ring-2 focus:ring-amber-400 outline-none">
            <option value="all">⚠️ Cruce Errado: Todos</option>
            <option value="valid">Solo Válidos</option>
            <option value="cruce">Solo Cruce Errado</option>
        </select>
    `;
    managerSelect.parentNode.insertBefore(wrapper, managerSelect.nextSibling);

    document.getElementById('adminCruceErradoFilter').addEventListener('change', () => {
        window.App.admin.renderAdminDashboard();
    });
};

/* ============================================================
   ALIAS GLOBALES
============================================================ */
window.showAdminAuthModal      = window.App.admin.showAdminAuthModal;
window.processAdminAuth        = window.App.admin.processAdminAuth;
window.updateAdminUI           = window.App.admin.updateAdminUI;
window.renderAdminDashboard    = window.App.admin.renderAdminDashboard;
window.toggleRepDetails        = window.App.admin.toggleRepDetails;
window.adminEditEval           = window.App.admin.adminEditEval;
window.adminDeleteEval         = window.App.admin.adminDeleteEval;
window.confirmClearAllEvals    = window.App.admin.confirmClearAllEvals;
window.executeClearAllEvals    = window.App.admin.executeClearAllEvals;
window.clearRepEvaluations     = window.App.admin.clearRepEvaluations;
window.executeClearRepEvals    = window.App.admin.executeClearRepEvals;
window.openSurveyConfigModal   = window.App.admin.openSurveyConfigModal;
window.renderSurveyConfigForm  = window.App.admin.renderSurveyConfigForm;
window.saveSurveyConfig        = window.App.admin.saveSurveyConfig;
window.restoreDefaultWeights   = window.App.admin.restoreDefaultWeights;
window.openProductModal        = window.App.admin.openProductModal;
window.renderProductCheckboxes = window.App.admin.renderProductCheckboxes;
window.saveProductsConfig      = window.App.admin.saveProductsConfig;
window.openAccessManager       = window.App.admin.openAccessManager;
window.saveRepPwd              = window.App.admin.saveRepPwd;

console.log('[SegmentApp] admin.js cargado.');

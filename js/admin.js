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
    const uploadBtn = document.getElementById('btnUploadData');
    const prodBtn  = document.getElementById('btnProductsNav');
    // Ajustes (su propia pantalla), productos y carga de datos: solo el administrador
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
    if (!st.isAdmin) return;
    // Solo se dibuja cuando se está viendo la pantalla "Equipo" (con 28 mil médicos
    // dibujarlo en cada filtro era uno de los tirones). Al abrirla se pone al día.
    if (st.PANTALLA !== 'equipo') { window.App.admin._panelPendiente = true; return; }
    window.App.admin._panelPendiente = false;
    // Fase 9B: distritos, visitadores, prioridades y alertas (js/equipo.js)
    if (window.App.equipo) window.App.equipo.render();
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
    const refrescar = async () => {
        if (window.localforage) await localforage.setItem('EQUIPO_EVALS_CACHE', st.ALL_EVALUATIONS);
        st._lastUniverseSignature = null;
        window.App.admin.renderAdminDashboard();
        window.App.filters.resetPaginationAndRender();
    };
    try {
        const eliminada = st.ALL_EVALUATIONS.find(e => e.firebaseId === firebaseId);
        await window.App.sb.eliminarEvaluacion(firebaseId);
        st.ALL_EVALUATIONS = st.ALL_EVALUATIONS.filter(e => e.firebaseId !== firebaseId);
        window.App.evaluation.marcarCambio();
        await refrescar();
        // No se borra (queda en el historial) y se puede deshacer enseguida
        window.App.ui.showToast("Evaluación eliminada.", {
            accion: 'Deshacer',
            alAccionar: async () => {
                try {
                    const restaurada = await window.App.sb.restaurarEvaluacion(firebaseId);
                    st.ALL_EVALUATIONS.push(restaurada || eliminada);
                    window.App.evaluation.marcarCambio();
                    await refrescar();
                    window.App.ui.showToast("Evaluación restaurada.");
                } catch (e) {
                    console.error(e);
                    window.App.ui.showToast("No se pudo restaurar: puede que ya exista otra evaluación activa para ese médico y mercado.");
                }
            }
        });
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
// La ponderación ahora está en la pantalla "Ajustes"
window.App.admin.openSurveyConfigModal = function() {
    if (window.App.ux) window.App.ux.irA('ajustes');
    if (window.App.ajustes) setTimeout(() => window.App.ajustes.irA('ajEncuesta'), 50);
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

// Umbrales de la matriz: se aplican y guardan para todos con "Aplicar" en Ajustes (js/ajustes.js)

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
   ALIAS GLOBALES
============================================================ */
window.showAdminAuthModal      = window.App.admin.showAdminAuthModal;
window.processAdminAuth        = window.App.admin.processAdminAuth;
window.updateAdminUI           = window.App.admin.updateAdminUI;
window.renderAdminDashboard    = window.App.admin.renderAdminDashboard;
window.adminEditEval           = window.App.admin.adminEditEval;
window.adminDeleteEval         = window.App.admin.adminDeleteEval;
window.confirmClearAllEvals    = window.App.admin.confirmClearAllEvals;
window.executeClearAllEvals    = window.App.admin.executeClearAllEvals;
window.clearRepEvaluations     = window.App.admin.clearRepEvaluations;
window.executeClearRepEvals    = window.App.admin.executeClearRepEvals;
window.openSurveyConfigModal   = window.App.admin.openSurveyConfigModal;
window.openProductModal        = window.App.admin.openProductModal;
window.renderProductCheckboxes = window.App.admin.renderProductCheckboxes;
window.saveProductsConfig      = window.App.admin.saveProductsConfig;
window.openAccessManager       = window.App.admin.openAccessManager;
window.saveRepPwd              = window.App.admin.saveRepPwd;

console.log('[SegmentApp] admin.js cargado.');

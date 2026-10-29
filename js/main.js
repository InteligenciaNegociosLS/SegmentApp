/* ============================================================
   SegmentApp - Entry Point (Orquestador principal)
   Archivo: js/main.js
   Responsable de:
   - Inicializar la app cuando el DOM está listo
   - Cargar la configuración compartida y los datos (Supabase)
   - processData(): recalcular filtros y matriz con los datos en memoria
   DEBE CARGARSE ÚLTIMO.
============================================================ */

window.App = window.App || {};
window.App.main = {};

/* ============================================================
   PROCESS DATA — recalcula filtros y matriz
   Se llama al terminar de cargar los datos y cuando el admin
   cambia la lista de productos PHQ.
============================================================ */
window.App.main.processData = async function() {
    const st = window.App.state;
    if (st.RAW_DATA.length === 0) return;

    window.App.filters.populateFilters();
    window.App.matrix.aggregateAndCalculate();

    document.getElementById('restoringSession').classList.add('hidden');
    document.getElementById('emptyState').classList.add('hidden');
};

/* ============================================================
   CONFIGURACIÓN COMPARTIDA (una sola para todos)
   Ponderación de la encuesta, umbrales y productos PHQ.
============================================================ */
window.App.main.aplicarConfiguracion = function(cfg) {
    const st = window.App.state;
    if (!cfg) return;
    if (cfg.ponderacion_encuesta) st.SURVEY_WEIGHTS = cfg.ponderacion_encuesta;
    if (cfg.umbrales_encuesta)    st.SURVEY_THRESHOLDS = cfg.umbrales_encuesta;
    if (Array.isArray(cfg.productos_phq)) st.PHQ_PRODUCTS = cfg.productos_phq.map(p => String(p).toUpperCase());
    if (cfg.umbrales_matriz) {
        const u = cfg.umbrales_matriz;
        ['TH_LOY_LOW', 'TH_LOY_HIGH', 'TH_POT_LOW', 'TH_POT_HIGH'].forEach(k => { if (Number.isFinite(u[k])) st[k] = u[k]; });
        const pares = { sliderLow: 'TH_LOY_LOW', sliderHigh: 'TH_LOY_HIGH', sliderPotLow: 'TH_POT_LOW', sliderPotHigh: 'TH_POT_HIGH' };
        Object.entries(pares).forEach(([id, k]) => { const el = document.getElementById(id); if (el) el.value = st[k]; });
    }
};

window.App.main.cargarConfiguracion = async function() {
    let cfg = null;
    try {
        cfg = await window.App.sb.configuracion();
        if (window.localforage) localforage.setItem('CONFIG_CACHE', cfg);
    } catch (e) {
        console.error('[SegmentApp] Configuración no disponible; se usa la última conocida:', e);
        if (window.localforage) cfg = await localforage.getItem('CONFIG_CACHE');
    }
    window.App.main.aplicarConfiguracion(cfg);
};

/* ============================================================
   CARGAR TODO (después de iniciar sesión)
   Devuelve true si los datos quedaron listos.
============================================================ */
window.App.main.cargarTodo = async function() {
    const ui = window.App.ui;
    try {
        await window.App.main.cargarConfiguracion();
        await window.App.data.cargarDatos();
        await window.App.main.processData();
        window.App.matrix.updateThresholds();
        return true;
    } catch (e) {
        console.error('[SegmentApp] No se pudieron cargar los datos:', e);
        document.getElementById('restoringSession').classList.add('hidden');
        const vacio = document.getElementById('emptyState');
        vacio.classList.remove('hidden');
        ui.safeSetText('emptyStateMsg', e && e.message && !/HTTP|fetch/i.test(e.message)
            ? e.message
            : 'No se pudieron descargar los datos. Revisa tu conexión e intenta de nuevo.');
        // El admin igual puede entrar para cargar la primera versión
        if (window.App.state.rolReal === 'admin') {
            const btn = document.getElementById('btnCargaDesdeVacio');
            if (btn) btn.classList.remove('hidden');
        }
        return false;
    }
};

window.App.main.reintentarCarga = async function() {
    const user = await window.App.sb.usuarioActual().catch(() => null);
    if (user) await window.App.auth.entrar(user);
    else window.App.auth.showLoginRequired();
};

/* ============================================================
   INICIALIZACIÓN COMPLETA DE LA APP
   Se llama una sola vez cuando el DOM está listo.
============================================================ */
window.App.main.initApp = function() {
    // 0) Almacén local (antes de cualquier lectura)
    if (window.localforage) localforage.config({ name: 'PHQ_Matrix_DB', storeName: 'session_data' });

    // 1) Estado con valores por defecto (luego llega la configuración compartida)
    window.App.state.init();

    // 2) Grilla estática de la matriz 9-box
    window.App.matrix.generateMatrixGridHTML();

    // 3) Sliders de umbrales
    const sliderLow = document.getElementById('sliderLow');
    const sliderHigh = document.getElementById('sliderHigh');
    if (sliderLow)  sliderLow.value  = window.App.state.TH_LOY_LOW;
    if (sliderHigh) sliderHigh.value = window.App.state.TH_LOY_HIGH;
    window.App.matrix.updateThresholds();

    // 4) Chart.js plugin (datalabels)
    if (typeof Chart !== 'undefined' && typeof ChartDataLabels !== 'undefined') {
        Chart.register(ChartDataLabels);
        // Misma tipografía y color de texto que el resto de la app
        Chart.defaults.font.family = '"Roboto Flex", Roboto, system-ui, sans-serif';
        Chart.defaults.color = '#44474e';
    }

    // 5) Cerrar dropdowns al hacer clic fuera
    document.addEventListener('click', function(event) {
        document.querySelectorAll('.filter-dropdown-panel').forEach(panel => {
            const btn = panel.previousElementSibling;
            if (!panel.classList.contains('hidden') && !panel.contains(event.target) && !btn.contains(event.target)) {
                panel.classList.add('hidden');
            }
        });
    });

    // 6) Sistema sin conexión
    window.App.offline.setupListeners();
    window.App.offline.initOfflineQueue();

    // 7) Sesión: si hay, carga configuración y datos; si no, pide ingresar
    window.App.auth.checkAuthentication();
};

/* ============================================================
   ALIAS GLOBALES (compatibilidad con llamadas existentes)
============================================================ */
window.processData = window.App.main.processData;
window.reintentarCarga = window.App.main.reintentarCarga;

/* ============================================================
   ARRANQUE — cuando el DOM esté listo
============================================================ */
window.addEventListener('DOMContentLoaded', () => {
    window.App.main.initApp();
});

console.log('[SegmentApp] main.js cargado.');

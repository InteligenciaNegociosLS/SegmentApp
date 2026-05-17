/* ============================================================
   SegmentApp - Estado global compartido
   Archivo: js/state.js
   Aquí viven TODAS las variables que varios archivos necesitan.
   Todo se accede como App.state.xxx
============================================================ */

window.App = window.App || {};

window.App.state = {

    // --- Datos crudos y procesados ---
    RAW_DATA: [],                 // Filas del CSV de auditoría CloseUp
    PROCESSED_DATA: [],           // Médicos agregados y calculados
    CURRENT_TABLE_DATA: [],       // Datos actualmente mostrados en la tabla
    MARKET_CACHE: {},             // Cache de clasificaciones por mercado
    FICHERO_MAP: new Map(),       // Mapa Matricula -> filas del fichero médico
    REP_MANAGER_MAP: {},          // Mapa Visitador -> Gerente de Distrito
    CURRENT_COMP_BREAKDOWN: [],   // Ranking de productos (para tarjeta competencia)

    // --- Productos PHQ configurados (se copia desde config al iniciar) ---
    PHQ_PRODUCTS: [],

    // --- Configuración de encuesta (se copia desde config al iniciar) ---
    SURVEY_WEIGHTS: {},
    SURVEY_THRESHOLDS: {},

    // --- Umbrales dinámicos de la matriz (sliders admin) ---
    TH_LOY_LOW: 33,
    TH_LOY_HIGH: 66,
    TH_POT_LOW: 33,
    TH_POT_HIGH: 66,

    // --- Filtros activos ---
    FILTER_STATE: {
        Market: [], Product: [], Rep: [], Region: [],
        Spec: [], Molecule: [], Class: [], Lab: []
    },
    FILTER_OPTIONS: {
        Market: [], Product: [], Rep: [], Region: [],
        Spec: [], Molecule: [], Class: [], Lab: []
    },
    MATRIX_FILTER: null,          // {pot, loy} si hay filtro activo por cuadrante

    // --- Evaluaciones ---
    EVALUACIONES_VISITADOR: {},   // Evaluaciones del visitador logueado
    ALL_EVALUATIONS: [],          // Todas las evaluaciones (modo admin)

    // --- Sesión y roles ---
    currentUserRole: 'guest',     // 'guest' | 'visitador' | 'gerente' | 'admin'
    currentVisitadorName: "",
    isAdmin: false,

    // --- UI ---
    currentMatrixMode: 'closeup', // 'closeup' | 'survey'
    currentExportTarget: 'excel', // 'excel' | 'pdf'
    SHOW_SUMMARIES: false,
    groupByInstitution: false,
    currentPage: 1,

    // --- Instancias (librerías externas) ---
    docChartInstance: null,       // Chart.js del modal del médico

    // --- Sistema offline ---
    OFFLINE_QUEUE: []
};

/* ------------------------------------------------------------
   Inicializador: copia valores por defecto desde App.config.
   Se llama una sola vez al arrancar la app (desde main.js).
------------------------------------------------------------ */
window.App.state.init = function() {
    const cfg = window.App.config;
    if (!cfg) {
        console.error('[SegmentApp] state.js: No se encontró App.config. Revisa el orden de carga.');
        return;
    }

    // Copias profundas para que cambios en el estado no afecten las plantillas
    window.App.state.PHQ_PRODUCTS = [...cfg.DEFAULT_PHQ_PRODUCTS];
    window.App.state.SURVEY_WEIGHTS = JSON.parse(JSON.stringify(cfg.DEFAULT_SURVEY_WEIGHTS));
    window.App.state.SURVEY_THRESHOLDS = JSON.parse(JSON.stringify(cfg.DEFAULT_SURVEY_THRESHOLDS));

    window.App.state.TH_LOY_LOW = cfg.DEFAULT_THRESHOLDS.TH_LOY_LOW;
    window.App.state.TH_LOY_HIGH = cfg.DEFAULT_THRESHOLDS.TH_LOY_HIGH;
    window.App.state.TH_POT_LOW = cfg.DEFAULT_THRESHOLDS.TH_POT_LOW;
    window.App.state.TH_POT_HIGH = cfg.DEFAULT_THRESHOLDS.TH_POT_HIGH;
};

console.log('[SegmentApp] state.js cargado.');

/* ============================================================
   SegmentApp - Configuración global
   Archivo: js/config.js
   Contiene constantes y valores por defecto.
   No tiene lógica; solo datos.
============================================================ */

// Todas las configuraciones se exponen bajo el objeto global App.config
window.App = window.App || {};
window.App.config = {};

// --- Librerías cargadas dinámicamente (Lazy Loading) ---
window.App.config.LIBRARIES = {
    xlsx: "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js",
    jspdf: "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js",
    autotable: "https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.29/jspdf.plugin.autotable.min.js",
    html2canvas: "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"
};

// --- Productos del laboratorio (PHQ) por defecto ---
window.App.config.DEFAULT_PHQ_PRODUCTS = [
    "AIREX PHQ", "ALLERFEX PHQ", "AMLODIPINA LST LST", "AMOXICILINA LST LST", "ANALPER NAX LST",
    "ATENOLOL LST LST", "ATORVASTATINA LST LST", "AZITROMICINA LST LST", "BROXOL ALERG LST",
    "BROXOL FLEM LST", "BROXOL LST", "BROXOL S/ALC-AZUC LST", "BUCOXOL GAR LST", "BUMETIN RETARD PHQ",
    "CANDESARTAN LST LST", "CANDETIQUE PHQ", "CARVEDILOL LST LST", "CEFADROXILO LST LST",
    "CETIRIZINA LST LST", "CIPROFIBRATO LST LST", "CIPROFLOXACIN.LST LST", "CLARITROMICIN.LST LST",
    "CLINDAMICINA LST LST", "DESLER M PHQ", "DESLER PHQ", "DESLORATADINA LST LST", "DICIGEL PHQ",
    "DICLOFENAC PO.LST LST", "DOMPERIDONA LST LST", "ESCITALOPRAM LST LST", "ESOMEPRAZOL LST LST",
    "ESOZ HP PHQ", "ESOZ PHQ", "EZETIM.+SINVA.LST LST", "FEXOFENADINA LST LST", "FLUDIL PHQ",
    "FLUOXETINA LST LST", "GLUSTAR PHQ", "HEDRALIVE LST", "IRBESARTAN LST LST", "KETOPROFENO LST LST",
    "KLAFENAC PHQ", "KLAFENAC RAPILENT PHQ", "LEPRIT PHQ", "LEVOCETIRIZIN.LST LST",
    "LEVOFLOXACINA LST LST", "LEVOSULPIRIDA LST LST", "LORACERT PHQ", "LOSARTAN LST PHQ",
    "MELOXICAM LST LST", "MONTELUKAST LST LST", "MONUKAST PHQ", "MOXIFLOXACINA LST LST",
    "NIFEDIPINA LST LST", "OCAM PROTECT PHQ", "OLMESARTAN LST LST", "OLMETIQUE PHQ",
    "OMEPRAZOL LST LST", "PROLARDI PHQ", "PULMOLIX PHQ", "ROSUVASTATINA LST LST",
    "SERTRALINA LST LST", "SINUX PHQ", "SULAMP PHQ", "TIOCOL PHQ", "TIOCOLFEN PHQ",
    "TRALIX PHQ", "TRIMEBUTINA LST LST", "VALSARTAN LST LST", "XAROX PHQ"
];

// --- Ponderación por defecto de la encuesta ---
window.App.config.DEFAULT_SURVEY_WEIGHTS = {
    q1: { "Menos de 10": 5, "10 a 20": 10, "21 a 30": 15, "31 a 40": 20, "41 a 50": 25, "51 a 70": 30, "Más de 70": 35 },
    q2: { "0": 0, "1 a 5": 10, "6 a 10": 15, "11 a 15": 20, "16 a 20": 25, "21 a 30": 30, "31 a 40": 33, "Más de 40": 35 },
    q3: { "0": 0, "1 a 5": 10, "6 a 10": 15, "11 a 15": 20, "16 a 20": 25, "21 a 30": 30, "Más de 30": 35 },
    q5: { "Gratuita / Institucional": 1, "Menos de $30": 2, "$30 a $50": 5, "$51 a $80": 8, "$81 a $120": 10, "$121 a $150": 12, "Más de $150": 15 }
};

// --- Umbrales por defecto para clasificar en A / B / C (encuesta) ---
window.App.config.DEFAULT_SURVEY_THRESHOLDS = { A: 70, B: 35 };

// --- Etiquetas de las preguntas de la encuesta (para UI de configuración) ---
window.App.config.SURVEY_QUESTION_LABELS = {
    q1: "1) Pacientes por semana (Total)",
    q5: "2) Costo estimado de consulta",
    q2: "3) Pacientes de la patología",
    q3: "4) Pacientes con nuestro producto"
};

// --- Umbrales por defecto de la matriz (Adopción y Potencialidad) ---
window.App.config.DEFAULT_THRESHOLDS = {
    TH_LOY_LOW: 33,
    TH_LOY_HIGH: 66,
    TH_POT_LOW: 33,
    TH_POT_HIGH: 66
};

// --- Paginación de la tabla principal ---
window.App.config.ROWS_PER_PAGE = 50;

// --- Columnas disponibles para exportar (Excel / PDF) ---
window.App.config.EXPORT_COLUMNS = [
    { id: 'col_matrix', label: 'Clasificación Final (CloseUp General)', default: true },
    { id: 'col_market_closeup', label: 'Clasificación (CloseUp) Mercado Evaluado', default: true },
    { id: 'col_eval', label: 'Clasificación Asesor (Subjetiva)', default: true },
    { id: 'col_obj_eval', label: 'Clasificación Objetiva (Encuesta)', default: true },
    { id: 'col_market_eval', label: 'Mercado Evaluado', default: true },
    { id: 'col_sur_q1', label: 'Pacientes/Sem (Total)', default: true },
    { id: 'col_sur_q2', label: 'Pacientes/Sem (Patología)', default: true },
    { id: 'col_sur_q3', label: 'Pacientes/Sem (Nuestro Prod)', default: true },
    { id: 'col_sur_q4', label: 'Otros Productos Rx', default: true },
    { id: 'col_sur_q5', label: 'Costo Consulta', default: true },
    { id: 'col_eval_notes', label: 'Notas del Asesor', default: true },
    { id: 'col_name', label: 'Médico / Institución', default: true },
    { id: 'col_spec', label: 'Especialidad', default: true },
    { id: 'col_mat', label: 'Matrícula', default: false },
    { id: 'col_address', label: 'Dirección', default: false },
    { id: 'col_city', label: 'Ciudad', default: false },
    { id: 'col_region', label: 'Región', default: false },
    { id: 'col_gap', label: 'Oportunidad (Rx Faltantes)', default: true },
    { id: 'col_rxTot', label: 'Recetas Totales', default: true },
    { id: 'col_rxPhq', label: 'Recetas Lab', default: true },
    { id: 'col_share', label: 'Share %', default: true }
];

console.log('[SegmentApp] config.js cargado.');

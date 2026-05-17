/* ============================================================
   SegmentApp - Entry Point (Orquestador principal)
   Archivo: js/main.js
   Responsable de:
   - Inicializar la app cuando el DOM está listo
   - Función processData() que orquesta carga/recarga de datos
   - Setup de listeners globales (clic fuera de dropdowns, etc.)
   DEBE CARGARSE ÚLTIMO.
============================================================ */

window.App = window.App || {};
window.App.main = {};

/* ============================================================
   PROCESS DATA — función orquestadora
   Se llama cuando:
   - Se restaura una sesión guardada
   - Se cargan los CSVs desde el repositorio
   - El admin sube nuevos archivos manualmente
   - El admin cambia la lista de productos PHQ
============================================================ */
window.App.main.processData = async function(isRestoring = false) {
    const st = window.App.state;
    const d  = window.App.data;
    const ui = window.App.ui;

    const errorEl = document.getElementById('errorMsg');
    if (errorEl) errorEl.classList.add('hidden');

    // --- Si NO estamos restaurando y no hay datos en RAM, leer del formulario ---
    if (!isRestoring && st.RAW_DATA.length === 0) {
        const textInput      = document.getElementById('csvInput').value;
        const auditFileInput = document.getElementById('auditFileInput');
        const ficheroFileInput = document.getElementById('ficheroFileInput');

        if (!textInput.trim() && (!auditFileInput.files || auditFileInput.files.length === 0)) {
            if (errorEl) {
                errorEl.innerText = "Por favor selecciona un archivo o pega los datos.";
                errorEl.classList.remove('hidden');
            }
            return;
        }

        try {
            // Fichero médico (si se subió)
            if (ficheroFileInput.files && ficheroFileInput.files.length > 0) {
                const fichJson = await d.readFileAsJson(ficheroFileInput.files[0]);
                d.parseFicheroData(fichJson);
            }
            // Audit (archivo o texto pegado)
            if (auditFileInput.files && auditFileInput.files.length > 0) {
                const json = await d.readFileAsJson(auditFileInput.files[0]);
                d.parseAuditData(json);
            } else if (textInput.trim()) {
                st.RAW_DATA = [];
                textInput.split('\n').forEach(line => {
                    const l = line.trim();
                    if (!l) return;
                    const parts = l.includes('\t') ? l.split('\t') : l.split(',');
                    if (parts.length >= 5) {
                        st.RAW_DATA.push({
                            doc:      parts[0]?.trim() || "",
                            license:  parts[1]?.trim() || "",
                            market:   parts[2]?.trim() || "General",
                            prod:     parts[3]?.trim() || "",
                            rx:       parseInt(parts[4]?.trim()) || 0,
                            address:  parts[6]?.trim() || "",
                            zip:      parts[7]?.trim() || "",
                            city:     parts[8]?.trim() || "",
                            region:   parts[9]?.trim() || "",
                            spec:     parts[10]?.trim() || "GEN",
                            molecule: parts[11]?.trim() || "",
                            class:    parts[12]?.trim() || "",
                            generic:  parts[13]?.trim() || "",
                            lab:      parts[14]?.trim() || ""
                        });
                    }
                });
            }
            st.MARKET_CACHE = {};
            d.saveSession();
        } catch (e) {
            if (errorEl) {
                errorEl.innerText = "Error procesando archivo: " + e.message;
                errorEl.classList.remove('hidden');
            }
            return;
        }
    }

    if (st.RAW_DATA.length === 0) {
        if (!isRestoring && errorEl) {
            errorEl.innerText = "No se encontraron datos procesables.";
            errorEl.classList.remove('hidden');
        }
        return;
    }

    window.App.filters.populateFilters();
    window.App.matrix.aggregateAndCalculate();

    document.getElementById('restoringSession').classList.add('hidden');
    document.getElementById('uploadModal').classList.add('hidden');
    document.getElementById('emptyState').classList.add('hidden');

    if (!isRestoring) ui.showToast("Datos procesados exitosamente");

    // Verificar sesión previa (si el usuario ya estaba logueado)
    window.App.auth.checkAuthentication();
};

/* ============================================================
   INICIALIZACIÓN COMPLETA DE LA APP
   Se llama una sola vez cuando el DOM está listo.
============================================================ */
window.App.main.initApp = function() {
    // 1) Inicializar estado con valores por defecto de config
    window.App.state.init();

    // 2) Generar la grilla estática de la matriz 9-box
    window.App.matrix.generateMatrixGridHTML();

    // 3) Inicializar sliders de umbrales
    const sliderLow = document.getElementById('sliderLow');
    const sliderHigh = document.getElementById('sliderHigh');
    if (sliderLow)  sliderLow.value  = window.App.state.TH_LOY_LOW;
    if (sliderHigh) sliderHigh.value = window.App.state.TH_LOY_HIGH;
    window.App.matrix.updateThresholds();

    // 4) Registrar Chart.js plugin (datalabels)
    if (typeof Chart !== 'undefined' && typeof ChartDataLabels !== 'undefined') {
        Chart.register(ChartDataLabels);
    }

    // 5) Listener global: cerrar dropdowns al hacer clic fuera
    document.addEventListener('click', function(event) {
        document.querySelectorAll('.filter-dropdown-panel').forEach(panel => {
            const btn = panel.previousElementSibling;
            if (!panel.classList.contains('hidden') && !panel.contains(event.target) && !btn.contains(event.target)) {
                panel.classList.add('hidden');
            }
        });
    });

    // 6) Setup de listeners offline
    window.App.offline.setupListeners();

    // 7) Cargar cola offline pendiente
    window.App.offline.initOfflineQueue();

    // 8) Inicializar storage (intenta restaurar sesión, sino carga del repo)
    window.App.data.initStorage();
};

/* ============================================================
   ALIAS GLOBAL (compatibilidad con llamadas existentes)
============================================================ */
window.processData = window.App.main.processData;

/* ============================================================
   ARRANQUE — cuando el DOM esté listo
============================================================ */
window.addEventListener('DOMContentLoaded', () => {
    window.App.main.initApp();
});

console.log('[SegmentApp] main.js cargado.');

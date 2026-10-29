/* ============================================================
   SegmentApp - Utilidades de UI e Interfaz
   Archivo: js/ui.js
   Contiene helpers genéricos: toast, formateo,
   cambio de tabs, apertura/cierre de modales, etc.
============================================================ */

window.App = window.App || {};
window.App.ui = {};

/* ------------------------------------------------------------
   FORMATEO DE NÚMEROS
------------------------------------------------------------ */
window.App.ui.formatNumber = function(num, decimals = 0) {
    return new Intl.NumberFormat('es-AR', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
    }).format(num);
};

window.App.ui.compactNum = function(num) {
    const f = window.App.ui.formatNumber;
    if (num >= 1000000) return f(num / 1000000, 1) + 'M';
    if (num >= 1000)    return f(num / 1000, 1) + 'k';
    return f(num);
};

/* ------------------------------------------------------------
   ESCAPAR TEXTO PARA INSERTARLO COMO HTML
------------------------------------------------------------ */
// Nombres del archivo de CloseUp: la "Ñ" viene escrita como "#" (NU#EZ → NUÑEZ).
// Solo cambia lo que se ve; el dato guardado no se toca.
window.App.ui.nombreVisible = function(nombre) {
    return String(nombre == null ? '' : nombre).replace(/([A-ZÁÉÍÓÚ])#(?=[A-ZÁÉÍÓÚ]|\s|$)/g, '$1Ñ');
};

window.App.ui.escapeHtml = function(value) {
    return String(value == null ? '' : value)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
};

/* ------------------------------------------------------------
   TOAST (notificación flotante)
------------------------------------------------------------ */
// Aviso inferior (snackbar). Opcional: un botón de acción, p. ej. "Deshacer".
let temporizadorToast = null;
window.App.ui.showToast = function(msg, opciones = {}) {
    const t = document.getElementById('toast');
    if (!t) return;
    clearTimeout(temporizadorToast);
    t.innerText = msg;
    if (opciones.accion && typeof opciones.alAccionar === 'function') {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'toast-accion';
        b.textContent = opciones.accion;
        b.onclick = () => { t.classList.remove('show'); opciones.alAccionar(); };
        t.appendChild(b);
    }
    t.classList.add('show');
    temporizadorToast = setTimeout(() => t.classList.remove('show'), opciones.accion ? 6000 : 3500);
};

/* ------------------------------------------------------------
   HELPER PARA ACTUALIZAR TEXTO DE UN ELEMENTO POR ID
   Seguro: si el elemento no existe, no rompe la app.
------------------------------------------------------------ */
window.App.ui.safeSetText = function(id, value) {
    const el = document.getElementById(id);
    if (el) el.innerText = value;
};

/* ------------------------------------------------------------
   TABS DEL MODAL DE MÉDICO (Fichaje / Mercado)
------------------------------------------------------------ */
window.App.ui.switchDocTab = function(tabName) {
    const btnFichaje = document.getElementById('tabBtnFichaje');
    const btnMercado = document.getElementById('tabBtnMercado');
    const contentFichaje = document.getElementById('tabContentFichaje');
    const contentMercado = document.getElementById('tabContentMercado');

    if (tabName === 'fichaje') {
        btnFichaje.classList.add('active');
        btnMercado.classList.remove('active');
        contentFichaje.classList.remove('hidden');
        contentMercado.classList.add('hidden');
    } else {
        btnMercado.classList.add('active');
        btnFichaje.classList.remove('active');
        contentMercado.classList.remove('hidden');
        contentFichaje.classList.add('hidden');
    }
};

/* ------------------------------------------------------------
   TOGGLE DE CELDAS DE RESUMEN EN LA MATRIZ
------------------------------------------------------------ */
window.App.ui.toggleSummaryCells = function() {
    window.App.state.SHOW_SUMMARIES = !window.App.state.SHOW_SUMMARIES;
    const show = window.App.state.SHOW_SUMMARIES;
    const elements = document.querySelectorAll('.summary-element');
    const btnText = document.getElementById('btnSummaryText');
    const grid = document.getElementById('matrixGridElement');

    if (show) grid.classList.add('expanded');
    else      grid.classList.remove('expanded');

    elements.forEach(el => {
        if (show) { el.classList.remove('hidden'); el.classList.add('flex'); }
        else      { el.classList.add('hidden');    el.classList.remove('flex'); }
    });

    btnText.innerText = show ? "Ocultar Subtotales" : "Ver Subtotales";
};

/* ------------------------------------------------------------
   ABRIR/CERRAR EL STATS DRAWER DE UNA CELDA DE LA MATRIZ
------------------------------------------------------------ */
window.App.ui.toggleStats = function(e, key) {
    e.stopPropagation();
    const clickedDrawer = document.getElementById(`drawer_${key}`);
    const shouldOpen = !clickedDrawer.classList.contains('open');
    document.querySelectorAll('.stats-drawer').forEach(drawer => {
        if (shouldOpen) drawer.classList.add('open');
        else            drawer.classList.remove('open');
    });
};

/* ------------------------------------------------------------
   ETIQUETA DE ARCHIVO (drop area de los inputs de archivos)
------------------------------------------------------------ */
window.App.ui.updateFileLabel = function(inputId, msgId) {
    const input = document.getElementById(inputId);
    const msg = document.getElementById(msgId);
    if (!input || !msg) return;
    if (input.files && input.files.length > 0) {
        msg.innerText = input.files[0].name;
        msg.style.color = "#0b57d0";
        msg.style.fontWeight = "bold";
    } else {
        msg.innerText = "O arrastra el archivo aquí";
        msg.style.color = "#44474e";
        msg.style.fontWeight = "normal";
    }
};

/* ------------------------------------------------------------
   MODAL DE CONFIRMACIÓN "BORRAR MEMORIA Y RECARGAR"
------------------------------------------------------------ */
window.App.ui.showConfirmClearModal = function() {
    document.getElementById('confirmResetModal').classList.remove('hidden');
};

window.App.ui.executeClearSession = async function() {
    if (window.localforage) {
        // Conservar las evaluaciones hechas sin conexión que aún no se subieron
        const pendingQueue = (await localforage.getItem('OFFLINE_QUEUE')) || [];
        await localforage.clear();
        if (pendingQueue.length > 0) {
            await localforage.setItem('OFFLINE_QUEUE', pendingQueue);
        }
    }
    window.location.reload();
};

/* ------------------------------------------------------------
   ALIAS GLOBALES (compatibilidad con llamadas onclick="..." del HTML)
   Esto permite que el HTML siga llamando funciones sueltas
   mientras migramos gradualmente.
------------------------------------------------------------ */
window.showToast              = window.App.ui.showToast;
window.safeSetText            = window.App.ui.safeSetText;
window.formatNumber           = window.App.ui.formatNumber;
window.compactNum             = window.App.ui.compactNum;
window.switchDocTab           = window.App.ui.switchDocTab;
window.toggleSummaryCells     = window.App.ui.toggleSummaryCells;
window.toggleStats            = window.App.ui.toggleStats;
window.updateFileLabel        = window.App.ui.updateFileLabel;
window.showConfirmClearModal  = window.App.ui.showConfirmClearModal;
window.executeClearSession    = window.App.ui.executeClearSession;

console.log('[SegmentApp] ui.js cargado.');

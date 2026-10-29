/* ============================================================
   SegmentApp - Filtros y búsqueda
   Archivo: js/filters.js
   Responsable de:
   - Dropdowns múltiples (Mercado, Producto, Asesor, etc.)
   - Búsqueda global
   - Reseteo de filtros
   - Poblado inicial de las opciones disponibles
============================================================ */

window.App = window.App || {};
window.App.filters = {};

/* ------------------------------------------------------------
   ABRIR / CERRAR UN DROPDOWN DE FILTRO
------------------------------------------------------------ */
window.App.filters.toggleGenericDropdown = function(key) {
    const panel = document.getElementById('Panel' + key);
    if (panel) panel.classList.toggle('hidden');
};

/* ------------------------------------------------------------
   MARCAR / DESMARCAR TODOS LOS CHECKBOXES DE UN FILTRO
------------------------------------------------------------ */
window.App.filters.toggleAllGeneric = function(key, checked) {
    document.querySelectorAll(`#list${key} input[type="checkbox"]`).forEach(cb => cb.checked = checked);
    window.App.filters.updateGenericSelected(key);
};

/* ------------------------------------------------------------
   ACTUALIZA EL ESTADO DEL FILTRO Y SU ETIQUETA VISIBLE
   (Se ejecuta cuando el usuario marca/desmarca un checkbox)
------------------------------------------------------------ */
window.App.filters.updateGenericSelected = function(key) {
    const st = window.App.state;
    const checkboxes = document.querySelectorAll(`#list${key} input[type="checkbox"]`);
    st.FILTER_STATE[key] = [];
    checkboxes.forEach(cb => { if (cb.checked) st.FILTER_STATE[key].push(cb.value); });

    const btnText = document.getElementById(`text${key}`);
    if (!btnText) return;

    const total = st.FILTER_OPTIONS[key].length;
    const selected = st.FILTER_STATE[key].length;

    if (selected === total) {
        btnText.innerText = "Todos";
        const sa = document.getElementById(`selectAll${key}`);
        if (sa) sa.checked = true;
        btnText.title = "";
    } else if (selected === 0) {
        btnText.innerText = "Ninguno";
        const sa = document.getElementById(`selectAll${key}`);
        if (sa) sa.checked = false;
        btnText.title = "";
    } else {
        if (selected <= 2) {
            btnText.innerText = st.FILTER_STATE[key]
                .map(i => key === 'Market' ? i.replace(/Mercado/i, '').trim() : i)
                .join(', ');
            btnText.title = "";
        } else {
            btnText.innerText = `${selected} Seleccionados`;
            btnText.title = st.FILTER_STATE[key].join(', ');
        }
        const sa = document.getElementById(`selectAll${key}`);
        if (sa) sa.checked = false;
    }

    if (typeof applyFilters === 'function') applyFilters();
};

/* ------------------------------------------------------------
   LLENAR UN DROPDOWN CON OPCIONES (y dejarlo todo seleccionado)
------------------------------------------------------------ */
window.App.filters.fillGenericDropdown = function(key, dataList) {
    const st = window.App.state;
    st.FILTER_OPTIONS[key] = dataList;

    const container = document.getElementById('list' + key);
    if (!container) return;
    container.innerHTML = '';

    dataList.forEach(item => {
        let cleanName = item;
        if (key === 'Market') cleanName = item.replace(/Mercado/i, '').trim() || item;
        const div = document.createElement('div');
        div.className = 'checkbox-item';
        div.innerHTML = `
            <input type="checkbox" value="${item}" onchange="updateGenericSelected('${key}')">
            <span class="text-sm font-medium text-slate-700">${cleanName}</span>
        `;
        // Dejarlo marcado por defecto
        div.querySelector('input').checked = true;
        container.appendChild(div);
    });

    st.FILTER_STATE[key] = [...dataList];
    const sa = document.getElementById(`selectAll${key}`);
    if (sa) sa.checked = true;
    const txt = document.getElementById(`text${key}`);
    if (txt) txt.innerText = "Todos";
};

/* ------------------------------------------------------------
   POBLAR TODOS LOS FILTROS A PARTIR DE LOS DATOS CRUDOS
   Se ejecuta una vez que RAW_DATA está cargado.
------------------------------------------------------------ */
window.App.filters.populateFilters = function() {
    const st = window.App.state;
    const getUnique = (key) => [...new Set(st.RAW_DATA.map(d => d[key]).filter(x => x))].sort();

    window.App.filters.fillGenericDropdown('Market', getUnique('market'));
    window.App.filters.fillGenericDropdown('Product',
        getUnique('prod').filter(p => window.App.data.isPhq(p))
    );

    // Asesores (se extraen del fichero médico)
    let repSet = new Set();
    st.FICHERO_MAP.forEach(rows => {
        rows.forEach(r => {
            const repKey = window.App.data.getFicheroRepKey(r);
            if (repKey && r[repKey]) repSet.add(String(r[repKey]).trim().toUpperCase());
        });
    });
    if (st.REPS_PERMITIDOS) [...repSet].forEach(r => { if (!st.REPS_PERMITIDOS.has(r)) repSet.delete(r); });
    window.App.filters.fillGenericDropdown('Rep', Array.from(repSet).sort());

    window.App.filters.fillGenericDropdown('Region',   getUnique('region'));
    window.App.filters.fillGenericDropdown('Spec',     getUnique('spec'));
    window.App.filters.fillGenericDropdown('Molecule', getUnique('molecule'));
    window.App.filters.fillGenericDropdown('Class',    getUnique('class'));
    window.App.filters.fillGenericDropdown('Lab',      getUnique('lab'));

    // Filtro de Genéricos (select tradicional)
    const genericsList = getUnique('generic');
    const genericSel = document.getElementById('filterGeneric');
    if (genericSel) {
        genericSel.innerHTML = `<option value="all">Todos</option>`;
        genericsList.forEach(v => genericSel.innerHTML += `<option value="${v}">${v}</option>`);
    }
};

/* ------------------------------------------------------------
   RESETEAR TODOS LOS FILTROS (botón "Restablecer")
------------------------------------------------------------ */
window.App.filters.resetAllFilters = function() {
    document.getElementById('globalSearch').value = '';
    document.getElementById('filterStatus').value = 'all';
    const fg = document.getElementById('filterGeneric');
    if (fg) fg.value = 'all';

    Object.keys(window.App.state.FILTER_OPTIONS).forEach(key => {
        window.App.filters.toggleAllGeneric(key, true);
    });

    if (typeof clearMatrixFilter === 'function') clearMatrixFilter();
    window.App.ui.showToast('Filtros restablecidos');
};

/* ------------------------------------------------------------
   APLICAR FILTROS (re-render de tabla + agregación)
   Estas funciones siguen en el HTML original por ahora,
   las movemos al módulo matrix.js en el paso 8.
------------------------------------------------------------ */
window.App.filters.applyFilters = function() {
    if (typeof resetPaginationAndRender === 'function') resetPaginationAndRender();
    if (typeof aggregateAndCalculate === 'function')    aggregateAndCalculate();
};

window.App.filters.resetPaginationAndRender = function() {
    window.App.state.currentPage = 1;
    if (typeof renderTable === 'function') renderTable();
};

/* ------------------------------------------------------------
   ALIAS GLOBALES (compatibilidad con onclick/onchange del HTML)
------------------------------------------------------------ */
window.toggleGenericDropdown   = window.App.filters.toggleGenericDropdown;
window.toggleAllGeneric        = window.App.filters.toggleAllGeneric;
window.updateGenericSelected   = window.App.filters.updateGenericSelected;
window.fillGenericDropdown     = window.App.filters.fillGenericDropdown;
window.populateFilters         = window.App.filters.populateFilters;
window.resetAllFilters         = window.App.filters.resetAllFilters;
window.applyFilters            = window.App.filters.applyFilters;
window.resetPaginationAndRender = window.App.filters.resetPaginationAndRender;

console.log('[SegmentApp] filters.js cargado.');

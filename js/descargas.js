/* ============================================================
   SegmentApp - Descargar mis datos (crudos), según el rol (Fase 12C)
   Archivo: js/descargas.js
   Menú ⋮ → "Descargar datos": tres archivos CSV para Excel, sin cálculos
   de la app, para analizar por fuera:
   - Recetas (CloseUp): una fila por médico, mercado y producto.
   - Fichero: las filas del CRM tal cual (todas sus columnas).
   - Evaluaciones: lo que guardaron los visitadores (cuadrante, encuesta, notas).
   Cada persona descarga SOLO lo que ve: el VM lo suyo, el GD lo de su
   equipo, el Gerente Nacional y el admin todo (y "Ver como" respeta la
   vista elegida). Los datos ya vienen filtrados por la base según el rol.
============================================================ */
(function() {
    window.App = window.App || {};
    const D = window.App.descargas = {};
    const esc = (v) => window.App.ui.escapeHtml(v);
    const fmt = (n) => window.App.ui.formatNumber(n || 0, 0);

    // Visitadores que esta persona puede ver (null = todos)
    const repsVisibles = () => {
        const st = window.App.state;
        if (st.REPS_PERMITIDOS) return st.REPS_PERMITIDOS;
        if (st.currentUserRole === 'visitador') return new Set([String(st.currentVisitadorName || '').trim().toUpperCase()]);
        return null;
    };
    const repDe = (fila) => {
        const k = window.App.data.getFicheroRepKey(fila);
        return k && fila[k] ? String(fila[k]).trim().toUpperCase() : '';
    };

    D.alcance = function() {
        const st = window.App.state;
        const reps = repsVisibles();
        if (st.verComo) return st.verComo.tipo === 'vm' ? `Visitador ${st.verComo.nombre}` : `Distrito de ${st.verComo.nombre}`;
        if (!reps) return 'Todo el país';
        if (st.currentUserRole === 'visitador') return `Tus médicos (${window.App.ui.nombreVisible(st.currentVisitadorName)})`;
        return `Tu equipo (${fmt(reps.size)} visitadores)`;
    };

    /* ---------- Los datos de cada archivo ---------- */
    D.filasFichero = function() {
        const reps = repsVisibles();
        const filas = [];
        window.App.state.FICHERO_MAP.forEach(lista => lista.forEach(r => { if (!reps || reps.has(repDe(r))) filas.push(r); }));
        return filas;
    };
    D.filasRecetas = function() {
        const st = window.App.state;
        const reps = repsVisibles();
        if (!reps) return st.RAW_DATA || [];
        const claves = new Set();
        st.FICHERO_MAP.forEach((lista, clave) => { if (lista.some(r => reps.has(repDe(r)))) claves.add(clave); });
        return (st.RAW_DATA || []).filter(r => claves.has(window.App.data.normalizeKey(r.license)));
    };
    D.filasEvaluaciones = function() {
        const st = window.App.state;
        const reps = repsVisibles();
        const todas = st.currentUserRole === 'visitador' && !st.isAdmin
            ? Object.values(st.EVALUACIONES_VISITADOR || {}).flatMap(m => Object.values(m || {}))
            : (st.ALL_EVALUATIONS || []);
        return reps ? todas.filter(e => reps.has(String(e.visitador || '').trim().toUpperCase())) : todas;
    };

    /* ---------- CSV (separado por ";" y con tildes, como lo abre Excel en español) ---------- */
    const celda = (v) => {
        const s = v == null ? '' : String(v);
        return /[;"\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const csv = (enc, filas) => '﻿' + [enc, ...filas].map(f => f.map(celda).join(';')).join('\r\n') + '\r\n';

    D.recetasCsv = function() {
        const enc = ['Medico', 'Matricula', 'Mercado', 'Producto', 'Px_Product', 'Domicilio', 'Cod.Postal', 'Localidad', 'Region', 'Especialidad', 'Molecula', 'Clase Terapeutica', 'Generico', 'Laboratorio', 'La Sante'];
        return csv(enc, D.filasRecetas().map(r => [r.doc, r.license, r.market, r.prod, r.rx, r.address, r.zip, r.city, r.region, r.spec, r.molecule, r.class, r.generic, r.lab,
            window.App.data.isPhq(r.prod) ? 'SI' : 'NO']));
    };
    D.ficheroCsv = function() {
        const filas = D.filasFichero();
        const enc = [];
        filas.forEach(r => Object.keys(r).forEach(k => { if (!enc.includes(k)) enc.push(k); }));
        return csv(enc, filas.map(r => enc.map(k => r[k])));
    };
    D.evaluacionesCsv = function() {
        const enc = ['Visitador', 'Matricula', 'Medico', 'Mercado', 'Cuadrante', 'Cruce errado', 'Nombre en fichero', 'Notas',
            'Pacientes por semana', 'Costo de la consulta', 'Pacientes de la patologia', 'Pacientes con nuestro producto', 'Competidor', 'Fecha'];
        return csv(enc, D.filasEvaluaciones().map(e => {
            const s = e.survey || {};
            return [e.visitador, e.medico_id, e.medico_name, e.mercado, e.cuadrante, e.cruceErrado ? 'SI' : 'NO', e.nombreFichero || '', e.notas || '',
                s.q1 || '', s.q5 || '', s.q2 || '', s.q3 || '', s.q4 || '', e.timestamp || ''];
        }));
    };

    const descargar = (nombre, texto) => {
        const url = URL.createObjectURL(new Blob([texto], { type: 'text/csv;charset=utf-8' }));
        const a = document.createElement('a');
        a.href = url; a.download = nombre;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 3000);
    };
    const hoy = () => new Date().toISOString().slice(0, 10);

    D.descargar = async function(tipo) {
        window.App.ui.showToast('Preparando el archivo…');
        await new Promise(r => setTimeout(r, 30));
        const texto = ({ recetas: D.recetasCsv, fichero: D.ficheroCsv, evaluaciones: D.evaluacionesCsv })[tipo]();
        descargar(`segmentapp-${tipo}-${hoy()}.csv`, texto);
        window.App.ui.showToast('Listo. Ábrelo con Excel.');
    };

    /* ---------- La ventana ---------- */
    D.abrir = function() {
        const st = window.App.state;
        const n = { recetas: D.filasRecetas().length, fichero: D.filasFichero().length, evaluaciones: D.filasEvaluaciones().length };
        const opcion = (tipo, icono, titulo, detalle) => `<button type="button" class="ajuste-item w-full" onclick="App.descargas.descargar('${tipo}')" ${n[tipo] ? '' : 'disabled'}>
            <span class="ajuste-icono bg-blue-50 text-blue-700"><span class="material-symbols-outlined">${icono}</span></span>
            <span class="min-w-0 flex-1"><b>${titulo}</b><small>${detalle} · ${fmt(n[tipo])} filas</small></span>
            <span class="material-symbols-outlined text-blue-700">download</span></button>`;
        document.getElementById('descargasAlcance').textContent = D.alcance();
        document.getElementById('descargasOpciones').innerHTML = [
            opcion('recetas', 'receipt_long', 'Recetas (CloseUp)', 'Médico, mercado, producto y recetas de la versión que estás viendo'),
            opcion('fichero', 'badge', 'Fichero', 'Las filas del CRM con todas sus columnas'),
            opcion('evaluaciones', 'rate_review', st.currentUserRole === 'visitador' ? 'Mis evaluaciones' : 'Evaluaciones', 'Cuadrante, encuesta y notas')
        ].join('');
        document.getElementById('descargasModal').classList.remove('hidden');
    };
    D.cerrar = function() { document.getElementById('descargasModal').classList.add('hidden'); };

    console.log('[SegmentApp] descargas.js cargado.');
})();

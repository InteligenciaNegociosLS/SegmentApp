/* ============================================================
   SegmentApp - Catálogos de CloseUp y filtros (solo administrador, Fase 12B)
   Archivo: js/catalogos.js
   Reemplaza las "tablas de dimensiones" de Power Query:
   - Especialidades (código Esp1 → nombre), Laboratorios (abreviatura →
     nombre), Productos (UNA fila por producto) y Clases terapéuticas
     (código → nombre; vacía hasta que exista ese catálogo).
   - Se suben los archivos TAL COMO salen del portal (.xls, .xlsx o .csv):
     la app salta los títulos ("EXPORTACIONES TABLAS", "Buscar:"…), lee
     todas las hojas y encuentra dónde empiezan los datos.
   - Productos: el portal trae varias filas por producto (concentraciones,
     formas). Se deja una sola, con la clase terapéutica más frecuente:
     así el cruce de CloseUp nunca duplica recetas.
   - Guardar un catálogo agrega o actualiza; nunca borra.
   - Filtros de la carga de CloseUp: editables aquí mismo.
   Base: migración 17 (catalogo_*, admin_guardar_catalogo, filtros_closeup).
============================================================ */
(function() {
    window.App = window.App || {};
    const C = window.App.catalogos = {};

    const esc = (v) => window.App.ui.escapeHtml(v);
    const fmt = (n) => window.App.ui.formatNumber(n || 0, 0);
    const toast = (t, o) => window.App.ui.showToast(t, o);
    const argC = (v) => esc(JSON.stringify(String(v == null ? '' : v)));
    const limpio = (v) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
    const norm = (v) => limpio(v).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

    C.TIPOS = {
        especialidades: { titulo: 'Especialidades', icono: 'stethoscope', clave: 'codigo', ayuda: 'Código de CloseUp (Esp1) → nombre de la especialidad.',
            campos: [['codigo', 'Código'], ['nombre', 'Nombre']] },
        laboratorios: { titulo: 'Laboratorios', icono: 'science', clave: 'abreviatura', ayuda: 'Abreviatura del laboratorio → nombre.',
            campos: [['abreviatura', 'Abreviatura'], ['nombre', 'Nombre'], ['codigo', 'Código']] },
        productos: { titulo: 'Productos', icono: 'medication', clave: 'producto', ayuda: 'Una fila por producto: laboratorio, molécula, clase terapéutica y genérico.',
            campos: [['producto', 'Producto'], ['laboratorio', 'Laboratorio (abreviatura)'], ['molecula', 'Molécula'], ['clase_terapeutica', 'Clase terapéutica (código)'], ['generico', 'Genérico (SI/NO)']] },
        clases: { titulo: 'Clases terapéuticas', icono: 'category', clave: 'codigo', ayuda: 'Código de clase → nombre. Opcional: si no está, se muestra el código.',
            campos: [['codigo', 'Código'], ['nombre', 'Nombre']] }
    };
    C.FILTROS_INICIALES = { especialidades_excluir: ['DCR', 'INS', 'OTR'], nombres_especialidad_excluir: ['UNIDAD DE CUIDADOS INTENS'], excluir_matricula_cero: true };

    /* ============================================================
       LECTURA DE LOS ARCHIVOS DEL PORTAL (funciones puras, sobre una
       matriz de filas; las pruebas las usan directo)
    ============================================================ */
    const fila = (r) => (r || []).map(limpio);
    const primerasNoVacias = (r) => r.filter(v => v !== '');
    const filaConEncabezados = (matriz, buscados) =>
        matriz.findIndex(r => buscados.every(b => r.some(v => norm(v) === b)));

    // Especialidades: no trae encabezados; cada fila de datos es CÓDIGO (2 a 5 letras) + NOMBRE
    C.leerEspecialidades = function(matriz) {
        const vistos = new Map();
        matriz.map(fila).forEach(r => {
            const [codigo, nombre] = primerasNoVacias(r);
            if (!codigo || !nombre) return;
            if (!/^[A-Z0-9]{2,5}$/.test(codigo.toUpperCase()) || /^(codigo|abreviatura)$/i.test(norm(codigo))) return;
            if (!/[A-Za-zÁÉÍÓÚÑáéíóúñ]/.test(nombre)) return;
            vistos.set(codigo.toUpperCase(), { codigo: codigo.toUpperCase(), nombre: nombre.toUpperCase() });
        });
        const filas = [...vistos.values()];
        return { filas, resumen: { registros: filas.length } };
    };

    // Laboratorios: encabezados ABREVIATURA · NOMBRE · CODIGO (con celdas combinadas en el medio)
    C.leerLaboratorios = function(matriz) {
        const m = matriz.map(fila);
        const h = filaConEncabezados(m, ['abreviatura', 'nombre']);
        if (h < 0) return { filas: [], error: 'No encontramos los encabezados "ABREVIATURA" y "NOMBRE". ¿Es el archivo de laboratorios?' };
        const col = (n) => m[h].findIndex(v => norm(v) === n);
        const iA = col('abreviatura'), iN = col('nombre'), iC = col('codigo');
        const vistos = new Map();
        m.slice(h + 1).forEach(r => {
            const a = (r[iA] || '').toUpperCase();
            if (!a || norm(a) === 'abreviatura' || !r[iN]) return;
            vistos.set(a, { abreviatura: a, nombre: r[iN].toUpperCase(), codigo: iC >= 0 ? (r[iC] || '') : '' });
        });
        const filas = [...vistos.values()];
        return { filas, resumen: { registros: filas.length } };
    };

    // Productos: UNA fila por producto. Se lee cada hoja (el portal reparte el catálogo en varias)
    C.leerProductos = function(matriz) {
        const m = matriz.map(fila);
        const h = filaConEncabezados(m, ['producto', 'laboratorio', 'molecula']);
        if (h < 0) return { filas: [], error: 'No encontramos los encabezados "Producto", "Laboratorio" y "Molecula". ¿Es el archivo de productos?' };
        const col = (n) => m[h].findIndex(v => norm(v) === n);
        const iP = col('producto'), iL = col('laboratorio'), iM = col('molecula'), iC = col('clase terapeutica'), iG = col('generico');
        const grupos = new Map();
        let leidas = 0;
        m.slice(h + 1).forEach(r => {
            const p = (r[iP] || '').toUpperCase();
            if (!p || norm(p) === 'producto') return;   // encabezados repetidos en otras hojas
            if (iL >= 0 && !r[iL] && iM >= 0 && !r[iM]) return;   // títulos de otras hojas
            leidas++;
            let g = grupos.get(p);
            if (!g) { g = { producto: p, laboratorio: '', molecula: '', generico: '', clases: new Map(), variantes: 0 }; grupos.set(p, g); }
            g.variantes++;
            if (!g.laboratorio && r[iL]) g.laboratorio = r[iL].toUpperCase();
            if (!g.molecula && r[iM]) g.molecula = r[iM].toUpperCase();
            const gen = (r[iG] || '').toUpperCase();
            if (!g.generico && gen) g.generico = gen === 'S' ? 'SI' : (gen === 'N' ? 'NO' : gen);
            const clase = iC >= 0 ? (r[iC] || '').toUpperCase() : '';
            if (clase) g.clases.set(clase, (g.clases.get(clase) || 0) + 1);
        });
        let conVariasClases = 0;
        const filas = [...grupos.values()].map(g => {
            const orden = [...g.clases.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
            if (orden.length > 1) conVariasClases++;
            return { producto: g.producto, laboratorio: g.laboratorio, molecula: g.molecula, generico: g.generico,
                clase_terapeutica: orden.length ? orden[0][0] : '', variantes: g.variantes, clases_distintas: orden.length > 1 ? orden.map(x => x[0]) : [] };
        });
        return { filas, resumen: { leidas, registros: filas.length, conVariasClases } };
    };

    // Clases terapéuticas del portal: "A02A1-ANTIACIDOS SIMPLES" en una sola celda, con niveles
    // (A → A01 → A01A → A02A1). También acepta código y nombre en dos columnas.
    const nivelDeClase = (c) => ({ 1: 1, 3: 2, 4: 3, 5: 4 })[c.length] || null;
    const padreDeClase = (c) => ({ 3: c.slice(0, 1), 4: c.slice(0, 3), 5: c.slice(0, 4) })[c.length] || null;
    C.leerClases = function(matriz) {
        const vistos = new Map();
        matriz.map(fila).forEach(r => {
            const celdas = primerasNoVacias(r);
            if (!celdas.length) return;
            let codigo = '', nombre = '';
            const m = celdas[0].match(/^([A-Z][0-9A-Z]{0,4})\s*-\s*(.+)$/i);
            if (m) { codigo = m[1]; nombre = m[2]; }
            else if (celdas.length >= 2 && /^[A-Z][0-9A-Z]{0,4}$/i.test(celdas[0])) { codigo = celdas[0]; nombre = celdas[1]; }
            codigo = codigo.toUpperCase();
            if (!codigo || !nombre || !nivelDeClase(codigo)) return;
            vistos.set(codigo, { codigo, nombre: limpio(nombre).toUpperCase(), nivel: nivelDeClase(codigo), padre: padreDeClase(codigo) });
        });
        const filas = [...vistos.values()];
        return { filas, resumen: { registros: filas.length } };
    };

    // Nombre de la clase de un producto: "R06A0" → la clase "R06A" (el 0 final = sin subnivel)
    C.claseDe = function(codigo) {
        const c = limpio(codigo).toUpperCase();
        if (!c) return null;
        const mapa = C._mapaClases || new Map();
        return mapa.get(c) || mapa.get(c.replace(/0$/, '')) || mapa.get(c.slice(0, 4)) || mapa.get(c.slice(0, 3)) || null;
    };
    // Grupo anatómico (primer nivel): "R06A0" → "R" y su nombre
    C.grupoDe = function(codigo) {
        const c = limpio(codigo).toUpperCase();
        return c ? ((C._mapaClases || new Map()).get(c[0]) || { codigo: c[0], nombre: c[0] }) : null;
    };

    C.leer = function(tipo, matriz) {
        return ({ especialidades: C.leerEspecialidades, laboratorios: C.leerLaboratorios, productos: C.leerProductos, clases: C.leerClases })[tipo](matriz);
    };

    // Todas las hojas del archivo, una debajo de otra (el portal reparte catálogos grandes en varias hojas)
    // Bytes de un archivo (con respaldo para navegadores sin File.arrayBuffer)
    const bytesDe = (archivo) => (typeof archivo.arrayBuffer === 'function')
        ? archivo.arrayBuffer().then(b => new Uint8Array(b))
        : new Promise((ok, mal) => { const r = new FileReader(); r.onload = () => ok(new Uint8Array(r.result)); r.onerror = () => mal(r.error); r.readAsArrayBuffer(archivo); });
    C.bytesDe = bytesDe;

    C.leerMatriz = async function(archivo) {
        const nombre = archivo.name.toLowerCase();
        const bytes = await bytesDe(archivo);
        if (/\.(xlsx|xls|xlsm)$/.test(nombre)) {
            await window.App.data.loadLibrary('xlsx');
            const libro = XLSX.read(bytes, { type: 'array' });
            return libro.SheetNames.flatMap(n => XLSX.utils.sheet_to_json(libro.Sheets[n], { header: 1, raw: false, defval: '' }))
                .map(f => f.map(v => (v == null ? '' : String(v)))).filter(f => f.some(v => String(v).trim() !== ''));
        }
        const texto = await window.App.data.descomprimirTexto(bytes);
        const { encabezados, filas } = window.App.carga.parsearCsv(texto);
        return [encabezados, ...filas];
    };

    /* ============================================================
       ESTADO Y PANTALLA
    ============================================================ */
    let datos = { especialidades: [], laboratorios: [], productos: [], clases: [] };
    let filtros = { ...C.FILTROS_INICIALES };
    let pendiente = null;   // { tipo, filas, archivo }
    let config = { laboratorios_propios: ['PHQ', 'LST'], productos_phq_excluidos: [], instructivos_descarga: {}, productos_phq: [] };
    let versiones = [];

    /* ---------- "Cómo descargarlo" de cada fuente (lo edita el admin) ---------- */
    C.FUENTES = {
        fichero: 'Fichero médico (CRM)', closeup: 'Mercados de CloseUp',
        especialidades: 'Especialidades', laboratorios: 'Laboratorios', productos: 'Productos', clases: 'Clases terapéuticas'
    };
    C.INSTRUCTIVOS_INICIALES = {
        fichero: '1. Entra al CRM.\n2. Exporta el fichero médico completo (todas las columnas) a Excel o CSV.\n3. En la app: Cargar datos → Fichero médico → Revisar archivo → Subir como borrador → Publicar.\n(Borrador: corrige estos pasos con los de tu CRM.)',
        closeup: '1. Entra al portal de CloseUp.\n2. Reporte "Médicos Prescriptores por Mercado".\n3. Filtros: Edición = la última · Línea = Todas · Periodos = TAM · Geografía = VENEZUELA · Especialidades = TOTAL ESPECIALIDADES.\n4. Descarga cada mercado en CSV y guarda el archivo con el nombre del mercado (la app usa el nombre del archivo).\n5. En la app: Cargar datos → CloseUp.\n(Borrador: corrige estos pasos con los del portal.)',
        especialidades: 'Portal de CloseUp → Exportaciones / Tablas → Especialidades → Exportar a Excel (.xls).\nEn la app: Ajustes → Catálogos → Especialidades → Subir archivo.',
        laboratorios: 'Portal de CloseUp → Exportaciones / Tablas → Laboratorios → Exportar a Excel (.xls).\nEn la app: Ajustes → Catálogos → Laboratorios → Subir archivo.',
        productos: 'Portal de CloseUp → Buscador de Productos → Exportar a Excel (.xls), sin filtros.\nEn la app: Ajustes → Catálogos → Productos → Subir archivo.',
        clases: 'Portal de CloseUp → Exportaciones / Tablas → Clases Terapéuticas → Exportar a Excel (.xls).\nEn la app: Ajustes → Catálogos → Clases terapéuticas → Subir archivo.'
    };
    C.instructivo = (fuente) => (config.instructivos_descarga || {})[fuente] || C.INSTRUCTIVOS_INICIALES[fuente] || '';

    C.datos = () => datos;
    C.filtros = () => filtros;

    const textoError = (e) => {
        const m = String((e && e.original && e.original.message) || (e && e.message) || '');
        if (/catalogo_|admin_guardar_catalogo|does not exist|could not find/i.test(m)) return 'Falta aplicar la migración 17 en Supabase (en Cloud Shell: node 0-preparar-base.mjs).';
        if (/failed to fetch|network/i.test(m)) return 'Sin conexión. Intenta de nuevo.';
        return m.replace(/^[^:]+:\s*/, '') || 'No se pudo completar.';
    };

    C.cargar = async function() {
        const zona = document.getElementById('ajCatalogosCuerpo');
        if (!zona) return;
        zona.innerHTML = '<p class="text-sm text-slate-500">Cargando catálogos…</p>';
        try {
            const [esp, lab, prod, cla, cfg, ver] = await Promise.all(['especialidades', 'laboratorios', 'productos', 'clases']
                .map(t => window.App.sb.catalogo(t)).concat([window.App.sb.configuracion(), window.App.sb.versionesCatalogo().catch(() => [])]));
            datos = { especialidades: esp, laboratorios: lab, productos: prod, clases: cla };
            C._mapaClases = new Map(cla.map(c => [c.codigo, c]));
            filtros = { ...C.FILTROS_INICIALES, ...((cfg && cfg.filtros_closeup) || {}) };
            config = { ...config, ...Object.fromEntries(['laboratorios_propios', 'productos_phq_excluidos', 'instructivos_descarga', 'productos_phq', 'nombres_mercado']
                .filter(k => cfg && cfg[k] != null).map(k => [k, cfg[k]])) };
            versiones = ver || [];
        } catch (e) {
            zona.innerHTML = `<p class="text-sm text-slate-500">${esc(textoError(e))}</p>`;
            return;
        }
        C.pintar();
    };

    // Recordatorio de carga en la campanita del admin (Fase 12E): fuente de la pantalla → tipo de versión
    const TIPO_RECORDATORIO = { closeup: 'recetas', fichero: 'fichero' };
    const diasRecordatorio = (fuente) => {
        const d = (window.App.state.RECORDATORIO_CARGAS || {})[TIPO_RECORDATORIO[fuente]];
        return Number.isFinite(Number(d)) ? Number(d) : 90;
    };
    C.guardarRecordatorio = async function(fuente, valor) {
        const tipo = TIPO_RECORDATORIO[fuente];
        const dias = Math.max(0, Math.min(730, Math.round(Number(valor))));
        if (!tipo || !Number.isFinite(dias)) { toast('Escribe un número de días.'); return; }
        const nuevo = { ...(window.App.state.RECORDATORIO_CARGAS || {}), [tipo]: dias };
        try {
            await window.App.sb.guardarConfiguracion('recordatorio_cargas', nuevo);
            window.App.state.RECORDATORIO_CARGAS = nuevo;
            if (window.App.avisos) window.App.avisos.actualizar();
            toast(dias ? `Listo: te recuerdo cargar ${C.FUENTES[fuente]} cada ${dias} días.` : `Listo: sin recordatorio para ${C.FUENTES[fuente]}.`);
        } catch (e) { toast(textoError(e)); }
    };
    const bloqueInstructivo = (fuente) => `<details class="mt-2 rounded-xl bg-slate-50 px-3 py-2" data-instructivo="${fuente}">
        <summary class="text-xs font-bold text-blue-800 cursor-pointer">Cómo descargarlo${['fichero', 'closeup'].includes(fuente) ? ': ' + esc(C.FUENTES[fuente]) : ''}</summary>
        <p class="text-xs text-slate-700 whitespace-pre-line mt-2">${esc(C.instructivo(fuente))}</p>
        <button type="button" class="boton-texto !h-8 !px-2 mt-1" onclick="App.catalogos.editarInstructivo('${fuente}')"><span class="material-symbols-outlined text-[16px]">edit</span> Editar</button>
        ${TIPO_RECORDATORIO[fuente] ? `<label class="flex items-center gap-2 text-xs text-slate-700 mt-2 pt-2 border-t border-slate-200">
            <span class="material-symbols-outlined text-[18px] text-indigo-700">event_upcoming</span> Recordarme en la campanita cada
            <input type="number" min="0" max="730" step="1" class="campo-mini !w-20" data-recordatorio="${fuente}" value="${esc(diasRecordatorio(fuente))}"
                onchange="App.catalogos.guardarRecordatorio('${fuente}', this.value)" aria-label="Días para recordar cargar ${esc(C.FUENTES[fuente])}"> días
            <span class="text-slate-500">(90 = cada trimestre · 0 = nunca)</span></label>` : ''}
    </details>`;
    C.bloqueInstructivo = bloqueInstructivo;

    // Nombres de mercado: cómo los escribe el portal → cómo se llaman en la app (Fase 12D-2)
    const bloqueNombresMercado = () => {
        const tabla = config.nombres_mercado || {};
        const claves = Object.keys(tabla).sort();
        return `<details class="rounded-2xl border border-slate-200 p-4 mb-4" id="catNombresMercado">
            <summary class="text-base font-bold text-slate-800 cursor-pointer">Nombres de mercado <span class="text-xs font-semibold text-slate-500">(${fmt(claves.length)})</span></summary>
            <p class="text-xs text-slate-600 mt-2">El portal de CloseUp escribe los mercados a su manera ("Esoz", "Bumetin Retard Mercado 2"). Aquí está el nombre que usa la app para cada uno (regla: Mdo + producto, ej. "Mdo Esoz"). Los nuevos se confirman al cargar CloseUp.</p>
            ${claves.length ? `<div class="mt-3 space-y-1.5">${claves.map(k => `<label class="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 text-xs">
                <span class="sm:w-1/2 font-semibold text-slate-700">${esc(k)}</span>
                <input type="text" class="campo-mini !w-full sm:!w-1/2" data-nombre-mercado="${esc(k)}" value="${esc(tabla[k])}"></label>`).join('')}</div>
                <div class="flex justify-end mt-3"><button type="button" class="boton-lleno" onclick="App.catalogos.guardarNombresMercado()"><span class="material-symbols-outlined text-[18px]">save</span> Guardar</button></div>`
            : '<p class="text-xs text-slate-500 mt-2">Todavía no hay nombres: se agregan en la primera carga de CloseUp.</p>'}
        </details>`;
    };
    C.guardarNombresMercado = async function() {
        const tabla = { ...(config.nombres_mercado || {}) };
        document.querySelectorAll('[data-nombre-mercado]').forEach(i => {
            const v = limpio(i.value);   // tal como lo escribe el admin ("Mdo Esoz")
            if (v) tabla[i.dataset.nombreMercado] = v;
        });
        try {
            await window.App.sb.guardarConfiguracion('nombres_mercado', tabla);
            config = { ...config, nombres_mercado: tabla };
            toast('Nombres de mercado guardados. Se usan desde la próxima carga de CloseUp.');
        } catch (e) { toast(textoError(e)); }
    };

    /* ---------- Renombrar mercados ya cargados (migración 19) ---------- */
    // Cambia el nombre en TODAS las versiones de recetas y en las evaluaciones guardadas
    // ("ESOZ MERCADO A02B2" → "Mdo Esoz"). No borra nada y cada cambio se puede deshacer.
    let renombre = { mercados: [], historial: [] };
    const bloqueRenombrar = () => `<details class="rounded-2xl border border-slate-200 p-4 mb-4" id="catRenombrar" ontoggle="if(this.open) App.catalogos.cargarRenombrar()">
        <summary class="text-base font-bold text-slate-800 cursor-pointer">Renombrar mercados ya cargados</summary>
        <p class="text-xs text-slate-600 mt-2">Para unificar los nombres con la regla <b>Mdo + producto</b> ("ESOZ MERCADO A02B2" → "Mdo Esoz").
            Cambia el nombre en <b>todas las versiones</b> de datos y en las <b>evaluaciones</b> de los visitadores, para que sigan enlazadas.
            No se borra nada y cada cambio se puede deshacer.</p>
        <div id="catRenombrarCuerpo" class="mt-3"><p class="text-xs text-slate-500">Cargando…</p></div>
    </details>`;
    const sigueLaRegla = (n) => /^Mdo\s+\S/.test(String(n || ''));
    C.cargarRenombrar = async function() {
        const zona = document.getElementById('catRenombrarCuerpo');
        if (!zona) return;
        try {
            const [m, h] = await Promise.all([window.App.sb.mercadosEnUso(), window.App.sb.renombresMercado().catch(() => [])]);
            renombre = { mercados: m || [], historial: h || [] };
        } catch (e) {
            const t = String((e && e.original && e.original.message) || (e && e.message) || '');
            zona.innerHTML = `<p class="text-xs text-slate-500">${/admin_mercados_en_uso|does not exist|could not find/i.test(t)
                ? 'Falta aplicar la migración 19 en Supabase (en Cloud Shell: node 0-preparar-base.mjs).' : esc(textoError(e))}</p>`;
            return;
        }
        C.pintarRenombrar();
    };
    C.pintarRenombrar = function() {
        const zona = document.getElementById('catRenombrarCuerpo');
        if (!zona) return;
        const { mercados, historial } = renombre;
        const porCambiar = mercados.filter(m => !sigueLaRegla(m.nombre)).length;
        const filas = mercados.map((m, i) => {
            const ok = sigueLaRegla(m.nombre);
            const sug = ok ? m.nombre : window.App.closeup.sugerirNombre(m.nombre);
            return `<label class="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 text-xs py-1 border-t border-slate-100">
                <span class="sm:w-1/2 flex items-start gap-2"><input type="checkbox" class="mt-0.5" data-renombrar-marca="${i}" ${ok ? '' : 'checked'}>
                    <span><b class="text-slate-800">${esc(m.nombre)}</b>${ok ? ' <span class="text-green-700">✓</span>' : ''}<br>
                    <span class="text-slate-500">${fmt(m.versiones)} versión(es)${m.en_vigente ? ' · en la de hoy' : ''} · ${fmt(m.evaluaciones)} evaluación(es)</span></span></span>
                <input type="text" class="campo-mini !w-full sm:!w-1/2" data-renombrar-nuevo="${i}" value="${esc(sug)}" aria-label="Nombre nuevo de ${esc(m.nombre)}"
                    oninput="this.closest('label').querySelector('[data-renombrar-marca]').checked = true"></label>`;
        }).join('');
        const hist = historial.slice(0, 20).map(h => `<li class="flex items-center gap-2 py-1 text-xs ${h.deshecho_en ? 'text-slate-400 line-through' : 'text-slate-700'}">
            <span class="min-w-0 flex-1">${esc(h.viejo)} → <b>${esc(h.nuevo)}</b>${h.fusion ? ' (se juntó)' : ''} · ${fmt((h.evaluaciones || []).length)} evaluación(es)
                <span class="text-slate-400">· ${new Date(h.hecho_en).toLocaleDateString('es-VE')}</span></span>
            ${h.deshecho_en ? '' : `<button type="button" class="boton-texto !h-8 !px-2" onclick="App.catalogos.deshacerRenombre(${Number(h.id)})"><span class="material-symbols-outlined text-[16px]">undo</span> Deshacer</button>`}</li>`).join('');
        zona.innerHTML = mercados.length ? `
            <p class="text-xs text-slate-700 mb-2">${porCambiar ? `<b>${fmt(porCambiar)}</b> mercado(s) no siguen la regla: la app sugiere el nombre; corrígelo si hace falta.` : 'Todos los mercados siguen la regla ✅'}</p>
            <div class="max-h-[28rem] overflow-auto pr-1">${filas}</div>
            <div class="flex justify-end mt-3"><button type="button" class="boton-lleno" onclick="App.catalogos.renombrarMarcados()"><span class="material-symbols-outlined text-[18px]">drive_file_rename_outline</span> Renombrar los marcados</button></div>
            ${hist ? `<details class="mt-3"><summary class="text-xs font-bold text-blue-800 cursor-pointer">Cambios hechos</summary><ul class="mt-1">${hist}</ul></details>` : ''}`
            : '<p class="text-xs text-slate-500">Todavía no hay mercados cargados.</p>';
    };
    C.cambiosMarcados = function() {
        const cambios = [];
        document.querySelectorAll('[data-renombrar-marca]').forEach(c => {
            if (!c.checked) return;
            const i = Number(c.dataset.renombrarMarca);
            const viejo = renombre.mercados[i] && renombre.mercados[i].nombre;
            const input = document.querySelector(`[data-renombrar-nuevo="${i}"]`);
            const nuevo = limpio(input && input.value);
            if (viejo && nuevo && nuevo !== viejo) cambios.push({ viejo, nuevo });
        });
        return cambios;
    };
    C.renombrarMarcados = async function() {
        const cambios = C.cambiosMarcados();
        if (!cambios.length) { toast('No hay cambios: marca los mercados y escribe su nombre nuevo.'); return; }
        const muestra = cambios.slice(0, 6).map(c => `• ${c.viejo} → ${c.nuevo}`).join('\n') + (cambios.length > 6 ? `\n… y ${cambios.length - 6} más` : '');
        if (!window.confirm(`¿Renombrar ${cambios.length} mercado(s)?\n\n${muestra}\n\nCambia en todas las versiones y en las evaluaciones. Se puede deshacer.`)) return;
        try {
            const r = await window.App.sb.renombrarMercados(cambios);
            const evals = (r.resultados || []).reduce((s, x) => s + (x.evaluaciones || 0), 0);
            const sin = (r.resultados || []).reduce((s, x) => s + (x.sin_cambiar || 0), 0);
            const tabla = { ...(config.nombres_mercado || {}) };
            cambios.forEach(c => {
                Object.keys(tabla).forEach(k => { if (tabla[k] === c.viejo) tabla[k] = c.nuevo; });
                if (!(c.viejo.toUpperCase() in tabla)) tabla[c.viejo.toUpperCase()] = c.nuevo;
            });
            config = { ...config, nombres_mercado: tabla };
            toast(`Listo: ${cambios.length} mercado(s) renombrados y ${evals} evaluación(es) actualizadas${sin ? ` (${sin} ya tenían el nombre nuevo y no se tocaron)` : ''}. Recarga la app para verlos.`,
                { accion: 'Recargar', alAccionar: () => window.location.reload(), duracion: 12000 });
            await C.cargarRenombrar();
        } catch (e) { toast(textoError(e)); }
    };
    C.deshacerRenombre = async function(id) {
        const h = renombre.historial.find(x => x.id === id);
        if (!h || !window.confirm(`¿Deshacer "${h.viejo} → ${h.nuevo}"? El mercado vuelve a llamarse "${h.viejo}" en las versiones y evaluaciones que se cambiaron.`)) return;
        try {
            await window.App.sb.deshacerRenombre(id);
            toast('Cambio deshecho. Recarga la app para verlo.', { accion: 'Recargar', alAccionar: () => window.location.reload(), duracion: 12000 });
            await C.cargarRenombrar();
        } catch (e) { toast(textoError(e)); }
    };

    C.pintar = function() {
        const zona = document.getElementById('ajCatalogosCuerpo');
        if (!zona) return;
        const tarjeta = (tipo) => {
            const t = C.TIPOS[tipo], n = datos[tipo].length;
            const extra = tipo === 'productos'
                ? `${fmt(datos.productos.filter(p => (p.clases_distintas || []).length > 1 && !p.editado_a_mano).length)} con varias clases por revisar`
                : (tipo === 'clases' && !n ? 'Opcional: aún sin catálogo' : '');
            return `<div class="catalogo-tarjeta" data-catalogo="${tipo}">
                <div class="flex items-center gap-3">
                    <span class="ajuste-icono bg-blue-50 text-blue-700"><span class="material-symbols-outlined">${t.icono}</span></span>
                    <div class="min-w-0 flex-1"><div class="text-sm font-bold text-slate-800">${t.titulo}</div>
                        <div class="text-xs text-slate-600"><b data-cuenta>${fmt(n)}</b> registros${extra ? ' · ' + esc(extra) : ''}</div></div>
                </div>
                <p class="text-[11px] text-slate-500 mt-2">${esc(t.ayuda)}</p>
                <div class="flex flex-wrap gap-2 mt-3">
                    <label class="boton-tonal cursor-pointer"><span class="material-symbols-outlined text-[18px]">upload</span> Subir archivo
                        <input type="file" class="sr-only" accept=".xls,.xlsx,.csv" onchange="App.catalogos.alElegirArchivo('${tipo}', this)"></label>
                    <button type="button" class="boton-texto" onclick="App.catalogos.ver('${tipo}')"><span class="material-symbols-outlined text-[18px]">search</span> Ver y editar</button>
                    <button type="button" class="boton-texto" onclick="App.catalogos.historial('${tipo}')"><span class="material-symbols-outlined text-[18px]">history</span> Historial</button>
                </div>
                ${bloqueInstructivo(tipo)}
            </div>`;
        };
        const lista = (clave, titulo, ayuda) => `<div class="mb-4">
            <div class="text-sm font-bold text-slate-800">${titulo}</div><p class="text-[11px] text-slate-500 mb-2">${ayuda}</p>
            <div class="flex flex-wrap gap-2" data-filtro="${clave}">${(filtros[clave] || []).map(v =>
                `<span class="chip !h-8"><span>${esc(v)}</span><button type="button" class="-mr-1 w-6 h-6 rounded-full inline-flex items-center justify-center" aria-label="Quitar ${esc(v)}" onclick="App.catalogos.quitarFiltro('${clave}', ${argC(v)})"><span class="material-symbols-outlined text-[16px]">close</span></button></span>`).join('')}
                <span class="inline-flex gap-1"><input type="text" class="campo-mini" id="filtroNuevo_${clave}" placeholder="Agregar…" onkeypress="if(event.key==='Enter') App.catalogos.agregarFiltro('${clave}')">
                <button type="button" class="boton-icono" aria-label="Agregar" onclick="App.catalogos.agregarFiltro('${clave}')"><span class="material-symbols-outlined">add</span></button></span>
            </div></div>`;
        const propios = C.productosDeLabsPropios();
        const nuevosPropios = propios.filter(p => !(config.productos_phq || []).includes(p)).length;
        zona.innerHTML = `
            <div class="grid sm:grid-cols-2 gap-3 mb-6">${Object.keys(C.TIPOS).map(tarjeta).join('')}</div>
            <div class="rounded-2xl bg-green-50 p-4 mb-4">
                <div class="flex items-center gap-2 mb-1"><span class="material-symbols-outlined text-green-800">verified</span>
                    <h4 class="text-base font-bold text-slate-800">Mis laboratorios</h4></div>
                <p class="text-xs text-slate-700 mb-3">Los productos de estos laboratorios del catálogo cuentan como <b>La Santé</b> automáticamente. Los que quites a mano en "Productos del laboratorio" no se vuelven a marcar solos.</p>
                <div class="flex flex-wrap gap-2 mb-3">${(config.laboratorios_propios || []).map(v =>
                    `<span class="chip !h-8"><span>${esc(v)}</span><button type="button" class="-mr-1 w-6 h-6 rounded-full inline-flex items-center justify-center" aria-label="Quitar ${esc(v)}" onclick="App.catalogos.quitarLabPropio(${argC(v)})"><span class="material-symbols-outlined text-[16px]">close</span></button></span>`).join('')}
                    <span class="inline-flex gap-1"><input type="text" class="campo-mini" id="labPropioNuevo" placeholder="Ej. PHQ" onkeypress="if(event.key==='Enter') App.catalogos.agregarLabPropio()">
                    <button type="button" class="boton-icono" aria-label="Agregar laboratorio" onclick="App.catalogos.agregarLabPropio()"><span class="material-symbols-outlined">add</span></button></span></div>
                <p class="text-sm text-slate-700" data-propios>En el catálogo: <b>${fmt(propios.length)}</b> productos de mis laboratorios · marcados hoy como La Santé: <b>${fmt((config.productos_phq || []).length)}</b>${nuevosPropios ? ` · <b class="text-green-800">${fmt(nuevosPropios)} por marcar</b>` : ''}.</p>
                ${nuevosPropios ? `<button type="button" class="boton-lleno mt-3" onclick="App.catalogos.marcarPropios()"><span class="material-symbols-outlined text-[18px]">done_all</span> Marcar ${fmt(nuevosPropios)} como La Santé</button>` : ''}
            </div>
            ${bloqueNombresMercado()}
            ${bloqueRenombrar()}
            <div class="rounded-2xl border border-slate-200 p-4 mb-4">
                <div class="flex items-center gap-2 mb-1"><span class="material-symbols-outlined text-blue-700">menu_book</span>
                    <h4 class="text-base font-bold text-slate-800">Cómo descargar los datos de origen</h4></div>
                <p class="text-xs text-slate-600 mb-2">Para no olvidar los pasos entre una carga y otra. Escríbelos a tu manera: se muestran también al cargar los datos.</p>
                ${['fichero', 'closeup'].map(bloqueInstructivo).join('')}
            </div>
            <div class="rounded-2xl bg-slate-50 p-4">
                <div class="flex items-center gap-2 mb-3"><span class="material-symbols-outlined text-amber-700">filter_alt</span>
                    <h4 class="text-base font-bold text-slate-800">Filtros de la carga de CloseUp</h4></div>
                <p class="text-xs text-slate-600 mb-4">Estas filas se quitan al cargar CloseUp (los mismos filtros de Power Query). Cambiarlos aplica desde la próxima carga.</p>
                ${lista('especialidades_excluir', 'Códigos de especialidad (Esp1) que se quitan', 'Ej. DCR, INS, OTR: instituciones y otros.')}
                ${lista('nombres_especialidad_excluir', 'Especialidades que se quitan (por nombre)', 'Ej. UNIDAD DE CUIDADOS INTENS.')}
                <label class="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" id="filtroMatriculaCero" ${filtros.excluir_matricula_cero ? 'checked' : ''} onchange="App.catalogos.cambiarMatriculaCero(this.checked)">
                    Quitar las filas con matrícula en cero (0, 0000000…)</label>
            </div>`;
    };

    /* ---------- Filtros ---------- */
    const guardarFiltros = async () => {
        try {
            await window.App.sb.guardarConfiguracion('filtros_closeup', filtros);
            toast('Filtros guardados. Se aplican desde la próxima carga de CloseUp.');
        } catch (e) { toast(textoError(e)); }
        C.pintar();
    };
    C.agregarFiltro = function(clave) {
        const el = document.getElementById('filtroNuevo_' + clave);
        const v = limpio(el && el.value).toUpperCase();
        if (!v) return;
        if (!(filtros[clave] || []).includes(v)) filtros = { ...filtros, [clave]: [...(filtros[clave] || []), v] };
        return guardarFiltros();
    };
    C.quitarFiltro = function(clave, v) {
        filtros = { ...filtros, [clave]: (filtros[clave] || []).filter(x => x !== v) };
        return guardarFiltros();
    };
    C.cambiarMatriculaCero = function(si) {
        filtros = { ...filtros, excluir_matricula_cero: !!si };
        return guardarFiltros();
    };

    /* ---------- Ventana ---------- */
    const abrir = (titulo, html) => {
        window.App.ui.safeSetText('catalogoModalTitulo', titulo);
        document.getElementById('catalogoModalCuerpo').innerHTML = html;
        document.getElementById('catalogoModal').classList.remove('hidden');
    };
    C.cerrar = function() {
        document.getElementById('catalogoModal').classList.add('hidden');
        pendiente = null;
    };
    const ocupado = (si) => document.querySelectorAll('#catalogoModalCuerpo button, #catalogoModalCuerpo input').forEach(b => { b.disabled = si; });

    /* ---------- Subir un catálogo ---------- */
    C.alElegirArchivo = async function(tipo, input) {
        const archivo = input && input.files && input.files[0];
        if (!archivo) return;
        input.value = '';
        let matriz;
        try { matriz = await C.leerMatriz(archivo); } catch (e) { toast('No se pudo leer el archivo. ¿Es un Excel o CSV?'); return; }
        C.revisar(tipo, matriz, archivo.name);
        if (pendiente) pendiente.archivo = archivo;
    };

    // Revisa lo leído y muestra qué se guardaría (no guarda nada todavía)
    C.revisar = function(tipo, matriz, nombreArchivo = '') {
        const t = C.TIPOS[tipo];
        const r = C.leer(tipo, matriz);
        if (r.error || !r.filas.length) {
            abrir(`${t.titulo}: no se pudo leer`, `<p class="text-sm text-rose-700">${esc(r.error || 'El archivo no tiene filas reconocibles para este catálogo.')}</p>
                <div class="flex justify-end mt-6"><button type="button" class="boton-lleno" onclick="App.catalogos.cerrar()">Entendido</button></div>`);
            return r;
        }
        const actuales = new Map(datos[tipo].map(x => [x[t.clave], x]));
        const nuevas = r.filas.filter(x => !actuales.has(x[t.clave])).length;
        pendiente = { tipo, filas: r.filas };
        const ejemplo = r.filas.slice(0, 5).map(x => `<li class="truncate">${t.campos.map(([k]) => esc(Array.isArray(x[k]) ? x[k].join('/') : x[k] || '—')).join(' · ')}</li>`).join('');
        abrir(`Revisar ${t.titulo.toLowerCase()}`, `
            <p class="text-sm text-slate-700">${esc(nombreArchivo)}</p>
            <ul class="text-sm text-slate-700 mt-3 space-y-1">
                ${r.resumen.leidas ? `<li>Filas del portal: <b>${fmt(r.resumen.leidas)}</b> → <b>${fmt(r.resumen.registros)}</b> productos (una fila por producto)</li>` : `<li>Registros leídos: <b>${fmt(r.resumen.registros)}</b></li>`}
                <li>Nuevos en la app: <b>${fmt(nuevas)}</b> · ya estaban: <b>${fmt(r.filas.length - nuevas)}</b> (se actualizan si cambiaron)</li>
                ${r.resumen.conVariasClases ? `<li class="text-amber-800">⚠️ <b>${fmt(r.resumen.conVariasClases)}</b> productos traen varias clases terapéuticas: se usa la más frecuente. Puedes corregirlas en "Ver y editar" (lo que corrijas a mano no se pisa en la próxima carga).</li>` : ''}
            </ul>
            <div class="text-[11px] text-slate-500 mt-3">Ejemplos:</div>
            <ul class="text-xs text-slate-600 mt-1 space-y-0.5">${ejemplo}</ul>
            <p class="text-[11px] text-slate-500 mt-3">No se borra nada: lo que ya estaba y no viene en este archivo se queda.</p>
            <p id="catalogoError" class="text-sm text-rose-700 mt-2 min-h-[20px]" role="alert"></p>
            <div class="flex flex-wrap justify-end gap-2 mt-4">
                <button type="button" class="boton-texto" onclick="App.catalogos.cerrar()">Cancelar</button>
                <button type="button" class="boton-lleno" data-accion="confirmar" onclick="App.catalogos.guardarPendiente()"><span class="material-symbols-outlined text-[18px]">save</span> Guardar ${fmt(r.filas.length)}</button>
            </div>`);
        return r;
    };

    C.guardarPendiente = async function() {
        if (!pendiente) return;
        const { tipo, filas, archivo } = pendiente;
        ocupado(true);
        try {
            const r = tipo === 'clases' ? await window.App.sb.guardarClases(filas) : await window.App.sb.guardarCatalogo(tipo, filas);
            // Historial: el archivo original queda guardado (comprimido) con su resumen
            let avisoHistorial = '';
            if (archivo) {
                try { await C.guardarOriginal(tipo, archivo, r, filas.length); }
                catch (e) { avisoHistorial = ' (no se pudo guardar la copia del archivo original)'; }
            }
            toast(`${C.TIPOS[tipo].titulo}: ${fmt(r.nuevas)} nuevos, ${fmt(r.cambiadas)} actualizados, ${fmt(r.iguales)} sin cambios.${avisoHistorial}`, { duracion: 6000 });
            C.cerrar();
            await C.cargar();
            // Productos nuevos de mis laboratorios: se marcan solos como La Santé
            if (tipo === 'productos') await C.marcarPropios({ silencioso: true });
        } catch (e) {
            ocupado(false);
            window.App.ui.safeSetText('catalogoError', textoError(e));
        }
    };

    /* ---------- Ver, buscar y editar ---------- */
    let tipoVisto = null;
    C.ver = function(tipo) {
        tipoVisto = tipo;
        const t = C.TIPOS[tipo];
        abrir(t.titulo, `
            <div class="flex gap-2 mb-3">
                <input type="search" id="catalogoBuscar" class="filter-select !rounded-2xl !bg-none flex-1" placeholder="Buscar…" oninput="App.catalogos.pintarLista()">
                <button type="button" class="boton-tonal" onclick="App.catalogos.editar(null)"><span class="material-symbols-outlined text-[18px]">add</span> Agregar</button>
            </div>
            ${tipo === 'productos' ? `<label class="flex items-center gap-2 text-xs text-slate-600 mb-2"><input type="checkbox" id="catalogoSoloVarias" onchange="App.catalogos.pintarLista()"> Solo los que traen varias clases</label>` : ''}
            <p id="catalogoCuenta" class="text-[11px] text-slate-500 mb-1"></p>
            <ul id="catalogoLista" class="divide-y divide-slate-100 max-h-[50vh] overflow-y-auto"></ul>`);
        C.pintarLista();
    };

    C.pintarLista = function() {
        const t = C.TIPOS[tipoVisto];
        const q = norm((document.getElementById('catalogoBuscar') || {}).value);
        const soloVarias = !!(document.getElementById('catalogoSoloVarias') || {}).checked;
        const todos = datos[tipoVisto].filter(x => (!q || t.campos.some(([k]) => norm(x[k]).includes(q)))
            && (!soloVarias || ((x.clases_distintas || []).length > 1 && !x.editado_a_mano)));
        window.App.ui.safeSetText('catalogoCuenta', todos.length > 100 ? `${fmt(todos.length)} resultados: se muestran los primeros 100.` : `${fmt(todos.length)} resultados.`);
        const nombreClase = { get: (c) => { const x = C.claseDe(c); return x ? x.nombre : null; } };
        document.getElementById('catalogoLista').innerHTML = todos.slice(0, 100).map(x => `
            <li><button type="button" class="w-full text-left py-2 flex items-center gap-2" onclick="App.catalogos.editar(${argC(x[t.clave])})">
                <span class="min-w-0 flex-1"><span class="block text-sm font-semibold text-slate-800 truncate">${esc(x[t.clave])}</span>
                <span class="block text-[11px] text-slate-500 truncate">${t.campos.slice(1).map(([k]) => esc(k === 'clase_terapeutica' && nombreClase.get(x[k]) ? `${x[k]} ${nombreClase.get(x[k])}` : (x[k] || '—'))).join(' · ')}
                ${(x.clases_distintas || []).length > 1 ? ` · <span class="text-amber-800">varias clases: ${esc(x.clases_distintas.join(', '))}</span>` : ''}</span></span>
                <span class="material-symbols-outlined text-slate-400">edit</span></button></li>`).join('') || '<li class="py-3 text-sm text-slate-500">Sin resultados.</li>';
    };

    C.editar = function(clave) {
        const t = C.TIPOS[tipoVisto];
        const x = clave == null ? {} : (datos[tipoVisto].find(y => y[t.clave] === clave) || {});
        abrir(clave == null ? `Agregar a ${t.titulo.toLowerCase()}` : `Editar ${esc(clave)}`, `
            ${t.campos.map(([k, etiqueta], i) => `<label class="campo ${i ? 'mt-3' : ''}">${etiqueta}
                <input type="text" data-campo="${k}" value="${esc(x[k] || '')}" ${i === 0 && clave != null ? 'readonly' : ''}></label>`).join('')}
            ${(x.clases_distintas || []).length > 1 ? `<p class="text-[11px] text-amber-800 mt-2">El portal trae estas clases para este producto: ${esc(x.clases_distintas.join(', '))}.</p>` : ''}
            <p id="catalogoError" class="text-sm text-rose-700 mt-2 min-h-[20px]" role="alert"></p>
            <div class="flex flex-wrap justify-end gap-2 mt-4">
                <button type="button" class="boton-texto" onclick="App.catalogos.ver('${tipoVisto}')">Volver</button>
                <button type="button" class="boton-lleno" data-accion="confirmar" onclick="App.catalogos.guardarEdicion()"><span class="material-symbols-outlined text-[18px]">save</span> Guardar</button>
            </div>`);
    };

    C.guardarEdicion = async function() {
        const t = C.TIPOS[tipoVisto];
        const fila_ = {};
        document.querySelectorAll('#catalogoModalCuerpo [data-campo]').forEach(i => { fila_[i.dataset.campo] = limpio(i.value).toUpperCase(); });
        if (!fila_[t.clave]) { window.App.ui.safeSetText('catalogoError', `Escribe ${t.campos[0][1].toLowerCase()}.`); return; }
        if (tipoVisto === 'productos') {
            const antes = datos.productos.find(p => p.producto === fila_.producto);
            fila_.variantes = antes ? antes.variantes : 1;
            fila_.clases_distintas = antes ? (antes.clases_distintas || []) : [];
            // Lo corregido a mano se respeta: subir el catálogo otra vez no lo pisa
            fila_.editado_a_mano = true;
        }
        if (tipoVisto === 'clases') { fila_.nivel = nivelDeClase(fila_.codigo); fila_.padre = padreDeClase(fila_.codigo); }
        ocupado(true);
        try {
            if (tipoVisto === 'clases') await window.App.sb.guardarClases([fila_]);
            else await window.App.sb.guardarCatalogo(tipoVisto, [fila_]);
            const lista = datos[tipoVisto].filter(y => y[t.clave] !== fila_[t.clave]);
            datos = { ...datos, [tipoVisto]: [...lista, fila_].sort((a, b) => String(a[t.clave]).localeCompare(String(b[t.clave]))) };
            if (tipoVisto === 'clases') C._mapaClases = new Map(datos.clases.map(c => [c.codigo, c]));
            toast('Guardado.');
            C.pintar();
            C.ver(tipoVisto);
        } catch (e) {
            ocupado(false);
            window.App.ui.safeSetText('catalogoError', textoError(e));
        }
    };

    /* ---------- Historial de cada catálogo ---------- */
    // Comprimido con gzip (si el navegador no puede, se guarda tal cual)
    const comprimir = async (archivo) => {
        const bytes = await bytesDe(archivo);
        if (typeof CompressionStream === 'undefined' || typeof Response === 'undefined') return new Blob([bytes]);
        try { return await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'))).blob(); }
        catch (e) { return new Blob([bytes]); }
    };
    C.guardarOriginal = async function(tipo, archivo, r, registros) {
        const fecha = new Date().toISOString().replace(/[:.]/g, '-');
        const ruta = `catalogos/${tipo}/${fecha}_${String(archivo.name || 'archivo').replace(/[^\w.-]+/g, '_')}.gz`;
        const blob = await comprimir(archivo);
        await window.App.sb.subirArchivo(ruta, blob);
        await window.App.sb.registrarVersionCatalogo({ tipo, nombre_archivo: archivo.name || 'archivo', ruta, bytes: blob.size,
            registros, nuevas: r.nuevas || 0, cambiadas: r.cambiadas || 0 });
    };
    C.historial = function(tipo) {
        const t = C.TIPOS[tipo];
        const lista = versiones.filter(v => v.tipo === tipo);
        abrir(`Historial: ${t.titulo.toLowerCase()}`, `
            <p class="text-xs text-slate-600 mb-3">Cada archivo que subiste queda guardado tal cual (comprimido), por si necesitas ver o volver a una versión anterior.</p>
            <ul class="divide-y divide-slate-100">${lista.map(v => `<li class="py-2 flex items-center gap-2">
                <span class="min-w-0 flex-1"><span class="block text-sm font-semibold text-slate-800 truncate">${esc(v.nombre_archivo)}</span>
                <span class="block text-[11px] text-slate-500">${new Date(v.subido_en).toLocaleString('es-VE', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                · ${fmt(v.registros)} registros · ${fmt(v.nuevas)} nuevos · ${fmt(v.cambiadas)} actualizados</span></span>
                ${v.ruta ? `<button type="button" class="boton-icono" title="Descargar el original" aria-label="Descargar ${esc(v.nombre_archivo)}" onclick="App.catalogos.descargarOriginal(${argC(v.ruta)})"><span class="material-symbols-outlined">download</span></button>` : ''}
            </li>`).join('') || '<li class="py-3 text-sm text-slate-500">Todavía no hay archivos guardados. Se guardan desde la próxima vez que subas este catálogo.</li>'}</ul>
            <div class="flex justify-end mt-4"><button type="button" class="boton-lleno" onclick="App.catalogos.cerrar()">Listo</button></div>`);
    };
    C.descargarOriginal = async function(ruta) {
        try { window.open(await window.App.sb.urlArchivo(ruta), '_blank', 'noopener'); }
        catch (e) { toast(textoError(e)); }
    };

    // En "Cargar datos": los pasos para descargar el archivo elegido (fichero o CloseUp)
    C.instructivoEnCarga = async function() {
        const zona = document.getElementById('cargaInstructivo');
        const tipo = (document.querySelector('input[name="cargaTipo"]:checked') || {}).value;
        if (!zona || !tipo) return;
        const fuente = tipo === 'recetas' ? 'closeup' : 'fichero';
        try { const cfg = await window.App.sb.configuracion(); if (cfg && cfg.instructivos_descarga) config = { ...config, instructivos_descarga: cfg.instructivos_descarga }; }
        catch (e) { /* sin conexión: se muestra lo que hay */ }
        zona.innerHTML = `<details class="rounded-xl bg-blue-50 px-3 py-2"><summary class="text-xs font-bold text-blue-800 cursor-pointer">Cómo descargar este archivo</summary>
            <p class="text-xs text-slate-700 whitespace-pre-line mt-2">${esc(C.instructivo(fuente))}</p>
            <p class="text-[11px] text-slate-500 mt-1">Se edita en Ajustes → Catálogos → "Cómo descargar los datos de origen".</p></details>`;
    };

    /* ---------- "Cómo descargarlo": editar el texto ---------- */
    C.editarInstructivo = function(fuente) {
        abrir(`Cómo descargar: ${C.FUENTES[fuente]}`, `
            <label class="campo">Pasos (escríbelos como te sirvan)<textarea id="instructivoTexto" rows="9">${esc(C.instructivo(fuente))}</textarea></label>
            <p id="catalogoError" class="text-sm text-rose-700 mt-2 min-h-[20px]" role="alert"></p>
            <div class="flex flex-wrap justify-end gap-2 mt-4">
                <button type="button" class="boton-texto" onclick="App.catalogos.cerrar()">Cancelar</button>
                <button type="button" class="boton-lleno" data-accion="confirmar" onclick="App.catalogos.guardarInstructivo('${fuente}')"><span class="material-symbols-outlined text-[18px]">save</span> Guardar</button>
            </div>`);
    };
    C.guardarInstructivo = async function(fuente) {
        const texto = String((document.getElementById('instructivoTexto') || {}).value || '').trim();
        const nuevo = { ...(config.instructivos_descarga || {}), [fuente]: texto };
        ocupado(true);
        try {
            await window.App.sb.guardarConfiguracion('instructivos_descarga', nuevo);
            config = { ...config, instructivos_descarga: nuevo };
            toast('Guardado.');
            C.cerrar();
            C.pintar();
        } catch (e) { ocupado(false); window.App.ui.safeSetText('catalogoError', textoError(e)); }
    };

    /* ---------- Mis laboratorios: productos propios automáticos ---------- */
    C.productosDeLabsPropios = function() {
        const labs = new Set((config.laboratorios_propios || []).map(x => String(x).toUpperCase()));
        const excluidos = new Set(config.productos_phq_excluidos || []);
        return datos.productos.filter(p => labs.has(String(p.laboratorio || '').toUpperCase()) && !excluidos.has(p.producto)).map(p => p.producto);
    };
    C.marcarPropios = async function({ silencioso = false } = {}) {
        const actuales = config.productos_phq || [];
        const nuevos = C.productosDeLabsPropios().filter(p => !actuales.includes(p));
        if (!nuevos.length) { if (!silencioso) toast('Todos los productos de tus laboratorios ya están marcados.'); return 0; }
        const lista = [...actuales, ...nuevos].sort();
        const ok = await window.App.admin.guardarConfig({ productos_phq: lista });
        if (!ok) return 0;
        config = { ...config, productos_phq: lista };
        window.App.state.PHQ_PRODUCTS = lista;
        window.App.state._lastUniverseSignature = null;
        if ((window.App.state.RAW_DATA || []).length && window.App.main && window.App.main.processData) window.App.main.processData();
        toast(`${fmt(nuevos.length)} productos de tus laboratorios quedaron marcados como La Santé.`, { duracion: 6000 });
        C.pintar();
        return nuevos.length;
    };
    const guardarLabs = async (lista) => {
        try {
            await window.App.sb.guardarConfiguracion('laboratorios_propios', lista);
            config = { ...config, laboratorios_propios: lista };
            window.App.state.LABS_PROPIOS = lista.slice();
            C.pintar();
        } catch (e) { toast(textoError(e)); }
    };
    C.agregarLabPropio = function() {
        const v = limpio((document.getElementById('labPropioNuevo') || {}).value).toUpperCase();
        if (!v || (config.laboratorios_propios || []).includes(v)) return;
        if (datos.laboratorios.length && !datos.laboratorios.some(l => l.abreviatura === v)) toast(`Ojo: "${v}" no está en el catálogo de laboratorios.`);
        return guardarLabs([...(config.laboratorios_propios || []), v]);
    };
    C.quitarLabPropio = function(v) { return guardarLabs((config.laboratorios_propios || []).filter(x => x !== v)); };
    // Lo que el admin quita a mano en "Productos del laboratorio" no se vuelve a marcar solo
    C.registrarCambioPropios = async function(antes, despues) {
        const quitados = antes.filter(p => !despues.includes(p));
        const agregados = despues.filter(p => !antes.includes(p));
        if (!quitados.length && !agregados.length) return;
        let cfgActual = config;
        try { const cfg = await window.App.sb.configuracion(); cfgActual = { ...config, productos_phq_excluidos: cfg.productos_phq_excluidos || [] }; } catch (e) { /* se usa lo que hay */ }
        const excl = new Set(cfgActual.productos_phq_excluidos || []);
        quitados.forEach(p => excl.add(p));
        agregados.forEach(p => excl.delete(p));
        const lista = [...excl].sort();
        try { await window.App.sb.guardarConfiguracion('productos_phq_excluidos', lista); config = { ...config, productos_phq_excluidos: lista, productos_phq: despues }; }
        catch (e) { /* no impide guardar los productos */ }
    };

    console.log('[SegmentApp] catalogos.js cargado.');
})();

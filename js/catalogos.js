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

    // Clases terapéuticas: código + nombre (con o sin encabezados)
    C.leerClases = function(matriz) {
        const vistos = new Map();
        matriz.map(fila).forEach(r => {
            const [codigo, nombre] = primerasNoVacias(r);
            if (!codigo || !nombre || /^(codigo|clase)/i.test(norm(codigo))) return;
            if (!/^[A-Z0-9]{3,8}$/.test(codigo.toUpperCase())) return;
            vistos.set(codigo.toUpperCase(), { codigo: codigo.toUpperCase(), nombre: nombre.toUpperCase() });
        });
        const filas = [...vistos.values()];
        return { filas, resumen: { registros: filas.length } };
    };

    C.leer = function(tipo, matriz) {
        return ({ especialidades: C.leerEspecialidades, laboratorios: C.leerLaboratorios, productos: C.leerProductos, clases: C.leerClases })[tipo](matriz);
    };

    // Todas las hojas del archivo, una debajo de otra (el portal reparte catálogos grandes en varias hojas)
    C.leerMatriz = async function(archivo) {
        const nombre = archivo.name.toLowerCase();
        const bytes = new Uint8Array(await archivo.arrayBuffer());
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
    let pendiente = null;   // { tipo, filas, resumen, archivo }

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
            const [esp, lab, prod, cla, cfg] = await Promise.all(['especialidades', 'laboratorios', 'productos', 'clases']
                .map(t => window.App.sb.catalogo(t)).concat([window.App.sb.configuracion()]));
            datos = { especialidades: esp, laboratorios: lab, productos: prod, clases: cla };
            filtros = { ...C.FILTROS_INICIALES, ...((cfg && cfg.filtros_closeup) || {}) };
        } catch (e) {
            zona.innerHTML = `<p class="text-sm text-slate-500">${esc(textoError(e))}</p>`;
            return;
        }
        C.pintar();
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
                </div>
            </div>`;
        };
        const lista = (clave, titulo, ayuda) => `<div class="mb-4">
            <div class="text-sm font-bold text-slate-800">${titulo}</div><p class="text-[11px] text-slate-500 mb-2">${ayuda}</p>
            <div class="flex flex-wrap gap-2" data-filtro="${clave}">${(filtros[clave] || []).map(v =>
                `<span class="chip !h-8"><span>${esc(v)}</span><button type="button" class="-mr-1 w-6 h-6 rounded-full inline-flex items-center justify-center" aria-label="Quitar ${esc(v)}" onclick="App.catalogos.quitarFiltro('${clave}', ${argC(v)})"><span class="material-symbols-outlined text-[16px]">close</span></button></span>`).join('')}
                <span class="inline-flex gap-1"><input type="text" class="campo-mini" id="filtroNuevo_${clave}" placeholder="Agregar…" onkeypress="if(event.key==='Enter') App.catalogos.agregarFiltro('${clave}')">
                <button type="button" class="boton-icono" aria-label="Agregar" onclick="App.catalogos.agregarFiltro('${clave}')"><span class="material-symbols-outlined">add</span></button></span>
            </div></div>`;
        zona.innerHTML = `
            <div class="grid sm:grid-cols-2 gap-3 mb-6">${Object.keys(C.TIPOS).map(tarjeta).join('')}</div>
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
        const { tipo, filas } = pendiente;
        ocupado(true);
        try {
            const r = await window.App.sb.guardarCatalogo(tipo, filas);
            toast(`${C.TIPOS[tipo].titulo}: ${fmt(r.nuevas)} nuevos, ${fmt(r.cambiadas)} actualizados, ${fmt(r.iguales)} sin cambios.`, { duracion: 6000 });
            C.cerrar();
            await C.cargar();
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
        const nombreClase = new Map(datos.clases.map(c => [c.codigo, c.nombre]));
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
        ocupado(true);
        try {
            await window.App.sb.guardarCatalogo(tipoVisto, [fila_]);
            const lista = datos[tipoVisto].filter(y => y[t.clave] !== fila_[t.clave]);
            datos = { ...datos, [tipoVisto]: [...lista, fila_].sort((a, b) => String(a[t.clave]).localeCompare(String(b[t.clave]))) };
            toast('Guardado.');
            C.pintar();
            C.ver(tipoVisto);
        } catch (e) {
            ocupado(false);
            window.App.ui.safeSetText('catalogoError', textoError(e));
        }
    };

    console.log('[SegmentApp] catalogos.js cargado.');
})();

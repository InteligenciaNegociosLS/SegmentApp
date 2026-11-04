/* ============================================================
   SegmentApp - CloseUp en un solo paso (solo administrador, Fase 12D)
   Archivo: js/closeup.js
   Hace en el navegador lo mismo que la consulta de Power Query del dueño:
   1. Lee los archivos de mercado TAL COMO salen del portal (CSV ";",
      Windows-1252; títulos arriba: "Edicion: 09/2026", "Periodos: TAM…").
      Acepta varios archivos a la vez o un .zip.
   2. El MERCADO es el nombre del archivo (decisión del dueño).
   3. Quita: matrícula en cero, especialidades DCR/INS/OTR y "UNIDAD DE
      CUIDADOS INTENS" (filtros editables en Ajustes → Catálogos).
   4. Cruza con los catálogos: especialidad (Esp1 → nombre), producto
      (UNA fila por producto: molécula, clase, genérico, laboratorio) y
      laboratorio (abreviatura → nombre).
   5. Matrícula con ceros a la izquierda hasta 10 dígitos; quita repetidas.
   6. Deja las mismas 15 columnas de siempre, más un informe con alertas.
   Nada llega a Supabase hasta que el admin sube la versión: entonces va
   UNA sola versión (como hoy), sin importar cuántos archivos fueron.
============================================================ */
(function() {
    window.App = window.App || {};
    const CU = window.App.closeup = {};

    const limpio = (v) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
    const norm = (v) => limpio(v).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

    /* ---------- Lectura de bytes y texto ---------- */
    // UTF-8 si se puede leer como tal; si no, Windows-1252 (como lo guarda el portal)
    CU.decodificar = function(bytes) {
        if (bytes.length >= 3 && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) return new TextDecoder('utf-8').decode(bytes.subarray(3));
        // (un corte a mitad de una letra al leer solo el comienzo no debe cambiar la decisión)
        try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
        catch (e) { return new TextDecoder('windows-1252').decode(bytes); }
    };
    const nombreSinExtension = (n) => limpio(String(n || '').split(/[\\/]/).pop().replace(/\.(csv|txt|gz)$/i, '').replace(/\.(csv|txt)$/i, ''));
    CU.mercadoDeArchivo = (nombre) => nombreSinExtension(nombre).toUpperCase();
    // Nombre del mercado como viene en el portal ("Esoz", "Bumetin Retard Mercado 2") → clave para la tabla de nombres
    CU.claveMercado = (crudo) => limpio(crudo).toUpperCase();
    // Nombre oficial: el de la tabla de nombres (Ajustes → Catálogos); si aún no tiene, el del portal en mayúsculas
    CU.nombreMercado = (crudo, ctx) => {
        const k = CU.claveMercado(crudo);
        const tabla = (ctx && ctx.nombresMercado) || {};
        return tabla[k] ? limpio(tabla[k]).toUpperCase() : k;
    };
    // Sugerencia para un nombre nuevo: el mercado de la versión de hoy que más se le parece
    CU.sugerirMercado = function(crudo, existentes) {
        const palabras = CU.claveMercado(crudo).split(/[^A-Z0-9]+/).filter(w => w.length > 1);
        let mejor = null, puntos = 0;
        (existentes || []).forEach(e => {
            const ew = String(e).toUpperCase().split(/[^A-Z0-9]+/);
            const p = palabras.filter(w => ew.includes(w)).length + (ew[0] === palabras[0] ? 0.5 : 0);
            if (p > puntos) { puntos = p; mejor = e; }
        });
        return puntos >= 1 ? mejor : null;
    };

    // ¿Es un archivo crudo del portal? (encabezados "Matricula" y "Productos1" en las primeras filas)
    CU.esCrudo = function(texto) {
        const primeras = String(texto || '').slice(0, 6000).split(/\r?\n/).slice(0, 25);
        return primeras.some(l => { const c = l.split(';').map(norm); return c.includes('matricula') && c.includes('productos1'); });
    };

    /* ---------- Un archivo de mercado ---------- */
    // ctx = { especialidades: Map(codigo→nombre), productos: Map(producto→{...}), laboratorios: Map(abrev→nombre),
    //         claseDe: fn(codigo)→{codigo,nombre}|null, filtros }
    CU.leerArchivo = function(texto, nombreArchivo, ctx) {
        const { encabezados, filas } = window.App.carga.parsearCsv(texto, ';');
        const matriz = [encabezados, ...filas];
        const h = matriz.findIndex(r => { const c = r.map(norm); return c.includes('matricula') && c.includes('productos1'); });
        if (h < 0) return { error: `"${nombreArchivo}" no parece un archivo de mercado de CloseUp (no tiene las columnas "Matricula" y "Productos1").` };
        const titulo = matriz.slice(0, h).map(r => r.join(' ')).join('\n');
        const ed = titulo.match(/edici[oó]n:\s*(\d{1,2})\/(\d{4})/i);
        const per = titulo.match(/periodos?:\s*([^\n;]+)/i);
        const cab = matriz[h].map(norm);
        const col = (n) => cab.indexOf(n);
        const i = { nom: col('nombre'), mat: col('matricula'), esp: col('esp1'), prod: col('productos1'), px: col('px1'), unico: col('medicounico'),
            dom: col('domicilio'), cp: col('codpostal'), loc: col('localidad'), reg: col('region') };
        const faltan = Object.entries(i).filter(([, v]) => v < 0).map(([k]) => k);
        if (faltan.length) return { error: `"${nombreArchivo}": faltan columnas (${faltan.join(', ')}).` };
        // El mercado sale de la columna "Mercado" (un archivo puede traer varios); si no está, del nombre del archivo
        const iMer = col('mercado');
        const porArchivo = CU.mercadoDeArchivo(nombreArchivo);
        const nombresCrudos = new Map();   // nombre del portal → filas
        const f = ctx.filtros || {};
        const espExcluir = new Set((f.especialidades_excluir || []).map(x => String(x).toUpperCase()));
        const nomExcluir = new Set((f.nombres_especialidad_excluir || []).map(x => String(x).toUpperCase()));
        const salida = [];
        const quitadas = { matricula: 0, especialidad: 0, nombreEspecialidad: 0 };
        const sinCatalogo = { especialidades: new Set(), productos: new Set(), laboratorios: new Set() };
        let leidas = 0;
        matriz.slice(h + 1).forEach(r => {
            if (!r || r.every(v => limpio(v) === '')) return;
            leidas++;
            const matRaw = limpio(r[i.mat]);
            if (f.excluir_matricula_cero !== false && (!matRaw || /^0+$/.test(matRaw))) { quitadas.matricula++; return; }
            const esp1 = limpio(r[i.esp]).toUpperCase();
            if (espExcluir.has(esp1)) { quitadas.especialidad++; return; }
            const especialidad = ctx.especialidades.get(esp1);
            if (!especialidad && esp1) sinCatalogo.especialidades.add(esp1);
            const espNombre = especialidad || esp1;
            if (nomExcluir.has(String(espNombre).toUpperCase())) { quitadas.nombreEspecialidad++; return; }
            const producto = limpio(r[i.prod]).toUpperCase();
            const p = ctx.productos.get(producto);
            if (!p && producto) sinCatalogo.productos.add(producto);
            const labAbrev = p ? limpio(p.laboratorio).toUpperCase() : '';
            const laboratorio = labAbrev ? (ctx.laboratorios.get(labAbrev) || labAbrev) : '';
            if (labAbrev && !ctx.laboratorios.has(labAbrev)) sinCatalogo.laboratorios.add(labAbrev);
            const claseCod = p ? limpio(p.clase_terapeutica).toUpperCase() : '';
            const clase = claseCod ? (ctx.claseDe(claseCod) || null) : null;
            const rx = parseInt(String(r[i.px]).replace(/[.\s]/g, ''), 10) || 0;
            const crudo = iMer >= 0 && limpio(r[iMer]) ? CU.claveMercado(r[iMer]) : porArchivo;
            nombresCrudos.set(crudo, (nombresCrudos.get(crudo) || 0) + 1);
            const mercado = iMer >= 0 && limpio(r[iMer]) ? CU.nombreMercado(r[iMer], ctx) : porArchivo;
            salida.push([
                limpio(r[i.nom]), matRaw.padStart(10, '0'), mercado, producto, rx,
                limpio(r[i.unico]), limpio(r[i.dom]), limpio(r[i.cp]), limpio(r[i.loc]), limpio(r[i.reg]),
                espNombre, p ? limpio(p.molecula) : '', clase ? `${clase.codigo} ${clase.nombre}` : (claseCod || 'SIN DATOS'),
                p ? limpio(p.generico) : '', laboratorio
            ]);
        });
        return { archivo: nombreArchivo, edicion: ed ? `${ed[1].padStart(2, '0')}/${ed[2]}` : '', periodo: per ? limpio(per[1]) : '',
            filas: salida, leidas, quitadas, sinCatalogo, nombresCrudos, porColumna: iMer >= 0 };
    };

    /* ---------- Todos los archivos: consolidado + informe ---------- */
    CU.consolidar = function(archivos, ctx, anterior = null) {
        const errores = [], porMercado = [];
        const vistos = new Set();
        const filas = [];
        const sinCatalogo = { especialidades: new Set(), productos: new Set(), laboratorios: new Set() };
        const ediciones = new Set();
        let repetidas = 0;
        const mercados = new Map();         // nombre oficial → { mercado, archivos, crudos, leidas?, filas, rx }
        const crudosVistos = new Map();     // nombre del portal → { filas, archivos }
        const archivoDe = new Map();        // nombre del portal → primer archivo donde apareció
        archivos.forEach(({ nombre, texto }) => {
            const r = CU.leerArchivo(texto, nombre, ctx);
            if (r.error) { errores.push(r.error); return; }
            if (r.edicion) ediciones.add(r.edicion);
            r.nombresCrudos.forEach((n, crudo) => {
                const c = crudosVistos.get(crudo) || { filas: 0, archivos: new Set() };
                c.filas += n; c.archivos.add(nombre); crudosVistos.set(crudo, c);
                if (archivoDe.has(crudo) && archivoDe.get(crudo) !== nombre) {
                    errores.push(`El mercado "${crudo}" viene en dos archivos (${archivoDe.get(crudo)} y ${nombre}). Quita uno para no sumarlo dos veces.`);
                }
                if (!archivoDe.has(crudo)) archivoDe.set(crudo, nombre);
            });
            r.filas.forEach(f => {
                const clave = f.join('\u0001');
                if (vistos.has(clave)) { repetidas++; return; }
                vistos.add(clave); filas.push(f);
                const m = mercados.get(f[2]) || { mercado: f[2], archivos: new Set(), filas: 0, rx: 0 };
                m.filas++; m.rx += f[4]; m.archivos.add(nombre); mercados.set(f[2], m);
            });
            Object.keys(sinCatalogo).forEach(k => r.sinCatalogo[k].forEach(x => sinCatalogo[k].add(x)));
            porMercado.push({ archivo: nombre, leidas: r.leidas, quitadas: r.quitadas });
        });
        // Por mercado (oficial), sumando todos los archivos
        const archivosLeidos = porMercado.splice(0);
        mercados.forEach(m => porMercado.push({ mercado: m.mercado, archivo: [...m.archivos].join(', '), filas: m.filas, rx: m.rx,
            crudos: [...crudosVistos.keys()].filter(c => CU.nombreMercado(c, ctx) === m.mercado) }));
        porMercado.sort((a, b) => a.mercado.localeCompare(b.mercado));
        // Nombres del portal que todavía no están en la tabla de nombres
        const tabla = ctx.nombresMercado || {};
        const existentes = anterior && anterior.porMercado ? [...anterior.porMercado.keys()] : [];
        const nombres = [...crudosVistos.entries()].map(([crudo, c]) => ({ crudo, filas: c.filas, oficial: tabla[crudo] || null,
            sugerencia: tabla[crudo] ? null : (CU.sugerirMercado(crudo, existentes) || crudo) })).sort((a, b) => a.crudo.localeCompare(b.crudo));
        const sinNombre = nombres.filter(n => !n.oficial);

        // Comparación con la versión anterior (la que usa hoy la app)
        const alertas = [];
        const totalRx = filas.reduce((s, f) => s + f[4], 0);
        const esPropio = ctx.esPropio || (() => false);
        const rxPropio = filas.reduce((s, f) => s + (esPropio(f[3]) ? f[4] : 0), 0);
        if (ediciones.size > 1) alertas.push({ tipo: 'aviso', texto: `Los archivos son de ediciones distintas: ${[...ediciones].join(', ')}.` });
        if (anterior && anterior.porMercado && anterior.porMercado.size) {
            porMercado.forEach(m => {
                const a = anterior.porMercado.get(m.mercado);
                m.filasAntes = a ? a.filas : null; m.rxAntes = a ? a.rx : null;
                if (a && a.filas > 50 && m.filas < a.filas * 0.7) alertas.push({ tipo: 'aviso', texto: `"${m.mercado}" trae ${Math.round((1 - m.filas / a.filas) * 100)}% menos filas que la carga anterior (${m.filas} vs ${a.filas}). ¿Archivo incompleto?` });
                if (!a) alertas.push({ tipo: 'info', texto: `Mercado nuevo respecto a la carga anterior: "${m.mercado}".` });
            });
            const faltan = [...anterior.porMercado.keys()].filter(k => !mercados.has(k));
            if (faltan.length) alertas.push({ tipo: 'aviso', texto: `Faltan ${faltan.length} mercado(s) que estaban en la carga anterior${faltan.length <= 3 ? ': ' + faltan.join(', ') : ''}.`, lista: faltan.sort() });
            const propiosAhora = new Set(filas.filter(f => esPropio(f[3])).map(f => f[3]));
            const propiosAusentes = [...(anterior.productosPropios || [])].filter(p => !propiosAhora.has(p));
            if (propiosAusentes.length) alertas.push({ tipo: 'aviso', texto: `${propiosAusentes.length} producto(s) de La Santé que estaban y ya no aparecen${propiosAusentes.length <= 3 ? ': ' + propiosAusentes.join(', ') : ''}.`, lista: propiosAusentes.sort() });
        }
        if (sinCatalogo.productos.size) alertas.push({ tipo: 'aviso', texto: `${sinCatalogo.productos.size} producto(s) no están en el catálogo (quedan sin molécula, clase ni laboratorio). Agrégalos en Ajustes → Catálogos → Productos.`, lista: [...sinCatalogo.productos].sort() });
        if (sinCatalogo.especialidades.size) alertas.push({ tipo: 'aviso', texto: `${sinCatalogo.especialidades.size} código(s) de especialidad no están en el catálogo (se deja el código).`, lista: [...sinCatalogo.especialidades].sort() });
        if (sinCatalogo.laboratorios.size) alertas.push({ tipo: 'info', texto: `${sinCatalogo.laboratorios.size} laboratorio(s) sin nombre en el catálogo (se deja la abreviatura).`, lista: [...sinCatalogo.laboratorios].sort() });

        const edicion = [...ediciones].sort().pop() || '';
        return {
            errores, alertas, porMercado, archivosLeidos, nombres, sinNombre, repetidas, edicion, sinCatalogo,
            leido: { encabezados: window.App.carga.COLUMNAS_RECETAS.slice(), filas: filas.map(f => f.map(v => String(v))) },
            resumen: { archivos: porMercado.length, filas: filas.length, rx: totalRx, rxPropio, share: totalRx ? rxPropio / totalRx * 100 : 0,
                shareAntes: anterior && anterior.rx ? anterior.rxPropio / anterior.rx * 100 : null, rxAntes: anterior ? anterior.rx : null }
        };
    };

    // Fecha de corte a partir de la edición "09/2026" → "2026-09-30"
    CU.fechaDeEdicion = function(edicion) {
        const m = String(edicion || '').match(/^(\d{2})\/(\d{4})$/);
        if (!m) return '';
        const ultimo = new Date(Date.UTC(+m[2], +m[1], 0)).getUTCDate();
        return `${m[2]}-${m[1]}-${String(ultimo).padStart(2, '0')}`;
    };

    // La versión que usa hoy la app, para comparar (filas y recetas por mercado, productos propios)
    CU.resumenAnterior = function() {
        const st = window.App.state;
        const datos = st.RAW_DATA || [];
        if (!datos.length) return null;
        const porMercado = new Map();
        let rx = 0, rxPropio = 0;
        const propios = new Set();
        datos.forEach(r => {
            const m = String(r.market || '').toUpperCase();
            const x = porMercado.get(m) || { filas: 0, rx: 0 };
            x.filas++; x.rx += r.rx || 0; porMercado.set(m, x);
            rx += r.rx || 0;
            if (window.App.data.isPhq(r.prod)) { rxPropio += r.rx || 0; propios.add(String(r.prod).toUpperCase()); }
        });
        return { porMercado, rx, rxPropio, productosPropios: propios };
    };

    /* ---------- Catálogos y filtros para el cruce ---------- */
    CU.contexto = async function() {
        const sb = window.App.sb;
        const [esp, lab, prod, cla, cfg] = await Promise.all([sb.catalogo('especialidades'), sb.catalogo('laboratorios'), sb.catalogo('productos'),
            sb.catalogo('clases'), sb.configuracion()]);
        const clases = new Map(cla.map(c => [c.codigo, c]));
        const claseDe = (c) => clases.get(c) || clases.get(c.replace(/0$/, '')) || clases.get(c.slice(0, 4)) || clases.get(c.slice(0, 3)) || null;
        return {
            especialidades: new Map(esp.map(e => [String(e.codigo).toUpperCase(), e.nombre])),
            laboratorios: new Map(lab.map(l => [String(l.abreviatura).toUpperCase(), l.nombre])),
            productos: new Map(prod.map(p => [String(p.producto).toUpperCase(), p])),
            claseDe,
            filtros: { especialidades_excluir: ['DCR', 'INS', 'OTR'], nombres_especialidad_excluir: ['UNIDAD DE CUIDADOS INTENS'], excluir_matricula_cero: true, ...((cfg && cfg.filtros_closeup) || {}) },
            esPropio: (prodNombre) => window.App.data.isPhq(prodNombre),
            nombresMercado: (cfg && cfg.nombres_mercado) || {},
            vacio: !esp.length || !prod.length
        };
    };

    /* ---------- Archivos elegidos → [{ nombre, bytes }] (abre los .zip) ---------- */
    CU.expandir = async function(archivos) {
        const salida = [];
        for (const a of archivos) {
            const bytes = await window.App.catalogos.bytesDe(a);
            if (/\.zip$/i.test(a.name)) {
                await window.App.data.loadLibrary('jszip');
                const zip = await JSZip.loadAsync(bytes);
                const internos = Object.values(zip.files).filter(f => !f.dir && /\.(csv|txt)$/i.test(f.name) && !/(^|\/)(__MACOSX|\.)/.test(f.name));
                for (const f of internos) salida.push({ nombre: f.name.split('/').pop(), bytes: await f.async('uint8array') });
            } else {
                salida.push({ nombre: a.name, bytes });
            }
        }
        return salida;
    };

    /* ---------- Descargar el consolidado (las 15 columnas, para Excel) ---------- */
    CU.consolidadoCsv = function(leido) {
        return window.App.carga.aCsv(leido.encabezados, leido.filas);
    };

    /* ---------- Comparar con el archivo de Power Query (una sola vez) ---------- */
    // Suma de recetas por matrícula + mercado + producto en cada lado
    const sumaPorClave = (encabezados, filas) => {
        const c = encabezados.map(norm);
        const iM = c.indexOf('matricula'), iMe = c.indexOf('mercado'), iP = c.indexOf('producto'), iR = c.indexOf('pxproduct');
        const mapa = new Map();
        const porMercado = new Map();
        let total = 0;
        filas.forEach(r => {
            const k = `${String(r[iM] || '').replace(/^0+/, '')}|${limpio(r[iMe]).toUpperCase()}|${limpio(r[iP]).toUpperCase()}`;
            const rx = parseInt(r[iR], 10) || 0;
            mapa.set(k, (mapa.get(k) || 0) + rx);
            const me = limpio(r[iMe]).toUpperCase();
            porMercado.set(me, (porMercado.get(me) || 0) + rx);
            total += rx;
        });
        return { mapa, porMercado, total, filas: filas.length };
    };
    CU.comparar = function(nuestro, suyo) {
        const a = sumaPorClave(nuestro.encabezados, nuestro.filas);
        const b = sumaPorClave(suyo.encabezados, suyo.filas);
        const diferencias = [];
        new Set([...a.mapa.keys(), ...b.mapa.keys()]).forEach(k => {
            const x = a.mapa.get(k) || 0, y = b.mapa.get(k) || 0;
            if (x !== y) diferencias.push({ clave: k, app: x, powerQuery: y });
        });
        const mercados = [...new Set([...a.porMercado.keys(), ...b.porMercado.keys()])].sort()
            .map(m => ({ mercado: m, app: a.porMercado.get(m) || 0, powerQuery: b.porMercado.get(m) || 0 }));
        return { iguales: diferencias.length === 0, filas: { app: a.filas, powerQuery: b.filas }, rx: { app: a.total, powerQuery: b.total },
            mercados, diferencias: diferencias.slice(0, 50), totalDiferencias: diferencias.length };
    };

    console.log('[SegmentApp] closeup.js cargado.');
})();

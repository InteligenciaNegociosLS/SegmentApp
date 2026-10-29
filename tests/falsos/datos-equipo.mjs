/* ============================================================
   Réplica en JavaScript de la función SQL public.datos_equipo()
   (supabase/migrations/20261030120000_datos_por_equipo.sql), para
   el Supabase simulado de las pruebas. Las pruebas de base de datos
   comprueban que la función real da lo que la app necesita.
============================================================ */

const norm = (m) => String(m || '').trim().split('_')[0].replace(/^0+/, '');

function clavesUnicas(encabezados) {
    const vistos = {};
    return encabezados.map(c => { vistos[c] = (vistos[c] || 0) + 1; return vistos[c] > 1 ? `${c} (${vistos[c]})` : c; });
}

/**
 * recetas: filas del archivo (15 columnas, en orden)
 * fichero: { encabezados, filas } del archivo de fichero
 * visibles: Set con los nombres de visitador visibles (en mayúsculas)
 * phq: lista de productos del laboratorio
 */
export function construirDatosEquipo({ recetas, fichero, visibles, phq }) {
    const iVis = fichero.encabezados.indexOf('Nombre del sector');
    const iMat = fichero.encabezados.indexOf('Matricula');
    const misFichero = fichero.filas.filter(r => visibles.has(String(r[iVis] || '').trim().toUpperCase()));
    const mats = new Set(misFichero.map(r => norm(r[iMat])).filter(Boolean));

    const medicos = {}, productos = {}, mercados = {};
    const idMed = new Map(), idProd = new Map(), idMk = new Map();
    const id = (mapa, clave, destino, valor) => {
        if (!mapa.has(clave)) { const n = mapa.size + 1; mapa.set(clave, n); destino[n] = valor; }
        return mapa.get(clave);
    };
    const lista = phq.map(p => String(p).toUpperCase());
    const esPhq = (p) => lista.some(x => String(p).toUpperCase().includes(x));

    const filas = [];
    const grupos = new Map();   // mercado -> Map(matricula -> {total, phq, primera})
    recetas.forEach((r, i) => {
        const mk = id(idMk, r[2], mercados, r[2]);
        const lic = String(r[1]).trim();
        if (!grupos.has(mk)) grupos.set(mk, new Map());
        const g = grupos.get(mk);
        if (!g.has(lic)) g.set(lic, { total: 0, phq: 0, primera: i });
        const rx = parseInt(r[4], 10);
        g.get(lic).total += rx;
        if (esPhq(r[3])) g.get(lic).phq += rx;
        if (mats.has(norm(r[1]))) {
            const m = id(idMed, [r[1], r[0], r[5], r[6], r[7], r[8], r[9], r[10]].join('\u0001'), medicos, [r[1], r[0], r[5], r[6], r[7], r[8], r[9], r[10]]);
            const p = id(idProd, [r[3], r[11], r[12], r[13], r[14]].join('\u0001'), productos, [r[3], r[11], r[12], r[13], r[14]]);
            filas.push([m, mk, p, rx]);
        }
    });

    const clasificacion = [];
    grupos.forEach((g, mk) => {
        const numero = (lic) => (/^(0|[1-9]\d{0,9})$/.test(lic) && Number(lic) < 4294967295 ? Number(lic) : Infinity);
        const lista = [...g.entries()].map(([lic, v]) => ({ lic, num: numero(lic), ...v }))
            .sort((a, b) => b.total - a.total || (a.num - b.num || 0) || a.primera - b.primera);
        const totalMercado = lista.reduce((s, x) => s + x.total, 0);
        let acumulado = 0;
        const vistos = new Set();
        lista.forEach(x => {
            acumulado += x.total;
            const n = norm(x.lic);
            if (vistos.has(n)) return;
            vistos.add(n);
            if (mats.has(n)) clasificacion.push([mk, n, x.total, x.phq, acumulado, totalMercado]);
        });
    });

    const claves = clavesUnicas(fichero.encabezados);
    return {
        columnas: fichero.encabezados,
        fichero: misFichero.map(r => claves.map((c, k) => (r[k] == null ? '' : r[k]))),
        medicos, productos, mercados,
        recetas: filas,
        clasificacion
    };
}

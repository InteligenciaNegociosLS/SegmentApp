/* ============================================================
   Ayudante de pruebas: carga la app REAL (index.html + js/*.js)
   dentro de un navegador simulado (jsdom), sin internet.
   Supabase y localForage se reemplazan por versiones de prueba.
============================================================ */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { createClient, datosDePrueba } from '../falsos/supabase-falso.mjs';

export const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// Mismo orden que index.html
const SCRIPTS = ['entorno', 'errores', 'config', 'state', 'ui', 'data', 'filters', 'matrix',
    'evaluation', 'admin', 'auth', 'modals', 'exports', 'offline', 'reports',
    'supabase-api', 'carga-datos', 'versiones', 'main'];

export function localforageEnMemoria() {
    const m = new Map();
    return {
        _mapa: m,
        config() {},
        async getItem(k) { return m.has(k) ? structuredClone(m.get(k)) : null; },
        async setItem(k, v) { m.set(k, structuredClone(v)); return v; },
        async removeItem(k) { m.delete(k); },
        async clear() { m.clear(); }
    };
}

// Archivos pequeños de ejemplo que "descarga" la app (por ruta del almacén)
const RECETAS_EJEMPLO = 'Medico;Matricula;Mercado;Producto;Px_Product;Especialidad;Direccion;CP;Ciudad;Region;Esp2;Molecula;Clase;Generico;Lab\n' +
    'PEREZ ANA;00123;DESLER MERCADO;DESLER PHQ;12;MG;C1;1010;CCS;DC;MG;DESLORATADINA;R06;N;LST\n' +
    'PEREZ ANA;00123;DESLER MERCADO;OTRO X;30;MG;C1;1010;CCS;DC;MG;DESLORATADINA;R06;N;OTRO\n' +
    'ROJAS LUIS;456;DESLER MERCADO;OTRO X;5;PED;C2;1020;CCS;DC;PED;DESLORATADINA;R06;N;OTRO\n';
const FICHERO_EJEMPLO = 'Matricula;Nombre;Nombre del sector;Sector;GER_DIS;NOME_GER_DIS;Equipo\n' +
    '123;PEREZ ANA;NEIVIS PARRA;S1;100001;GERENTE UNO;OTC\n' +
    '456;ROJAS LUIS;OTRO VISITADOR;S2;100002;GERENTE DOS;OTC\n';

export function cargarApp({ datos, env } = {}) {
    const html = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');
    const cuerpo = html.slice(html.indexOf('<body'), html.lastIndexOf('</body>'));
    document.body.outerHTML = cuerpo.replace(/<script[\s\S]*?<\/script>/g, '') + '</body>';

    delete window.App;
    window.localforage = localforageEnMemoria();
    window.__calls = [];
    window.__SEGMENTAPP_ENV__ = env || { APP_ENV: 'development', SUPABASE_URL: 'https://prueba.supabase.co', SUPABASE_ANON_KEY: 'clave-publica-de-prueba' };

    for (const nombre of SCRIPTS) {
        const codigo = fs.readFileSync(path.join(RAIZ, 'js', nombre + '.js'), 'utf8');
        (0, eval)(codigo + `\n//# sourceURL=${nombre}.js`);
    }
    // Conectar el Supabase simulado
    const bd = datos || datosDePrueba();
    const csv = (t) => { const [e, ...f] = t.trim().split('\n').map(l => l.split(';')); return { encabezados: e, filas: f }; };
    bd.fuentes['s-rec-1'] = bd.fuentes['s-rec-0'] = csv(RECETAS_EJEMPLO);
    bd.fuentes['s-fic-1'] = csv(FICHERO_EJEMPLO);
    bd.configuracion.push({ clave: 'productos_phq', valor: ['DESLER PHQ'] });
    window.App.supabase._cliente = createClient('', '', { datos: bd });
    window.App.data.fetchFileAsJson = async (url) => {
        window.__calls.push('descargar:' + url);
        return window.App.data.parseCSVFast(url.includes('fic') ? FICHERO_EJEMPLO : RECETAS_EJEMPLO);
    };

    window.App.state.init();
    window.App.matrix.generateMatrixGridHTML();
    return window.App;
}

export function baseSimulada(App) {
    return App.supabase._cliente._bd;
}

// Lee los datos reales del repositorio igual que la app (descomprimir + CSV)
export function cargarDatosReales(App) {
    const leer = (archivo) => App.data.parseCSVFast(
        zlib.gunzipSync(fs.readFileSync(path.join(RAIZ, archivo))).toString('utf8'));
    App.data.parseFicheroData(leer('fichero_medico.csv.gz'));
    App.data.parseAuditData(leer('datacloseup.csv.gz'));
    App.filters.populateFilters();
}

export function textoReal(archivo) {
    return zlib.gunzipSync(fs.readFileSync(path.join(RAIZ, archivo))).toString('utf8');
}

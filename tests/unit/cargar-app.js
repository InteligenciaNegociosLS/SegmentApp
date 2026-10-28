/* ============================================================
   Ayudante de pruebas: carga la app REAL (index.html + js/*.js)
   dentro de un navegador simulado (jsdom), sin internet.
   Firebase y localForage se reemplazan por versiones de prueba.
============================================================ */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

export const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// Mismo orden que index.html (sin firebase-init.js, que es un módulo de red)
const SCRIPTS = ['entorno', 'errores', 'config', 'state', 'ui', 'data', 'filters', 'matrix',
    'evaluation', 'admin', 'auth', 'modals', 'exports', 'offline', 'reports', 'main'];

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

export function cargarApp() {
    const html = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');
    const cuerpo = html.slice(html.indexOf('<body'), html.lastIndexOf('</body>'));
    document.body.outerHTML = cuerpo.replace(/<script[\s\S]*?<\/script>/g, '') + '</body>';

    delete window.App;
    window.localforage = localforageEnMemoria();
    window.__calls = [];
    window.firebaseDb = {};
    window.firebaseAuth = { currentUser: null };
    window.firebaseCollection = (db, ...p) => ({ path: p.join('/') });
    window.firebaseDoc = (db, ...p) => ({ path: p.join('/'), id: p[p.length - 1] });
    window.firebaseGetDocs = async (q) => { window.__calls.push('getDocs:' + q.path); return { docs: [], size: 0, empty: true, forEach() {} }; };
    window.firebaseGetDoc = async (d) => ({ exists: () => false, data: () => ({}) });
    window.firebaseSetDoc = async (d) => { window.__calls.push('setDoc:' + d.path); };
    window.firebaseDeleteDoc = async (d) => { window.__calls.push('deleteDoc:' + d.path); };

    for (const nombre of SCRIPTS) {
        const codigo = fs.readFileSync(path.join(RAIZ, 'js', nombre + '.js'), 'utf8');
        (0, eval)(codigo + `\n//# sourceURL=${nombre}.js`);
    }
    window.App.state.init();
    window.App.matrix.generateMatrixGridHTML();
    return window.App;
}

// Lee los datos reales del repositorio igual que la app (descomprimir + CSV)
export function cargarDatosReales(App) {
    const leer = (archivo) => App.data.parseCSVFast(
        zlib.gunzipSync(fs.readFileSync(path.join(RAIZ, archivo))).toString('utf8'));
    App.data.parseFicheroData(leer('fichero_medico.csv.gz'));
    App.data.parseAuditData(leer('datacloseup.csv.gz'));
    App.filters.populateFilters();
}

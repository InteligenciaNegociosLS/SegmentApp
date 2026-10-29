/* ============================================================
   Capturas de pantalla de la app construida (dist/) en teléfono,
   iPad y computadora, con Supabase simulado y datos reales.
   Sirve para revisar el diseño antes de publicar.
   Uso:  npm run build && node tests/e2e/capturas.mjs <carpeta-salida> [carpeta-fuentes]
   carpeta-fuentes (opcional): node_modules con @fontsource-variable/roboto-flex
   y material-symbols, para ver la tipografía real sin internet.
============================================================ */
import { createRequire } from 'node:module';
import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { construirDatosEquipo } from '../falsos/datos-equipo.mjs';
import { leerCsvGz } from '../../scripts/migracion/transformar.mjs';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, '..', '..');
const SALIDA = path.resolve(process.argv[2] || 'capturas');
const FUENTES = process.argv[3] ? path.resolve(process.argv[3]) : null;
const PUERTO = 5198;
const BASE = `http://127.0.0.1:${PUERTO}/`;
fs.mkdirSync(SALIDA, { recursive: true });

function cargarPlaywright() {
    const require = createRequire(import.meta.url);
    try { return require('playwright'); } catch {}
    return require(path.join(execSync('npm root -g').toString().trim(), 'playwright'));
}
const { chromium } = cargarPlaywright();

const servidor = spawn(process.execPath, [path.join(RAIZ, 'scripts', 'servidor-local.mjs')], { env: { ...process.env, PORT: String(PUERTO) }, stdio: 'ignore' });
await new Promise(r => setTimeout(r, 800));

const leer = (f) => leerCsvGz(path.join(RAIZ, f));
const phq = JSON.parse(fs.readFileSync(path.join(RAIZ, 'js', 'config.js'), 'utf8').match(/DEFAULT_PHQ_PRODUCTS = (\[[\s\S]*?\]);/)[1]);
const paqueteVm = construirDatosEquipo({ recetas: leer('datacloseup.csv.gz').filas, fichero: leer('fichero_medico.csv.gz'), visibles: new Set(['NEIVIS PARRA']), phq });
const ENV = `window.__SEGMENTAPP_ENV__ = ${JSON.stringify({ APP_ENV: 'preview', SUPABASE_URL: 'https://prueba.supabase.co', SUPABASE_ANON_KEY: 'clave', VERSION: 'capturas' })};`;
const ARCHIVOS = { 's-rec-1': 'datacloseup.csv.gz', 's-fic-1': 'fichero_medico.csv.gz' };
const fuente = (rel) => FUENTES && fs.existsSync(path.join(FUENTES, rel)) ? fs.readFileSync(path.join(FUENTES, rel)) : null;
const CSS_ROBOTO = `@font-face{font-family:"Roboto Flex";font-style:normal;font-weight:100 1000;font-stretch:25% 151%;src:url(https://fuentes.prueba/roboto.woff2) format("woff2")}`;
const CSS_SIMBOLOS = `@font-face{font-family:"Material Symbols Outlined";font-style:normal;font-weight:100 700;src:url(https://fuentes.prueba/simbolos.woff2) format("woff2")}
.material-symbols-outlined{font-family:"Material Symbols Outlined";font-weight:normal;font-style:normal;font-size:24px;line-height:1;letter-spacing:normal;text-transform:none;display:inline-block;white-space:nowrap;word-wrap:normal;direction:ltr;-webkit-font-feature-settings:"liga";-webkit-font-smoothing:antialiased}`;

async function rutas(page) {
    await page.addInitScript((p) => { window.__calls = []; window.__SIN_GUIA = true; window.__SB_DATOS_EQUIPO = { 's-rec-1|s-fic-1|u-vm': p }; }, paqueteVm);
    await page.route('**/*', route => {
        const u = route.request().url();
        if (u.startsWith(BASE + 'js/env.js')) return route.fulfill({ contentType: 'application/javascript', body: ENV });
        if (u.startsWith(BASE)) return route.continue();
        if (u.endsWith('/datos-equipo.mjs')) return route.fulfill({ contentType: 'application/javascript', body: fs.readFileSync(path.join(RAIZ, 'tests', 'falsos', 'datos-equipo.mjs')) });
        if (u.includes('@supabase/supabase-js')) return route.fulfill({ contentType: 'application/javascript', body: fs.readFileSync(path.join(RAIZ, 'tests', 'falsos', 'supabase-falso.mjs')) });
        if (u.startsWith('https://prueba.supabase.co/auth/v1/health')) return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
        const archivo = u.match(/^https:\/\/archivos\.prueba\/snapshots\/([^/]+)\//);
        if (archivo) return ARCHIVOS[archivo[1]] ? route.fulfill({ contentType: 'application/gzip', body: fs.readFileSync(path.join(RAIZ, ARCHIVOS[archivo[1]])) }) : route.fulfill({ status: 404, body: '' });
        if (u.includes('fonts.googleapis.com') && u.includes('Roboto+Flex')) return route.fulfill({ contentType: 'text/css', body: FUENTES ? CSS_ROBOTO : '' });
        if (u.includes('fonts.googleapis.com') && u.includes('Material+Symbols')) return route.fulfill({ contentType: 'text/css', body: FUENTES ? CSS_SIMBOLOS : '' });
        if (u === 'https://fuentes.prueba/roboto.woff2') return route.fulfill({ contentType: 'font/woff2', body: fuente('@fontsource-variable/roboto-flex/files/roboto-flex-latin-full-normal.woff2') });
        if (u === 'https://fuentes.prueba/simbolos.woff2') return route.fulfill({ contentType: 'font/woff2', body: fuente('material-symbols/material-symbols-outlined.woff2') });
        if (u.includes('localforage')) return route.fulfill({ contentType: 'application/javascript', body: fs.readFileSync(path.join(AQUI, 'stubs', 'localforage.js')) });
        if (u.includes('chart.js')) return route.fulfill({ contentType: 'application/javascript', body: 'window.Chart=function(){return{destroy(){}}};Chart.register=()=>{};Chart.defaults={font:{}};' });
        return route.fulfill({ contentType: u.includes('css') ? 'text/css' : 'application/javascript', body: '' });
    });
}

const PANTALLAS = {
    telefono: { width: 390, height: 844 }, ipad: { width: 820, height: 1180 }, computadora: { width: 1440, height: 900 },
    'telefono-oscuro': { width: 390, height: 844, oscuro: true }
};
const browser = await chromium.launch();
const hechas = [];
try {
    for (const [nombre, viewport] of Object.entries(PANTALLAS)) {
        const page = await browser.newPage({ serviceWorkers: 'block', viewport: { width: viewport.width, height: viewport.height }, deviceScaleFactor: 1,
            hasTouch: nombre !== 'computadora', colorScheme: viewport.oscuro ? 'dark' : 'light' });
        await rutas(page);
        const foto = async (id, opciones = {}) => {
            await page.waitForTimeout(opciones.espera ?? 700);
            const archivo = path.join(SALIDA, `${nombre}-${id}.png`);
            await page.screenshot({ path: archivo, fullPage: opciones.completa === true });
            hechas.push(archivo);
            // Aviso si la página se sale de lado (no debe haber desplazamiento horizontal)
            const ancho = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
            if (ancho[0] > ancho[1]) {
                const culpables = await page.evaluate((w) => [...document.querySelectorAll('body *')]
                    .filter(e => { const r = e.getBoundingClientRect(); return r.right > w + 1 && r.width > 0 && getComputedStyle(e).position !== 'fixed'; })
                    .filter(e => !e.parentElement || e.parentElement.getBoundingClientRect().right <= w + 1)
                    // dentro de una zona con desplazamiento propio (tablas, matriz) está bien
                    .filter(e => { for (let a = e.parentElement; a; a = a.parentElement) { if (/(auto|scroll|hidden)/.test(getComputedStyle(a).overflowX)) return false; } return true; })
                    .slice(0, 3).map(e => `${e.tagName.toLowerCase()}#${e.id}.${String(e.className).slice(0, 60)}`), ancho[1]);
                console.log(`AVISO ${nombre}-${id}: la página mide ${ancho[0]} px de ancho en una pantalla de ${ancho[1]} px → ${culpables.join(' | ')}`);
            }
        };
        await page.goto(BASE, { waitUntil: 'domcontentloaded' });
        await foto('0-splash', { espera: 550 });
        await page.waitForFunction(() => { const e = document.getElementById('loginRequiredState'); return e && !e.classList.contains('hidden'); });
        await foto('1-inicio');
        await page.evaluate(() => openLoginModal());
        await foto('2-login');
        await page.fill('#loginEmail', 'vm@lasante.com'); await page.fill('#visitadorPwd', '123456');
        await page.evaluate(() => attemptLogin());
        await page.waitForFunction(() => App.state.currentUserRole === 'visitador');
        await foto('3-vm-tablero', { completa: true });
        await page.evaluate(() => filterByMatrix('C', 'C'));
        await foto('3a-vm-cuadrante');
        await page.evaluate(() => { clearMatrixFilter(); App.ux.abrirFiltros(); });
        await foto('3d-vm-filtros');
        // Fase 8: sin conexión, "N por subir" y el botón "Instalar la app"
        await page.evaluate(() => {
            App.ux.cerrarFiltros();
            const e = { visitador_id: App.state.visitadorId, medico_id: 'X', mercado: 'M' };
            App.state.OFFLINE_QUEUE.push({ tipo: 'evaluacion', evaluacion: e }, { tipo: 'evaluacion', evaluacion: { ...e, mercado: 'N' } });
            Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
            App.offline.actualizarIndicadores();
            document.getElementById('btnInstalarApp').classList.remove('hidden');
            App.ux.abrirMas();
        });
        await foto('3e-vm-mas');
        await page.evaluate(() => { App.ux.cerrarMas(); App.offline.instalar(); });
        await foto('3e2-vm-instalar-iphone');
        await page.evaluate(() => {
            document.getElementById('instalarIos').classList.add('hidden');
            App.state.OFFLINE_QUEUE.length = 0;
            Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => true });
            App.offline.actualizarIndicadores();
        });
        await page.evaluate(() => { App.ux.cerrarMas(); App.ux.iniciarGuia(true); });
        await foto('3f-vm-guia');
        await page.evaluate(() => App.ux.pasoGuia(2));
        await foto('3f3-vm-guia-paso3');
        await page.evaluate(() => App.ux.pasoGuia(1));
        await foto('3f4-vm-guia-paso4');
        await page.evaluate(() => { App.ux.terminarGuia(); App.ux.abrirAyudaMatriz(); });
        await foto('3g-vm-ayuda');
        await page.evaluate(() => { App.ux.cerrarAyudaMatriz(); App.ux.abrirMatrizCompleta(); });
        await foto('3h-vm-matriz-completa');
        await page.evaluate(() => toggleSummaryCells());
        await foto('3i-vm-matriz-completa-subtotales');
        await page.evaluate(() => toggleSummaryCells());
        await page.evaluate(() => App.ux.cerrarMatrizCompleta());
        if (nombre === 'computadora') {
            // La imagen que se descarga con "Exportar → Imagen de la matriz"
            const png = await page.evaluate(async () => { await document.fonts.ready; return App.exports.dibujarMatriz().toDataURL('image/png'); });
            const archivo = path.join(SALIDA, 'imagen-matriz-exportada.png');
            fs.writeFileSync(archivo, Buffer.from(png.split(',')[1], 'base64'));
            hechas.push(archivo);
        }
        await page.evaluate(() => { const d = App.state.PROCESSED_DATA.find(x => !x.isZeroRx); App.modals.openDoctorModal(d.id); });
        await foto('3b-vm-medico');
        for (const t of ['mercados', 'productos', 'historial', 'datos']) { await page.evaluate((x) => App.ficha.mostrar(x), t); await page.waitForTimeout(300); await foto('3b-vm-ficha-' + t); }
        await page.evaluate(() => App.ficha.cerrar());
        await page.evaluate(() => { document.querySelectorAll('.fixed.inset-0').forEach(m => m.classList.add('hidden')); const d = App.state.PROCESSED_DATA[0]; App.evaluation.openEvalModal(d.id, d.name); });
        await foto('3c-vm-evaluar');
        await page.evaluate(() => document.querySelectorAll('.fixed.inset-0').forEach(m => m.classList.add('hidden')));
        await page.evaluate(() => logoutSession());
        await page.evaluate(() => openLoginModal());
        await page.fill('#loginEmail', 'admin@lasante.com'); await page.fill('#visitadorPwd', 'adminadmin');
        await page.evaluate(() => attemptLogin());
        await page.waitForFunction(() => App.state.isAdmin, null, { timeout: 120000 });
        await foto('4-admin-tablero', { completa: true });
        await page.evaluate(() => abrirCargaDatos());
        await foto('5-admin-carga');
        await page.evaluate(() => { App.carga.cerrarPanel(); App.reports.openModal(); });
        await foto('5b-reportes');
        await page.evaluate(() => { document.querySelectorAll('.fixed.inset-0').forEach(m => m.classList.add('hidden')); App.exports.showExportModal('excel'); });
        await foto('5c-exportar');
        await page.evaluate(() => { document.querySelectorAll('.fixed.inset-0').forEach(m => m.classList.add('hidden')); App.admin.openSurveyConfigModal(); });
        await foto('5d-ponderacion');
        await page.evaluate(() => document.querySelectorAll('.fixed.inset-0').forEach(m => m.classList.add('hidden')));
        await page.evaluate(() => abrirVersiones());
        await foto('6-versiones');
        await page.close();
    }
} finally {
    await browser.close().catch(() => {});
    servidor.kill();
}
console.log(hechas.join('\n'));

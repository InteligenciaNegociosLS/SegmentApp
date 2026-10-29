/* ============================================================
   Prueba de punta a punta de la Fase 8: la app SIN INTERNET.
   Usa el trabajador de fondo real (dist/sw.js) en Chromium:
   1. El VM entra con internet (la app se guarda en el equipo).
   2. Se corta internet y se recarga: la app abre igual, con sus médicos.
   3. Evalúa sin internet: queda "por subir" y sobrevive a recargar.
   4. Vuelve internet: la evaluación se sube sola.
   Uso:  npm run build && node tests/e2e/sin-internet.e2e.mjs
============================================================ */
import { createRequire } from 'node:module';
import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { construirDatosEquipo } from '../falsos/datos-equipo.mjs';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, '..', '..');
const PUERTO = 5198;
const BASE = `http://127.0.0.1:${PUERTO}/`;

// Versiones anteriores de Playwright (la de GitHub) necesitan esto para atender lo que pide sw.js
process.env.PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS = '1';
function cargarPlaywright() {
    const require = createRequire(import.meta.url);
    try { return require('playwright'); } catch {}
    return require(path.join(execSync('npm root -g').toString().trim(), 'playwright'));
}
const { chromium } = cargarPlaywright();
if (!fs.existsSync(path.join(RAIZ, 'dist', 'sw.js'))) { console.error('Primero ejecuta: npm run build'); process.exit(1); }

const servidor = spawn(process.execPath, [path.join(RAIZ, 'scripts', 'servidor-local.mjs')], { env: { ...process.env, PORT: String(PUERTO) }, stdio: 'ignore' });
await new Promise(r => setTimeout(r, 800));

let fallas = 0;
const ok = (nombre, cond) => { if (!cond) fallas++; console.log((cond ? 'OK   ' : 'FALLA') + ' ' + nombre); };
const browser = await chromium.launch();
try {
    const context = await browser.newContext({ serviceWorkers: 'allow' });
    const { leerCsvGz } = await import('../../scripts/migracion/transformar.mjs');
    const leer = (f) => leerCsvGz(path.join(RAIZ, f));
    const phq = JSON.parse(fs.readFileSync(path.join(RAIZ, 'js', 'config.js'), 'utf8').match(/DEFAULT_PHQ_PRODUCTS = (\[[\s\S]*?\]);/)[1]);
    const paqueteVm = construirDatosEquipo({ recetas: leer('datacloseup.csv.gz').filas, fichero: leer('fichero_medico.csv.gz'), visibles: new Set(['NEIVIS PARRA']), phq });
    await context.addInitScript((p) => { window.__calls = []; window.__SIN_GUIA = true; window.__SB_DATOS_EQUIPO = { 's-rec-1|s-fic-1|u-vm': p }; }, paqueteVm);
    const ENV = `window.__SEGMENTAPP_ENV__ = ${JSON.stringify({ APP_ENV: 'preview', SUPABASE_URL: 'https://prueba.supabase.co', SUPABASE_ANON_KEY: 'clave-publica-de-prueba', VERSION: 'e2e' })};`;
    let sinInternet = false;
    const js = (body) => ({ contentType: 'application/javascript', headers: { 'Access-Control-Allow-Origin': '*' }, body });
    // context.route también atiende lo que pide el trabajador de fondo
    await context.route('**/*', route => {
        const u = route.request().url();
        if (sinInternet) return route.abort('internetdisconnected');
        if (u.startsWith(BASE + 'js/env.js')) return route.fulfill({ contentType: 'application/javascript', body: ENV });
        if (u.startsWith(BASE)) return route.continue();
        if (u.endsWith('/datos-equipo.mjs')) return route.fulfill(js(fs.readFileSync(path.join(RAIZ, 'tests', 'falsos', 'datos-equipo.mjs'), 'utf8')));
        if (u.includes('@supabase/supabase-js')) return route.fulfill(js(fs.readFileSync(path.join(RAIZ, 'tests', 'falsos', 'supabase-falso.mjs'), 'utf8')));
        if (u.includes('localforage')) return route.fulfill(js(fs.readFileSync(path.join(AQUI, 'stubs', 'localforage-persistente.js'), 'utf8')));
        if (u.includes('chart.js')) return route.fulfill(js('window.Chart=function(){return{destroy(){},update(){}}};Chart.register=()=>{};Chart.defaults={font:{}};'));
        if (u.includes('/auth/v1/health')) return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: '{}' });
        return route.fulfill({ contentType: u.includes('css') ? 'text/css' : 'application/javascript', headers: { 'Access-Control-Allow-Origin': '*' }, body: '' });
    });
    const page = await context.newPage();
    const errores = [];
    page.on('pageerror', e => errores.push(e.message));
    const vis = id => page.evaluate(i => { const e = document.getElementById(i); return !!e && !e.classList.contains('hidden'); }, id);
    const esperarTablero = () => page.waitForFunction(() => window.App && App.state.currentUserRole === 'visitador' && App.state.PROCESSED_DATA.length > 0, null, { timeout: 120000 });

    // 1. Con internet
    await page.goto(BASE);
    await page.waitForFunction(() => { const e = document.getElementById('loginRequiredState'); return e && !e.classList.contains('hidden'); }, null, { timeout: 120000 });
    await page.evaluate(() => openLoginModal());
    await page.fill('#loginEmail', 'vm@lasante.com'); await page.fill('#visitadorPwd', '123456');
    await page.evaluate(() => attemptLogin());
    await esperarTablero();
    const medicos = await page.evaluate(() => App.state.PROCESSED_DATA.length);
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 30000 });
    const cache = await page.evaluate(async () => {
        const nombres = await caches.keys();
        const app = await caches.open(nombres.find(n => n.startsWith('segmentapp-app-')));
        const externo = await caches.open('segmentapp-externo-v1');
        return { app: (await app.keys()).length, externo: (await externo.keys()).map(r => r.url) };
    });
    ok(`la app quedó guardada en el equipo (${cache.app} archivos)`, cache.app > 25);
    ok('la librería de Supabase y lo que importa quedaron guardadas', cache.externo.some(u => u.includes('@supabase/supabase-js')) && cache.externo.some(u => u.endsWith('/datos-equipo.mjs')));
    ok('el trabajador de fondo NO guarda nada de Supabase', !cache.externo.some(u => u.includes('supabase.co')));

    // 2. Sin internet: cerrar y volver a abrir
    sinInternet = true;
    await context.setOffline(true);
    await page.evaluate(() => localStorage.setItem('__prueba_sin_red', '1'));   // el servidor simulado tampoco responde
    await page.reload();
    await esperarTablero();
    ok('sin internet: la app abre y el VM ve sus médicos', (await page.evaluate(() => App.state.PROCESSED_DATA.length)) === medicos && await vis('dashboardContent'));
    ok('sin internet: se ve el aviso "Sin conexión"', await vis('offlineIndicator'));

    // 3. Evaluar sin internet
    const docId = await page.evaluate(async () => {
        const d = App.state.PROCESSED_DATA.find(x => !x.isZeroRx && !App.ux.estaEvaluado(x));
        openEvalModal(d.id, d.name);
        document.querySelectorAll('#evalMarketSelect_chips button')[0].click();
        ['surveyQ1', 'surveyQ5', 'surveyQ2', 'surveyQ3'].forEach(z => document.querySelectorAll(`#${z}_chips button`)[1].click());
        selectEvalQuadrant(document.querySelector('.eval-btn'), 'A-');
        document.getElementById('evalNotas').value = 'Evaluado sin internet';
        await saveEvaluation();
        return d.id;
    });
    await page.waitForTimeout(500);
    ok('sin internet: la evaluación queda "1 por subir"', await vis('chipPendientes') && (await page.textContent('#lblPendientes')) === '1');
    await page.evaluate(() => { try { closeEvalModal(); } catch (e) {} });
    await page.reload();
    await esperarTablero();
    ok('sin internet: tras volver a abrir, sigue por subir y el médico cuenta como evaluado',
        await page.evaluate((id) => App.state.OFFLINE_QUEUE.length === 1 && App.ux.estaEvaluado(App.state.PROCESSED_DATA.find(d => d.id === id)), docId));

    // 4. Vuelve internet
    sinInternet = false;
    await page.evaluate(() => localStorage.removeItem('__prueba_sin_red'));
    await context.setOffline(false);
    await page.waitForFunction(() => App.state.OFFLINE_QUEUE.length === 0, null, { timeout: 30000 }).catch(() => {});
    ok('con internet: la evaluación se subió sola', await page.evaluate(() => App.state.OFFLINE_QUEUE.length === 0 && App.supabase._cliente._bd.evaluaciones.some(e => e.notas === 'Evaluado sin internet')));
    ok('con internet: desaparece "por subir"', !(await vis('chipPendientes')));
    // 5. Versión nueva publicada: aviso "Actualizar" y la app se recarga con la nueva
    const swDist = path.join(RAIZ, 'dist', 'sw.js');
    const swOriginal = fs.readFileSync(swDist, 'utf8');
    try {
        fs.writeFileSync(swDist, swOriginal.replace(/const VERSION = "[^"]*"/, 'const VERSION = "version-nueva-de-prueba"'));
        await page.evaluate(() => App.offline.registro.update());
        await page.waitForFunction(() => /versión nueva/.test(document.getElementById('toast').innerText), null, { timeout: 30000 }).catch(() => {});
        ok('versión nueva: aviso con botón "Actualizar"', await page.evaluate(() => /versión nueva/.test(document.getElementById('toast').innerText) && !!document.querySelector('#toast .toast-accion')) && await vis('btnActualizarApp'));
        await Promise.all([page.waitForEvent('load', { timeout: 30000 }), page.evaluate(() => document.querySelector('#toast .toast-accion').click())]);
        await esperarTablero();
        const version = await page.evaluate(() => new Promise(r => { navigator.serviceWorker.addEventListener('message', e => r(e.data.version)); navigator.serviceWorker.controller.postMessage('VERSION'); }));
        ok('versión nueva: al tocar "Actualizar" queda la nueva', version === 'version-nueva-de-prueba');
    } finally {
        fs.writeFileSync(swDist, swOriginal);
    }
    ok('sin errores de JavaScript' + (errores.length ? ': ' + errores.join(' | ') : ''), errores.length === 0);
} finally {
    await browser.close().catch(() => {});
    servidor.kill();
}
console.log(fallas ? `\n${fallas} prueba(s) fallaron.` : '\nTodas las pruebas sin internet pasaron.');
process.exit(fallas ? 1 : 0);

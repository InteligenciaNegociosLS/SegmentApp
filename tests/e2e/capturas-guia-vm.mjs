/* ============================================================
   Capturas nítidas (x2) del modo VISITADOR para la guía rápida en PDF
   (docs/guia-vm/). Mismo Supabase simulado y datos reales que capturas.mjs.
   Uso:  npm run build && node tests/e2e/capturas-guia-vm.mjs <carpeta-salida> [carpeta-fuentes]
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
const PUERTO = 5199;
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


const browser = await chromium.launch();
try {
    const page = await browser.newPage({ serviceWorkers: 'block', viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true });
    await rutas(page);
    // Sin la etiqueta "PRUEBAS" ni avisos flotantes: la guía muestra la app como la ve el VM
    const limpiar = () => page.addStyleTag({ content: '#etiquetaEntorno,#toast{display:none!important}' });
    // La guía circula entre todos los VM: nombres de médicos, cédulas y el nombre del VM son de EJEMPLO
    // (se reemplazan en pantalla antes de cada captura; los datos no cambian). Los mercados con su nombre "Mdo …".
    const anonimizar = () => page.evaluate(() => {
        const ficticios = ['GÓMEZ ANA', 'PÉREZ LUIS', 'ROJAS MARÍA', 'DÍAZ CARLOS', 'TORRES ELENA', 'RAMÍREZ JOSÉ', 'SUÁREZ LAURA', 'MORENO PEDRO',
            'CASTILLO SOFÍA', 'MÉNDEZ JORGE', 'VARGAS ROSA', 'HERRERA MIGUEL', 'MOLINA CARMEN', 'CRUZ ANDRÉS', 'ORTIZ PAULA', 'RÍOS DANIEL'];
        const mapa = new Map();
        (App.state.PROCESSED_DATA || []).forEach((d, i) => { const n = String(d.name || '').trim(); if (n && !mapa.has(n)) mapa.set(n, ficticios[mapa.size % ficticios.length]); });
        const vm = String(App.state.currentVisitadorName || '').trim();
        const titulo = (w) => w.charAt(0) + w.slice(1).toLowerCase();
        const cambiar = (t) => {
            let x = t;
            if (vm) x = x.split(vm).join('ANA VISITADORA');
            mapa.forEach((nuevo, viejo) => { if (viejo.length > 3 && x.includes(viejo)) x = x.split(viejo).join(nuevo); });
            x = x.replace(/C\.I\. ?[\d.]+/g, 'C.I. 12.345.678').replace(/Matrícula \d+/g, 'Matrícula 123456');
            x = x.replace(/\b([A-ZÁÉÍÓÚÑ]{3,})(?: [A-ZÁÉÍÓÚÑ]{3,})? (?:MERCADO|MCDO)\b(?: [A-Z]\d{2}[A-Z0-9]*)?(?: \d+)?/g, (m, p) => 'Mdo ' + titulo(p));
            return x;
        };
        const caminar = (n) => { if (n.nodeType === 3) { const v = cambiar(n.nodeValue); if (v !== n.nodeValue) n.nodeValue = v; } else n.childNodes.forEach(caminar); };
        caminar(document.body);
        // Nombres recortados con "…" en las tarjetas: también de ejemplo
        let k = 0;
        document.querySelectorAll('.truncate').forEach(e => { const t = e.textContent.trim(); if (/^[A-ZÁÉÍÓÚÑ .…]{8,}$/.test(t) && !ficticios.includes(t) && !/MEDICINA|CARDIO|NEUMO|PEDIATR|CIRUG|GINECO|DERMA|INTERNA|GENERAL|FICHADO|VISITADORA/.test(t)) e.textContent = ficticios[(k++ * 5 + 3) % ficticios.length]; });
    });
    const foto = async (id, sel = null, espera = 600) => {
        await page.waitForTimeout(espera);
        await anonimizar();
        const archivo = path.join(SALIDA, `${id}.png`);
        if (sel) {
            // Recortes de una tarjeta: sin la barra de abajo encima
            const tapa = await page.addStyleTag({ content: '#navInferior,#navRiel{display:none!important}' });
            await page.locator(sel).first().screenshot({ path: archivo });
            await tapa.evaluate(e => e.remove());
        }
        else await page.screenshot({ path: archivo });
        console.log(archivo);
    };
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => { const e = document.getElementById('loginRequiredState'); return e && !e.classList.contains('hidden'); });
    await page.waitForTimeout(1500);   // que termine la pantalla de bienvenida
    await page.evaluate(() => { if (App.ux && App.ux.ocultarSplash) App.ux.ocultarSplash(); openLoginModal(); });
    await limpiar();
    await page.fill('#loginEmail', 'nombre.apellido@lasante.com.ve');
    await foto('01-entrar', '#loginModal > div', 1200);
    await page.fill('#loginEmail', '');
    await page.fill('#loginEmail', 'vm@lasante.com'); await page.fill('#visitadorPwd', '123456');
    await page.evaluate(() => attemptLogin());
    await page.waitForFunction(() => App.state.currentUserRole === 'visitador');
    await limpiar();
    await page.evaluate(() => { App.ux.irA('inicio', { historial: false }); window.scrollTo(0, 0); });
    await foto('02-avance', '#visitadorDashboard', 1200);
    await foto('03-indicadores', 'section:has(> .kpi-card), div:has(> .kpi-card)', 300).catch(() => {});
    // Movimientos con un EJEMPLO (los datos de prueba tienen una sola carga de CloseUp)
    await page.evaluate(() => {
        const actual = App.state.VERSIONES_EN_USO && App.state.VERSIONES_EN_USO.recetas;
        App.comparar.estado = { version: { nombre: 'CloseUp 06/2026' }, resumen: { mejor: 12, peor: 5, igual: 23, nuevo: 3, salieron: 2 }, kpis: null };
        App.comparar.mercados = { cargando: false, clave: actual && actual.id, datos: [
            { id: 'antes', nombre: 'CloseUp 06/2026', mercados: [['Mdo Esoz', 1000, 120], ['Mdo Fludil', 600, 150], ['Mdo Bumetin', 400, 30], ['Mdo Leprit', 300, 60]] },
            { id: actual && actual.id, nombre: 'CloseUp 09/2026', mercados: [['Mdo Esoz', 1000, 170], ['Mdo Fludil', 600, 120], ['Mdo Bumetin', 400, 40], ['Mdo Leprit', 300, 55]] }] };
        App.comparar.render();
    });
    await foto('04-movimientos', '#tarjetaMovimientos', 300);
    await foto('05-concordancia', '#tarjetaConcordancia', 300);
    await page.evaluate(() => App.ux.irA('matriz'));
    await foto('06-matriz', '#matrixGridElement', 900);
    await page.evaluate(() => App.ux.irA('medicos'));
    await foto('07-medicos', null, 900);
    await page.evaluate(() => { const d = App.state.PROCESSED_DATA.find(x => !x.isZeroRx && x.gap > 0); App.ficha.abrir(d.id); });
    await foto('08-ficha', null, 800);
    await page.evaluate(() => App.ficha.mostrar('mercados'));
    await foto('09-ficha-mercados', null, 500);
    await page.evaluate(() => App.ficha.cerrar());
    await page.evaluate(() => { document.querySelectorAll('.fixed.inset-0').forEach(m => m.classList.add('hidden')); const d = App.state.PROCESSED_DATA.find(x => !x.isZeroRx); App.evaluation.openEvalModal(d.id, d.name); });
    await foto('10-evaluar', null, 800);
    await page.evaluate(() => document.querySelectorAll('.fixed.inset-0').forEach(m => m.classList.add('hidden')));
    await page.evaluate(() => { App.ux.irA('inicio', { historial: false }); });
    await page.waitForTimeout(500);
    await page.evaluate(() => { const t = [...document.querySelectorAll('#tablerosInicio section, #tablerosInicio article, #tablerosInicio > *')].find(e => /10 médicos con más oportunidad/.test(e.textContent)); if (t) t.id = 'tarjetaTop10'; });
    await foto('11-top10', '#tarjetaTop10', 300).catch(e => console.log('sin top10', e.message));
    await page.evaluate(() => {
        const e = { visitador_id: App.state.visitadorId, medico_id: 'X', mercado: 'M' };
        App.state.OFFLINE_QUEUE.push({ tipo: 'evaluacion', evaluacion: e, encolada_en: new Date().toISOString() });
        Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
        App.offline.actualizarIndicadores();
        window.scrollTo(0, 0);
    });
    await foto('12-sin-internet', 'header', 400);
} finally {
    await browser.close();
    servidor.kill();
}

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
        await page.evaluate(() => App.ux.irA('matriz'));
        await foto('3m-vm-matriz', { completa: true });
        await page.evaluate(() => App.ux.irA('medicos'));
        await foto('3n-vm-medicos', { completa: true });
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
        await page.evaluate(() => { App.ux.cerrarAyudaMatriz(); App.ux.irA('matriz'); App.ux.abrirMatrizCompleta(); });
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
        // Campanita con algunos avisos de ejemplo
        await page.evaluate(() => {
            const docs = App.state.PROCESSED_DATA.filter(d => !d.isZeroRx && d.ficheroData && d.ficheroData.length).slice(0, 4);
            docs.forEach((d, i) => App.state.ALL_EVALUATIONS.push({ firebaseId: 'demo' + i, id: 'demo' + i, visitador: App.data.getFicheroRepKey(d.ficheroData[0]) ? String(d.ficheroData[0][App.data.getFicheroRepKey(d.ficheroData[0])]).trim().toUpperCase() : '',
                medico_id: d._clave, medico_name: d.name, mercado: 'DESLER MERCADO', cuadrante: i === 0 ? (d.closeupPotency === 'A' ? 'C-' : 'A+') : d.closeupLabel, survey: {}, timestamp: new Date(Date.now() - i * 3600000).toISOString() }));
            App.evaluation.marcarCambio(); App.avisos.actualizar(); App.avisos.abrir();
        });
        await foto('4a-admin-avisos');
        await page.evaluate(() => App.avisos.cerrar());
        await page.evaluate(() => App.ux.irA('matriz'));
        await foto('4b-admin-matriz');
        await page.evaluate(() => App.ux.irA('equipo'));
        await foto('4c-admin-equipo', { completa: true });
        await page.evaluate(() => { App.equipo.verVista('visitadores'); const e = App.equipo.estadisticas(); App.equipo.abrirVm(0, e.vms.slice().sort((a, b) => b.pct - a.pct)[0].nombre); });
        await foto('4c1-admin-equipo-detalle-vm');
        await page.evaluate(() => App.ux.iniciarGuia(true));
        await foto('4c0a-guia-paso-1');
        await page.evaluate(() => App.ux.pasoGuia(2));
        await foto('4c0b-guia-paso-3-matriz');
        await page.evaluate(() => App.ux.pasoGuia(3));
        await foto('4c0-guia-paso-mas');
        await page.evaluate(() => App.ux.terminarGuia());
        await page.evaluate(() => { App.equipo.verVista('visitadores'); App.equipo.abrirVm(0, App.equipo.estadisticas().vms.slice().sort((a, b) => b.pct - a.pct)[0].nombre); });
        await foto('4c2-admin-equipo-visitadores');
        await page.evaluate(() => App.equipo.verVista('prioridades'));
        await foto('4c3-admin-equipo-prioridades');
        await page.evaluate(() => App.ux.irA('ajustes'));
        await foto('4d-admin-ajustes', { completa: true });
        await page.evaluate(async () => { await App.usuarios.cargar(); App.ajustes.irA('ajUsuarios'); });
        await page.waitForTimeout(400);
        await foto('4g-admin-usuarios');
        await page.evaluate(() => App.usuarios.editar('u-vm'));
        await foto('4h-admin-usuario-editar');
        await page.evaluate(async () => { App.usuarios.clave('u-gd'); await App.usuarios.crearClave(); });
        await foto('4i-admin-usuario-clave');
        await page.evaluate(() => App.usuarios.cerrar());
        await page.evaluate(async () => { await App.catalogos.cargar(); App.ajustes.irA('ajCatalogos'); });
        await page.waitForTimeout(300);
        await foto('4k-admin-catalogos');
        await page.evaluate(() => App.catalogos.revisar('productos', [
            ['Producto', 'Laboratorio', 'Concentracion', 'Formas Farmaceuticas', 'Molecula', 'Clase Terapeutica', 'Generico'],
            ['DESLER PHQ', 'PHQ', '5MG', 'TABLETAS', 'DESLORATADINA', 'R06A0', 'N'], ['DESLER PHQ', 'PHQ', '0.5MG', 'GOTAS', 'DESLORATADINA', 'R05X0', 'N'],
            ['AZITROMICINA SAL SAL', 'SAL', '500MG', 'TABLETAS', 'AZITROMICINA', 'J01F0', 'S']], 'Productos.xls'));
        await foto('4l-admin-catalogo-revisar');
        await page.evaluate(() => App.catalogos.cerrar());
        await page.evaluate(async () => {
            App.sb.mercadosEnUso = async () => [
                { nombre: 'BUMETIN RETARD MERCADO A03F0', versiones: 4, en_vigente: true, evaluaciones: 37 },
                { nombre: 'ESOZ MERCADO A02B2', versiones: 4, en_vigente: true, evaluaciones: 112 },
                { nombre: 'FLUDIL SOLO', versiones: 1, en_vigente: true, evaluaciones: 0 },
                { nombre: 'Mdo Desler', versiones: 2, en_vigente: true, evaluaciones: 20 }];
            App.sb.renombresMercado = async () => [];
            const d = document.getElementById('catRenombrar');
            d.open = true; await App.catalogos.cargarRenombrar(); d.scrollIntoView({ block: 'start' });
        });
        await page.waitForTimeout(300);
        await foto('4l2-admin-renombrar-mercados');
        await page.evaluate(async () => { App.ajustes.irA('ajUsuarios'); await App.usuarios.cargarPendientes(); });
        await page.waitForTimeout(300);
        await foto('4m-admin-sin-acceso');
        await page.evaluate(() => App.usuarios.nuevo('vm', 0));
        await foto('4n-admin-crear-acceso');
        await page.evaluate(() => { App.usuarios.cerrar(); App.descargas.abrir(); });
        await foto('4o-descargar-datos');
        await page.evaluate(() => App.descargas.cerrar());
        await page.evaluate(async () => { App.usuarios.clavesMasivas(); await App.usuarios.crearClavesMasivas(); });
        await foto('4j-admin-claves-masivas');
        await page.evaluate(() => { window.confirm = () => true; App.usuarios.cerrarAccesos(); });
        await page.evaluate(() => App.ajustes.verComo('vm', 'NEIVIS PARRA'));
        await foto('4f-admin-ver-como');
        await page.evaluate(() => App.ajustes.salirVerComo());
        await page.evaluate(() => { document.getElementById('sliderPotHigh').value = 80; App.ajustes.alMoverUmbral(); App.ajustes.vistaPrevia(); });
        await foto('4e-admin-ajustes-vista-previa');
        await page.evaluate(() => { App.ajustes.descartarUmbrales(); App.ux.irA('inicio'); });
        await page.evaluate(() => abrirCargaDatos());
        await foto('5-admin-carga');
        await page.evaluate(async () => {
            const tit = ['Medicos Prescriptores por Mercado', 'Edicion: 09/2026', 'Linea: Todas', 'Mercados: X', 'Periodos: TAM 09/26 - ', 'Geografia: VENEZUELA', 'Especialidades: TOTAL', 'Sin filtros avanzados', 'Medico;;;;;;TAM 09/26'];
            const cab = 'Nombre;Matricula;Esp1;Esp2;Representantes;Mercado;Categ;%MS;Px;Productos1;Rnk1;%MS1;Px1;Medico Unico;Domicilio;Cod.Postal;Localidad ;Region';
            const f = (n, m, e, p, x) => `${n};${m};${e};;;X;1;1;1;${p};1;1;${x};1;DIR;1000;CARACAS;REGION CAPITAL`;
            const a1 = [...tit, cab, f('DR UNO', '107041', 'CAR', 'DESLER PHQ', 12), f('DR UNO', '107041', 'CAR', 'AERIUS SCH', 30), f('CLINICA', '0', 'INS', 'AERIUS SCH', 9)].join('\r\n');
            const a2 = [...tit, cab, f('DR DOS', '200', 'PED', 'ESOZ PHQ', 5), f('DR DOS', '200', 'PED', 'NEXIUM AZ', 7)].join('\r\n');
            document.querySelector('input[name="cargaTipo"][value="recetas"]').checked = true;
            await App.carga.intentarCloseUp([new File([a1], 'DESLER MERCADO.csv'), new File([a2], 'ESOZ MERCADO A02B2.csv')]);
            document.querySelector('#informeCloseUp details').open = true;
        });
        await page.waitForTimeout(300);
        await foto('5a-admin-carga-closeup', { completa: true });
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

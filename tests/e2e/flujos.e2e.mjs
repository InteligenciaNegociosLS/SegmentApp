/* ============================================================
   Prueba de punta a punta: abre la app construida (dist/) en un
   navegador real (Chromium) y recorre los flujos críticos:
   ingreso, permisos por rol, salida, recuperación de clave,
   descarga del Excel y panel de accesos.
   Supabase y las librerías externas se simulan (sin internet).
   Uso:  npm run build && npm run test:e2e
============================================================ */
import { createRequire } from 'node:module';
import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { construirDatosEquipo } from '../falsos/datos-equipo.mjs';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, '..', '..');
const STUB = path.join(AQUI, 'stubs');
const PUERTO = 5199;
const BASE = `http://127.0.0.1:${PUERTO}/`;

// Playwright: el del proyecto o el instalado globalmente
function cargarPlaywright() {
    const require = createRequire(import.meta.url);
    try { return require('playwright'); } catch {}
    const global = execSync('npm root -g').toString().trim();
    return require(path.join(global, 'playwright'));
}
const { chromium } = cargarPlaywright();

if (!fs.existsSync(path.join(RAIZ, 'dist', 'index.html'))) {
    console.error('Primero ejecuta: npm run build');
    process.exit(1);
}
const servidor = spawn(process.execPath, [path.join(RAIZ, 'scripts', 'servidor-local.mjs')], { env: { ...process.env, PORT: String(PUERTO) }, stdio: 'ignore' });
await new Promise(r => setTimeout(r, 800));

let fallas = 0;
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => { window.__calls = []; });
  // Lo que el servidor le enviaría a NEIVIS PARRA (calculado aquí con los datos reales)
  const { leerCsvGz } = await import('../../scripts/migracion/transformar.mjs');
  const leer = (f) => leerCsvGz(path.join(RAIZ, f));
  const phq = JSON.parse(fs.readFileSync(path.join(RAIZ, 'js', 'config.js'), 'utf8').match(/DEFAULT_PHQ_PRODUCTS = (\[[\s\S]*?\]);/)[1]);
  const paqueteVm = construirDatosEquipo({ recetas: leer('datacloseup.csv.gz').filas, fichero: leer('fichero_medico.csv.gz'), visibles: new Set(['NEIVIS PARRA']), phq });
  await page.addInitScript((p) => { window.__SB_DATOS_EQUIPO = { 's-rec-1|s-fic-1|u-vm': p }; }, paqueteVm);
  const ENV = `window.__SEGMENTAPP_ENV__ = ${JSON.stringify({ APP_ENV: 'preview', SUPABASE_URL: 'https://prueba.supabase.co', SUPABASE_ANON_KEY: 'clave-publica-de-prueba', VERSION: 'e2e' })};`;
  const ARCHIVOS = { 's-rec-1': 'datacloseup.csv.gz', 's-fic-1': 'fichero_medico.csv.gz' };
  await page.route('**/*', route => {
    const u = route.request().url();
    if (u.startsWith(BASE + 'js/env.js')) return route.fulfill({ contentType: 'application/javascript', body: ENV });
    if (u.startsWith(BASE)) return route.continue();
    if (u.endsWith('/datos-equipo.mjs')) return route.fulfill({ contentType: 'application/javascript', body: fs.readFileSync(path.join(RAIZ, 'tests', 'falsos', 'datos-equipo.mjs')) });
    if (u.includes('@supabase/supabase-js')) return route.fulfill({ contentType: 'application/javascript', body: fs.readFileSync(path.join(RAIZ, 'tests', 'falsos', 'supabase-falso.mjs')) });
    if (u.startsWith('https://prueba.supabase.co/auth/v1/health')) return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    const archivo = u.match(/^https:\/\/archivos\.prueba\/snapshots\/([^/]+)\//);
    if (archivo) {
      if (!ARCHIVOS[archivo[1]]) return route.fulfill({ status: 404, body: '' });
      return route.fulfill({ contentType: 'application/gzip', body: fs.readFileSync(path.join(RAIZ, ARCHIVOS[archivo[1]])) });
    }
    if (u.includes('localforage')) return route.fulfill({ contentType: 'application/javascript', body: fs.readFileSync(path.join(STUB, 'localforage.js')) });
    return route.fulfill({ contentType: u.includes('css') ? 'text/css' : 'application/javascript', body: '' });
  });
  const vis = id => page.evaluate(i => { const e = document.getElementById(i); return !!e && !e.classList.contains('hidden'); }, id);
  const toast = () => page.evaluate(() => document.getElementById('toast').innerText);
  const ok = (name, cond) => { if (!cond) fallas++; console.log((cond ? 'OK   ' : 'FALLA') + ' ' + name); };

  await page.goto(BASE);
  await page.waitForFunction(() => { const e = document.getElementById('loginRequiredState'); return e && !e.classList.contains('hidden'); }, null, { timeout: 120000 });
  ok('sin sesión: pantalla "Inicia sesión"', true);
  ok('sin sesión: no se ve el tablero', !(await vis('dashboardContent')) && !(await vis('filterBar')));

  await page.evaluate(() => openLoginModal());
  await page.fill('#loginEmail', 'vm@lasante.com'); await page.fill('#visitadorPwd', 'malaclave');
  await page.evaluate(() => attemptLogin()); await page.waitForTimeout(300);
  ok('clave mala: mensaje', (await toast()).includes('Correo o clave incorrectos'));
  await page.evaluate(() => sendPasswordReset()); await page.waitForTimeout(200);
  ok('recuperar clave: envía correo', (await page.evaluate(() => window.__calls)).includes('reset:vm@lasante.com'));

  await page.fill('#visitadorPwd', '123456');
  const tVm = Date.now();
  await page.evaluate(() => attemptLogin());
  await page.waitForFunction(() => App.state.currentUserRole === 'visitador', null, { timeout: 120000 });
  console.log(`INFO  VM: de "Entrar" al tablero en ${Date.now() - tVm} ms (solo sus médicos)`);
  await page.waitForTimeout(500);
  ok('VM: entra y ve su tablero', await vis('visitadorDashboard') && await vis('dashboardContent') && !(await vis('adminDashboard')));
  ok('VM: nombre desde su perfil', (await page.textContent('#navUserName')) === 'NEIVIS PARRA');
  const llamadasVm = await page.evaluate(() => window.__calls);
  ok('VM: recibe solo sus médicos (no descarga el archivo completo)', llamadasVm.includes('rpc:datos_equipo:s-rec-1') && !llamadasVm.some(c => c.startsWith('firmar:')));
  ok('VM: etiqueta "Datos: Hoy"', (await page.textContent('#lblVersionDatos')) === 'Datos: Hoy');
  ok('VM: sin botón de cargar datos', !(await vis('btnUploadData')));
  const nDocs = await page.evaluate(() => App.state.PROCESSED_DATA.length);
  ok('VM: ve solo sus médicos (' + nDocs + ')', nDocs > 0 && nDocs < 2000);
  ok('VM: consulta las evaluaciones', (await page.evaluate(() => window.__calls)).includes('select:evaluaciones'));

  await page.reload();
  await page.waitForFunction(() => App.state.currentUserRole !== 'guest', null, { timeout: 120000 });
  ok('VM: la sesión sigue tras recargar', await page.evaluate(() => App.state.currentUserRole === 'visitador'));
  await page.evaluate(() => { sessionStorage.setItem('userRole', 'admin'); });
  ok('truco sessionStorage ya no da admin', await page.evaluate(() => !App.state.isAdmin));

  await page.evaluate(() => logoutSession()); await page.waitForTimeout(300);
  ok('salir: vuelve a "Inicia sesión"', await vis('loginRequiredState') && !(await vis('dashboardContent')));

  await page.evaluate(() => openLoginModal());
  await page.fill('#loginEmail', 'norole@lasante.com'); await page.fill('#visitadorPwd', '123456');
  await page.evaluate(() => attemptLogin()); await page.waitForTimeout(500);
  ok('usuario sin rol: no entra', (await toast()).includes('permisos') && await page.evaluate(() => App.state.currentUserRole === 'guest'));

  await page.fill('#loginEmail', 'admin@lasante.com'); await page.fill('#visitadorPwd', 'adminadmin');
  const tAdmin = Date.now();
  await page.evaluate(() => attemptLogin());
  await page.waitForFunction(() => App.state.isAdmin, null, { timeout: 120000 });
  console.log(`INFO  Admin: de "Entrar" al tablero en ${Date.now() - tAdmin} ms (archivo completo, como antes lo hacían todos)`);
  await page.waitForTimeout(1000);
  ok('admin: entra al panel', await vis('adminDashboard') && await page.evaluate(() => App.state.isAdmin));
  ok('admin: sin botón "Limpiar Datos"', !(await page.evaluate(() => document.body.innerHTML.includes('Limpiar Datos'))));
  await page.evaluate(() => confirmClearAllEvals());
  ok('admin: borrado masivo desactivado', (await toast()).includes('desactivada'));
  ok('admin: botón "Cargar Datos" visible', await vis('btnUploadData'));

  // Panel de carga: revisar un archivo con un error y luego uno correcto
  await page.evaluate(() => abrirCargaDatos());
  ok('panel de carga: se abre', await vis('cargaDatosModal'));
  const C = await page.evaluate(() => App.carga.COLUMNAS_RECETAS);
  const filaOk = (i) => [`DR ${i}`, String(1000 + i), 'DESLER MERCADO', 'DESLER PHQ', '3', 'MG', 'C', '1', 'CCS', 'DC', 'MG', 'X', 'R', 'N', 'LST'].join(';');
  await page.check('input[name="cargaTipo"][value="recetas"]');
  await page.setInputFiles('#cargaArchivo', { name: 'malo.csv', mimeType: 'text/csv', buffer: Buffer.from(C.join(';') + '\n' + filaOk(1) + '\n;2;M;P;x;a;b;c;d;e;f;g;h;i;j\n') });
  await page.evaluate(() => App.carga.revisar()); await page.waitForTimeout(300);
  ok('panel de carga: muestra la fila con error', (await page.textContent('#cargaResultado')).includes('falta Medico') && await page.evaluate(() => document.getElementById('btnCargaSubir').disabled));
  await page.setInputFiles('#cargaArchivo', { name: 'bueno.csv', mimeType: 'text/csv', buffer: Buffer.from(C.join(';') + '\n' + Array.from({ length: 50 }, (_, i) => filaOk(i)).join('\n')) });
  await page.evaluate(() => App.carga.revisar()); await page.waitForTimeout(300);
  ok('panel de carga: archivo correcto sin errores', (await page.textContent('#cargaResultado')).includes('Sin errores'));
  await page.fill('#cargaNombre', 'Prueba febrero'); await page.fill('#cargaFecha', '2026-02-28');
  await page.evaluate(() => App.carga.iniciarSubida()); await page.waitForTimeout(800);
  const borrador = await page.evaluate(() => App.supabase._cliente._bd.data_snapshots.find(s => s.nombre === 'Prueba febrero'));
  ok('panel de carga: queda como borrador con su archivo', !!borrador && borrador.estado === 'borrador' && !!borrador.archivo && !borrador.es_vigente);
  ok('panel de carga: muestra la comparación', (await page.textContent('#cargaProgreso')).includes('Comparación'));
  page.once('dialog', d => d.accept());
  await page.evaluate(id => App.carga.publicar(id), borrador.id); await page.waitForTimeout(1500);
  const vigente = await page.evaluate(() => App.supabase._cliente._bd.data_snapshots.filter(s => s.tipo === 'recetas' && s.es_vigente).map(s => s.nombre));
  ok('publicar: la app recarga con los datos nuevos (50 filas)', await page.evaluate(() => App.state.RAW_DATA.length === 50));
  ok('publicar: la nueva pasa a ser "Hoy" y la anterior se conserva', vigente.length === 1 && vigente[0] === 'Prueba febrero' && await page.evaluate(() => App.supabase._cliente._bd.data_snapshots.some(s => s.id === 's-rec-1')));

  // Excel de evaluaciones con 3.000 evaluaciones sintéticas
  const ms = await page.evaluate(async () => {
    const keys = [...App.state.RAW_DATA.slice(0, 50000).map(r => r.license)];
    const mk = ['AIREX MCDO','DESLER MERCADO','ESOZ MERCADO A02B2'];
    App.state.ALL_EVALUATIONS = Array.from({ length: 3000 }, (_, i) => ({ firebaseId: 'f' + i, visitador: 'X', medico_id: keys[i * 13 % keys.length], mercado: mk[i % 3], cuadrante: 'A', survey: { q1: '10 a 20', q2: '1 a 5' } }));
    let rows = 0;
    window.XLSX = { utils: { book_new: () => ({}), json_to_sheet: d => { rows = d.length; return {}; }, book_append_sheet() {} }, writeFile() {} };
    const t = performance.now(); await exportAdminEvaluationsExcel(); return [Math.round(performance.now() - t), rows];
  });
  ok('Excel 3.000 evaluaciones: ' + ms[0] + ' ms, ' + ms[1] + ' filas', ms[1] === 3000 && ms[0] < 15000);

  await page.evaluate(() => openAccessManager()); await page.waitForTimeout(500);
  ok('panel accesos: sin claves visibles', !(await page.evaluate(() => document.getElementById('accessListContainer').innerHTML.includes('pwd_input'))));

  ok('admin: botón "Registro de fallas"', await page.evaluate(() => typeof descargarRegistroFallas === 'function' && document.body.innerHTML.includes('Registro de fallas')));
  ok('etiqueta de entorno visible fuera de producción', await page.evaluate(() => !!document.getElementById('etiquetaEntorno')));
  ok('sin errores de JavaScript' + (errors.length ? ': ' + errors.join(' | ') : ''), errors.length === 0);
} finally {
  await browser.close().catch(() => {});
  servidor.kill();
}
console.log(fallas ? `\n${fallas} prueba(s) fallaron.` : '\nTodas las pruebas de punta a punta pasaron.');
process.exit(fallas ? 1 : 0);

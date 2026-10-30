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
  const page = await browser.newPage({ serviceWorkers: 'block' });   // la app sin internet se prueba en sin-internet.e2e.mjs
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => { window.__calls = []; window.__SIN_GUIA = true; });
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
    // Gráficos simulados (las ventanas que los usan se pueden abrir sin internet)
    if (u.includes('chart.js')) return route.fulfill({ contentType: 'application/javascript', body: 'window.Chart=function(){return{destroy(){},update(){}}};Chart.register=()=>{};Chart.defaults={font:{}};' });
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
  // Ventanas y botones principales del VM (sin errores)
  await page.evaluate(() => { const d = App.state.PROCESSED_DATA.find(x => !x.isZeroRx); App.modals.openDoctorModal(d.id); });
  ok('VM: abre la ficha de un médico', await vis('fichaMedico') && await page.evaluate(() => document.querySelectorAll('#fichaIndicadores > div').length === 4));
  ok('ficha: matrícula, mercado favorito y producto más recetado', await page.evaluate(() => /Matrícula/.test(fichaEncabezado.innerText) && /Mercado favorito/.test(fichaContenido.innerText) && /Producto más recetado/.test(fichaContenido.innerText)));
  ok('ficha: botón Evaluar para el VM', await vis('fichaEvaluar'));
  const pestanas = [];
  for (const t of ['mercados', 'productos', 'datos']) { await page.evaluate((x) => App.ficha.mostrar(x), t); pestanas.push(await page.evaluate(() => fichaContenido.innerText.trim().length > 20)); }
  ok('ficha: pestañas Mercados, Productos y Datos con contenido', pestanas.every(Boolean));
  await page.evaluate(() => App.ficha.mostrar('historial')); await page.waitForTimeout(400);
  ok('ficha: historial de recetas por versión', await page.evaluate(() => window.__calls.some(c => c.startsWith('rpc:historial_medico')) && !/Cargando/.test(fichaHistRecetas.innerText)));
  ok('ficha: función de PDF disponible', await page.evaluate(() => typeof App.ficha.pdf === 'function'));
  await page.evaluate(() => App.ficha.cerrar());
  ok('ficha: se cierra', !(await vis('fichaMedico')));
  // Ideas 1 a 5: comparativos, selector de mercado y competencia por cuadrante
  ok('comparativos: tarjetas de movimientos y concordancia', await page.evaluate(() => /Movimientos/.test(tarjetaMovimientos.innerText) && /CloseUp vs/.test(tarjetaConcordancia.innerText)));
  ok('matriz: selector de mercado con opciones', await page.evaluate(() => document.querySelectorAll('#selectorMercado option').length >= 2));
  await page.evaluate(() => { document.querySelectorAll('.fixed.inset-0').forEach(m => m.classList.add('hidden')); const d = App.state.PROCESSED_DATA[0]; App.evaluation.openEvalModal(d.id, d.name); });
  ok('VM: abre la evaluación de un médico', await vis('evalModal'));
  await page.evaluate(() => document.getElementById('evalModal').classList.add('hidden'));
  await page.evaluate(() => switchMatrixMode('survey'));
  const modoEncuesta = await page.evaluate(() => [document.getElementById('btnMatrixSurvey').classList.contains('bg-blue-600'), document.getElementById('btnMatrixData').classList.contains('bg-blue-600')]);
  await page.evaluate(() => switchMatrixMode('closeup'));
  const modoDatos = await page.evaluate(() => [document.getElementById('btnMatrixSurvey').classList.contains('bg-blue-600'), document.getElementById('btnMatrixData').classList.contains('bg-blue-600')]);
  ok('matriz: el botón CloseUp/Encuesta marca solo el elegido', modoEncuesta.join() === 'true,false' && modoDatos.join() === 'false,true');
  // Fase 6B: filtro de pendientes, respuestas de un toque y "Guardar y siguiente"
  await page.evaluate(() => App.ux.filtroRapido('pendientes'));
  ok('VM: filtro "Pendientes" muestra solo los no evaluados', await page.evaluate(() => App.state.CURRENT_TABLE_DATA.length === 142 && App.state.CURRENT_TABLE_DATA.every(d => !App.ux.estaEvaluado(d))));
  const primero = await page.evaluate(() => { const d = App.state.CURRENT_TABLE_DATA[0]; openEvalModal(d.id, d.name); return d.name; });
  const toque = (zona, i = 0) => page.evaluate(([z, n]) => document.querySelectorAll(`#${z}_chips button`)[n].click(), [zona, i]);
  ok('evaluación: respuestas como botones', await page.evaluate(() => document.querySelectorAll('#surveyQ1_chips button').length === 7));
  await toque('evalMarketSelect'); await toque('surveyQ1', 1); await toque('surveyQ5', 2); await toque('surveyQ2', 1); await toque('surveyQ3', 1);
  ok('evaluación: tocar un botón llena la respuesta', await page.evaluate(() => document.getElementById('surveyQ1').value === '10 a 20'));
  await page.evaluate(() => { selectEvalQuadrant(document.querySelector('.eval-btn'), 'A-'); document.getElementById('evalNotas').value = 'Prueba automática'; });
  await page.evaluate(() => App.ux.guardarYSiguiente()); await page.waitForTimeout(600);
  const despues = await page.evaluate(() => ({ abierto: !document.getElementById('evalModal').classList.contains('hidden'), nombre: document.getElementById('evalModalDocName').innerText, evaluados: Object.keys(App.state.EVALUACIONES_VISITADOR).length }));
  ok('evaluación: "Guardar y siguiente" guarda y abre el próximo pendiente', despues.abierto && despues.nombre !== primero && despues.evaluados === 1);
  await page.evaluate(() => { closeEvalModal(); App.ux.filtroRapido('evaluados'); });
  ok('VM: filtro "Evaluados" muestra el recién evaluado', await page.evaluate(() => App.state.CURRENT_TABLE_DATA.length === 1));
  await page.evaluate(() => App.ux.filtroRapido('todos'));
  // Fase 6C: cuadrante → lista filtrada, pantalla completa y paginación de 20
  await page.evaluate(() => filterByMatrix('C', 'C'));
  ok('VM: página única (la matriz y la lista se ven juntas) y sin botón "Pendientes"', await page.evaluate(() => App.state.PANTALLA === 'medicos'
    && getComputedStyle(document.getElementById('seccionMatriz')).display !== 'none' && getComputedStyle(document.getElementById('seccionMedicos')).display !== 'none'
    && !document.querySelector('#navInferior [data-seccion="pendientes"]')));
  ok('matriz: tocar un cuadrante filtra la lista (sin lista repetida arriba)', await page.evaluate(() => !document.getElementById('panelCelda') && App.state.CURRENT_TABLE_DATA.length > 0 && App.state.CURRENT_TABLE_DATA.every(d => d.catPotency === 'C' && d.catLoyalty === 'C')));
  await page.evaluate(() => clearMatrixFilter());
  ok('lista: de 20 en 20', await page.evaluate(() => document.querySelectorAll('#dataTable tr').length === 20));
  await page.evaluate(() => App.ux.abrirMatrizCompleta());
  const completa = await page.evaluate(() => document.getElementById('seccionMatriz').classList.contains('matriz-completa'));
  await page.keyboard.press('Escape');
  ok('matriz: pantalla completa abre y se cierra con Escape', completa && await page.evaluate(() => !document.getElementById('seccionMatriz').classList.contains('matriz-completa')));
  ok('imagen de la matriz: se dibuja sin capturar la pantalla', await page.evaluate(() => { const c = App.exports.dibujarMatriz(); return c.width === 3200 && c.height === 2480; }));
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

  await page.evaluate(() => openLoginModal());
  await page.fill('#loginEmail', 'admin@lasante.com'); await page.fill('#visitadorPwd', 'adminadmin');
  const tAdmin = Date.now();
  await page.evaluate(() => attemptLogin());
  await page.waitForFunction(() => App.state.isAdmin, null, { timeout: 120000 });
  console.log(`INFO  Admin: de "Entrar" al tablero en ${Date.now() - tAdmin} ms (archivo completo, como antes lo hacían todos)`);
  await page.waitForTimeout(1000);
  ok('admin: entra al panel', await vis('adminDashboard') && await page.evaluate(() => App.state.isAdmin));
  ok('admin: secciones Inicio, Matriz, Médicos, Equipo y Ajustes', await page.evaluate(() => [...document.querySelectorAll('#navRiel [data-seccion]')].map(b => b.dataset.seccion).join() === 'inicio,matriz,medicos,equipo,ajustes'));
  await page.evaluate(() => App.ux.irA('ajustes'));
  const tUmbral = await page.evaluate(() => { const t = performance.now(); document.getElementById('sliderLow').value = 40; App.ajustes.alMoverUmbral(); return performance.now() - t; });
  ok(`ajustes: mover un umbral es instantáneo (${Math.round(tUmbral)} ms) y no cambia la matriz`, tUmbral < 50 && await page.evaluate(() => App.state.TH_LOY_LOW !== 40));
  await page.evaluate(() => App.ajustes.vistaPrevia());
  ok('ajustes: vista previa de cuántos médicos cambiarían', await page.evaluate(() => /cambiarían de cuadrante/.test(document.getElementById('ajVistaPrevia').innerText)));
  await page.evaluate(() => App.ajustes.descartarUmbrales());
  ok('ajustes: "Descartar" vuelve a los valores de todos', await page.evaluate(() => document.getElementById('sliderLow').value == App.state.TH_LOY_LOW && document.getElementById('btnAplicarUmbrales').disabled));
  await page.evaluate(() => App.ux.irA('equipo'));
  ok('equipo: el panel se dibuja al abrir la pantalla', await page.evaluate(() => document.querySelectorAll('#equipoContenido article').length > 3));
  ok('equipo (9B): 7 distritos y 51 visitadores con los datos reales', await page.evaluate(() => App.equipo.estadisticas().distritos.length === 7 && App.equipo.estadisticas().vms.length === 51));
  await page.evaluate(() => { App.equipo.verVista('visitadores'); App.equipo.abrirVm(0, App.equipo.estadisticas().vms.slice().sort((a, b) => b.pct - a.pct)[0].nombre); });
  ok('equipo: detalle de un visitador con su mini matriz', await page.evaluate(() => /Sus médicos por cuadrante/.test(document.getElementById('equipoContenido').innerText)));
  await page.evaluate(() => App.ux.irA('inicio'));
  ok('inicio: cobertura, mercados con oportunidad y distritos (sin mapa ni gráfica mes a mes)', await page.evaluate(() => ['Cobertura', 'Mercados con más oportunidad', 'Distritos'].every(t => document.getElementById('tablerosInicio').innerText.includes(t))
    && !/Mapa por estado|mes a mes/.test(document.getElementById('tablerosInicio').innerText)));
  ok('admin: sigue con pantallas separadas', await page.evaluate(() => { App.ux.irA('matriz'); const r = getComputedStyle(document.getElementById('seccionMedicos')).display === 'none'; App.ux.irA('inicio'); return r; }));
  await page.evaluate(() => App.ux.irA('ajustes'));
  await page.evaluate(() => App.ajustes.verComo('vm', 'NEIVIS PARRA')); await page.waitForTimeout(300);
  ok('ver como: el admin ve la app de NEIVIS PARRA (solo sus médicos, solo consulta)', await page.evaluate(() => App.state.soloLectura && App.state.PROCESSED_DATA.length === 142 && !document.getElementById('bannerVerComo').classList.contains('hidden')));
  await page.evaluate(() => App.ajustes.salirVerComo()); await page.waitForTimeout(300);
  ok('ver como: "Salir" vuelve al administrador', await page.evaluate(() => !App.state.soloLectura && App.state.PROCESSED_DATA.length === 28712 && App.state.PANTALLA === 'ajustes'));
  await page.evaluate(() => App.ux.irA('equipo'));
  await page.evaluate(() => history.back()); await page.waitForTimeout(300);
  ok('botón atrás: vuelve a la pantalla anterior', await page.evaluate(() => App.state.PANTALLA === 'ajustes'));
  await page.evaluate(() => App.ux.irA('inicio'));
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

  for (const abrir of ['App.reports.openModal()', "App.exports.showExportModal('excel')", 'App.admin.openSurveyConfigModal()', 'openProductModal()']) {
    await page.evaluate((a) => { document.querySelectorAll('.fixed.inset-0').forEach(m => m.classList.add('hidden')); (0, eval)(a); }, abrir);
    await page.waitForTimeout(150);
  }
  ok('admin: abre reportes, exportar, ponderación y productos', await page.evaluate(() => !!document.querySelector('.fixed.inset-0:not(.hidden)')));
  await page.evaluate(() => document.querySelectorAll('.fixed.inset-0').forEach(m => m.classList.add('hidden')));
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

/* ============================================================
   Genera docs/guia-vm-tablet/Guia-VM-tablet-y-computadora.pdf
   (horizontal, A4) desde docs/guia-vm-tablet/guia-vm-tablet.html.
   Uso:  node scripts/guia-vm-tablet-pdf.mjs [carpeta-fuentes]
   carpeta-fuentes (opcional): node_modules con @fontsource-variable/roboto-flex
   y material-symbols (la tipografía y los íconos de la app). Sin ella se usa
   la letra del sistema y los íconos no se ven.
   Para renovar las capturas: npm run build && node tests/e2e/capturas-guia-vm-tablet.mjs <salida> [carpeta-fuentes]
   y copiarlas a docs/guia-vm-tablet/img/ como .jpg (máx. 1800 px de ancho).
============================================================ */
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HTML = path.join(RAIZ, 'docs', 'guia-vm-tablet', 'guia-vm-tablet.html');
const PDF = path.join(RAIZ, 'docs', 'guia-vm-tablet', 'Guia-VM-tablet-y-computadora.pdf');
const FUENTES = process.argv[2] ? path.resolve(process.argv[2]) : null;

const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); } catch { playwright = require(path.join(execSync('npm root -g').toString().trim(), 'playwright')); }

const fuente = (rel) => FUENTES && fs.existsSync(path.join(FUENTES, rel)) ? fs.readFileSync(path.join(FUENTES, rel)).toString('base64') : null;

const browser = await playwright.chromium.launch();
try {
    const page = await browser.newPage();
    await page.goto(pathToFileURL(HTML).href, { waitUntil: 'load' });
    const roboto = fuente('@fontsource-variable/roboto-flex/files/roboto-flex-latin-full-normal.woff2');
    const simbolos = fuente('material-symbols/material-symbols-outlined.woff2');
    let css = '';
    if (roboto) css += `@font-face{font-family:"Roboto Flex";font-weight:100 1000;font-stretch:25% 151%;src:url(data:font/woff2;base64,${roboto}) format("woff2")}`;
    if (simbolos) css += `@font-face{font-family:"Material Symbols Outlined";font-weight:100 700;src:url(data:font/woff2;base64,${simbolos}) format("woff2")}`;
    if (css) { await page.addStyleTag({ content: css }); await page.evaluate(() => document.fonts.ready); }
    await page.pdf({ path: PDF, format: 'A4', landscape: true, printBackground: true, preferCSSPageSize: true,
        displayHeaderFooter: true, headerTemplate: '<span></span>',
        footerTemplate: '<div style="width:100%;font-size:8px;color:#44474e;padding:0 13mm;display:flex;justify-content:space-between;font-family:Arial"><span>SegmentApp · Guía del Visitador Médico · iPad, tablet y computadora · La Santé</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>' });
    console.log('PDF listo:', PDF);
} finally {
    await browser.close();
}

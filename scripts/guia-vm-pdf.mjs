/* ============================================================
   Genera docs/guia-vm/Guia-rapida-VM.pdf desde docs/guia-vm/guia-vm.html.
   Uso:  node scripts/guia-vm-pdf.mjs [carpeta-fuentes]
   carpeta-fuentes (opcional): node_modules con @fontsource-variable/roboto-flex
   (la tipografía de la app). Sin ella se usa la letra del sistema.
   Para renovar las capturas: npm run build && node tests/e2e/capturas-guia-vm.mjs <salida> [carpeta-fuentes]
   y copiarlas a docs/guia-vm/img/ como .jpg.
============================================================ */
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HTML = path.join(RAIZ, 'docs', 'guia-vm', 'guia-vm.html');
const PDF = path.join(RAIZ, 'docs', 'guia-vm', 'Guia-rapida-VM.pdf');
const FUENTES = process.argv[2] ? path.resolve(process.argv[2]) : null;

const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); } catch { playwright = require(path.join(execSync('npm root -g').toString().trim(), 'playwright')); }

const browser = await playwright.chromium.launch();
try {
    const page = await browser.newPage();
    await page.goto(pathToFileURL(HTML).href, { waitUntil: 'load' });
    const woff = FUENTES && path.join(FUENTES, '@fontsource-variable', 'roboto-flex', 'files', 'roboto-flex-latin-full-normal.woff2');
    if (woff && fs.existsSync(woff)) {
        const b64 = fs.readFileSync(woff).toString('base64');
        await page.addStyleTag({ content: `@font-face{font-family:"Roboto Flex";font-weight:100 1000;font-stretch:25% 151%;src:url(data:font/woff2;base64,${b64}) format("woff2")}` });
        await page.evaluate(() => document.fonts.ready);
    }
    await page.pdf({ path: PDF, format: 'A4', printBackground: true, preferCSSPageSize: true,
        displayHeaderFooter: true, headerTemplate: '<span></span>',
        footerTemplate: '<div style="width:100%;font-size:8px;color:#5f6368;padding:0 14mm;display:flex;justify-content:space-between;font-family:Arial"><span>SegmentApp · Guía rápida del Visitador Médico · La Santé</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>' });
    console.log('PDF listo:', PDF);
} finally {
    await browser.close();
}

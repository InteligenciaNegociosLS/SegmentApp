/* ============================================================
   PASO 4 · Validar la migración (SOLO LECTURA)
   Uso:  node 4-validar.mjs
   Compara Supabase con la exportación de Firebase y con los
   archivos originales, y escribe VALIDACION.md en esta carpeta.
============================================================ */
import fs from 'node:fs';
import path from 'node:path';
import { destinoSeguro, conectarBase, rutaExportacion, AQUI, RAIZ } from './comun.mjs';
import { leerExportacion } from './transformar.mjs';
import { validar, informeMarkdown } from './validar.mjs';

const { destino, ref, dbUrl } = await destinoSeguro();
const exportacion = leerExportacion(rutaExportacion());
const db = await conectarBase(dbUrl);
try {
    console.log('Comparando (puede tardar 1–2 minutos)...');
    const resultado = await validar({ db, raiz: RAIZ, exportacion });
    const md = informeMarkdown(resultado, { destino, proyecto: ref, exportacion });
    const archivo = path.join(AQUI, 'VALIDACION.md');
    fs.writeFileSync(archivo, md);
    resultado.chequeos.forEach(c => console.log(`${c.ok ? '✅' : '❌'} ${c.grupo}: ${c.nombre} — ${c.detalle}`));
    console.log(`\n${resultado.todoOk ? '✅ TODO COINCIDE' : '❌ HAY DIFERENCIAS'} · Informe: ${archivo}`);
    if (!resultado.todoOk) process.exitCode = 1;
} finally {
    await db.end();
}

/* ============================================================
   PASO 2 · Importar a Supabase
   Uso:  node 2-importar.mjs --simulacro    (valida todo y lo DESHACE)
         node 2-importar.mjs                (lo guarda de verdad)
   Opcional: --export exportaciones/firebase-XXXX.json (por defecto, la más reciente)
   Carga distritos, visitadores, "Datos enero" (fichero y recetas)
   y las evaluaciones de Firebase. Se puede repetir sin duplicar.
============================================================ */
import { destinoSeguro, conectarBase, rutaExportacion, tieneOpcion, RAIZ } from './comun.mjs';
import { leerExportacion } from './transformar.mjs';
import { importar } from './importar.mjs';

const simulacro = tieneOpcion('--simulacro');
const { dbUrl } = await destinoSeguro();
const archivo = rutaExportacion();
console.log(`Exportación de Firebase: ${archivo}`);
console.log(simulacro ? '🔎 MODO SIMULACRO: se valida todo y al final se deshace.' : '✍️  MODO REAL.');

const exportacion = leerExportacion(archivo);
const db = await conectarBase(dbUrl);
const t0 = Date.now();
try {
    await importar({ db, raiz: RAIZ, exportacion, simulacro });
    console.log(`\n✅ ${simulacro ? 'Simulacro terminado sin errores' : 'Importación terminada'} en ${Math.round((Date.now() - t0) / 1000)} s.`);
    if (!simulacro) console.log('   Siguiente: node 3-usuarios.mjs --plantilla');
} catch (e) {
    console.error(`\n❌ La importación se detuvo: ${e.message}`);
    console.error('   El paso que falló se deshizo completo. Puedes corregir y repetir.');
    process.exitCode = 1;
} finally {
    await db.end();
}

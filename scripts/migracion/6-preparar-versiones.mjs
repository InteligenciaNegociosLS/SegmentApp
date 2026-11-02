/* ============================================================
   PASO 6 · Preparar las versiones de recetas para VM y GD
   Uso:  node 6-preparar-versiones.mjs --simulacro
         node 6-preparar-versiones.mjs
   (5-subir-archivos.mjs ya lo hace al final; este paso es por si
   hay que repetirlo.) Se puede repetir sin problema.
============================================================ */
import { destinoSeguro, conectarBase, tieneOpcion, salir } from './comun.mjs';
import { prepararVersiones } from './orden.mjs';

const simulacro = tieneOpcion('--simulacro');
const { dbUrl } = await destinoSeguro();
const db = await conectarBase(dbUrl);
try {
    const hechas = await prepararVersiones({ db, simulacro });
    if (!simulacro && hechas.length) console.log(`\n✅ Preparadas: ${hechas.join(', ')}. Los visitadores ya pueden entrar.`);
} catch (e) {
    salir(e.message);
} finally {
    await db.end();
}

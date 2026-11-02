/* ============================================================
   PASO 0 · Crear las tablas en el Supabase NUEVO (producción)
   Uso:  node 0-preparar-base.mjs --simulacro   (muestra qué aplicaría)
         node 0-preparar-base.mjs               (aplica lo que falte)
   Aplica todos los archivos de supabase/migrations/ en orden. En PRUEBAS
   no hace falta (ya se aplicaron a mano) y el script se detiene solo.
============================================================ */
import path from 'node:path';
import { destinoSeguro, conectarBase, tieneOpcion, RAIZ, salir } from './comun.mjs';
import { aplicarMigraciones } from './migraciones.mjs';

const simulacro = tieneOpcion('--simulacro');
const { dbUrl } = await destinoSeguro();
const db = await conectarBase(dbUrl);
try {
    console.log(simulacro ? '🔎 SIMULACRO (no se aplica nada)\n' : '✍️  MODO REAL\n');
    const r = await aplicarMigraciones({ db, carpeta: path.join(RAIZ, 'supabase', 'migrations'), simulacro });
    if (simulacro) console.log(`\n✅ Todo listo: se aplicarían ${r.pendientes.length} archivo(s).`);
    else console.log(r.aplicadas.length ? `\n✅ Base lista: se aplicaron ${r.aplicadas.length} archivo(s).` : '\n✅ La base ya estaba al día. No se cambió nada.');
} catch (e) {
    salir(e.message);
} finally {
    await db.end();
}

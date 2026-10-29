/* ============================================================
   PASO 5 · Subir los archivos de "Datos enero" al almacén privado
   Uso:  node 5-subir-archivos.mjs --simulacro   (revisa sin subir nada)
         node 5-subir-archivos.mjs               (sube y asocia)
   Desde la Fase 5 la app descarga los datos de Supabase, SOLO
   después de iniciar sesión. Los .gz siguen en el repositorio
   como respaldo (no se borran). Se puede repetir sin problema.
============================================================ */
import { destinoSeguro, conectarBase, tieneOpcion, RAIZ, salir } from './comun.mjs';
import { subirArchivosVersion, almacenSupabase } from './archivos.mjs';

const simulacro = tieneOpcion('--simulacro');
const { dbUrl, url } = await destinoSeguro({ necesitaAuth: !simulacro });
const db = await conectarBase(dbUrl);
try {
    const columnas = await db.query(`select 1 from information_schema.columns where table_schema = 'public' and table_name = 'data_snapshots' and column_name = 'archivo'`);
    if (!columnas.rows.length) salir('Falta aplicar en Supabase el SQL 20261029120000_carga_de_datos.sql (Fase 5).');
    const storage = simulacro ? null : await almacenSupabase(url, process.env.SUPABASE_SERVICE_ROLE_KEY);
    console.log(simulacro ? '🔎 SIMULACRO (no se sube nada)\n' : '✍️  MODO REAL\n');
    const hechos = await subirArchivosVersion({ db, storage, raiz: RAIZ, simulacro });
    console.log(`\n✅ ${simulacro ? 'Todo listo para subir' : 'Archivos subidos y asociados'}: ${hechos.map(h => h.tipo).join(' y ')}.`);
} catch (e) {
    salir(e.message);
} finally {
    await db.end();
}

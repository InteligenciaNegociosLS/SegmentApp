/* ============================================================
   PASO 3 · Usuarios (correo corporativo + rol)
   Uso:  node 3-usuarios.mjs --plantilla   (crea usuarios.csv para llenar en Excel)
         node 3-usuarios.mjs --simulacro   (revisa el CSV sin crear nada)
         node 3-usuarios.mjs               (crea / actualiza los usuarios)
============================================================ */
import fs from 'node:fs';
import path from 'node:path';
import { destinoSeguro, conectarBase, authAdminSupabase, rutaExportacion, tieneOpcion, AQUI, salir } from './comun.mjs';
import { leerExportacion } from './transformar.mjs';
import { plantillaCsv, leerCsvUsuarios, aplicarUsuarios } from './usuarios.mjs';

const CSV = path.join(AQUI, 'usuarios.csv');
const { dbUrl, url } = await destinoSeguro({ necesitaAuth: !tieneOpcion('--plantilla') && !tieneOpcion('--simulacro') });
const db = await conectarBase(dbUrl);
try {
    if (tieneOpcion('--plantilla')) {
        if (fs.existsSync(CSV)) salir('Ya existe usuarios.csv. Renómbralo si quieres una plantilla nueva.');
        const exp = leerExportacion(rutaExportacion());
        const { texto, llenos } = await plantillaCsv(db, exp);
        fs.writeFileSync(CSV, texto);
        console.log(`✅ Creado ${CSV}`);
        console.log(`   ${llenos} correo(s) ya vienen llenos desde Firebase: revísalos.`);
        console.log('   Descárgalo con:  cloudshell download usuarios.csv');
        console.log('   Completa los correos que falten en Excel y guárdalo como "CSV UTF-8".');
    } else {
        if (!fs.existsSync(CSV)) salir('No encuentro usuarios.csv. Primero: node 3-usuarios.mjs --plantilla');
        const { filas, errores } = leerCsvUsuarios(fs.readFileSync(CSV, 'utf8'));
        if (errores.length) salir('Hay errores en usuarios.csv:\n   - ' + errores.join('\n   - '));
        const exp = leerExportacion(rutaExportacion());
        const simulacro = tieneOpcion('--simulacro');
        const authAdmin = simulacro ? null : await authAdminSupabase(url);
        console.log(`${filas.length} usuarios en el CSV. ${simulacro ? '🔎 SIMULACRO (no se crea nada)' : '✍️  MODO REAL'}\n`);
        const r = await aplicarUsuarios({ db, authAdmin, filas, claves: exp.claves, claveAdmin: exp.claveAdmin, simulacro });
        if (r.errores.length) salir('No se pudo completar:\n   - ' + r.errores.join('\n   - '));
        console.log(`\nCreados: ${r.creados} · Ya existían: ${r.actualizados}`);
        if (r.conRecuperacion.length) {
            console.log(`\nℹ️  Entrarán la primera vez con "¿Olvidaste tu clave?" (${r.conRecuperacion.length}):`);
            r.conRecuperacion.forEach(c => console.log('   - ' + c));
        }
    }
} finally {
    await db.end();
}

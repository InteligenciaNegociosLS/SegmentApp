/* ============================================================
   PASO 3 · Usuarios (correo corporativo + rol)
   Uso:  node 3-usuarios.mjs --plantilla   (crea usuarios.csv para llenar en Excel)
         node 3-usuarios.mjs --simulacro   (revisa el CSV sin crear nada)
         node 3-usuarios.mjs               (crea / actualiza los usuarios)
         node 3-usuarios.mjs --enviar-enlaces --simulacro   (muestra a quién le llegaría)
         node 3-usuarios.mjs --enviar-enlaces               (correo "Crea tu clave" a quien no tiene clave)
             opciones: --todos (a todos) · --solo correo@empresa.com (a una persona)
   Para enviar enlaces hace falta APP_URL en el .env y el correo propio
   configurado en Supabase (docs/CORREO.md).
============================================================ */
import fs from 'node:fs';
import path from 'node:path';
import { destinoSeguro, conectarBase, authAdminSupabase, rutaExportacion, tieneOpcion, argumento, AQUI, salir } from './comun.mjs';
import { leerExportacion } from './transformar.mjs';
import { plantillaCsv, leerCsvUsuarios, aplicarUsuarios, quienesNecesitanEnlace, enviarEnlaces } from './usuarios.mjs';

const CSV = path.join(AQUI, 'usuarios.csv');
const { dbUrl, url } = await destinoSeguro({ necesitaAuth: !tieneOpcion('--plantilla') && !tieneOpcion('--simulacro') });
const db = await conectarBase(dbUrl);
try {
    if (tieneOpcion('--enviar-enlaces')) {
        if (!fs.existsSync(CSV)) salir('No encuentro usuarios.csv.');
        const { filas, errores } = leerCsvUsuarios(fs.readFileSync(CSV, 'utf8'));
        if (errores.length) salir('Hay errores en usuarios.csv:\n   - ' + errores.join('\n   - '));
        const appUrl = (process.env.APP_URL || '').trim();
        if (!/^https:\/\//.test(appUrl)) salir('Falta APP_URL en el .env (la dirección de la app, ej. https://segmentapp.vercel.app).');
        const exp = leerExportacion(rutaExportacion());
        const destinatarios = quienesNecesitanEnlace({ filas, claves: exp.claves, claveAdmin: exp.claveAdmin, todos: tieneOpcion('--todos'), solo: argumento('--solo') || '' });
        const simulacro = tieneOpcion('--simulacro');
        console.log(`${destinatarios.length} persona(s) recibirán el correo "Crea tu clave". ${simulacro ? '🔎 SIMULACRO (no se envía nada)' : '✉️  ENVIANDO'}\n`);
        const authAdmin = simulacro ? null : await authAdminSupabase(url);
        const r = await enviarEnlaces({ authAdmin, destinatarios, appUrl, simulacro });
        if (!simulacro) console.log(`\nEnviados: ${r.enviados.length} · Con problemas: ${r.fallidos.length}`);
        if (r.fallidos.length) console.log('Repite con --solo para cada uno cuando se resuelva:\n   - ' + r.fallidos.join('\n   - '));
    } else if (tieneOpcion('--plantilla')) {
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

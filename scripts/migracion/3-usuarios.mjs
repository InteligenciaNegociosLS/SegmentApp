/* ============================================================
   PASO 3 · Usuarios (correo corporativo + rol)
   Uso:  node 3-usuarios.mjs --plantilla   (crea usuarios.csv para llenar en Excel)
         node 3-usuarios.mjs --simulacro   (revisa el CSV sin crear nada)
         node 3-usuarios.mjs               (crea / actualiza los usuarios)
         node 3-usuarios.mjs --nueva-clave correo@empresa.com
                                           (clave temporal nueva para quien la olvidó)
   La app NO envía correos: al crear usuarios (o dar una clave nueva),
   el script deja accesos.csv con el correo, la clave temporal y un
   mensaje listo para que el dueño lo envíe por Gmail o WhatsApp.
   accesos.csv tiene claves: descárgalo, envía los mensajes y bórralo.
============================================================ */
import fs from 'node:fs';
import path from 'node:path';
import { destinoSeguro, conectarBase, authAdminSupabase, rutaExportacion, tieneOpcion, argumento, AQUI, salir } from './comun.mjs';
import { leerExportacion } from './transformar.mjs';
import { plantillaCsv, leerCsvUsuarios, aplicarUsuarios, generarClaveTemporal, accesosCsv } from './usuarios.mjs';

const CSV = path.join(AQUI, 'usuarios.csv');
const ACCESOS = path.join(AQUI, 'accesos.csv');
const appUrl = () => (process.env.APP_URL || '').trim();
const guardarAccesos = (accesos) => {
    fs.writeFileSync(ACCESOS, accesosCsv(accesos, appUrl()), { mode: 0o600 });
    console.log(`\n🔑 Accesos guardados en ${ACCESOS} (${accesos.length}).`);
    console.log('   Descárgalo con:  cloudshell download accesos.csv');
    console.log('   Envía a cada uno su mensaje (columna "mensaje") y luego bórralo:  rm accesos.csv');
    console.log('   No lo subas a GitHub ni lo pegues en el chat: tiene claves.');
};

const nuevaClave = argumento('--nueva-clave');
const { dbUrl, url } = await destinoSeguro({ necesitaAuth: !tieneOpcion('--plantilla') && !tieneOpcion('--simulacro') });
const db = await conectarBase(dbUrl);
try {
    if (nuevaClave) {
        const correo = nuevaClave.trim().toLowerCase();
        const authAdmin = await authAdminSupabase(url);
        const id = await authAdmin.buscarPorCorreo(correo);
        if (!id) salir(`No existe un usuario con el correo ${correo}.`);
        const clave = generarClaveTemporal();
        await authAdmin.cambiarClave(id, clave);
        const perfil = (await db.query('select nombre, rol from public.perfiles where id = $1', [id])).rows[0] || {};
        console.log(`✅ Clave temporal nueva para ${correo}.`);
        guardarAccesos([{ correo, nombre: perfil.nombre || '', rol: perfil.rol || '', clave, tipo: 'temporal' }]);
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
        console.log(`\nCreados: ${r.creados} · Ya existían: ${r.actualizados} · Con clave temporal: ${r.conClaveTemporal.length}`);
        if (!simulacro && r.accesos.length) guardarAccesos(r.accesos);
        if (!simulacro && r.actualizados) console.log('\nℹ️  Los que ya existían conservan su clave. Si alguno la olvidó: node 3-usuarios.mjs --nueva-clave su@correo');
        if (!appUrl()) console.log('\n💡 Pon APP_URL en el .env para que el mensaje incluya la dirección de la app.');
    }
} finally {
    await db.end();
}

/* ============================================================
   SegmentApp - Crear usuarios reales de Firebase (SOLO AGREGA)
   Uso:
     node crear-usuarios.mjs --simulacro      (muestra lo que haría, no cambia nada)
     node crear-usuarios.mjs                  (lo hace de verdad)
     node crear-usuarios.mjs --csv otro.csv   (otro archivo; por defecto usuarios.csv)
     node crear-usuarios.mjs --plantilla      (crea usuarios.csv con los nombres actuales)

   Lee usuarios.csv con columnas:  correo,nombre_visitador,rol
     rol = visitador | admin
     nombre_visitador = EXACTAMENTE el nombre con el que el VM entraba hoy
                        (el de la lista desplegable / fichero).

   Qué hace:
   - Crea cada usuario en Firebase Auth con su CLAVE ACTUAL
     (claves_visitadores; para el admin, config/admin_settings).
     Si la clave actual tiene menos de 6 caracteres (mínimo de Firebase)
     o no existe, se crea con una clave aleatoria que nadie conoce: esa
     persona entra con "¿Olvidaste tu clave?".
   - Le asigna su rol (custom claims): role + visitadorName.
   - Si el usuario YA existe, solo actualiza su rol. NO cambia su clave.
   - Guarda el directorio nombre -> correo en config/directorio_usuarios.
   No borra nada. No muestra claves en pantalla.
============================================================ */
import fs from 'node:fs';
import crypto from 'node:crypto';
import { conectar, avisoProyecto, APP_ID } from './comun.mjs';

const args = process.argv.slice(2);
const SIMULACRO = args.includes('--simulacro');
const csvIdx = args.indexOf('--csv');
const CSV = csvIdx >= 0 ? args[csvIdx + 1] : 'usuarios.csv';
const ROLES_VALIDOS = ['visitador', 'admin'];
const CLAVE_MINIMA = 6;

function salir(msg) {
    console.error(`\n❌ ${msg}\n   No se hizo ningún cambio.`);
    process.exit(1);
}

// --- 0. (Opcional) Generar plantilla con los nombres actuales -------------
if (args.includes('--plantilla')) {
    avisoProyecto();
    const { db } = conectar();
    const snap = await db.collection('artifacts').doc(APP_ID)
        .collection('public').doc('data').collection('claves_visitadores').get();
    const nombres = snap.docs.map(d => d.id).sort();
    const contenido = ['correo,nombre_visitador,rol', ',ADMIN,admin', ...nombres.map(n => `,${n},visitador`)].join('\n') + '\n';
    fs.writeFileSync('usuarios.csv', contenido);
    console.log(`✅ Creado usuarios.csv con ${nombres.length} visitadores + 1 admin.`);
    console.log('   Completa la columna "correo" de cada fila (no cambies los nombres) y guarda.');
    process.exit(0);
}

// --- 1. Leer y validar el CSV --------------------------------------------
if (!fs.existsSync(CSV)) salir(`No encuentro el archivo ${CSV}. Súbelo a esta carpeta (usa usuarios-ejemplo.csv como modelo).`);
const textoCsv = fs.readFileSync(CSV, 'utf8');
if (textoCsv.includes('\uFFFD')) salir('El archivo no está en UTF-8 (las Ñ y tildes se dañaron). En Excel usa: Guardar como → "CSV UTF-8 (delimitado por comas)".');
const lineas = textoCsv.replace(/^\uFEFF/, '').split(/\r?\n/).filter(l => l.trim());
const sep = lineas[0].includes(';') ? ';' : ',';
const cab = lineas[0].split(sep).map(c => c.trim().toLowerCase());
const iCorreo = cab.indexOf('correo'), iNombre = cab.indexOf('nombre_visitador'), iRol = cab.indexOf('rol');
if (iCorreo < 0 || iNombre < 0 || iRol < 0) salir('La primera fila debe ser: correo,nombre_visitador,rol');

const filas = [];
const errores = [];
lineas.slice(1).forEach((linea, n) => {
    const c = linea.split(sep).map(x => x.trim());
    const fila = { linea: n + 2, correo: (c[iCorreo] || '').toLowerCase(), nombre: (c[iNombre] || '').toUpperCase(), rol: (c[iRol] || '').toLowerCase() };
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(fila.correo)) errores.push(`Fila ${fila.linea}: correo inválido "${fila.correo}"`);
    if (!ROLES_VALIDOS.includes(fila.rol)) {
        const extra = ['gd', 'gte_nacional'].includes(fila.rol) ? ' (ese rol llega con la app nueva)' : '';
        errores.push(`Fila ${fila.linea}: rol "${fila.rol}" no válido; usa visitador o admin${extra}`);
    }
    if (fila.rol === 'visitador' && !fila.nombre) errores.push(`Fila ${fila.linea}: falta nombre_visitador`);
    filas.push(fila);
});
const repetidos = (campo) => filas.map(f => f[campo]).filter((v, i, a) => v && a.indexOf(v) !== i);
repetidos('correo').forEach(v => errores.push(`Correo repetido: ${v}`));
[...new Set(filas.filter(f => f.rol === 'visitador').map(f => f.nombre).filter((v, i, a) => a.indexOf(v) !== i))]
    .forEach(v => errores.push(`Visitador repetido: ${v}`));
if (!filas.some(f => f.rol === 'admin')) errores.push('Debe haber al menos una fila con rol admin.');
if (errores.length) salir('Hay errores en el CSV:\n   - ' + errores.join('\n   - '));

// --- 2. Leer claves actuales (solo lectura) --------------------------------
avisoProyecto();
console.log(SIMULACRO ? '🔎 MODO SIMULACRO: no se cambia nada.\n' : '✍️  MODO REAL.\n');
const { db, auth } = conectar();
const base = db.collection('artifacts').doc(APP_ID);

const clavesSnap = await base.collection('public').doc('data').collection('claves_visitadores').get();
const claves = new Map();               // nombre exacto (id del documento) -> clave
clavesSnap.forEach(d => claves.set(d.id, String(d.data().clave || '')));
const idPorMayusculas = new Map([...claves.keys()].map(id => [id.trim().toUpperCase(), id]));

const adminSnap = await base.collection('config').doc('admin_settings').get();
const claveAdmin = adminSnap.exists ? String(adminSnap.data().clave || '') : '';

// --- 3. Procesar cada usuario ---------------------------------------------
const directorio = {};
const resumen = { creados: 0, actualizados: 0, conRecuperacion: [], sinClaveVieja: [] };

for (const f of filas) {
    let nombreClaim = null, claveActual = '';
    if (f.rol === 'visitador') {
        // El nombre del token debe ser idéntico al guardado en las evaluaciones
        nombreClaim = idPorMayusculas.get(f.nombre) || f.nombre;
        claveActual = claves.get(nombreClaim) || '';
        if (!claves.has(nombreClaim)) resumen.sinClaveVieja.push(f.nombre);
        directorio[nombreClaim] = f.correo;
    } else {
        claveActual = claveAdmin;
    }
    const claims = f.rol === 'admin' ? { role: 'admin' } : { role: 'visitador', visitadorName: nombreClaim };
    const claveUsable = claveActual.length >= CLAVE_MINIMA;

    let existente = null;
    try { existente = await auth.getUserByEmail(f.correo); } catch (e) { if (e.code !== 'auth/user-not-found') throw e; }

    const etiqueta = `${f.rol.padEnd(9)} ${f.correo.padEnd(38)} ${nombreClaim || ''}`;
    if (existente) {
        console.log(`↻ ya existe, solo rol   ${etiqueta}`);
        if (!SIMULACRO) await auth.setCustomUserClaims(existente.uid, claims);
        resumen.actualizados++;
    } else {
        const nota = claveUsable ? 'clave actual' : 'clave aleatoria → usará "¿Olvidaste tu clave?"';
        console.log(`+ crear (${nota})  ${etiqueta}`);
        if (!claveUsable) resumen.conRecuperacion.push(f.correo);
        if (!SIMULACRO) {
            const nuevo = await auth.createUser({
                email: f.correo,
                password: claveUsable ? claveActual : crypto.randomBytes(24).toString('base64url'),
                disabled: false
            });
            await auth.setCustomUserClaims(nuevo.uid, claims);
        }
        resumen.creados++;
    }
}

// --- 4. Directorio nombre -> correo (para el panel de accesos del admin) --
if (!SIMULACRO) {
    await base.collection('config').doc('directorio_usuarios').set({
        visitadores: directorio,
        actualizado_en: new Date().toISOString()
    }, { merge: true });
}

// --- 5. Resumen ------------------------------------------------------------
const sinUsuario = [...claves.keys()].filter(n => !directorio[n]);
console.log('\n================ RESUMEN ================');
console.log(`Usuarios ${SIMULACRO ? 'que se crearían' : 'creados'}:      ${resumen.creados}`);
console.log(`Usuarios ya existentes (rol):   ${resumen.actualizados}`);
if (resumen.conRecuperacion.length) {
    console.log(`\n⚠️  Deben usar "¿Olvidaste tu clave?" la primera vez (${resumen.conRecuperacion.length}):`);
    resumen.conRecuperacion.forEach(c => console.log('   - ' + c));
}
if (resumen.sinClaveVieja.length) {
    console.log(`\nℹ️  Visitadores del CSV que no tenían clave en la app vieja (${resumen.sinClaveVieja.length}). Revisa que el nombre esté bien escrito:`);
    resumen.sinClaveVieja.forEach(n => console.log('   - ' + n));
}
if (sinUsuario.length) {
    console.log(`\n⚠️  Tenían clave en la app vieja pero NO están en el CSV (${sinUsuario.length}). No podrán entrar cuando se publiquen las reglas nuevas:`);
    sinUsuario.forEach(n => console.log('   - ' + n));
}
console.log(SIMULACRO
    ? '\n🔎 Simulacro terminado: no se cambió nada. Si todo se ve bien, ejecuta sin --simulacro.'
    : '\n✅ Listo. En Firebase Console → Authentication verás los usuarios.');
process.exit(0);

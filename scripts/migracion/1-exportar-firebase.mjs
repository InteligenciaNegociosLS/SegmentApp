/* ============================================================
   PASO 1 · Exportar Firebase (SOLO LECTURA)
   Uso:  node 1-exportar-firebase.mjs
   Copia TODOS los documentos de Firestore a
   exportaciones/firebase-AAAAMMDD-HHMM.json y cuenta los usuarios
   de Firebase Auth. No cambia nada en Firebase.
============================================================ */
import fs from 'node:fs';
import path from 'node:path';
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore, Timestamp, GeoPoint, DocumentReference } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { AQUI, cargarEnv } from './comun.mjs';

cargarEnv();
const PROYECTO = process.env.FIREBASE_PROJECT_ID || 'segmentapp-1b237';
const app = initializeApp({ credential: applicationDefault(), projectId: PROYECTO });
const db = getFirestore(app);

function convertir(v) {
    if (v instanceof Timestamp) return { __tipo: 'timestamp', iso: v.toDate().toISOString() };
    if (v instanceof GeoPoint) return { __tipo: 'geopoint', lat: v.latitude, lon: v.longitude };
    if (v instanceof DocumentReference) return { __tipo: 'referencia', ruta: v.path };
    if (Array.isArray(v)) return v.map(convertir);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, convertir(x)]));
    return v;
}

const documentos = {}, conteo = {};
async function recorrer(col) {
    for (const ref of await col.listDocuments()) {
        const snap = await ref.get();
        if (snap.exists) {
            documentos[ref.path] = convertir(snap.data());
            conteo[col.path] = (conteo[col.path] || 0) + 1;
        }
        for (const sub of await ref.listCollections()) await recorrer(sub);
    }
}

console.log(`Firebase: ${PROYECTO} (solo lectura)\nLeyendo Firestore...`);
for (const col of await db.listCollections()) await recorrer(col);

// Usuarios de Firebase Auth (solo para el registro: hoy son anónimos;
// las claves de los VM estaban en Firestore y viajan en este archivo)
const proveedores = {};
const usuariosConCorreo = [];   // solo correo y rol; nunca claves ni hashes
let pagina;
do {
    let r;
    try {
        r = await getAuth(app).listUsers(1000, pagina);
    } catch (e) {
        const texto = String(e && e.message || e);
        if (/quota project|SERVICE_DISABLED|Application Default Credentials/i.test(texto)) {
            console.error('\n❌ Google no dio permiso para leer los usuarios de Firebase (falta el "proyecto de cuota").');
            console.error('   Pega estos comandos, uno por uno, y vuelve a ejecutar este paso:\n');
            console.error('   gcloud auth application-default login');
            console.error(`   gcloud auth application-default set-quota-project ${PROYECTO}\n`);
            process.exit(1);
        }
        throw e;
    }
    r.users.forEach(u => {
        const p = u.providerData.length ? u.providerData.map(x => x.providerId).join('+') : 'anonimo';
        proveedores[p] = (proveedores[p] || 0) + 1;
        if (u.email) usuariosConCorreo.push({ correo: u.email.toLowerCase(), desactivado: u.disabled, claims: u.customClaims || {} });
    });
    pagina = r.pageToken;
} while (pagina);

const carpeta = path.join(AQUI, 'exportaciones');
fs.mkdirSync(carpeta, { recursive: true });
const p = (n) => String(n).padStart(2, '0');
const d = new Date();
const archivo = path.join(carpeta, `firebase-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.json`);
fs.writeFileSync(archivo, JSON.stringify({ creado_en: d.toISOString(), proyecto: PROYECTO, conteo, usuarios_auth: proveedores, usuarios_con_correo: usuariosConCorreo, documentos }, null, 1));

console.log('\nDocumentos por colección:');
Object.entries(conteo).sort().forEach(([c, n]) => console.log(`  ${String(n).padStart(6)}  ${c}`));
console.log(`  ${String(Object.keys(documentos).length).padStart(6)}  TOTAL`);
console.log('\nUsuarios de Firebase Auth por tipo:', JSON.stringify(proveedores));
const dominios = {};
usuariosConCorreo.forEach(u => { const d = u.correo.split('@')[1]; dominios[d] = (dominios[d] || 0) + 1; });
console.log('Usuarios con correo, por dominio:', JSON.stringify(dominios));
console.log(`\n✅ Exportación guardada en: ${archivo}`);
console.log('⚠️  Contiene las claves antiguas: descárgala y guárdala en un lugar privado.');

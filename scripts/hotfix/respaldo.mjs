/* ============================================================
   SegmentApp - Respaldo completo de Firestore (SOLO LECTURA)
   Uso:  node respaldo.mjs
   Crea respaldos/respaldo-AAAAMMDD-HHMM.json con TODOS los
   documentos y muestra cuántos hay por colección.
   No modifica nada en Firebase.
============================================================ */
import fs from 'node:fs';
import path from 'node:path';
import { Timestamp, GeoPoint, DocumentReference } from 'firebase-admin/firestore';
import { conectar, fechaArchivo, avisoProyecto } from './comun.mjs';

const { db } = conectar();

function convertir(valor) {
    if (valor instanceof Timestamp)         return { __tipo: 'timestamp', iso: valor.toDate().toISOString() };
    if (valor instanceof GeoPoint)          return { __tipo: 'geopoint', lat: valor.latitude, lon: valor.longitude };
    if (valor instanceof DocumentReference) return { __tipo: 'referencia', ruta: valor.path };
    if (Array.isArray(valor))               return valor.map(convertir);
    if (valor && typeof valor === 'object') return Object.fromEntries(Object.entries(valor).map(([k, v]) => [k, convertir(v)]));
    return valor;
}

const documentos = {};
const conteo = {};

async function recorrerColeccion(colRef) {
    // listDocuments incluye documentos "contenedores" sin campos (ej. artifacts/segmentapp-local)
    const refs = await colRef.listDocuments();
    for (const ref of refs) {
        const snap = await ref.get();
        if (snap.exists) {
            documentos[ref.path] = convertir(snap.data());
            conteo[colRef.path] = (conteo[colRef.path] || 0) + 1;
        }
        for (const sub of await ref.listCollections()) {
            await recorrerColeccion(sub);
        }
    }
}

avisoProyecto();
console.log('Leyendo Firestore (solo lectura)...');
for (const col of await db.listCollections()) {
    await recorrerColeccion(col);
}

const carpeta = path.join(process.cwd(), 'respaldos');
fs.mkdirSync(carpeta, { recursive: true });
const archivo = path.join(carpeta, `respaldo-${fechaArchivo()}.json`);
fs.writeFileSync(archivo, JSON.stringify({ creado_en: new Date().toISOString(), conteo, documentos }, null, 1));

console.log('\nDocumentos por colección:');
for (const [col, n] of Object.entries(conteo).sort()) console.log(`  ${String(n).padStart(6)}  ${col}`);
console.log(`  ${String(Object.keys(documentos).length).padStart(6)}  TOTAL`);
console.log(`\n✅ Respaldo guardado en: ${archivo}`);
console.log('⚠️  Contiene las claves antiguas en texto plano: guárdalo en un lugar privado.');

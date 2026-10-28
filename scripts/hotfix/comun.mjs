/* ============================================================
   SegmentApp - Utilidades comunes de los scripts del hotfix
   Usa las credenciales de tu propia cuenta de Google en Cloud
   Shell (no hay claves en archivos ni en el código).
============================================================ */
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

export const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'segmentapp-1b237';
export const APP_ID = 'segmentapp-local';

export function conectar() {
    const app = initializeApp({ credential: applicationDefault(), projectId: PROJECT_ID });
    return { db: getFirestore(app), auth: getAuth(app) };
}

export function fechaArchivo(d = new Date()) {
    const p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

export function avisoProyecto() {
    const emu = process.env.FIRESTORE_EMULATOR_HOST ? ' (EMULADOR LOCAL)' : '';
    console.log(`Proyecto: ${PROJECT_ID}${emu}`);
}

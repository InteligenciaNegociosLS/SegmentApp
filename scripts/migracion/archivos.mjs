/* ============================================================
   SegmentApp · Migración · Archivos de la versión "Datos enero"
   Sube los .gz del repositorio (los mismos que la app leía hasta
   ahora) al almacén PRIVADO de Supabase y los asocia a su versión.
   No cambia ni borra ninguna fila de datos: solo completa las
   columnas "archivo" y "archivo_bytes" de cada versión.
============================================================ */
import fs from 'node:fs';
import path from 'node:path';
import { NOMBRE_VERSION } from './importar.mjs';

export const ARCHIVOS_REPO = { recetas: 'datacloseup.csv.gz', fichero: 'fichero_medico.csv.gz' };

// storage: { subir(ruta, bytes) } — en Cloud Shell es el almacén de Supabase
export async function subirArchivosVersion({ db, storage, raiz, simulacro = false, log = console.log }) {
    const hechos = [];
    for (const [tipo, archivo] of Object.entries(ARCHIVOS_REPO)) {
        const { rows } = await db.query('select id, archivo from public.data_snapshots where nombre = $1 and tipo = $2', [NOMBRE_VERSION, tipo]);
        if (!rows.length) throw new Error(`No existe la versión "${NOMBRE_VERSION}" de ${tipo}. Primero ejecuta: node 2-importar.mjs`);
        const { id } = rows[0];
        const bytes = fs.readFileSync(path.join(raiz, archivo));
        if (bytes[0] !== 0x1f || bytes[1] !== 0x8b) throw new Error(`${archivo} no es un archivo .gz válido`);
        const ruta = `snapshots/${id}/datos.csv.gz`;
        log(`${simulacro ? '🔎' : '⬆️ '} ${tipo}: ${archivo} (${(bytes.length / 1048576).toFixed(1)} MB) → ${ruta}`);
        if (!simulacro) {
            await storage.subir(ruta, bytes);
            await db.query('update public.data_snapshots set archivo = $1, archivo_bytes = $2 where id = $3', [ruta, bytes.length, id]);
        }
        hechos.push({ tipo, id, ruta, bytes: bytes.length });
    }
    return hechos;
}

export async function almacenSupabase(url, claveServicio) {
    const { createClient } = await import('@supabase/supabase-js');
    const sb = createClient(url, claveServicio, { auth: { persistSession: false, autoRefreshToken: false } });
    return {
        async subir(ruta, bytes) {
            const { error } = await sb.storage.from('datos').upload(ruta, bytes, { upsert: true, contentType: 'application/gzip' });
            if (error) throw new Error(`No se pudo subir ${ruta}: ${error.message}`);
        }
    };
}

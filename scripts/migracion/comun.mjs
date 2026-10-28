/* ============================================================
   SegmentApp · Migración · Conexión y seguridad
   Las claves se leen de scripts/migracion/.env (archivo privado en
   Cloud Shell, que NUNCA se sube a GitHub) o de variables de entorno.
============================================================ */
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { fileURLToPath } from 'node:url';

export const AQUI = path.dirname(fileURLToPath(import.meta.url));
export const RAIZ = path.resolve(AQUI, '..', '..');

export function cargarEnv() {
    const archivo = path.join(AQUI, '.env');
    if (!fs.existsSync(archivo)) return;
    for (const linea of fs.readFileSync(archivo, 'utf8').split(/\r?\n/)) {
        const m = linea.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
        if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
}

export function argumento(nombre) {
    const i = process.argv.indexOf(nombre);
    return i >= 0 ? process.argv[i + 1] : undefined;
}
export const tieneOpcion = (nombre) => process.argv.includes(nombre);

export function salir(mensaje) {
    console.error(`\n❌ ${mensaje}\n`);
    process.exit(1);
}

export async function preguntar(texto) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const r = await rl.question(texto);
    rl.close();
    return r.trim();
}

// Acepta la URL aunque venga con algo de más (ej. ".../rest/v1/"):
// se queda solo con "https://xxxx.supabase.co"
export function normalizarUrlSupabase(valor) {
    const texto = String(valor || '').trim();
    if (!texto) return '';
    try {
        return new URL(texto).origin;
    } catch {
        return texto;
    }
}

// Referencia del proyecto (ej. "abcdxyz") a partir de sus URLs
function refDesdeUrl(url) {
    const m = String(url).match(/https:\/\/([a-z0-9]+)\.supabase\.co/i);
    return m ? m[1].toLowerCase() : '';
}
function refDesdeDbUrl(dbUrl) {
    const m = String(dbUrl).match(/postgres(?:ql)?:\/\/postgres\.([a-z0-9]+):/i) || String(dbUrl).match(/@db\.([a-z0-9]+)\.supabase\.co/i);
    return m ? m[1].toLowerCase() : '';
}

/* ---------- Destino: pruebas o producción ---------- */
export async function destinoSeguro({ necesitaAuth = false } = {}) {
    cargarEnv();
    const destino = (process.env.DESTINO || '').trim().toLowerCase();
    const dbUrl = (process.env.SUPABASE_DB_URL || '').trim();
    const url = normalizarUrlSupabase(process.env.SUPABASE_URL);
    if (!['pruebas', 'produccion'].includes(destino)) salir('Falta DESTINO=pruebas (o DESTINO=produccion) en el archivo .env');
    if (!dbUrl) salir('Falta SUPABASE_DB_URL en el archivo .env (Supabase → Connect → Session pooler)');
    if (!url) salir('Falta SUPABASE_URL en el archivo .env');
    if (necesitaAuth && !process.env.SUPABASE_SERVICE_ROLE_KEY) salir('Falta SUPABASE_SERVICE_ROLE_KEY en el archivo .env');

    const ref = refDesdeUrl(url), refDb = refDesdeDbUrl(dbUrl);
    if (!ref) salir('SUPABASE_URL debe ser como https://xxxx.supabase.co');
    if (refDb && refDb !== ref) salir(`SUPABASE_DB_URL (${refDb}) y SUPABASE_URL (${ref}) son de PROYECTOS DISTINTOS. Revisa el .env.`);

    console.log(`\nDestino: ${destino.toUpperCase()} · proyecto Supabase: ${ref}`);
    if (destino === 'produccion') {
        const r = await preguntar('⚠️  Vas a escribir en PRODUCCIÓN. Para continuar escribe exactamente: MIGRAR PRODUCCION\n> ');
        if (r !== 'MIGRAR PRODUCCION') salir('Cancelado. No se hizo ningún cambio.');
    }
    return { destino, ref, dbUrl, url };
}

/* ---------- Conexión directa a la base (Postgres) ---------- */
export async function conectarBase(dbUrl) {
    const { default: pg } = await import('pg');
    // Supabase exige conexión cifrada; su certificado no está en Node, por eso no se verifica la cadena.
    const client = new pg.Client({ connectionString: dbUrl.replace(/[?&]sslmode=[^&]*/g, ''), ssl: { rejectUnauthorized: false } });
    await client.connect();
    await client.query(`set statement_timeout = 0`);
    return client;
}

/* ---------- Administración de usuarios (Supabase Auth) ---------- */
export async function authAdminSupabase(url) {
    const { createClient } = await import('@supabase/supabase-js');
    const sb = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    let cache = null;
    const cargarTodos = async () => {
        cache = new Map();
        for (let page = 1; ; page++) {
            const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 1000 });
            if (error) throw error;
            data.users.forEach(u => cache.set(String(u.email).toLowerCase(), u.id));
            if (data.users.length < 1000) break;
        }
    };
    return {
        async buscarPorCorreo(email) {
            if (!cache) await cargarTodos();
            return cache.get(email.toLowerCase()) || null;
        },
        async crear({ email, password, app_metadata }) {
            const { data, error } = await sb.auth.admin.createUser({ email, password, email_confirm: true, app_metadata });
            if (error) throw new Error(`No se pudo crear ${email}: ${error.message}`);
            if (cache) cache.set(email.toLowerCase(), data.user.id);
            return data.user.id;
        },
        async actualizar(id, { app_metadata }) {
            const { error } = await sb.auth.admin.updateUserById(id, { app_metadata });
            if (error) throw new Error(`No se pudo actualizar el usuario: ${error.message}`);
        }
    };
}

/* ---------- Exportación de Firebase más reciente ---------- */
export function rutaExportacion() {
    const elegida = argumento('--export');
    if (elegida) return path.resolve(elegida);
    const carpeta = path.join(AQUI, 'exportaciones');
    const archivos = fs.existsSync(carpeta) ? fs.readdirSync(carpeta).filter(f => f.endsWith('.json')).sort() : [];
    if (!archivos.length) salir('No hay exportación de Firebase. Primero ejecuta: node 1-exportar-firebase.mjs');
    return path.join(carpeta, archivos[archivos.length - 1]);
}

/* ============================================================
   SegmentApp - Construcción del sitio para Vercel
   Uso: npm run build   (Vercel lo ejecuta solo en cada despliegue)

   1. Lee las variables de entorno (en Vercel: Settings → Environment
      Variables; en tu computadora: archivo .env, que NO se sube a GitHub).
   2. Copia a dist/ SOLO los archivos que la app necesita.
   3. Escribe dist/js/env.js con la configuración PÚBLICA del entorno.

   Nunca escribe claves secretas: si detecta una clave de servicio de
   Supabase en una variable pública, se detiene con error.
============================================================ */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(RAIZ, 'dist');

// Archivos y carpetas que se publican (todo lo demás queda fuera del sitio)
const PUBLICAR = ['index.html', 'css', 'js', 'datacloseup.csv.gz', 'fichero_medico.csv.gz'];

// --- 1. Variables de entorno ----------------------------------------------
function cargarDotEnv() {
    const archivo = path.join(RAIZ, '.env');
    if (!fs.existsSync(archivo)) return;
    for (const linea of fs.readFileSync(archivo, 'utf8').split(/\r?\n/)) {
        const m = linea.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
        if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
}
cargarDotEnv();

function entorno() {
    const explicito = (process.env.APP_ENV || '').trim().toLowerCase();
    if (['production', 'preview', 'development'].includes(explicito)) return explicito;
    const vercel = (process.env.VERCEL_ENV || '').trim().toLowerCase();   // lo pone Vercel solo
    if (vercel === 'production' || vercel === 'preview') return vercel;
    return 'development';
}

// Detecta claves que NUNCA deben ir al navegador
function esClaveSecreta(valor) {
    if (!valor) return false;
    if (valor.startsWith('sb_secret_')) return true;
    const partes = valor.split('.');
    if (partes.length === 3) {
        try {
            const payload = JSON.parse(Buffer.from(partes[1], 'base64url').toString('utf8'));
            return payload.role === 'service_role';
        } catch { /* no es un JWT */ }
    }
    return false;
}

const config = {
    APP_ENV: entorno(),
    SUPABASE_URL: (process.env.SUPABASE_URL || '').trim().replace(/\/+$/, ''),
    SUPABASE_ANON_KEY: (process.env.SUPABASE_ANON_KEY || '').trim(),
    ERROR_LOG_REMOTE: ['1', 'true', 'si', 'sí'].includes((process.env.ERROR_LOG_REMOTE || '').trim().toLowerCase()),
    VERSION: (process.env.VERCEL_GIT_COMMIT_SHA || 'local').slice(0, 7),
    CONSTRUIDO_EN: new Date().toISOString()
};

if (esClaveSecreta(config.SUPABASE_ANON_KEY)) {
    console.error('\n❌ SUPABASE_ANON_KEY contiene una clave SECRETA (service_role / sb_secret_).');
    console.error('   Esa clave nunca debe ir al navegador. Usa la clave "anon" / "publishable".\n');
    process.exit(1);
}
if (config.SUPABASE_URL && !/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(config.SUPABASE_URL)) {
    console.warn(`⚠️  SUPABASE_URL no parece una URL de Supabase: ${config.SUPABASE_URL}`);
}

// --- 2. Copiar archivos ----------------------------------------------------
fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(DIST, { recursive: true });
for (const item of PUBLICAR) {
    const origen = path.join(RAIZ, item);
    if (!fs.existsSync(origen)) {
        console.error(`❌ Falta ${item}; no se puede construir el sitio.`);
        process.exit(1);
    }
    fs.cpSync(origen, path.join(DIST, item), { recursive: true });
}

// --- 3. Configuración pública del entorno ----------------------------------
fs.writeFileSync(path.join(DIST, 'js', 'env.js'),
    '/* Generado por scripts/build.mjs. No editar. Solo valores PÚBLICOS. */\n' +
    `window.__SEGMENTAPP_ENV__ = ${JSON.stringify(config, null, 2)};\n`);

console.log('✅ Sitio construido en dist/');
console.log(`   Entorno:  ${config.APP_ENV}`);
console.log(`   Supabase: ${config.SUPABASE_URL ? config.SUPABASE_URL : 'sin configurar'}`);
console.log(`   Registro remoto de fallas: ${config.ERROR_LOG_REMOTE ? 'sí' : 'no'}`);

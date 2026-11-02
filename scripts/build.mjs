/* ============================================================
   SegmentApp - Construcción del sitio para Vercel
   Uso: npm run build   (Vercel lo ejecuta solo en cada despliegue)

   1. Lee las variables de entorno (en Vercel: Settings → Environment
      Variables; en tu computadora: archivo .env, que NO se sube a GitHub).
   2. Copia a dist/ SOLO los archivos que la app necesita.
   3. Escribe dist/js/env.js con la configuración PÚBLICA del entorno.
   4. Escribe dist/sw.js (app sin internet) con la lista de archivos y
      una versión nueva en cada publicación.

   Nunca escribe claves secretas: si detecta una clave de servicio de
   Supabase en una variable pública, se detiene con error.
============================================================ */
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(RAIZ, 'dist');

// Archivos y carpetas que se publican (todo lo demás queda fuera del sitio)
// Los archivos .gz siguen en el repositorio como respaldo, pero ya no se publican:
// desde la Fase 5 los datos se descargan de Supabase, solo después de iniciar sesión.
const PUBLICAR = ['index.html', 'manifest.webmanifest', 'css', 'js', 'img'];

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

// Acepta la URL aunque venga con algo de más (ej. ".../rest/v1/"):
// se queda solo con "https://xxxx.supabase.co"
function normalizarUrlSupabase(valor) {
    const texto = (valor || '').trim();
    if (!texto) return { url: '', problema: '' };
    try {
        const u = new URL(texto);
        if (u.protocol !== 'https:') return { url: '', problema: 'la URL debe empezar con https://' };
        if (!/\.supabase\.co$/i.test(u.hostname)) return { url: '', problema: 'la URL no es de un proyecto Supabase (debe terminar en .supabase.co)' };
        return { url: u.origin, problema: '' };
    } catch {
        return { url: '', problema: 'la URL no es válida' };
    }
}
const urlSupabase = normalizarUrlSupabase(process.env.SUPABASE_URL);

const config = {
    APP_ENV: entorno(),
    SUPABASE_URL: urlSupabase.url,
    SUPABASE_PROBLEMA: urlSupabase.problema,
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
if (urlSupabase.problema) {
    console.warn(`⚠️  SUPABASE_URL: ${urlSupabase.problema}.`);
} else if (config.SUPABASE_URL && config.SUPABASE_URL !== (process.env.SUPABASE_URL || '').trim()) {
    console.log(`ℹ️  SUPABASE_URL ajustada a ${config.SUPABASE_URL}`);
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

// --- 4. App sin internet (service worker) ----------------------------------
function listarArchivos(carpeta, base = '') {
    return fs.readdirSync(carpeta, { withFileTypes: true }).flatMap(e => {
        const rel = base ? `${base}/${e.name}` : e.name;
        return e.isDirectory() ? listarArchivos(path.join(carpeta, e.name), rel) : [rel];
    });
}
const archivosApp = listarArchivos(DIST).filter(a => a !== 'css/entrada.css').sort();
const huella = crypto.createHash('sha256');
for (const a of archivosApp) huella.update(a).update(fs.readFileSync(path.join(DIST, a)));
const versionApp = huella.digest('hex').slice(0, 12);
// Librerías y fuentes externas que usa la app (se guardan en el dispositivo la primera vez)
const externos = new Set();
for (const a of ['index.html', 'js/config.js', 'js/entorno.js']) {
    const texto = fs.readFileSync(path.join(RAIZ, a), 'utf8');
    for (const m of texto.matchAll(/https:\/\/(?:cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|fonts\.googleapis\.com)\/[^'"`\s<>]+/g)) externos.add(m[0].replace(/&amp;/g, '&'));
}
fs.writeFileSync(path.join(DIST, 'sw.js'), fs.readFileSync(path.join(RAIZ, 'sw.js'), 'utf8')
    .replace("'__VERSION__'", JSON.stringify(versionApp))
    .replace('__ARCHIVOS__', JSON.stringify(['./', ...archivosApp], null, 4))
    .replace('__EXTERNOS__', JSON.stringify([...externos].sort(), null, 4)));

console.log('✅ Sitio construido en dist/');
console.log(`   App sin internet: versión ${versionApp} (${archivosApp.length} archivos, ${externos.size} librerías externas)`);
console.log(`   Entorno:  ${config.APP_ENV}`);
console.log(`   Supabase: ${config.SUPABASE_URL ? config.SUPABASE_URL : 'sin configurar'}`);
console.log(`   Registro remoto de fallas: ${config.ERROR_LOG_REMOTE ? 'sí' : 'no'}`);

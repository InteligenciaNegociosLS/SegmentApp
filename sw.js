/* ============================================================
   SegmentApp - Trabajador de fondo (service worker)
   Archivo: sw.js   (npm run build lo copia a dist/ con la lista
   de archivos y la versión ya escritas)
   Guarda la app en el dispositivo para que abra SIN INTERNET:
   - Archivos de la app (html, css, js, imágenes): se guardan al
     instalar y se sirven desde el dispositivo (rápido).
   - Librerías y fuentes externas (cdnjs, jsdelivr, Google Fonts):
     se guardan la primera vez que se usan.
   - Supabase (datos, sesión, evaluaciones): NUNCA se guarda aquí.
     Los datos del usuario los guarda la app (copia local) y las
     evaluaciones sin conexión van a su cola.
   Cuando se publica una versión nueva de la app, la página avisa
   "Hay una versión nueva" y se actualiza al tocar "Actualizar".
============================================================ */

const VERSION = '__VERSION__';
const CACHE_APP = 'segmentapp-app-' + VERSION;
const CACHE_EXTERNO = 'segmentapp-externo-v1';
const ARCHIVOS = __ARCHIVOS__;
const EXTERNOS = __EXTERNOS__;
const HOSTS_EXTERNOS = ['cdnjs.cloudflare.com', 'cdn.jsdelivr.net', 'fonts.googleapis.com', 'fonts.gstatic.com'];

/* ---------- Guardar librerías externas (sin frenar la instalación) ---------- */
async function guardarExterno(cache, url, vistos) {
    if (vistos.has(url) || vistos.size > 60) return;
    vistos.add(url);
    let resp = await cache.match(url);
    if (!resp) {
        try {
            resp = await fetch(url, { mode: 'cors', credentials: 'omit' });
            if (!resp.ok) return;
            await cache.put(url, resp.clone());
        } catch (e) { return; }
    }
    const tipo = resp.headers.get('content-type') || '';
    // La librería de Supabase llega en varios módulos: guardar también los que importa
    if (/javascript|ecmascript/.test(tipo) && (/\+esm$/.test(url) || /\.mjs$/.test(url))) {
        const texto = await resp.text();
        const internos = [...texto.matchAll(/(?:from|import)\s*\(?\s*["']((?:\/|\.\.?\/)[^"']+)["']/g)].map(m => new URL(m[1], url).href);
        await Promise.all(internos.map(u => guardarExterno(cache, u, vistos)));
    }
    // Hojas de Google Fonts: guardar también los archivos de letra
    if (tipo.includes('text/css')) {
        const texto = await resp.text();
        const fuentes = [...texto.matchAll(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/g)].map(m => m[1]);
        await Promise.all(fuentes.map(u => guardarExterno(cache, u, vistos)));
    }
}

self.addEventListener('install', (event) => {
    event.waitUntil((async () => {
        const cache = await caches.open(CACHE_APP);
        // Sin "recarga" del navegador: siempre la versión recién publicada
        await cache.addAll(ARCHIVOS.map(a => new Request(a, { cache: 'reload' })));
        const externo = await caches.open(CACHE_EXTERNO);
        const vistos = new Set();
        await Promise.allSettled(EXTERNOS.map(u => guardarExterno(externo, u, vistos)));
    })());
});

self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
        const nombres = await caches.keys();
        await Promise.all(nombres.filter(n => n.startsWith('segmentapp-app-') && n !== CACHE_APP).map(n => caches.delete(n)));
        await self.clients.claim();
    })());
});

// La página pide activar la versión nueva cuando la persona toca "Actualizar"
self.addEventListener('message', (event) => {
    if (event.data === 'ACTUALIZAR') self.skipWaiting();
    if (event.data === 'VERSION' && event.source) event.source.postMessage({ tipo: 'VERSION', version: VERSION });
});

/* ---------- Responder pedidos ---------- */
async function desdeLaApp(request) {
    const cache = await caches.open(CACHE_APP);
    const guardado = await cache.match(request, { ignoreSearch: true });
    if (guardado) return guardado;
    try {
        return await fetch(request);
    } catch (e) {
        // Sin internet y es una pantalla: se abre la app guardada
        if (request.mode === 'navigate') {
            const inicio = await cache.match('./') || await cache.match('index.html');
            if (inicio) return inicio;
        }
        throw e;
    }
}

async function desdeExterno(request) {
    const cache = await caches.open(CACHE_EXTERNO);
    const guardado = await cache.match(request.url);
    if (guardado) return guardado;
    const resp = await fetch(request);
    // Las direcciones llevan número de versión: lo guardado no cambia
    if (resp.ok || resp.type === 'opaque') cache.put(request.url, resp.clone()).catch(() => {});
    return resp;
}

self.addEventListener('fetch', (event) => {
    const request = event.request;
    if (request.method !== 'GET') return;
    const url = new URL(request.url);
    if (url.origin === self.location.origin) {
        if (url.pathname.endsWith('/sw.js')) return;
        event.respondWith(desdeLaApp(request));
    } else if (HOSTS_EXTERNOS.includes(url.hostname)) {
        event.respondWith(desdeExterno(request));
    }
    // Todo lo demás (Supabase) va directo a internet
});

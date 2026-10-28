/* ============================================================
   SegmentApp - Manejo global de errores y registro de fallas
   Archivo: js/errores.js
   Responsable de:
   - Capturar errores no manejados (código y promesas)
   - Capturar fallas al cargar librerías externas (CDN)
   - Guardar las últimas fallas en el dispositivo (registro local)
   - Enviarlas a Supabase si el entorno lo tiene activado
   - Avisar al usuario con un mensaje claro (sin congelar la app)
   Se carga justo después de js/entorno.js.
============================================================ */

window.App = window.App || {};

window.App.errores = (function() {
    const CLAVE = 'SEGMENTAPP_FALLAS';
    const MAXIMO = 100;               // fallas guardadas en el dispositivo
    const MAX_REMOTAS = 20;           // envíos remotos por sesión
    const PAUSA_AVISO_MS = 10000;     // un aviso al usuario cada 10 s como máximo
    let enviadas = 0;
    let ultimoAviso = 0;
    let registrando = false;          // evita bucles si registrar() falla

    function leer() {
        try { return JSON.parse(localStorage.getItem(CLAVE) || '[]'); } catch (e) { return []; }
    }

    function guardar(lista) {
        try { localStorage.setItem(CLAVE, JSON.stringify(lista.slice(-MAXIMO))); } catch (e) { /* almacenamiento lleno o bloqueado */ }
    }

    function texto(valor, max) {
        if (valor == null) return '';
        let s;
        if (valor instanceof Error) s = (valor.stack || `${valor.name}: ${valor.message}`);
        else if (typeof valor === 'string') s = valor;
        else { try { s = JSON.stringify(valor); } catch (e) { s = String(valor); } }
        return s.length > max ? s.slice(0, max) + '…' : s;
    }

    function usuarioActual() {
        const st = window.App.state;
        if (!st) return '';
        return st.currentUserRole === 'guest' ? 'sin sesión' : `${st.currentUserRole}:${st.currentVisitadorName || ''}`;
    }

    function enviarRemoto(falla) {
        const env = window.App.env || {};
        if (!env.ERROR_LOG_REMOTE || !env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) return;
        if (enviadas >= MAX_REMOTAS) return;
        enviadas++;
        // Tabla app_errores (se crea en la Fase 3). Si no existe, se ignora.
        fetch(env.SUPABASE_URL + '/rest/v1/app_errores', {
            method: 'POST',
            keepalive: true,
            headers: {
                apikey: env.SUPABASE_ANON_KEY,
                Authorization: 'Bearer ' + env.SUPABASE_ANON_KEY,
                'Content-Type': 'application/json',
                Prefer: 'return=minimal'
            },
            body: JSON.stringify(falla)
        }).catch(() => { /* sin conexión: queda en el registro local */ });
    }

    function avisarUsuario() {
        const ahora = Date.now();
        if (ahora - ultimoAviso < PAUSA_AVISO_MS) return;
        ultimoAviso = ahora;
        if (window.App.ui && window.App.ui.showToast) {
            window.App.ui.showToast('Algo no funcionó como se esperaba. Si se repite, avisa al administrador.');
        }
    }

    /* ------------------------------------------------------------
       REGISTRAR UNA FALLA
       tipo: 'error' | 'promesa' | 'recurso' | 'consola'
    ------------------------------------------------------------ */
    function registrar(tipo, mensaje, detalle, opciones) {
        if (registrando) return null;
        registrando = true;
        try {
            const env = window.App.env || {};
            const falla = {
                fecha: new Date().toISOString(),
                tipo: tipo,
                mensaje: texto(mensaje, 500),
                detalle: texto(detalle, 2000),
                pantalla: location.pathname + location.hash,
                usuario: usuarioActual(),
                entorno: env.APP_ENV || '',
                version: env.VERSION || '',
                navegador: navigator.userAgent.slice(0, 200),
                conexion: navigator.onLine ? 'en línea' : 'sin conexión'
            };
            const lista = leer();
            lista.push(falla);
            guardar(lista);
            enviarRemoto(falla);
            if (opciones && opciones.avisar) avisarUsuario();
            return falla;
        } finally {
            registrando = false;
        }
    }

    /* ------------------------------------------------------------
       DESCARGAR EL REGISTRO (para enviarlo al administrador)
    ------------------------------------------------------------ */
    function descargar() {
        const blob = new Blob([JSON.stringify(leer(), null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `SegmentApp_registro_fallas_${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }

    function instalar() {
        // Errores de código no manejados
        window.addEventListener('error', (ev) => {
            const objetivo = ev.target;
            // Falla al cargar un archivo externo (librería, estilo, fuente)
            if (objetivo && objetivo !== window && (objetivo.src || objetivo.href)) {
                registrar('recurso', `No se pudo cargar: ${objetivo.src || objetivo.href}`, objetivo.tagName);
                return;
            }
            registrar('error', ev.message, ev.error || `${ev.filename}:${ev.lineno}:${ev.colno}`, { avisar: true });
        }, true);

        // Promesas rechazadas sin manejar (ej. fallas de red en funciones async)
        window.addEventListener('unhandledrejection', (ev) => {
            const razon = ev.reason;
            registrar('promesa', razon && razon.message ? razon.message : texto(razon, 300), razon, { avisar: true });
        });

        // Errores que la app ya maneja pero que conviene registrar
        const consolaOriginal = console.error.bind(console);
        console.error = function(...args) {
            consolaOriginal(...args);
            const err = args.find(a => a instanceof Error);
            const mensaje = args.filter(a => typeof a === 'string').join(' ') || (err && err.message) || 'Error';
            registrar('consola', mensaje, err || args.slice(1));
        };
    }

    instalar();

    return {
        registrar: registrar,
        lista: leer,
        descargar: descargar,
        limpiar: () => guardar([])
    };
})();

// Atajo para soporte: escribir descargarRegistroFallas() en la consola
window.descargarRegistroFallas = window.App.errores.descargar;

console.log('[SegmentApp] errores.js cargado.');

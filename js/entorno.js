/* ============================================================
   SegmentApp - Entorno (Producción / Pruebas / Local)
   Archivo: js/entorno.js
   Responsable de:
   - Leer la configuración PÚBLICA que genera scripts/build.mjs
     (js/env.js → window.__SEGMENTAPP_ENV__)
   - Preparar la conexión a Supabase (sin usarla todavía)
   - Mostrar la etiqueta "PRUEBAS" fuera de producción
   DEBE CARGARSE ANTES que el resto de los archivos de la app.
============================================================ */

window.App = window.App || {};

(function() {
    const crudo = window.__SEGMENTAPP_ENV__ || {};
    const env = {
        APP_ENV: crudo.APP_ENV || 'development',
        SUPABASE_URL: crudo.SUPABASE_URL || '',
        SUPABASE_ANON_KEY: crudo.SUPABASE_ANON_KEY || '',
        ERROR_LOG_REMOTE: crudo.ERROR_LOG_REMOTE === true,
        VERSION: crudo.VERSION || 'local',
        CONSTRUIDO_EN: crudo.CONSTRUIDO_EN || ''
    };
    env.esProduccion = env.APP_ENV === 'production';
    window.App.env = Object.freeze(env);
})();

/* ============================================================
   SUPABASE (preparado para las próximas fases; hoy no se usa)
============================================================ */
window.App.supabase = {
    // Versión fija de la librería (se descarga solo cuando se necesite)
    LIBRERIA: 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm',
    _cliente: null,

    configurado: function() {
        return !!(window.App.env.SUPABASE_URL && window.App.env.SUPABASE_ANON_KEY);
    },

    // Devuelve el cliente de Supabase (o null si este entorno no lo tiene configurado)
    cliente: async function() {
        if (!window.App.supabase.configurado()) return null;
        if (!window.App.supabase._cliente) {
            const { createClient } = await import(window.App.supabase.LIBRERIA);
            window.App.supabase._cliente = createClient(
                window.App.env.SUPABASE_URL,
                window.App.env.SUPABASE_ANON_KEY
            );
        }
        return window.App.supabase._cliente;
    },

    // Comprueba que Supabase responde (para la etiqueta de pruebas)
    estado: async function() {
        if (!window.App.supabase.configurado()) return 'sin configurar';
        try {
            const r = await fetch(window.App.env.SUPABASE_URL + '/auth/v1/health', {
                headers: { apikey: window.App.env.SUPABASE_ANON_KEY }
            });
            return r.ok ? 'conectado' : `error ${r.status}`;
        } catch (e) {
            return 'sin respuesta';
        }
    }
};

/* ============================================================
   ETIQUETA "PRUEBAS" (solo fuera de producción)
============================================================ */
window.App.mostrarEtiquetaEntorno = async function() {
    const env = window.App.env;
    if (env.esProduccion || document.getElementById('etiquetaEntorno')) return;

    const etiqueta = document.createElement('div');
    etiqueta.id = 'etiquetaEntorno';
    etiqueta.setAttribute('role', 'status');
    etiqueta.style.cssText = 'position:fixed;left:12px;bottom:12px;z-index:200;' +
        'background:#7D5700;color:#fff;font:600 11px/1.3 system-ui,sans-serif;' +
        'padding:6px 12px;border-radius:999px;box-shadow:0 2px 6px rgba(0,0,0,.25);' +
        'pointer-events:none;max-width:calc(100vw - 24px)';
    const nombre = env.APP_ENV === 'preview' ? 'PRUEBAS' : 'LOCAL';
    etiqueta.textContent = `${nombre} · v${env.VERSION} · Supabase: comprobando…`;
    document.body.appendChild(etiqueta);

    const estado = await window.App.supabase.estado();
    etiqueta.textContent = `${nombre} · v${env.VERSION} · Supabase: ${estado}`;
};

window.addEventListener('DOMContentLoaded', () => window.App.mostrarEtiquetaEntorno());

console.log(`[SegmentApp] entorno.js cargado (${window.App.env.APP_ENV}).`);

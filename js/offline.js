/* ============================================================
   SegmentApp - App sin internet (Fase 8)
   Archivo: js/offline.js
   Responsable de:
   - Instalar la app en el dispositivo (service worker, sw.js) para
     que abra sin internet, y avisar cuando hay una versión nueva
   - Botón "Instalar la app" (Android/computadora) e instrucciones
     para iPhone/iPad
   - Cola de evaluaciones hechas sin conexión: se guardan en el
     dispositivo y se suben solas al volver internet (nunca se borran
     antes de que el servidor confirme)
   - Indicadores: "Sin conexión" y "N por subir"
============================================================ */

window.App = window.App || {};
window.App.offline = { registro: null, instalador: null };

/* ============================================================
   COLA DE EVALUACIONES SIN CONEXIÓN
============================================================ */
window.App.offline.initOfflineQueue = async function() {
    const st = window.App.state;
    if (!window.localforage) return;
    const stored = await localforage.getItem('OFFLINE_QUEUE');
    if (stored) st.OFFLINE_QUEUE = stored;
    window.App.offline.actualizarIndicadores();
    // La cola se sube al iniciar sesión (ver auth.loginSuccess) y al volver internet
};

const mismaEvaluacion = (a, b) => a && b && a.visitador_id === b.visitador_id && a.mercado === b.mercado
    && window.App.data.normalizeKey(a.medico_id) === window.App.data.normalizeKey(b.medico_id);

// Agrega a la cola. Si el mismo médico y mercado ya estaba esperando, queda solo la última versión.
window.App.offline.encolar = async function(evaluacion) {
    const st = window.App.state;
    st.OFFLINE_QUEUE = st.OFFLINE_QUEUE.filter(item => !mismaEvaluacion(item.evaluacion, evaluacion));
    st.OFFLINE_QUEUE.push({ tipo: 'evaluacion', evaluacion, encolada_en: new Date().toISOString() });
    if (window.localforage) await localforage.setItem('OFFLINE_QUEUE', st.OFFLINE_QUEUE);
    window.App.offline.actualizarIndicadores();
};

// Evaluaciones de ESTE visitador que todavía esperan subir
window.App.offline.pendientesPropias = function() {
    const st = window.App.state;
    return st.OFFLINE_QUEUE.filter(item => item.evaluacion && item.evaluacion.visitador_id && item.evaluacion.visitador_id === st.visitadorId)
        .map(item => item.evaluacion);
};

/* ============================================================
   SUBIR LA COLA
   Recorre la cola, sube cada una y deja en la cola solo las que
   fallaron (se reintentan después). Las de otro usuario del mismo
   equipo se conservan hasta que esa persona entre.
============================================================ */
window.App.offline.syncOfflineEvaluations = async function({ avisar = true } = {}) {
    const st = window.App.state;
    const ui = window.App.ui;

    if (!navigator.onLine || st.OFFLINE_QUEUE.length === 0) return;
    if (st.currentUserRole === 'guest' || window.App.offline._sincronizando) return;
    window.App.offline._sincronizando = true;
    window.App.offline.actualizarIndicadores();

    const remainingQueue = [];
    let syncedCount = 0;
    try {
        for (const item of st.OFFLINE_QUEUE) {
            let evaluacion = item.evaluacion;
            // Pendientes de la versión anterior de la app (formato Firebase)
            if (!evaluacion && item.payload) {
                if (normalizarNombre(item.payload.visitador) !== normalizarNombre(st.currentVisitadorName) || !st.visitadorId) {
                    remainingQueue.push(item);
                    continue;
                }
                evaluacion = { ...item.payload, visitador_id: st.visitadorId };
            }
            // De otra persona que usó este mismo equipo: se queda esperando a esa persona
            if (evaluacion && evaluacion.visitador_id && st.visitadorId && evaluacion.visitador_id !== st.visitadorId && !st.isAdmin) {
                remainingQueue.push(item);
                continue;
            }
            try {
                await window.App.sb.guardarEvaluacion(evaluacion);
                syncedCount++;
            } catch (e) {
                console.error("Error sincronizando un item offline, se mantendrá en cola:", e);
                remainingQueue.push(item);
            }
        }
        st.OFFLINE_QUEUE = remainingQueue;
        if (window.localforage) await localforage.setItem('OFFLINE_QUEUE', st.OFFLINE_QUEUE);
    } finally {
        window.App.offline._sincronizando = false;
        window.App.offline.actualizarIndicadores();
    }

    if (syncedCount > 0) {
        if (avisar) ui.showToast(syncedCount === 1 ? 'Se subió 1 evaluación que estaba guardada en el dispositivo.' : `Se subieron ${syncedCount} evaluaciones que estaban guardadas en el dispositivo.`);
        if (st.isAdmin) window.App.evaluation.fetchAllEvaluacionesAdmin();
        else window.App.evaluation.fetchEvaluacionesYCalcular();
    }
};

// Botón "N por subir"
window.App.offline.subirAhora = async function() {
    const ui = window.App.ui;
    if (!navigator.onLine) {
        ui.showToast('Sigues sin conexión. Las evaluaciones están seguras en este dispositivo y se subirán solas al volver internet.');
        return;
    }
    await window.App.offline.syncOfflineEvaluations();
    if (window.App.offline.pendientesPropias().length) ui.showToast('Algunas evaluaciones no se pudieron subir todavía. Se intentará otra vez en un minuto.');
};

function normalizarNombre(n) {
    return String(n || '').trim().toUpperCase();
}

/* ============================================================
   INDICADORES ("Sin conexión" y "N por subir")
============================================================ */
window.App.offline.actualizarIndicadores = function() {
    const st = window.App.state;
    const sinRed = !navigator.onLine;
    const indicador = document.getElementById('offlineIndicator');
    if (indicador) { indicador.classList.toggle('hidden', !sinRed); indicador.classList.toggle('flex', sinRed); }
    const chip = document.getElementById('chipPendientes');
    if (!chip) return;
    const n = st.currentUserRole === 'guest' ? 0 : (st.isAdmin ? st.OFFLINE_QUEUE.length : window.App.offline.pendientesPropias().length);
    chip.classList.toggle('hidden', n === 0);
    chip.classList.toggle('flex', n > 0);
    chip.title = n === 1 ? '1 evaluación guardada en este dispositivo, por subir' : `${n} evaluaciones guardadas en este dispositivo, por subir`;
    const texto = document.getElementById('lblPendientes');
    if (texto) texto.textContent = window.App.offline._sincronizando ? '…' : String(n);
};

/* ============================================================
   EVENTOS DE CONEXIÓN
============================================================ */
window.App.offline.setupListeners = function() {
    window.addEventListener('online', () => {
        window.App.offline.actualizarIndicadores();
        window.App.ui.showToast('Volvió la conexión.');
        window.App.offline.syncOfflineEvaluations();
    });
    window.addEventListener('offline', () => {
        window.App.offline.actualizarIndicadores();
        window.App.ui.showToast('Sin conexión. Puedes seguir viendo tus médicos y evaluando: todo queda guardado en este dispositivo.');
    });
    // Al volver a la app (por ejemplo, desde otra aplicación del teléfono)
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState !== 'visible') return;
        window.App.offline.syncOfflineEvaluations({ avisar: true });
        if (window.App.offline.registro) window.App.offline.registro.update().catch(() => {});
    });
    // Reintento cada minuto mientras haya algo por subir
    setInterval(() => {
        if (typeof window !== 'undefined' && window.App && window.App.state.OFFLINE_QUEUE.length) window.App.offline.syncOfflineEvaluations();
    }, 60000);
    window.App.offline.actualizarIndicadores();
};

/* ============================================================
   APP INSTALADA EN EL DISPOSITIVO (service worker)
============================================================ */
window.App.offline.registrarApp = async function() {
    if (!('serviceWorker' in navigator) || window.__SIN_SW) return;
    const local = ['localhost', '127.0.0.1'].includes(location.hostname);
    if (location.protocol !== 'https:' && !local) return;
    try {
        const registro = await navigator.serviceWorker.register('sw.js');
        window.App.offline.registro = registro;
        const avisarSiHayNueva = (sw) => {
            if (!sw) return;
            const revisar = () => {
                // "installed" con otra versión ya activa = hay una versión nueva esperando
                if (sw.state === 'installed' && navigator.serviceWorker.controller) window.App.offline.hayVersionNueva(sw);
            };
            sw.addEventListener('statechange', revisar);
            revisar();
        };
        avisarSiHayNueva(registro.waiting);
        registro.addEventListener('updatefound', () => avisarSiHayNueva(registro.installing));
        // Revisar si hay versión nueva cada 30 minutos
        setInterval(() => registro.update().catch(() => {}), 30 * 60000);
    } catch (e) {
        console.error('[SegmentApp] No se pudo preparar la app sin internet:', e);
    }
    navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (window.App.offline._actualizando) location.reload();
    });
};

window.App.offline.hayVersionNueva = function(sw) {
    window.App.offline._esperando = sw;
    const item = document.getElementById('btnActualizarApp');
    if (item) item.classList.remove('hidden');
    window.App.ui.showToast('Hay una versión nueva de la app.', { accion: 'Actualizar', alAccionar: window.App.offline.actualizarApp, duracion: 15000 });
};

window.App.offline.actualizarApp = function() {
    const sw = window.App.offline._esperando;
    if (!sw) { location.reload(); return; }
    window.App.offline._actualizando = true;
    // Las evaluaciones por subir NO se pierden: están guardadas en el dispositivo
    sw.postMessage('ACTUALIZAR');
};

/* ============================================================
   INSTALAR LA APP (ícono en la pantalla de inicio)
============================================================ */
const esIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
window.App.offline.estaInstalada = () => window.matchMedia && (window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true);

window.App.offline.prepararInstalacion = function() {
    const boton = document.getElementById('btnInstalarApp');
    const mostrar = (si) => { if (boton) boton.classList.toggle('hidden', !si); };
    if (window.App.offline.estaInstalada()) { mostrar(false); return; }
    // iPhone/iPad no tiene botón automático: se muestran las instrucciones
    if (esIos()) mostrar(true);
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        window.App.offline.instalador = e;
        mostrar(true);
    });
    window.addEventListener('appinstalled', () => {
        window.App.offline.instalador = null;
        mostrar(false);
        window.App.ui.showToast('¡Listo! SegmentApp quedó instalada en tu dispositivo.');
    });
};

window.App.offline.instalar = async function() {
    const instalador = window.App.offline.instalador;
    if (instalador) {
        instalador.prompt();
        await instalador.userChoice.catch(() => null);
        window.App.offline.instalador = null;
        return;
    }
    document.getElementById('instalarIos').classList.remove('hidden');
};

/* ============================================================
   ALIAS GLOBALES
============================================================ */
window.initOfflineQueue       = window.App.offline.initOfflineQueue;
window.syncOfflineEvaluations = window.App.offline.syncOfflineEvaluations;

console.log('[SegmentApp] offline.js cargado.');

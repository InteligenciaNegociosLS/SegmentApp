/* ============================================================
   SegmentApp - Sistema Offline y Sincronización
   Archivo: js/offline.js
   Responsable de:
   - Inicializar la cola offline desde IndexedDB al abrir la app
   - Sincronizar evaluaciones pendientes cuando vuelve internet
   - Listeners de eventos 'online' / 'offline' del navegador
   - Indicador visual de estado de conexión
============================================================ */

window.App = window.App || {};
window.App.offline = {};

/* ============================================================
   INICIALIZAR COLA OFFLINE
   Se llama una sola vez al arrancar la app (desde main.js)
============================================================ */
window.App.offline.initOfflineQueue = async function() {
    const st = window.App.state;
    if (!window.localforage) return;

    const stored = await localforage.getItem('OFFLINE_QUEUE');
    if (stored) st.OFFLINE_QUEUE = stored;

    // La cola se sube al iniciar sesión (ver auth.loginSuccess)
};

/* ============================================================
   SINCRONIZAR EVALUACIONES PENDIENTES
   Recorre la cola, sube cada item a Supabase, y al final
   guarda solo los que fallaron (reintento futuro).
============================================================ */
window.App.offline.syncOfflineEvaluations = async function() {
    const st = window.App.state;
    const ui = window.App.ui;

    if (!navigator.onLine || st.OFFLINE_QUEUE.length === 0) return;
    if (st.currentUserRole === 'guest' || window.App.offline._sincronizando) return;
    window.App.offline._sincronizando = true;

    ui.showToast(`Sincronizando ${st.OFFLINE_QUEUE.length} evaluaciones pendientes...`);
    const remainingQueue = [];
    let syncedCount = 0;

    try {
        for (const item of st.OFFLINE_QUEUE) {
            let evaluacion = item.evaluacion;
            // Pendientes de la versión anterior de la app (formato Firebase)
            if (!evaluacion && item.payload) {
                if (normalizarNombre(item.payload.visitador) !== normalizarNombre(st.currentVisitadorName) || !st.visitadorId) {
                    remainingQueue.push(item);   // es de otro usuario: se conserva hasta que ese usuario entre
                    continue;
                }
                evaluacion = { ...item.payload, visitador_id: st.visitadorId };
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
    }

    if (syncedCount > 0) {
        ui.showToast(`${syncedCount} evaluaciones subidas a la nube exitosamente.`);
        if (st.isAdmin) window.App.evaluation.fetchAllEvaluacionesAdmin();
        else window.App.evaluation.fetchEvaluacionesYCalcular();
    }
};

function normalizarNombre(n) {
    return String(n || '').trim().toUpperCase();
}

/* ============================================================
   LISTENERS DE EVENTOS DE CONEXIÓN DEL NAVEGADOR
============================================================ */
window.App.offline.setupListeners = function() {
    window.addEventListener('online', () => {
        const indicator = document.getElementById('offlineIndicator');
        if (indicator) {
            indicator.classList.add('hidden');
            indicator.classList.remove('flex');
        }
        window.App.offline.syncOfflineEvaluations();
    });

    window.addEventListener('offline', () => {
        const indicator = document.getElementById('offlineIndicator');
        if (indicator) {
            indicator.classList.remove('hidden');
            indicator.classList.add('flex');
        }
        window.App.ui.showToast("Se perdió la conexión. Puedes seguir evaluando (Guardado Local Activo).");
    });
};

/* ============================================================
   ALIAS GLOBALES
============================================================ */
window.initOfflineQueue       = window.App.offline.initOfflineQueue;
window.syncOfflineEvaluations = window.App.offline.syncOfflineEvaluations;

console.log('[SegmentApp] offline.js cargado.');

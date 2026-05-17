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

    // Si hay internet y cola pendiente, sincronizar después de 3 segundos
    // (damos tiempo a que Firebase Auth termine de conectarse)
    if (navigator.onLine && st.OFFLINE_QUEUE.length > 0) {
        setTimeout(() => window.App.offline.syncOfflineEvaluations(), 3000);
    }
};

/* ============================================================
   SINCRONIZAR EVALUACIONES PENDIENTES
   Recorre la cola, sube cada item a Firebase, y al final
   guarda solo los que fallaron (reintento futuro).
============================================================ */
window.App.offline.syncOfflineEvaluations = async function() {
    const st = window.App.state;
    const ui = window.App.ui;

    if (!navigator.onLine || st.OFFLINE_QUEUE.length === 0) return;
    if (!window.firebaseAuth || !window.firebaseAuth.currentUser) return;

    ui.showToast(`Sincronizando ${st.OFFLINE_QUEUE.length} evaluaciones pendientes...`);

    const appId = typeof __app_id !== 'undefined' ? __app_id : 'segmentapp-local';
    const remainingQueue = [];
    let syncedCount = 0;

    for (const item of st.OFFLINE_QUEUE) {
        try {
            await window.firebaseSetDoc(
                window.firebaseDoc(window.firebaseDb, 'artifacts', appId, 'public', 'data', 'evaluaciones_matriz', item.docRefId),
                item.payload
            );
            syncedCount++;
        } catch (e) {
            console.error("Error sincronizando un item offline, se mantendrá en cola:", e);
            remainingQueue.push(item);
        }
    }

    st.OFFLINE_QUEUE = remainingQueue;
    await localforage.setItem('OFFLINE_QUEUE', st.OFFLINE_QUEUE);

    if (syncedCount > 0) {
        ui.showToast(`${syncedCount} evaluaciones subidas a la nube exitosamente.`);
        if (st.isAdmin && window.App.evaluation && window.App.evaluation.fetchAllEvaluacionesAdmin) {
            window.App.evaluation.fetchAllEvaluacionesAdmin();
        }
    }
};

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

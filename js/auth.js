/* ============================================================
   SegmentApp - Autenticación y sesión
   Archivo: js/auth.js
   Responsable de:
   - Login de visitadores (modal + Firestore)
   - Logout limpio de sesión
   - Verificación de sesión al abrir la app
   - Cambio de UI según rol (guest / visitador / admin)
   - Listado de visitadores desde Firestore
============================================================ */

window.App = window.App || {};
window.App.auth = {};

/* ============================================================
   ABRIR MODAL DE LOGIN
============================================================ */
window.App.auth.openLoginModal = function() {
    document.getElementById('loginModal').classList.remove('hidden');
    window.App.auth.populateLoginSelect();
};

/* ============================================================
   LLENAR EL SELECT DE VISITADORES (desde Firestore)
============================================================ */
window.App.auth.populateLoginSelect = async function() {
    const select = document.getElementById('visitadorSelect');
    select.innerHTML = '<option value="">Conectando con base de datos...</option>';
    try {
        const appId = typeof __app_id !== 'undefined' ? __app_id : 'segmentapp-local';
        const colRef = window.firebaseCollection(
            window.firebaseDb, 'artifacts', appId, 'public', 'data', 'claves_visitadores'
        );
        const snapshot = await window.firebaseGetDocs(colRef);
        let options = '<option value="">Selecciona tu nombre...</option>';
        snapshot.forEach(doc => { options += `<option value="${doc.id}">${doc.id}</option>`; });
        if (snapshot.empty) {
            options = '<option value="">No hay visitadores registrados (Contacta al Admin)</option>';
        }
        select.innerHTML = options;
    } catch (e) {
        console.error("Error cargando visitadores para login", e);
        select.innerHTML = '<option value="">Error. Intenta recargar la página.</option>';
    }
};

/* ============================================================
   INTENTAR LOGIN DE VISITADOR
============================================================ */
window.App.auth.attemptLogin = async function() {
    const ui = window.App.ui;
    const name = document.getElementById('visitadorSelect').value;
    const pwd  = document.getElementById('visitadorPwd').value.trim();
    const btn  = document.getElementById('btnLoginBtn');

    if (!name) { ui.showToast("Por favor, selecciona tu nombre."); return; }
    if (!pwd)  { ui.showToast("Ingresa tu contraseña.");            return; }

    btn.disabled = true;
    btn.innerHTML = '<span class="material-symbols-outlined animate-spin-reverse">sync</span> Validando...';

    try {
        const appId = typeof __app_id !== 'undefined' ? __app_id : 'segmentapp-local';
        const docRef = window.firebaseDoc(
            window.firebaseDb, 'artifacts', appId, 'public', 'data', 'claves_visitadores', name
        );
        const docSnap = await window.firebaseGetDoc(docRef);

        if (docSnap.exists() && docSnap.data().clave === pwd) {
            window.App.auth.loginSuccess('visitador', name);
            ui.showToast(`¡Bienvenido/a, ${name.substring(0, 15)}!`);
        } else {
            ui.showToast("Contraseña incorrecta.");
        }
    } catch (e) {
        console.error("Error validando login", e);
        ui.showToast("Error de conexión. Intenta nuevamente.");
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<span class="material-symbols-outlined">login</span> Entrar al Panel';
    }
};

/* ============================================================
   VERIFICACIÓN DE SESIÓN AL ABRIR LA APP
   Si el usuario ya se había logueado antes, se restaura.
============================================================ */
window.App.auth.checkAuthentication = function() {
    const savedRole = sessionStorage.getItem('userRole');
    const savedName = sessionStorage.getItem('userName');

    if (savedRole) {
        window.App.auth.loginSuccess(savedRole, savedName, false);
    } else {
        const st = window.App.state;
        st.currentUserRole = 'guest';
        st.currentVisitadorName = "";

        document.getElementById('dashboardContent').classList.remove('hidden');
        document.getElementById('filterBar').classList.remove('hidden');
        document.getElementById('loginModal').classList.add('hidden');
        document.getElementById('navUserInfo').classList.add('hidden');
        document.getElementById('btnLoginNavContainer').classList.remove('hidden');

        const intRow = document.getElementById('intelligenceRow');
        if (intRow) intRow.classList.remove('hidden');

        if (typeof updateAdminUI === 'function') updateAdminUI();
    }
};

/* ============================================================
   LOGIN EXITOSO — configura UI según el rol
============================================================ */
window.App.auth.loginSuccess = function(role, name, save = true) {
    const st = window.App.state;
    st.currentUserRole = role;
    st.currentVisitadorName = name;

    if (save) {
        sessionStorage.setItem('userRole', role);
        sessionStorage.setItem('userName', name);
    }

    // Cerrar modales y limpiar input sensible
    document.getElementById('loginModal').classList.add('hidden');
    document.getElementById('adminAuthModal').classList.add('hidden');
    document.getElementById('visitadorPwd').value = '';

    // Barra superior
    document.getElementById('navUserInfo').classList.remove('hidden');
    document.getElementById('btnLoginNavContainer').classList.add('hidden');
    document.getElementById('navUserName').innerText =
        role === 'admin' ? 'Administrador' : name.substring(0, 15);

    const intRow = document.getElementById('intelligenceRow');

    if (role === 'admin') {
        st.isAdmin = true;
        if (typeof updateAdminUI === 'function') updateAdminUI();
        document.getElementById('visitadorDashboard').classList.add('hidden');
        document.getElementById('adminDashboard').classList.remove('hidden');
        document.getElementById('textRep').parentElement.parentElement.classList.remove('hidden');
        if (intRow) intRow.classList.remove('hidden');

        window.App.filters.resetPaginationAndRender();
        window.App.matrix.aggregateAndCalculate();
        window.App.ui.showToast("Cargando métricas del equipo...");
        window.App.evaluation.fetchAllEvaluacionesAdmin();
    } else {
        st.isAdmin = false;
        if (typeof updateAdminUI === 'function') updateAdminUI();
        document.getElementById('visitadorDashboard').classList.remove('hidden');
        document.getElementById('adminDashboard').classList.add('hidden');
        document.getElementById('textRep').parentElement.parentElement.classList.add('hidden');
        if (intRow) intRow.classList.add('hidden');

        window.App.ui.showToast("Descargando tu progreso...");
        window.App.evaluation.fetchEvaluacionesYCalcular();
    }

    document.getElementById('dashboardContent').classList.remove('hidden');
    document.getElementById('filterBar').classList.remove('hidden');
    document.getElementById('filterBar').style.display = 'flex';
};

/* ============================================================
   LOGOUT — limpieza profunda de sesión
============================================================ */
window.App.auth.logoutSession = function() {
    const st = window.App.state;

    sessionStorage.clear();
    st.currentUserRole = 'guest';
    st.currentVisitadorName = "";
    st.isAdmin = false;

    // Borrar datos sensibles de RAM
    st.EVALUACIONES_VISITADOR = {};
    st.ALL_EVALUATIONS.length = 0;

    // Limpiar inputs de contraseña
    const pwdA = document.getElementById('adminPwdInput');
    const pwdV = document.getElementById('visitadorPwd');
    if (pwdA) pwdA.value = '';
    if (pwdV) pwdV.value = '';

    // Resetear UI
    document.getElementById('navUserInfo').classList.add('hidden');
    document.getElementById('btnLoginNavContainer').classList.remove('hidden');
    document.getElementById('visitadorDashboard').classList.add('hidden');
    document.getElementById('adminDashboard').classList.add('hidden');
    document.getElementById('textRep').parentElement.parentElement.classList.remove('hidden');

    const intRow = document.getElementById('intelligenceRow');
    if (intRow) intRow.classList.remove('hidden');

    st.currentMatrixMode = 'closeup';

    if (typeof updateAdminUI === 'function') updateAdminUI();
    window.App.filters.resetPaginationAndRender();
    window.App.matrix.aggregateAndCalculate();
    window.App.ui.showToast("Sesión cerrada correctamente");
};

/* ============================================================
   ALIAS GLOBALES (compatibilidad con onclick="..." del HTML)
============================================================ */
window.openLoginModal       = window.App.auth.openLoginModal;
window.populateLoginSelect  = window.App.auth.populateLoginSelect;
window.attemptLogin         = window.App.auth.attemptLogin;
window.checkAuthentication  = window.App.auth.checkAuthentication;
window.loginSuccess         = window.App.auth.loginSuccess;
window.logoutSession        = window.App.auth.logoutSession;

console.log('[SegmentApp] auth.js cargado.');

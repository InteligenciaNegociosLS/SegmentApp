/* ============================================================
   SegmentApp - Autenticación y sesión
   Archivo: js/auth.js
   Responsable de:
   - Login con correo corporativo + clave (Firebase Auth)
   - Recuperación de clave por correo
   - Logout limpio de sesión
   - Verificación de sesión al abrir la app
   - Cambio de UI según rol (guest / visitador / admin)

   El rol y el nombre del visitador vienen del token de Firebase
   (custom claims: role, visitadorName), NO del navegador.
============================================================ */

window.App = window.App || {};
window.App.auth = {};

const PROFILE_CACHE_KEY = 'SEGMENTAPP_PROFILE';
const LAST_EMAIL_KEY    = 'SEGMENTAPP_LAST_EMAIL';

/* ============================================================
   ESPERAR A QUE FIREBASE ESTÉ LISTO
   Devuelve el usuario con sesión (o null).
============================================================ */
window.App.auth.waitForAuth = async function() {
    if (!window.firebaseAuthReady) {
        await new Promise(resolve => {
            const done = () => resolve();
            window.addEventListener('firebase-ready', done, { once: true });
            window.addEventListener('firebase-error', done, { once: true });
            setTimeout(done, 15000);
        });
    }
    return window.firebaseAuthReady ? window.firebaseAuthReady : null;
};

/* ============================================================
   PERFIL (rol + nombre) DESDE EL TOKEN DE FIREBASE
   Sin conexión, usa la última copia verificada del mismo usuario.
============================================================ */
window.App.auth.getProfile = async function(user, forceRefresh = false) {
    if (!user) return null;
    try {
        const token = await user.getIdTokenResult(forceRefresh);
        const role = token.claims.role || null;
        let name = '';
        if (role === 'visitador') name = token.claims.visitadorName || '';
        if (role === 'admin')     name = 'Administrador';
        const profile = { uid: user.uid, role, name };
        try { localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(profile)); } catch (e) { /* sin almacenamiento */ }
        return profile;
    } catch (e) {
        // Probablemente sin conexión: usar el perfil guardado del MISMO usuario
        try {
            const cached = JSON.parse(localStorage.getItem(PROFILE_CACHE_KEY) || 'null');
            if (cached && cached.uid === user.uid) return cached;
        } catch (e2) { /* sin almacenamiento */ }
        throw e;
    }
};

window.App.auth.isValidProfile = function(profile) {
    if (!profile) return false;
    if (profile.role === 'admin') return true;
    return profile.role === 'visitador' && !!profile.name;
};

/* ============================================================
   ABRIR MODAL DE LOGIN
============================================================ */
window.App.auth.openLoginModal = function() {
    document.getElementById('loginModal').classList.remove('hidden');
    const emailInput = document.getElementById('loginEmail');
    if (emailInput && !emailInput.value) {
        try { emailInput.value = localStorage.getItem(LAST_EMAIL_KEY) || ''; } catch (e) { /* sin almacenamiento */ }
    }
    setTimeout(() => {
        // No mover el cursor si la persona ya empezó a escribir
        if (document.getElementById('loginModal').contains(document.activeElement)) return;
        if (emailInput && !emailInput.value) emailInput.focus();
        else document.getElementById('visitadorPwd').focus();
    }, 50);
};

/* ============================================================
   MENSAJES DE ERROR DE FIREBASE AUTH (en español)
============================================================ */
window.App.auth.authErrorMessage = function(e) {
    const code = (e && e.code) || '';
    if (code === 'auth/invalid-email')          return "El correo no tiene un formato válido.";
    if (code === 'auth/invalid-credential' ||
        code === 'auth/wrong-password' ||
        code === 'auth/user-not-found')         return "Correo o clave incorrectos.";
    if (code === 'auth/user-disabled')          return "Tu usuario está desactivado. Contacta al administrador.";
    if (code === 'auth/too-many-requests')      return "Demasiados intentos. Espera unos minutos o recupera tu clave.";
    if (code === 'auth/network-request-failed') return "Sin conexión. Revisa tu internet e intenta de nuevo.";
    return "No se pudo iniciar sesión. Intenta nuevamente.";
};

/* ============================================================
   INTENTAR LOGIN (visitador o admin, mismo formulario)
============================================================ */
window.App.auth.attemptLogin = async function() {
    const ui    = window.App.ui;
    const email = document.getElementById('loginEmail').value.trim().toLowerCase();
    const pwd   = document.getElementById('visitadorPwd').value;
    const btn   = document.getElementById('btnLoginBtn');

    if (!email) { ui.showToast("Escribe tu correo corporativo."); return; }
    if (!pwd)   { ui.showToast("Ingresa tu contraseña.");          return; }
    if (!window.firebaseAuthApi) { ui.showToast("Conectando con el servidor... intenta en unos segundos."); return; }

    btn.disabled = true;
    btn.innerHTML = '<span class="material-symbols-outlined animate-spin-reverse">sync</span> Validando...';

    try {
        const cred = await window.firebaseAuthApi.signIn(email, pwd);
        const profile = await window.App.auth.getProfile(cred.user, true);

        if (!window.App.auth.isValidProfile(profile)) {
            await window.firebaseAuthApi.signOut();
            ui.showToast("Tu usuario aún no tiene permisos asignados. Contacta al administrador.");
            return;
        }
        try { localStorage.setItem(LAST_EMAIL_KEY, email); } catch (e) { /* sin almacenamiento */ }
        window.App.auth.loginSuccess(profile.role, profile.name);
        ui.showToast(profile.role === 'admin'
            ? "Modo Administrador activado"
            : `¡Bienvenido/a, ${profile.name.substring(0, 15)}!`);
    } catch (e) {
        console.error("Error validando login", e);
        ui.showToast(window.App.auth.authErrorMessage(e));
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<span class="material-symbols-outlined">login</span> Entrar al Panel';
    }
};

/* ============================================================
   RECUPERAR CLAVE (envía correo de Firebase)
============================================================ */
window.App.auth.sendPasswordReset = async function() {
    const ui    = window.App.ui;
    const email = document.getElementById('loginEmail').value.trim().toLowerCase();
    if (!email) {
        ui.showToast("Escribe primero tu correo corporativo arriba.");
        document.getElementById('loginEmail').focus();
        return;
    }
    if (!window.firebaseAuthApi) { ui.showToast("Conectando con el servidor... intenta en unos segundos."); return; }

    const btn = document.getElementById('btnForgotPwd');
    if (btn) btn.disabled = true;
    try {
        await window.firebaseAuthApi.sendReset(email);
        ui.showToast("Si el correo está registrado, te llegará un mensaje para crear una clave nueva. Revisa también la carpeta de spam.");
    } catch (e) {
        const code = (e && e.code) || '';
        if (code === 'auth/user-not-found') {
            // Mismo mensaje: no revelamos qué correos existen
            ui.showToast("Si el correo está registrado, te llegará un mensaje para crear una clave nueva. Revisa también la carpeta de spam.");
        } else {
            console.error("Error enviando correo de recuperación", e);
            ui.showToast(window.App.auth.authErrorMessage(e));
        }
    } finally {
        if (btn) btn.disabled = false;
    }
};

/* ============================================================
   PANTALLA "INICIA SESIÓN" (sin sesión no se muestran datos)
============================================================ */
window.App.auth.showLoginRequired = function() {
    const st = window.App.state;
    st.currentUserRole = 'guest';
    st.currentVisitadorName = "";
    st.isAdmin = false;

    ['dashboardContent', 'filterBar', 'analysisTools', 'adminDashboard', 'visitadorDashboard', 'navUserInfo']
        .forEach(id => {
            const el = document.getElementById(id);
            if (el) el.classList.add('hidden');
        });
    const filterBar = document.getElementById('filterBar');
    if (filterBar) filterBar.style.display = '';

    const req = document.getElementById('loginRequiredState');
    if (req) { req.classList.remove('hidden'); req.classList.add('flex'); }
    document.getElementById('btnLoginNavContainer').classList.remove('hidden');

    if (typeof updateAdminUI === 'function') updateAdminUI();
};

/* ============================================================
   VERIFICACIÓN DE SESIÓN AL ABRIR LA APP
   Se llama al terminar de cargar los datos (processData).
============================================================ */
window.App.auth.checkAuthentication = async function() {
    const st = window.App.state;

    // Si ya hay sesión aplicada en esta pestaña, solo refrescar la vista
    if (st.currentUserRole !== 'guest' && window.firebaseAuth && window.firebaseAuth.currentUser) {
        window.App.auth.loginSuccess(st.currentUserRole, st.currentVisitadorName);
        return;
    }

    const user = await window.App.auth.waitForAuth();
    if (!user) {
        window.App.auth.showLoginRequired();
        return;
    }
    try {
        const profile = await window.App.auth.getProfile(user);
        if (window.App.auth.isValidProfile(profile)) {
            window.App.auth.loginSuccess(profile.role, profile.name);
            return;
        }
    } catch (e) {
        console.error('[SegmentApp] No se pudo verificar la sesión:', e);
    }
    window.App.auth.showLoginRequired();
};

/* ============================================================
   LOGIN EXITOSO — configura UI según el rol
============================================================ */
window.App.auth.loginSuccess = function(role, name) {
    const st = window.App.state;
    st.currentUserRole = role;
    st.currentVisitadorName = name;

    // Cerrar modales y limpiar input sensible
    document.getElementById('loginModal').classList.add('hidden');
    document.getElementById('adminAuthModal').classList.add('hidden');
    document.getElementById('visitadorPwd').value = '';
    const req = document.getElementById('loginRequiredState');
    if (req) { req.classList.add('hidden'); req.classList.remove('flex'); }

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

    // Subir evaluaciones pendientes hechas sin conexión (ahora que hay sesión)
    if (window.App.offline && window.App.offline.syncOfflineEvaluations) {
        window.App.offline.syncOfflineEvaluations();
    }
};

/* ============================================================
   LOGOUT — limpieza profunda de sesión
============================================================ */
window.App.auth.logoutSession = async function() {
    const st = window.App.state;

    try {
        if (window.firebaseAuthApi) await window.firebaseAuthApi.signOut();
    } catch (e) {
        console.error('[SegmentApp] Error al cerrar sesión en Firebase:', e);
    }
    try { localStorage.removeItem(PROFILE_CACHE_KEY); } catch (e) { /* sin almacenamiento */ }

    // Borrar datos sensibles de RAM
    st.EVALUACIONES_VISITADOR = {};
    st.ALL_EVALUATIONS.length = 0;

    // Limpiar inputs de contraseña
    const pwdA = document.getElementById('adminPwdInput');
    const pwdV = document.getElementById('visitadorPwd');
    if (pwdA) pwdA.value = '';
    if (pwdV) pwdV.value = '';

    st.currentMatrixMode = 'closeup';
    window.App.auth.showLoginRequired();
    window.App.ui.showToast("Sesión cerrada correctamente");
};

/* ============================================================
   ALIAS GLOBALES (compatibilidad con onclick="..." del HTML)
============================================================ */
window.openLoginModal       = window.App.auth.openLoginModal;
window.attemptLogin         = window.App.auth.attemptLogin;
window.sendPasswordReset    = window.App.auth.sendPasswordReset;
window.checkAuthentication  = window.App.auth.checkAuthentication;
window.loginSuccess         = window.App.auth.loginSuccess;
window.logoutSession        = window.App.auth.logoutSession;

console.log('[SegmentApp] auth.js cargado.');

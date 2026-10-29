/* ============================================================
   SegmentApp - Autenticación y sesión (Supabase Auth)
   Archivo: js/auth.js
   Responsable de:
   - Login con correo corporativo + clave
   - Recuperación de clave por correo y "Crea tu clave nueva"
   - Perfil y rol desde la base (no desde el navegador)
   - Cambio de UI según rol:
       vm            → su tablero (vista "visitador")
       admin         → panel del equipo con todas las herramientas
       gd            → panel del equipo de SU distrito, solo consulta
       gte_nacional  → panel de todo el equipo, solo consulta
============================================================ */

window.App = window.App || {};
window.App.auth = {};

const PROFILE_CACHE_KEY = 'SEGMENTAPP_PROFILE';
const LAST_EMAIL_KEY    = 'SEGMENTAPP_LAST_EMAIL';

/* ============================================================
   PERFIL (rol + nombre) DESDE SUPABASE
   Sin conexión, usa la última copia verificada del mismo usuario.
============================================================ */
window.App.auth.getProfile = async function(user) {
    if (!user) return null;
    try {
        const perfil = await window.App.sb.perfil(user);
        try {
            if (perfil) localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(perfil));
            else localStorage.removeItem(PROFILE_CACHE_KEY);
        } catch (e) { /* sin almacenamiento */ }
        return perfil;
    } catch (e) {
        // Probablemente sin conexión: usar el perfil guardado del MISMO usuario
        try {
            const cached = JSON.parse(localStorage.getItem(PROFILE_CACHE_KEY) || 'null');
            if (cached && cached.uid === user.id) return cached;
        } catch (e2) { /* sin almacenamiento */ }
        throw e;
    }
};

window.App.auth.isValidProfile = function(profile) {
    if (!profile) return false;
    if (['admin', 'gte_nacional', 'gd'].includes(profile.rol)) return true;
    return profile.rol === 'vm' && !!profile.visitadorNombre;
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
   MENSAJES DE ERROR (en español)
============================================================ */
window.App.auth.authErrorMessage = function(e) {
    const texto = String((e && e.original && e.original.message) || (e && e.message) || '');
    const codigo = String((e && e.code) || '');
    if (/invalid login credentials|invalid_credentials/i.test(texto + codigo)) return "Correo o clave incorrectos.";
    if (/email not confirmed/i.test(texto)) return "Tu correo aún no está confirmado. Contacta al administrador.";
    if (/rate limit|too many/i.test(texto) || codigo === '429') return "Demasiados intentos. Espera unos minutos o recupera tu clave.";
    if (/failed to fetch|network|load failed/i.test(texto)) return "Sin conexión. Revisa tu internet e intenta de nuevo.";
    if (/password should be|weak/i.test(texto)) return "La clave es muy débil: usa al menos 8 caracteres.";
    if (/supabase no está configurado/i.test(texto)) return "La app no está conectada al servidor en este entorno.";
    return "No se pudo completar. Intenta nuevamente.";
};

/* ============================================================
   INTENTAR LOGIN (todos los roles, mismo formulario)
============================================================ */
window.App.auth.attemptLogin = async function() {
    const ui    = window.App.ui;
    const email = document.getElementById('loginEmail').value.trim().toLowerCase();
    const pwd   = document.getElementById('visitadorPwd').value;
    const btn   = document.getElementById('btnLoginBtn');

    if (!email) { ui.showToast("Escribe tu correo corporativo."); return; }
    if (!pwd)   { ui.showToast("Ingresa tu contraseña.");          return; }

    btn.disabled = true;
    btn.innerHTML = '<span class="material-symbols-outlined animate-spin-reverse">sync</span> Validando...';

    try {
        const user = await window.App.sb.iniciarSesion(email, pwd);
        try { localStorage.setItem(LAST_EMAIL_KEY, email); } catch (e) { /* sin almacenamiento */ }
        document.getElementById('loginModal').classList.add('hidden');
        document.getElementById('visitadorPwd').value = '';
        await window.App.auth.entrar(user, { avisar: true });
    } catch (e) {
        console.error("Error validando login", e);
        ui.showToast(window.App.auth.authErrorMessage(e));
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<span class="material-symbols-outlined">login</span> Entrar al Panel';
    }
};

/* ============================================================
   RECUPERAR CLAVE (Supabase envía el correo)
============================================================ */
window.App.auth.sendPasswordReset = async function() {
    const ui    = window.App.ui;
    const email = document.getElementById('loginEmail').value.trim().toLowerCase();
    if (!email) {
        ui.showToast("Escribe primero tu correo corporativo arriba.");
        document.getElementById('loginEmail').focus();
        return;
    }
    const btn = document.getElementById('btnForgotPwd');
    if (btn) btn.disabled = true;
    try {
        await window.App.sb.enviarRecuperacion(email);
        ui.showToast("Si el correo está registrado, te llegará un mensaje para crear una clave nueva. Revisa también la carpeta de spam.");
    } catch (e) {
        console.error("Error enviando correo de recuperación", e);
        ui.showToast(window.App.auth.authErrorMessage(e));
    } finally {
        if (btn) btn.disabled = false;
    }
};

/* ============================================================
   "CREA TU CLAVE NUEVA" (al abrir el enlace del correo)
============================================================ */
window.App.auth.mostrarNuevaClave = function() {
    document.getElementById('loginModal').classList.add('hidden');
    document.getElementById('nuevaClaveModal').classList.remove('hidden');
    setTimeout(() => document.getElementById('nuevaClave1').focus(), 50);
};

window.App.auth.guardarNuevaClave = async function() {
    const ui = window.App.ui;
    const c1 = document.getElementById('nuevaClave1').value;
    const c2 = document.getElementById('nuevaClave2').value;
    if (c1.length < 8) { ui.showToast("La clave debe tener al menos 8 caracteres."); return; }
    if (c1 !== c2)     { ui.showToast("Las dos claves no coinciden."); return; }
    const btn = document.getElementById('btnGuardarNuevaClave');
    btn.disabled = true;
    try {
        await window.App.sb.cambiarClave(c1);
        document.getElementById('nuevaClave1').value = '';
        document.getElementById('nuevaClave2').value = '';
        document.getElementById('nuevaClaveModal').classList.add('hidden');
        ui.showToast("¡Listo! Tu clave nueva quedó guardada.");
        const user = await window.App.sb.usuarioActual();
        if (user && window.App.state.currentUserRole === 'guest') await window.App.auth.entrar(user, { avisar: true });
    } catch (e) {
        console.error('Error guardando la clave nueva', e);
        ui.showToast(window.App.auth.authErrorMessage(e));
    } finally {
        btn.disabled = false;
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
    st.rolReal = null;
    st.soloLectura = false;
    st.visitadorId = null;
    st.REPS_PERMITIDOS = null;

    ['dashboardContent', 'filterBar', 'analysisTools', 'adminDashboard', 'visitadorDashboard', 'navUserInfo', 'restoringSession', 'emptyState']
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
   ENTRAR: perfil → configuración → datos → tablero
============================================================ */
window.App.auth.entrar = async function(user, { avisar = false } = {}) {
    const st = window.App.state;
    const ui = window.App.ui;
    let perfil = null;
    try {
        perfil = await window.App.auth.getProfile(user);
    } catch (e) {
        console.error('[SegmentApp] No se pudo leer el perfil:', e);
    }
    if (!window.App.auth.isValidProfile(perfil)) {
        await window.App.sb.cerrarSesion().catch(() => {});
        window.App.auth.showLoginRequired();
        ui.showToast("Tu usuario aún no tiene permisos asignados o está desactivado. Contacta al administrador.");
        return;
    }

    st.rolReal = perfil.rol;
    st.soloLectura = perfil.rol === 'gd' || perfil.rol === 'gte_nacional';
    st.visitadorId = perfil.visitadorId;
    if (perfil.rol === 'vm') {
        st.REPS_PERMITIDOS = new Set([perfil.visitadorNombre]);
    } else if (perfil.rol === 'gd') {
        try {
            st.REPS_PERMITIDOS = new Set(await window.App.sb.nombresVisitadoresVisibles());
        } catch (e) {
            st.REPS_PERMITIDOS = new Set();
            console.error('[SegmentApp] No se pudieron leer los visitadores del distrito:', e);
        }
    } else {
        st.REPS_PERMITIDOS = null;
    }

    const req = document.getElementById('loginRequiredState');
    if (req) { req.classList.add('hidden'); req.classList.remove('flex'); }

    const ok = await window.App.main.cargarTodo();
    if (!ok) return;

    const rolVista = perfil.rol === 'vm' ? 'visitador' : 'admin';
    const nombre = perfil.rol === 'vm' ? perfil.visitadorNombre : (perfil.nombre || 'Equipo');
    window.App.auth.loginSuccess(rolVista, nombre);
    if (avisar) {
        const saludo = { admin: 'Modo Administrador activado', gte_nacional: 'Bienvenido/a, Gerente Nacional (solo consulta)', gd: 'Bienvenido/a, Gerente de Distrito (solo consulta)' };
        ui.showToast(saludo[perfil.rol] || `¡Bienvenido/a, ${nombre.substring(0, 15)}!`);
    }
};

/* ============================================================
   VERIFICACIÓN DE SESIÓN AL ABRIR LA APP
============================================================ */
window.App.auth.checkAuthentication = async function() {
    if (!window.App.supabase.configurado()) {
        window.App.auth.showLoginRequired();
        window.App.ui.showToast('La app no está conectada al servidor en este entorno.');
        return;
    }
    // Enlace del correo de recuperación → pedir clave nueva
    window.App.sb.alCambiarSesion((evento) => {
        if (evento === 'PASSWORD_RECOVERY') window.App.auth.mostrarNuevaClave();
    }).catch(e => console.error('[SegmentApp] Escucha de sesión:', e));

    let user = null;
    try {
        user = await window.App.sb.usuarioActual();
    } catch (e) {
        console.error('[SegmentApp] No se pudo verificar la sesión:', e);
    }
    if (!user) {
        window.App.auth.showLoginRequired();
        return;
    }
    await window.App.auth.entrar(user);
};

/* ============================================================
   LOGIN EXITOSO — configura UI según el rol
============================================================ */
window.App.auth.loginSuccess = function(role, name) {
    const st = window.App.state;
    st.currentUserRole = role;
    st.currentVisitadorName = name;

    document.getElementById('loginModal').classList.add('hidden');
    document.getElementById('adminAuthModal').classList.add('hidden');
    document.getElementById('visitadorPwd').value = '';
    const req = document.getElementById('loginRequiredState');
    if (req) { req.classList.add('hidden'); req.classList.remove('flex'); }

    document.getElementById('navUserInfo').classList.remove('hidden');
    document.getElementById('btnLoginNavContainer').classList.add('hidden');
    const etiquetas = { admin: 'Administrador', gte_nacional: 'Gte. Nacional', gd: 'GD ' + name };
    document.getElementById('navUserName').innerText = (etiquetas[st.rolReal] || name).substring(0, 18);

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

    if (window.App.versiones && window.App.versiones.actualizarEtiqueta) window.App.versiones.actualizarEtiqueta();

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
        await window.App.sb.cerrarSesion();
    } catch (e) {
        console.error('[SegmentApp] Error al cerrar sesión:', e);
    }
    try { localStorage.removeItem(PROFILE_CACHE_KEY); } catch (e) { /* sin almacenamiento */ }

    st.EVALUACIONES_VISITADOR = {};
    st.ALL_EVALUATIONS.length = 0;
    const pwdV = document.getElementById('visitadorPwd');
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
window.guardarNuevaClave    = window.App.auth.guardarNuevaClave;
window.checkAuthentication  = window.App.auth.checkAuthentication;
window.loginSuccess         = window.App.auth.loginSuccess;
window.logoutSession        = window.App.auth.logoutSession;

console.log('[SegmentApp] auth.js cargado.');

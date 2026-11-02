/* ============================================================
   SegmentApp - Usuarios (solo administrador, Fase 10C)
   Archivo: js/usuarios.js
   En Ajustes → Usuarios el administrador puede:
   - ver a todos, buscar por nombre o correo y filtrar por rol;
   - cambiar el nombre y el correo con el que entra cada persona
     (la clave no cambia);
   - darle una CLAVE TEMPORAL nueva si la olvidó: la app la crea, se
     guarda cifrada, y aquí se muestra UNA vez con el mensaje listo
     para enviar por WhatsApp o correo (al entrar, la app le pide
     crear la suya);
   - activar o desactivar su acceso (no se borra nada).
   Funciones de la base: migración 14 (admin_usuarios, admin_editar_usuario,
   admin_clave_temporal, admin_activar_usuario).
============================================================ */
(function() {
    window.App = window.App || {};
    const U = window.App.usuarios = {};

    const esc = (v) => window.App.ui.escapeHtml(v);
    const fmt = (n) => window.App.ui.formatNumber(n || 0, 0);
    const toast = (t) => window.App.ui.showToast(t);
    const ROL = { admin: 'Administrador', gte_nacional: 'Gerente Nacional', gd: 'Gerente de Distrito', vm: 'Visitador' };
    const ROL_CORTO = { admin: 'Admin', gte_nacional: 'Gte. Nacional', gd: 'GD', vm: 'VM' };

    let lista = [];
    let actual = null;       // usuario abierto en la ventana

    /* ---------- Clave temporal (mismo formato que el script de Cloud Shell) ---------- */
    // Fácil de dictar o escribir en el teléfono: "maro-kebi-4821". Sin letras que se confundan.
    U.SILABAS = ['ba', 'be', 'bi', 'bo', 'bu', 'ca', 'co', 'cu', 'da', 'de', 'do', 'fa', 'fe', 'fi', 'fo', 'ga', 'go', 'gu',
        'ka', 'ke', 'ki', 'ko', 'ku', 'ma', 'me', 'mi', 'mo', 'mu', 'na', 'ne', 'ni', 'no', 'nu', 'pa', 'pe', 'pi', 'po', 'pu',
        'ra', 're', 'ri', 'ro', 'ru', 'sa', 'se', 'si', 'so', 'su', 'ta', 'te', 'ti', 'to', 'tu', 'va', 've', 'vi', 'za', 'zo'];
    const azarSeguro = (n) => {
        const a = new Uint32Array(1);
        const limite = Math.floor(0x100000000 / n) * n;   // sin sesgo
        do { window.crypto.getRandomValues(a); } while (a[0] >= limite);
        return a[0] % n;
    };
    U.generarClave = function(azar = azarSeguro) {
        const palabra = () => U.SILABAS[azar(U.SILABAS.length)] + U.SILABAS[azar(U.SILABAS.length)];
        return `${palabra()}-${palabra()}-${String(1000 + azar(9000))}`;
    };

    // Mensaje listo para enviar (mismo texto que accesos.csv)
    U.mensaje = function({ nombre, correo, clave, tipo }, appUrl = '') {
        const dir = appUrl || '(dirección de la app)';
        const saludo = `Hola ${String(nombre || '').trim()}. Ya puedes entrar a la nueva SegmentApp: ${dir}`;
        if (tipo === 'temporal') return `${saludo} · Correo: ${correo} · Clave temporal: ${clave} · Al entrar, la app te pedirá crear tu propia clave. En el teléfono usa el menú ⋮ → "Instalar la app".`;
        return `${saludo} · Correo: ${correo} · Usa la misma clave de siempre. En el teléfono usa el menú ⋮ → "Instalar la app".`;
    };
    const direccionApp = () => (window.location && window.location.origin) || '';

    const textoError = (e) => {
        const m = String((e && e.original && e.original.message) || (e && e.message) || '');
        if (/admin_usuarios|admin_editar|admin_clave|admin_activar|could not find the function|does not exist/i.test(m)) return 'Falta aplicar la migración 14 en Supabase.';
        if (/failed to fetch|network|sin conexi/i.test(m)) return 'Sin conexión. Intenta de nuevo.';
        return m.replace(/^[^:]+:\s*/, '') || 'No se pudo completar. Intenta de nuevo.';
    };

    /* ---------- Lista ---------- */
    U.cargar = async function() {
        const zona = document.getElementById('ajUsuariosLista');
        if (!zona) return;
        zona.innerHTML = '<li class="py-3 text-sm text-slate-500">Cargando usuarios…</li>';
        try {
            lista = await window.App.sb.usuarios();
        } catch (e) {
            lista = [];
            zona.innerHTML = `<li class="py-3 text-sm text-slate-500">${esc(textoError(e))}</li>`;
            window.App.ui.safeSetText('ajUsuariosResumen', '');
            return;
        }
        U.pintar();
    };

    const fechaCorta = (x) => new Date(x).toLocaleDateString('es-VE', { day: '2-digit', month: 'short', year: 'numeric' });
    const iniciales = (n) => String(n || '?').trim().split(/\s+/).slice(0, 2).map(p => p[0] || '').join('').toUpperCase() || '?';

    U.pintar = function() {
        const zona = document.getElementById('ajUsuariosLista');
        if (!zona) return;
        const buscar = String((document.getElementById('ajUsuariosBuscar') || {}).value || '').trim().toLowerCase();
        const rol = String((document.getElementById('ajUsuariosRol') || {}).value || '');
        const yo = window.App.state.usuarioId;
        const vistos = lista.filter(u => (!rol || u.rol === rol)
            && (!buscar || `${u.nombre} ${u.correo} ${u.visitador || ''} ${u.distritos || ''}`.toLowerCase().includes(buscar)));
        const temporales = lista.filter(u => u.clave_temporal).length;
        const nunca = lista.filter(u => !u.ultimo_ingreso).length;
        const internos = lista.filter(u => /@segmentapp\.internal$/i.test(u.correo)).length;
        window.App.ui.safeSetText('ajUsuariosResumen', `${fmt(lista.length)} usuarios · ${fmt(temporales)} con clave temporal pendiente · ${fmt(nunca)} nunca han entrado`
            + (internos ? ` · ${fmt(internos)} con correo interno de la app vieja` : ''));
        if (!vistos.length) {
            zona.innerHTML = `<li class="py-3 text-sm text-slate-500">${lista.length ? 'Nadie coincide con la búsqueda.' : 'Todavía no hay usuarios.'}</li>`;
            return;
        }
        zona.innerHTML = vistos.map(u => {
            const etiquetas = [
                `<span class="usuario-etiqueta">${esc(ROL_CORTO[u.rol] || u.rol)}</span>`,
                u.visitador && u.visitador.toUpperCase() !== String(u.nombre).toUpperCase() ? `<span class="usuario-etiqueta">${esc(u.visitador)}</span>` : '',
                u.distritos ? `<span class="usuario-etiqueta">${esc(u.distritos)}</span>` : '',
                !u.activo ? '<span class="usuario-etiqueta aviso">Acceso desactivado</span>' : '',
                u.clave_temporal ? '<span class="usuario-etiqueta aviso">Clave temporal pendiente</span>' : '',
                /@segmentapp\.internal$/i.test(u.correo) ? '<span class="usuario-etiqueta aviso">Correo interno</span>' : ''
            ].filter(Boolean).join('');
            const ingreso = u.ultimo_ingreso ? `Último ingreso: ${fechaCorta(u.ultimo_ingreso)}` : 'Nunca ha entrado';
            const esYo = u.id === yo;
            return `<li class="usuario-fila${u.activo ? '' : ' inactivo'}" data-usuario="${esc(u.id)}">
                <span class="usuario-avatar" aria-hidden="true">${esc(iniciales(u.nombre))}</span>
                <div class="min-w-0 flex-1">
                    <div class="text-sm font-bold text-slate-800 truncate">${esc(u.nombre || '(sin nombre)')}${esYo ? ' <span class="text-xs font-semibold text-slate-500">(tú)</span>' : ''}</div>
                    <div class="text-xs text-slate-600 truncate">${esc(u.correo)}</div>
                    <div class="flex flex-wrap gap-1 mt-1.5">${etiquetas}</div>
                    <div class="text-[11px] text-slate-500 mt-1">${esc(ingreso)}</div>
                </div>
                <div class="usuario-acciones">
                    <button type="button" class="boton-icono" title="Cambiar nombre o correo" aria-label="Cambiar nombre o correo de ${esc(u.nombre)}" data-accion="editar" onclick="App.usuarios.editar('${esc(u.id)}')"><span class="material-symbols-outlined">edit</span></button>
                    ${esYo ? '' : `<button type="button" class="boton-icono" title="Dar clave temporal" aria-label="Dar clave temporal a ${esc(u.nombre)}" data-accion="clave" onclick="App.usuarios.clave('${esc(u.id)}')"><span class="material-symbols-outlined">key</span></button>
                    <button type="button" class="boton-icono" title="${u.activo ? 'Desactivar acceso' : 'Activar acceso'}" aria-label="${u.activo ? 'Desactivar' : 'Activar'} el acceso de ${esc(u.nombre)}" data-accion="activar" onclick="App.usuarios.activar('${esc(u.id)}')"><span class="material-symbols-outlined">${u.activo ? 'person_off' : 'person_check'}</span></button>`}
                </div>
            </li>`;
        }).join('');
    };

    /* ---------- Ventana (una sola, con varios pasos) ---------- */
    const ventana = () => document.getElementById('usuarioModal');
    const cuerpo = () => document.getElementById('usuarioModalCuerpo');
    const abrir = (titulo, html) => {
        window.App.ui.safeSetText('usuarioModalTitulo', titulo);
        cuerpo().innerHTML = html;
        ventana().classList.remove('hidden');
        const primero = cuerpo().querySelector('input, button');
        if (primero && primero.focus) setTimeout(() => { try { primero.focus(); } catch (e) { /* sin foco */ } }, 50);
    };
    U.cerrar = function() {
        const v = ventana();
        if (v) v.classList.add('hidden');
        actual = null;
    };
    const ocupado = (si) => cuerpo().querySelectorAll('button, input').forEach(b => { b.disabled = si; });
    const buscarUsuario = (id) => lista.find(u => u.id === id);
    const botones = (accion, texto, icono) => `<div class="flex flex-wrap justify-end gap-2 mt-6">
        <button type="button" class="boton-texto" onclick="App.usuarios.cerrar()">Cancelar</button>
        <button type="button" class="boton-lleno" data-accion="confirmar" onclick="${accion}"><span class="material-symbols-outlined text-[18px]">${icono}</span> ${texto}</button></div>`;

    // Cambiar nombre y correo
    U.editar = function(id) {
        actual = buscarUsuario(id);
        if (!actual) return;
        abrir('Cambiar nombre o correo', `
            <p class="text-sm text-slate-600 mb-4">${esc(ROL[actual.rol] || actual.rol)}. <b>La clave no cambia</b>: avísale a la persona con qué correo entra ahora.</p>
            <label class="campo">Nombre<input id="usuarioNombre" type="text" autocomplete="off" value="${esc(actual.nombre)}"></label>
            <label class="campo mt-3">Correo con el que entra<input id="usuarioCorreo" type="email" inputmode="email" autocomplete="off" value="${esc(actual.correo)}"
                onkeypress="if(event.key==='Enter') App.usuarios.guardarEdicion()"></label>
            <p id="usuarioError" class="text-sm text-rose-700 mt-3 min-h-[20px]" role="alert"></p>
            ${botones('App.usuarios.guardarEdicion()', 'Guardar', 'save')}`);
    };

    U.guardarEdicion = async function() {
        if (!actual) return;
        const nombre = document.getElementById('usuarioNombre').value.trim();
        const correo = document.getElementById('usuarioCorreo').value.trim().toLowerCase();
        const error = (t) => window.App.ui.safeSetText('usuarioError', t);
        if (!nombre) return error('Escribe el nombre.');
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(correo)) return error('El correo no es válido.');
        if (nombre === actual.nombre && correo === actual.correo) { U.cerrar(); return; }
        ocupado(true);
        try {
            const r = await window.App.sb.editarUsuario(actual.id, nombre, correo);
            const cambioCorreo = r.correo !== actual.correo;
            const u = Object.assign(actual, { nombre: r.nombre, correo: r.correo });
            U.pintar();
            if (!cambioCorreo) { U.cerrar(); toast('Nombre guardado.'); return; }
            mostrarMensaje(u, { tipo: u.clave_temporal ? 'pendiente' : 'actual',
                aviso: 'Correo cambiado' });
        } catch (e) {
            ocupado(false);
            error(textoError(e));
        }
    };

    // Clave temporal nueva
    U.clave = function(id) {
        actual = buscarUsuario(id);
        if (!actual) return;
        abrir('Dar clave temporal', `
            <p class="text-sm text-slate-700">Se creará una clave temporal nueva para <b>${esc(actual.nombre)}</b> (${esc(actual.correo)}).</p>
            <ul class="text-sm text-slate-600 mt-3 space-y-1 list-disc pl-5">
                <li>Su clave actual <b>dejará de funcionar</b>.</li>
                <li>Al entrar con la temporal, la app le pedirá crear la suya.</li>
                <li>La verás <b>solo una vez</b>, con el mensaje listo para enviarle.</li>
            </ul>
            <p id="usuarioError" class="text-sm text-rose-700 mt-3 min-h-[20px]" role="alert"></p>
            ${botones('App.usuarios.crearClave()', 'Crear clave temporal', 'key')}`);
    };

    U.crearClave = async function() {
        if (!actual) return;
        const clave = U.generarClave();
        ocupado(true);
        try {
            await window.App.sb.claveTemporal(actual.id, clave);
            actual.clave_temporal = true;
            U.pintar();
            mostrarMensaje(actual, { tipo: 'temporal', clave, aviso: 'Clave temporal creada' });
        } catch (e) {
            ocupado(false);
            window.App.ui.safeSetText('usuarioError', textoError(e));
        }
    };

    // Paso final: el mensaje listo para enviar
    function mostrarMensaje(u, { tipo, clave = '', aviso }) {
        const texto = tipo === 'pendiente'
            ? `Hola ${String(u.nombre).trim()}. Tu correo para entrar a SegmentApp (${direccionApp()}) ahora es: ${u.correo} · Usa la clave temporal que te envié.`
            : U.mensaje({ nombre: u.nombre, correo: u.correo, clave, tipo }, direccionApp());
        U._mensaje = texto;
        abrir(aviso, `
            ${tipo === 'temporal' ? `<div class="rounded-2xl bg-slate-50 p-4 text-center mb-4">
                <div class="text-xs font-semibold text-slate-500">Clave temporal de ${esc(u.nombre)}</div>
                <div id="usuarioClave" class="text-2xl font-display font-bold text-slate-900 tracking-wide mt-1 select-all">${esc(clave)}</div>
                <div class="text-[11px] text-slate-500 mt-1">No se vuelve a mostrar. Envíasela ahora.</div></div>` : ''}
            <label class="campo">Mensaje para enviar
                <textarea id="usuarioMensaje" rows="5" readonly>${esc(texto)}</textarea></label>
            <div class="flex flex-wrap justify-end gap-2 mt-6">
                <button type="button" class="boton-tonal" data-accion="copiar" onclick="App.usuarios.copiar()"><span class="material-symbols-outlined text-[18px]">content_copy</span> Copiar mensaje</button>
                <button type="button" class="boton-tonal" data-accion="whatsapp" onclick="App.usuarios.whatsapp()"><span class="material-symbols-outlined text-[18px]">send</span> WhatsApp</button>
                <button type="button" class="boton-lleno" onclick="App.usuarios.cerrar()">Listo</button>
            </div>`);
    }

    U.copiar = async function() {
        const texto = U._mensaje || '';
        try {
            await navigator.clipboard.writeText(texto);
        } catch (e) {
            const area = document.getElementById('usuarioMensaje');
            if (area) { area.select(); try { document.execCommand('copy'); } catch (x) { /* el usuario puede copiar a mano */ } }
        }
        toast('Mensaje copiado. Pégalo en WhatsApp o en un correo.');
    };

    U.whatsapp = function() {
        window.open(`https://wa.me/?text=${encodeURIComponent(U._mensaje || '')}`, '_blank', 'noopener');
    };

    // Activar o desactivar el acceso
    U.activar = function(id) {
        actual = buscarUsuario(id);
        if (!actual) return;
        const activar = !actual.activo;
        abrir(activar ? 'Activar acceso' : 'Desactivar acceso', `
            <p class="text-sm text-slate-700">${activar
                ? `<b>${esc(actual.nombre)}</b> podrá volver a entrar a SegmentApp con su correo y su clave.`
                : `<b>${esc(actual.nombre)}</b> ya no podrá entrar a SegmentApp. <b>No se borra nada</b>: sus evaluaciones quedan guardadas y puedes reactivarlo cuando quieras.`}</p>
            <p id="usuarioError" class="text-sm text-rose-700 mt-3 min-h-[20px]" role="alert"></p>
            ${botones('App.usuarios.confirmarActivar()', activar ? 'Activar' : 'Desactivar', activar ? 'person_check' : 'person_off')}`);
    };

    U.confirmarActivar = async function() {
        if (!actual) return;
        const activar = !actual.activo;
        ocupado(true);
        try {
            await window.App.sb.activarUsuario(actual.id, activar);
            actual.activo = activar;
            U.pintar();
            toast(activar ? `${actual.nombre} puede entrar de nuevo.` : `Acceso de ${actual.nombre} desactivado.`);
            U.cerrar();
        } catch (e) {
            ocupado(false);
            window.App.ui.safeSetText('usuarioError', textoError(e));
        }
    };

    console.log('[SegmentApp] usuarios.js cargado.');
})();

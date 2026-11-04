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
        if (/admin_crear_usuario|admin_pendientes_acceso/i.test(m)) return 'Falta aplicar la migración 18 en Supabase (en Cloud Shell: node 0-preparar-base.mjs).';
        if (/admin_claves_temporales/i.test(m)) return 'Falta aplicar la migración 15 en Supabase (en Cloud Shell: node 0-preparar-base.mjs).';
        if (/admin_usuarios|admin_editar|admin_clave|admin_activar|could not find the function|does not exist/i.test(m)) return 'Falta aplicar la migración 14 en Supabase (en Cloud Shell: node 0-preparar-base.mjs).';
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
        U.pintarLineas();
        U.pintar();
        await U.cargarPendientes();
        // "Salud de los datos" cuenta lo mismo: se actualiza al cambiar los accesos
        if (window.App.ajustes && window.App.ajustes.renderSalud && document.getElementById('ajSaludLista')) window.App.ajustes.renderSalud();
    };

    /* ---------- Quién no tiene acceso todavía (migración 18) ---------- */
    let pendientes = { visitadores: [], distritos: [] };
    U.cargarPendientes = async function() {
        const zona = document.getElementById('ajUsuariosPendientes');
        if (!zona) return;
        try { pendientes = await window.App.sb.pendientesAcceso(); }
        catch (e) { pendientes = { visitadores: [], distritos: [] }; zona.innerHTML = ''; return; }
        U.pintarPendientes();
    };
    U.pendientes = () => pendientes;
    U.pintarPendientes = function() {
        const zona = document.getElementById('ajUsuariosPendientes');
        if (!zona) return;
        const v = pendientes.visitadores || [], d = pendientes.distritos || [];
        if (!v.length && !d.length) {
            zona.innerHTML = '<p class="text-xs text-green-800 bg-green-50 rounded-xl px-3 py-2">✅ Todos los visitadores del fichero y todos los distritos tienen acceso.</p>';
            return;
        }
        const item = (titulo, detalle, accion) => `<li class="flex items-center gap-2 py-2">
            <span class="min-w-0 flex-1"><span class="block text-sm font-semibold text-slate-800 truncate">${esc(titulo)}</span>
            <span class="block text-[11px] text-slate-500 truncate">${esc(detalle)}</span></span>
            <button type="button" class="boton-tonal !h-9 !px-3 !text-xs" onclick="${accion}"><span class="material-symbols-outlined text-[16px]">person_add</span> Crear acceso</button></li>`;
        const todos = [
            ...v.map((x, i) => item(x.nombre, `Visitador${x.distrito ? ' · distrito ' + x.distrito : ''} · ${U.correoSugerido(x.nombre)}`, `App.usuarios.nuevo('vm', ${i})`)),
            ...d.map((x, i) => item(x.nombre || x.codigo, `Gerente de distrito · ${x.codigo}${x.nombre ? ' · ' + U.correoSugerido(x.nombre) : ''}`, `App.usuarios.nuevo('gd', ${i})`))];
        const pag = window.App.ui.paginar(todos, U._paginaPend || 1);
        U._paginaPend = pag.pagina;
        const abierto = v.length + d.length <= 6 || U._pendAbierto;
        zona.innerHTML = `<details class="rounded-2xl bg-amber-50 px-4 py-3" ${abierto ? 'open' : ''} ontoggle="App.usuarios._pendAbierto = this.open">
            <summary class="text-sm font-bold text-amber-900 cursor-pointer">Sin acceso: ${fmt(v.length)} ${v.length === 1 ? 'visitador' : 'visitadores'} del fichero · ${fmt(d.length)} ${d.length === 1 ? 'distrito' : 'distritos'} sin GD</summary>
            <p class="text-[11px] text-amber-900 mt-1">Aparecen al cargar un fichero con personas nuevas. "Crear acceso" crea su usuario con una clave temporal y el mensaje listo para enviar.
                El correo se arma solo: <b>nombre.apellido@lasante.com.ve</b>.</p>
            <button type="button" class="boton-lleno !h-9 !px-4 !text-xs mt-2" onclick="App.usuarios.nuevosEnBloque()"><span class="material-symbols-outlined text-[16px]">group_add</span> Crear varios a la vez (${fmt(todos.length)})</button>
            <ul class="divide-y divide-amber-100 mt-2">${pag.items.join('')}</ul>
            ${window.App.ui.paginacion({ pagina: pag.pagina, paginas: pag.paginas, total: todos.length, accion: 'App.usuarios.paginaPendientes' })}</details>`;
    };

    // Crear varios accesos a la vez: se revisan (y corrigen) los correos sugeridos, luego se crean con su clave temporal
    const enBloque = () => [
        ...(pendientes.visitadores || []).map(x => ({ rol: 'vm', nombre: x.nombre, visitador: x.nombre, distritos: null, detalle: `Visitador${x.distrito ? ' · ' + x.distrito : ''}` })),
        ...(pendientes.distritos || []).filter(x => x.nombre).map(x => ({ rol: 'gd', nombre: x.nombre, visitador: null, distritos: [x.codigo], detalle: `GD · ${x.codigo}` }))];
    U.nuevosEnBloque = function() {
        const lista2 = enBloque();
        if (!lista2.length) return;
        actual = null;
        abrir('Crear accesos a la vez', `
            <p class="text-sm text-slate-700">Revisa los correos (se arman con <b>nombre.apellido@lasante.com.ve</b>) y desmarca a quien no quieras crear todavía.
                Cada uno recibe una clave temporal; <b>descarga el archivo antes de cerrar</b>.</p>
            <ul class="divide-y divide-slate-100 mt-3 max-h-[45vh] overflow-y-auto pr-1">${lista2.map((x, i) => `
                <li class="py-2"><label class="flex items-start gap-2">
                    <input type="checkbox" class="mt-1" data-bloque-marca="${i}" checked>
                    <span class="min-w-0 flex-1"><span class="block text-sm font-semibold text-slate-800 truncate">${esc(x.nombre)} <span class="text-[11px] font-normal text-slate-500">· ${esc(x.detalle)}</span></span>
                    <input type="email" class="campo-mini !w-full mt-1" data-bloque-correo="${i}" value="${esc(U.correoSugerido(x.nombre))}" aria-label="Correo de ${esc(x.nombre)}"></span>
                </label></li>`).join('')}</ul>
            <p id="usuarioError" class="text-sm text-rose-700 mt-3 min-h-[20px]" role="alert"></p>
            ${botones('App.usuarios.crearEnBloque()', 'Crear los marcados', 'group_add')}`);
    };
    U.crearEnBloque = async function() {
        const lista2 = enBloque();
        const elegidos = lista2.map((x, i) => {
            const marca = document.querySelector(`[data-bloque-marca="${i}"]`);
            const correo = String((document.querySelector(`[data-bloque-correo="${i}"]`) || {}).value || '').trim().toLowerCase();
            return marca && marca.checked ? { ...x, correo } : null;
        }).filter(Boolean);
        const error = (t) => window.App.ui.safeSetText('usuarioError', t);
        if (!elegidos.length) return error('Marca al menos una persona.');
        const malo = elegidos.find(x => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x.correo));
        if (malo) return error(`El correo de ${malo.nombre} no es válido.`);
        const repetido = elegidos.find((x, i) => elegidos.findIndex(y => y.correo === x.correo) !== i);
        if (repetido) return error(`El correo ${repetido.correo} está repetido: corrige uno.`);
        ocupado(true);
        const dir = direccionApp();
        const hechos = [], fallas = [];
        for (const x of elegidos) {
            const clave = U.generarClave();
            try {
                await window.App.sb.crearUsuario({ correo: x.correo, nombre: x.nombre, rol: x.rol, clave, visitador: x.visitador, distritos: x.distritos });
                const a = { nombre: x.nombre, correo: x.correo, rol: x.rol, clave, tipo: 'temporal' };
                hechos.push({ ...a, mensaje: U.mensaje(a, dir) });
            } catch (e) { fallas.push(`${x.nombre}: ${textoError(e)}`); }
        }
        accesos = hechos;
        guardados = false;
        await U.cargar();
        if (!hechos.length) { ocupado(false); error(`No se creó ninguno. ${fallas.join(' · ')}`); return; }
        mostrarAccesos();
        if (fallas.length) {
            const zona = document.getElementById('usuarioAccesos');
            if (zona) zona.insertAdjacentHTML('beforebegin', `<p class="text-xs text-rose-700 bg-rose-50 rounded-xl px-3 py-2 mt-3" role="alert">No se pudieron crear ${fmt(fallas.length)}: ${esc(fallas.join(' · '))}</p>`);
        }
    };

    U.paginaPendientes = function(p) { U._paginaPend = p; U._pendAbierto = true; U.pintarPendientes(); };

    // Correo de La Santé: nombre.apellido@lasante.com.ve (sin tildes ni ñ). Con 4 palabras
    // ("MARIA JOSE PEREZ GOMEZ") se toma el 1.º nombre y el 1.er apellido; con 2 o 3, las dos primeras.
    U.DOMINIO = 'lasante.com.ve';
    U.correoSugerido = function(nombre) {
        const p = String(nombre || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
            .replace(/[-']/g, '').replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(w => w.length > 1 && !['de', 'del', 'la', 'las', 'los', 'y'].includes(w));
        if (!p.length) return '';
        const apellido = p.length >= 4 ? p[2] : p[1];
        return `${p[0]}${apellido ? '.' + apellido : ''}@${U.DOMINIO}`;
    };

    // Crear el acceso: VM (de un visitador del fichero), GD (de un distrito) o Gerente Nacional / Administrador
    let nuevoDatos = null;
    U.nuevo = function(rol, i) {
        const x = rol === 'vm' ? (pendientes.visitadores || [])[i] : (rol === 'gd' ? (pendientes.distritos || [])[i] : null);
        nuevoDatos = { rol: rol || 'gte_nacional', visitador: rol === 'vm' && x ? x.nombre : null, distritos: rol === 'gd' && x ? [x.codigo] : null };
        const nombre = x ? (x.nombre || '') : '';
        actual = null;
        abrir('Crear acceso', `
            <p class="text-sm text-slate-600 mb-4">${rol === 'vm' ? `Visitador <b>${esc(nombre)}</b>: verá solo sus médicos.`
                : rol === 'gd' ? `Gerente del distrito <b>${esc(x ? x.codigo : '')}</b>: verá a sus visitadores.`
                : 'Elige el rol. Para un visitador o un GD, usa la lista "Sin acceso".'}</p>
            ${!x ? `<label class="campo mb-3">Rol<select id="nuevoRol" class="filter-select !rounded-2xl"><option value="gte_nacional">Gerente Nacional (ve todo, solo consulta)</option><option value="admin">Administrador (todo)</option></select></label>` : ''}
            <label class="campo">Nombre<input id="nuevoNombre" type="text" autocomplete="off" value="${esc(nombre)}"></label>
            <label class="campo mt-3">Correo con el que entra<input id="nuevoCorreo" type="email" inputmode="email" autocomplete="off" placeholder="nombre.apellido@lasante.com.ve" value="${esc(U.correoSugerido(nombre))}"></label>
            <p class="text-[11px] text-slate-500 mt-1">Sugerido con la regla <b>nombre.apellido@lasante.com.ve</b>. Corrígelo si la persona usa otro.</p>
            <p class="text-[11px] text-slate-500 mt-2">Se crea con una clave temporal: al entrar, la app le pide crear la suya.</p>
            <p id="usuarioError" class="text-sm text-rose-700 mt-3 min-h-[20px]" role="alert"></p>
            ${botones('App.usuarios.crearNuevo()', 'Crear acceso', 'person_add')}`);
    };
    U.crearNuevo = async function() {
        if (!nuevoDatos) return;
        const nombre = document.getElementById('nuevoNombre').value.trim();
        const correo = document.getElementById('nuevoCorreo').value.trim().toLowerCase();
        const selRol = document.getElementById('nuevoRol');
        const rol = selRol ? selRol.value : nuevoDatos.rol;
        const error = (t) => window.App.ui.safeSetText('usuarioError', t);
        if (!nombre) return error('Escribe el nombre.');
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(correo)) return error('El correo no es válido.');
        const clave = U.generarClave();
        ocupado(true);
        try {
            await window.App.sb.crearUsuario({ correo, nombre, rol, clave, visitador: nuevoDatos.visitador, distritos: nuevoDatos.distritos });
            nuevoDatos = null;
            mostrarMensaje({ nombre, correo }, { tipo: 'temporal', clave, aviso: 'Acceso creado' });
            await U.cargar();
        } catch (e) {
            ocupado(false);
            error(textoError(e));
        }
    };

    const fechaCorta = (x) => new Date(x).toLocaleDateString('es-VE', { day: '2-digit', month: 'short', year: 'numeric' });
    const iniciales = (n) => String(n || '?').trim().split(/\s+/).slice(0, 2).map(p => p[0] || '').join('').toUpperCase() || '?';

    // Los que se ven con la búsqueda y el rol elegidos (los botones de abajo usan esta misma lista)
    // Líneas de un usuario (del fichero): el VM, la suya; el GD, las de los visitadores de sus distritos
    U.lineasDe = function(u) {
        const l = window.App.data.lineasDelFichero();
        if (u.rol === 'vm' && u.visitador) return [...(l.porVm.get(String(u.visitador).trim().toUpperCase()) || [])].sort();
        if (u.rol === 'gd' && u.distritos) {
            const todas = new Set();
            String(u.distritos).split(/[,\s]+/).filter(Boolean).forEach(c => (l.porDistrito.get(c) || []).forEach(x => todas.add(x)));
            return [...todas].sort();
        }
        return [];
    };
    const valorDe = (id) => String((document.getElementById(id) || {}).value || '');
    U.filtrados = function() {
        const buscar = valorDe('ajUsuariosBuscar').trim().toLowerCase();
        const rol = valorDe('ajUsuariosRol'), activo = valorDe('ajUsuariosActivo'), metricas = valorDe('ajUsuariosMetricas'), linea = valorDe('ajUsuariosLinea');
        return lista.filter(u => (!rol || u.rol === rol)
            && (!activo || (activo === 'si') === !!u.activo)
            // "Métricas" solo aplica a visitadores
            && (!metricas || (u.rol === 'vm' && u.visitador && (metricas === 'si') === window.App.data.cuentaEnMetricas(u.visitador)))
            && (!linea || U.lineasDe(u).includes(linea))
            && (!buscar || `${u.nombre} ${u.correo} ${u.visitador || ''} ${u.distritos || ''}`.toLowerCase().includes(buscar)));
    };
    // Opciones de "Línea": las que hay en el fichero cargado
    U.pintarLineas = function() {
        const sel = document.getElementById('ajUsuariosLinea');
        if (!sel) return;
        const l = window.App.data.lineasDelFichero();
        const todas = new Set();
        l.porVm.forEach(x => x.forEach(y => todas.add(y)));
        const orden = Object.values((window.App.config && window.App.config.LINEAS_EQUIPO) || {});
        const lista2 = [...todas].sort((a, b) => ((orden.indexOf(a) + 1) || 99) - ((orden.indexOf(b) + 1) || 99) || a.localeCompare(b));
        const elegida = sel.value;
        sel.innerHTML = '<option value="">Todas las líneas</option>' + lista2.map(x => `<option value="${esc(x)}" ${x === elegida ? 'selected' : ''}>${esc(x)}</option>`).join('');
    };

    U.pintar = function() {
        const zona = document.getElementById('ajUsuariosLista');
        if (!zona) return;
        const yo = window.App.state.usuarioId;
        const vistos = U.filtrados();
        const masivo = vistos.filter(u => u.id !== yo && u.activo).length;
        const bMasivo = document.getElementById('btnClavesMasivas');
        if (bMasivo) {
            bMasivo.disabled = !masivo;
            bMasivo.querySelector('[data-cuenta]').textContent = fmt(masivo);
        }
        const bLista = document.getElementById('btnDescargarUsuarios');
        if (bLista) bLista.disabled = !vistos.length;
        const temporales = lista.filter(u => u.clave_temporal).length;
        const nunca = lista.filter(u => !u.ultimo_ingreso).length;
        const internos = lista.filter(u => /@segmentapp\.internal$/i.test(u.correo)).length;
        window.App.ui.safeSetText('ajUsuariosResumen', `${fmt(lista.length)} usuarios · ${fmt(temporales)} con clave temporal pendiente · ${fmt(nunca)} nunca han entrado`
            + (internos ? ` · ${fmt(internos)} con correo interno de la app vieja` : ''));
        if (!vistos.length) {
            const zp = document.getElementById('ajUsuariosPaginas');
            if (zp) zp.innerHTML = '';
            zona.innerHTML = `<li class="py-3 text-sm text-slate-500">${lista.length ? 'Nadie coincide con la búsqueda.' : 'Todavía no hay usuarios.'}</li>`;
            return;
        }
        // De 10 en 10 (Fase 12E); al cambiar la búsqueda o el rol se vuelve a la primera página
        const firma = ['ajUsuariosBuscar', 'ajUsuariosRol', 'ajUsuariosActivo', 'ajUsuariosMetricas', 'ajUsuariosLinea'].map(valorDe).join('|');
        if (firma !== U._firma) { U._firma = firma; U._pagina = 1; }
        const pag = window.App.ui.paginar(vistos, U._pagina);
        U._pagina = pag.pagina;
        const paginas = window.App.ui.paginacion({ pagina: pag.pagina, paginas: pag.paginas, total: vistos.length, accion: 'App.usuarios.irAPagina' });
        const zonaPag = document.getElementById('ajUsuariosPaginas');
        if (zonaPag) zonaPag.innerHTML = paginas;
        zona.innerHTML = pag.items.map(u => {
            const etiquetas = [
                `<span class="usuario-etiqueta">${esc(ROL_CORTO[u.rol] || u.rol)}</span>`,
                u.visitador && u.visitador.toUpperCase() !== String(u.nombre).toUpperCase() ? `<span class="usuario-etiqueta">${esc(u.visitador)}</span>` : '',
                u.distritos ? `<span class="usuario-etiqueta">${esc(u.distritos)}</span>` : '',
                ...U.lineasDe(u).slice(0, 3).map(x => `<span class="usuario-etiqueta">${esc(x)}</span>`),
                !u.activo ? '<span class="usuario-etiqueta aviso">Acceso desactivado</span>' : '',
                u.rol === 'vm' && u.visitador && !window.App.data.cuentaEnMetricas(u.visitador) ? '<span class="usuario-etiqueta">No cuenta en las métricas</span>' : '',
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
                    ${u.rol === 'vm' && u.visitador ? (() => { const cuenta = window.App.data.cuentaEnMetricas(u.visitador);
                        return `<button type="button" class="boton-icono" title="${cuenta ? 'Sacar de las métricas' : 'Volver a contar en las métricas'}" aria-pressed="${!cuenta}" aria-label="${cuenta ? 'Sacar de las métricas a' : 'Volver a contar en las métricas a'} ${esc(u.nombre)}" data-accion="metricas" onclick="App.usuarios.metricas('${esc(u.id)}')"><span class="material-symbols-outlined">${cuenta ? 'query_stats' : 'visibility_off'}</span></button>`; })() : ''}
                    <button type="button" class="boton-icono" title="${u.activo ? 'Desactivar acceso' : 'Activar acceso'}" aria-label="${u.activo ? 'Desactivar' : 'Activar'} el acceso de ${esc(u.nombre)}" data-accion="activar" onclick="App.usuarios.activar('${esc(u.id)}')"><span class="material-symbols-outlined">${u.activo ? 'person_off' : 'person_check'}</span></button>`}
                </div>
            </li>`;
        }).join('');
    };

    // Con acceso pero sin contar en las métricas del GD ni nacionales (Fase 12E, migración 21)
    U.metricas = function(id) {
        actual = buscarUsuario(id);
        if (!actual || !actual.visitador) return;
        const cuenta = window.App.data.cuentaEnMetricas(actual.visitador);
        abrir(cuenta ? 'Sacar de las métricas' : 'Volver a contar en las métricas', `
            <p class="text-sm text-slate-700">${cuenta
                ? `<b>${esc(actual.nombre)}</b> sigue entrando a la app y viendo a sus médicos, pero <b>deja de sumar</b> en la cobertura, los visitadores y los avisos de su GD y del país. Útil para quien tiene usuario pero no le corresponde llenar encuestas.`
                : `<b>${esc(actual.nombre)}</b> vuelve a sumar en las métricas de su GD y del país.`}</p>
            <p class="text-xs text-slate-500 mt-2">No se borra nada; se puede cambiar cuando quieras.</p>
            <p id="usuarioError" class="text-sm text-rose-700 mt-3 min-h-[20px]" role="alert"></p>
            ${botones('App.usuarios.confirmarMetricas()', cuenta ? 'Sacar de las métricas' : 'Volver a contar', 'query_stats')}`);
    };
    U.confirmarMetricas = async function() {
        if (!actual || !actual.visitador) return;
        const st = window.App.state;
        const nombre = String(actual.visitador).trim().toUpperCase();
        const cuenta = window.App.data.cuentaEnMetricas(nombre);
        ocupado(true);
        try {
            await window.App.sb.metricasVisitador(nombre, !cuenta);
            const fuera = new Set(st.REPS_FUERA_METRICAS || []);
            if (cuenta) fuera.add(nombre); else fuera.delete(nombre);
            st.REPS_FUERA_METRICAS = fuera.size ? fuera : null;   // un Set nuevo: Equipo e Inicio se recalculan
            try { localStorage.setItem('SEGMENTAPP_FUERA_METRICAS_' + st.usuarioId, JSON.stringify([...fuera])); } catch (e) { /* sin almacenamiento */ }
            U.cerrar();
            U.pintar();
            if (window.App.avisos) window.App.avisos.actualizar();
            toast(cuenta ? 'Listo: ya no cuenta en las métricas.' : 'Listo: vuelve a contar en las métricas.');
        } catch (e) {
            ocupado(false);
            const m = String((e && e.original && e.original.message) || (e && e.message) || '');
            window.App.ui.safeSetText('usuarioError', /admin_metricas_visitador|does not exist|could not find/i.test(m) ? 'Falta aplicar la migración 21 en Supabase.' : textoError(e));
        }
    };

    U._pagina = 1;
    U.irAPagina = function(p) {
        U._pagina = p;
        U.pintar();
        const z = document.getElementById('ajUsuariosLista');
        if (z && z.scrollIntoView) z.scrollIntoView({ block: 'start', behavior: 'smooth' });
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
                : `<b>${esc(actual.nombre)}</b> ya no podrá entrar a SegmentApp${actual.rol === 'vm' ? ', y sus médicos y números dejarán de verse en Equipo, Inicio y las listas' : ''}. <b>No se borra nada</b>: sus evaluaciones quedan guardadas y, si lo reactivas, todo vuelve a aparecer.`}</p>
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
            const esVm = actual.rol === 'vm';
            const texto = activar ? `${actual.nombre} puede entrar de nuevo.` : `Acceso de ${actual.nombre} desactivado.`;
            // Sus médicos y números se ocultan (o vuelven) al actualizar la app
            if (esVm) window.App.ui.showToast(`${texto} Actualiza para ${activar ? 'ver de nuevo' : 'ocultar'} sus médicos y números.`,
                { accion: 'Actualizar', alAccionar: () => window.location.reload(), duracion: 9000 });
            else toast(texto);
            U.cerrar();
        } catch (e) {
            ocupado(false);
            window.App.ui.safeSetText('usuarioError', textoError(e));
        }
    };

    /* ---------- Archivos (CSV que abre Excel, con tildes y Ñ) ---------- */
    const celda = (v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
    const csv = (encabezados, filas) => '\ufeff' + [encabezados.join(','), ...filas.map(f => f.map(celda).join(','))].join('\n') + '\n';
    const hoy = () => new Date().toISOString().slice(0, 10);
    const descargar = (nombre, texto) => {
        const url = URL.createObjectURL(new Blob([texto], { type: 'text/csv;charset=utf-8' }));
        const a = document.createElement('a');
        a.href = url; a.download = nombre;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
    };

    // Lista de usuarios (sin claves): la que se ve en pantalla
    U.listaCsv = function(usuarios = U.filtrados()) {
        return csv(['nombre', 'correo', 'rol', 'visitador', 'distritos', 'acceso', 'clave_temporal_pendiente', 'ultimo_ingreso'],
            usuarios.map(u => [u.nombre, u.correo, ROL[u.rol] || u.rol, u.visitador || '', u.distritos || '', u.activo ? 'activo' : 'desactivado',
                u.clave_temporal ? 'sí' : 'no', u.ultimo_ingreso ? fechaCorta(u.ultimo_ingreso) : 'nunca']));
    };
    U.descargarLista = function() {
        const usuarios = U.filtrados();
        if (!usuarios.length) return;
        descargar(`usuarios-segmentapp-${hoy()}.csv`, U.listaCsv(usuarios));
        toast(`Lista descargada (${fmt(usuarios.length)} usuarios).`);
    };

    /* ---------- Claves temporales para todos (o los filtrados) ---------- */
    let accesos = [];          // resultado: se muestra una sola vez
    let guardados = false;     // ¿ya descargó o compartió el archivo?
    const candidatos = () => U.filtrados().filter(u => u.id !== window.App.state.usuarioId && u.activo);

    U.clavesMasivas = function() {
        const lista2 = candidatos();
        if (!lista2.length) return;
        actual = null;
        const filtro = U.filtrados().length !== lista.length;
        abrir('Claves temporales', `
            <p class="text-sm text-slate-700">Se creará una clave temporal nueva para <b>${fmt(lista2.length)} ${lista2.length === 1 ? 'persona' : 'personas'}</b>${filtro ? ' (las que se ven con la búsqueda o el rol elegidos)' : ''}.</p>
            <ul class="text-sm text-slate-600 mt-3 space-y-1 list-disc pl-5">
                <li>Sus claves actuales <b>dejarán de funcionar</b>.</li>
                <li>Al entrar con la temporal, la app le pide a cada una crear la suya.</li>
                <li>Tú no estás incluido, ni quien tiene el acceso desactivado.</li>
                <li>Las claves se ven <b>solo una vez</b>: descarga el archivo antes de cerrar.</li>
            </ul>
            <p id="usuarioError" class="text-sm text-rose-700 mt-3 min-h-[20px]" role="alert"></p>
            ${botones('App.usuarios.crearClavesMasivas()', `Crear ${fmt(lista2.length)} claves`, 'key')}`);
    };

    U.crearClavesMasivas = async function() {
        const lista2 = candidatos();
        if (!lista2.length) return;
        const nuevas = lista2.map(u => ({ u, clave: U.generarClave() }));
        ocupado(true);
        try {
            await window.App.sb.clavesTemporales(nuevas.map(x => ({ id: x.u.id, clave: x.clave })));
        } catch (e) {
            ocupado(false);
            window.App.ui.safeSetText('usuarioError', textoError(e));
            return;
        }
        const dir = direccionApp();
        accesos = nuevas.map(({ u, clave }) => {
            u.clave_temporal = true;
            const a = { nombre: u.nombre, correo: u.correo, rol: u.rol, clave, tipo: 'temporal' };
            return { ...a, mensaje: U.mensaje(a, dir) };
        });
        guardados = false;
        U.pintar();
        mostrarAccesos();
    };

    U.accesosCsv = () => csv(['correo', 'nombre', 'rol', 'clave', 'mensaje'], accesos.map(a => [a.correo, a.nombre, ROL[a.rol] || a.rol, a.clave, a.mensaje]));
    const archivoAccesos = () => `accesos-segmentapp-${hoy()}.csv`;

    function mostrarAccesos() {
        const puedeCompartir = !!(navigator.canShare && typeof File !== 'undefined'
            && navigator.canShare({ files: [new File(['x'], 'a.csv', { type: 'text/csv' })] }));
        abrir(`${fmt(accesos.length)} ${accesos.length === 1 ? 'clave temporal creada' : 'claves temporales creadas'}`, `
            <p class="text-sm text-slate-700">Envía a cada persona su mensaje. <b>Descarga el archivo antes de cerrar</b>: las claves no se vuelven a mostrar.</p>
            <div class="flex flex-wrap gap-2 mt-4">
                <button type="button" class="boton-lleno" data-accion="descargar-accesos" onclick="App.usuarios.descargarAccesos()"><span class="material-symbols-outlined text-[18px]">download</span> Descargar accesos</button>
                ${puedeCompartir ? '<button type="button" class="boton-tonal" data-accion="compartir-accesos" onclick="App.usuarios.compartirAccesos()"><span class="material-symbols-outlined text-[18px]">share</span> Compartir archivo</button>' : ''}
                <button type="button" class="boton-tonal" data-accion="copiar-todos" onclick="App.usuarios.copiarTodos()"><span class="material-symbols-outlined text-[18px]">content_copy</span> Copiar todos</button>
            </div>
            <ul id="usuarioAccesos" class="divide-y divide-slate-100 mt-4 max-h-[45vh] overflow-y-auto">${accesos.map((a, i) => `
                <li class="flex items-center gap-2 py-2.5">
                    <div class="min-w-0 flex-1"><div class="text-sm font-semibold text-slate-800 truncate">${esc(a.nombre)}</div>
                        <div class="text-xs text-slate-600 truncate">${esc(a.correo)} · <b class="text-slate-900">${esc(a.clave)}</b></div></div>
                    <button type="button" class="boton-icono" title="Copiar mensaje" aria-label="Copiar el mensaje de ${esc(a.nombre)}" onclick="App.usuarios.copiarUno(${i})"><span class="material-symbols-outlined">content_copy</span></button>
                    <button type="button" class="boton-icono" title="Enviar por WhatsApp" aria-label="Enviar por WhatsApp a ${esc(a.nombre)}" onclick="App.usuarios.whatsappUno(${i})"><span class="material-symbols-outlined">send</span></button>
                </li>`).join('')}</ul>
            <div class="flex justify-end mt-4"><button type="button" class="boton-texto" onclick="App.usuarios.cerrarAccesos()">Listo</button></div>`);
    }

    const copiarTexto = async (texto) => {
        try { await navigator.clipboard.writeText(texto); return true; } catch (e) { return false; }
    };
    U.descargarAccesos = function() {
        if (!accesos.length) return;
        descargar(archivoAccesos(), U.accesosCsv());
        guardados = true;
        toast('Archivo descargado. Tiene claves: no lo reenvíes a nadie más y bórralo cuando termines.');
    };
    U.compartirAccesos = async function() {
        if (!accesos.length) return;
        try {
            await navigator.share({ title: 'Accesos SegmentApp', files: [new File([U.accesosCsv()], archivoAccesos(), { type: 'text/csv' })] });
            guardados = true;
        } catch (e) { /* la persona canceló */ }
    };
    U.copiarTodos = async function() {
        const ok = await copiarTexto(accesos.map(a => a.mensaje).join('\n\n'));
        toast(ok ? `${fmt(accesos.length)} mensajes copiados.` : 'No se pudo copiar. Usa "Descargar accesos".');
    };
    U.copiarUno = async function(i) {
        const a = accesos[i];
        if (!a) return;
        const ok = await copiarTexto(a.mensaje);
        toast(ok ? `Mensaje de ${a.nombre} copiado.` : 'No se pudo copiar. Usa "Descargar accesos".');
    };
    U.whatsappUno = function(i) {
        const a = accesos[i];
        if (a) window.open(`https://wa.me/?text=${encodeURIComponent(a.mensaje)}`, '_blank', 'noopener');
    };
    U.cerrarAccesos = function() {
        if (accesos.length && !guardados
            && !window.confirm('Todavía no descargaste el archivo con las claves. Si cierras, no se vuelven a mostrar. ¿Cerrar de todos modos?')) return;
        accesos = [];
        U.cerrar();
    };

    console.log('[SegmentApp] usuarios.js cargado.');
})();

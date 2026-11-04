/* ============================================================
   SegmentApp - Avisos (campanita) · Fase 9C
   Archivo: js/avisos.js
   Para GD, Gerente Nacional y administrador. Avisa cuando:
   - un visitador evalúa médicos (agrupado por visitador y día),
   - un visitador evaluó a TODOS sus médicos 🎉,
   - hay visitadores que llevan 7 días o más sin evaluar,
   - una evaluación no coincide con CloseUp (alerta),
   - (solo admin) ya toca cargar CloseUp o el fichero: la versión de hoy
     tiene más días que los configurados (Fase 12E; 90 = cada trimestre).
   Los avisos se arman con las evaluaciones que la persona ya puede
   ver (el GD, solo su distrito). Cada 2 minutos, con la app abierta y
   con internet, se traen SOLO las evaluaciones nuevas o cambiadas.
   "Visto hasta" se guarda en el servidor (migración 12), así la
   campanita marca lo mismo en el teléfono y en la computadora.
============================================================ */

window.App = window.App || {};

(function() {
    window.App.avisos = { lista: [], vistoHasta: 0, _cargado: false };

    const escV = (v) => window.App.ui.escapeHtml(v);
    const fmtV = (n) => window.App.ui.formatNumber(n || 0);
    const nomV = (n) => window.App.ui.nombreVisible(n);
    const argV = (v) => escV(JSON.stringify(String(v == null ? '' : v)));
    const DIA = 86400000;
    const DIAS_ATRAS = 14;
    const CADA = 2 * 60 * 1000;
    const claveLocal = () => `SEGMENTAPP_AVISOS_${window.App.state.usuarioId || 'x'}`;
    const aplica = () => window.App.state.isAdmin && !window.App.state.verComo;

    /* ============================================================
       ARMAR LOS AVISOS
    ============================================================ */
    const diaDe = (t) => { const d = new Date(t); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; };
    const lista = (nombres, total) => {
        const n = nombres.slice(0, 2).map(x => `<b>${escV(nomV(x))}</b>`);
        const resto = total - n.length;
        return n.join(n.length === 2 && !resto ? ' y ' : ', ') + (resto > 0 ? ` y ${fmtV(resto)} más` : '');
    };

    window.App.avisos.generar = function() {
        if (!window.App.equipo) return [];
        const e = window.App.equipo.estadisticas();
        const ahora = Date.now(), desde = ahora - DIAS_ATRAS * DIA;
        const avisos = [];

        // 1) Evaluaciones: un aviso por visitador y día
        e.vms.forEach(v => {
            const porDia = new Map();
            v.evals.forEach(ev => {
                const t = Date.parse(ev.timestamp);
                if (!t || t < desde) return;
                const k = diaDe(t);
                const g = porDia.get(k) || { t: 0, medicos: [] };
                g.t = Math.max(g.t, t);
                if (!g.medicos.includes(ev.medico_name)) g.medicos.push(ev.medico_name);
                porDia.set(k, g);
            });
            porDia.forEach(g => avisos.push({
                tipo: 'evaluacion', t: g.t, vm: v.nombre, icono: 'rate_review', color: 'bg-blue-50 text-blue-800',
                texto: `<b>${escV(nomV(v.nombre))}</b> evaluó ${g.medicos.length === 1 ? 'a ' + lista(g.medicos, 1) : `a ${fmtV(g.medicos.length)} médicos: ${lista(g.medicos, g.medicos.length)}`}`
            }));
            // 2) Terminó todo su fichero
            if (v.fichero.size && v.pct >= 100 && v.ultima && v.ultima >= desde) avisos.push({
                tipo: 'completo', t: v.ultima, vm: v.nombre, icono: 'emoji_events', color: 'bg-green-50 text-green-800',
                texto: `🎉 <b>${escV(nomV(v.nombre))}</b> evaluó a todos sus médicos (${fmtV(v.fichero.size)})`
            });
        });

        // 3) Visitadores sin evaluar en 7 días o más (un solo aviso)
        const quietos = e.vms.filter(v => !v.fueraMetricas && v.fichero.size && v.pct < 100 && v.ultima && v.dias >= 7).sort((a, b) => b.dias - a.dias);
        if (quietos.length) avisos.push({
            tipo: 'inactivo', t: Math.max(...quietos.map(v => v.ultima + 7 * DIA)), icono: 'schedule', color: 'bg-amber-50 text-amber-800',
            texto: `${quietos.slice(0, 2).map(v => `<b>${escV(nomV(v.nombre))}</b> (${fmtV(v.dias)} días)`).join(', ')}${quietos.length > 2 ? ` y ${fmtV(quietos.length - 2)} más` : ''} ${quietos.length === 1 ? 'lleva' : 'llevan'} 7 días o más sin evaluar`
        });

        // 4) Alertas: evaluaciones que no coinciden con CloseUp (por visitador y día)
        const alertas = new Map();
        e.alertas.forEach(a => {
            const t = Date.parse(a.ev.timestamp);
            if (!t || t < desde) return;
            const k = a.vm + '|' + diaDe(t);
            const g = alertas.get(k) || { t: 0, vm: a.vm, n: 0, graves: 0 };
            g.t = Math.max(g.t, t); g.n++; if (a.distancia === 2) g.graves++;
            alertas.set(k, g);
        });
        alertas.forEach(g => avisos.push({
            tipo: 'alerta', t: g.t, vm: g.vm, icono: 'warning', color: g.graves ? 'bg-rose-50 text-rose-800' : 'bg-amber-50 text-amber-800',
            texto: `${g.n === 1 ? 'Una evaluación' : fmtV(g.n) + ' evaluaciones'} de <b>${escV(nomV(g.vm))}</b> no ${g.n === 1 ? 'coincide' : 'coinciden'} con CloseUp${g.graves ? ` (${g.graves === 1 ? 'una muy distinta' : fmtV(g.graves) + ' muy distintas'})` : ''}`
        }));

        // 5) Los lunes: el resumen de la semana está listo para compartir (Fase 12G)
        const lunes = new Date(ahora); lunes.setHours(8, 0, 0, 0);
        lunes.setDate(lunes.getDate() - ((lunes.getDay() + 6) % 7));   // el lunes de esta semana, 8:00
        if (ahora < lunes.getTime()) lunes.setDate(lunes.getDate() - 7);   // lunes antes de las 8: el de la semana pasada
        if (e.vms.length) avisos.push({ tipo: 'resumen', t: lunes.getTime(), icono: 'summarize', color: 'bg-blue-50 text-blue-800',
            texto: 'El <b>resumen de la semana</b> está listo para compartir con tu equipo por WhatsApp. Tócalo para verlo.' });

        // 6) Médicos con la misma matrícula y otro nombre en CloseUp y el fichero (Fase 12I), desde la versión de recetas de hoy
        const nombres = window.App.data.nombresDistintos ? window.App.data.nombresDistintos() : [];
        const distintos = nombres.filter(x => x.nivel === 'distinto').length;
        const vRec = window.App.state.VERSIONES_EN_USO && window.App.state.VERSIONES_EN_USO.recetas;
        const desdeRec = vRec ? Date.parse(vRec.publicado_en || vRec.creado_en || '') : 0;
        if (nombres.length) avisos.push({ tipo: 'nombres', t: desdeRec || ahora - DIA, icono: 'badge', color: distintos ? 'bg-amber-50 text-amber-800' : 'bg-slate-100 text-slate-700',
            texto: `${distintos ? `<b>${fmtV(distintos)}</b> médicos tienen la misma matrícula pero <b>otro nombre</b> en CloseUp y en el fichero` : 'Hay médicos con un nombre parecido entre CloseUp y el fichero'}${nombres.length - distintos ? ` (y ${fmtV(nombres.length - distintos)} parecidos)` : ''}. Tócalo para revisarlos.` });

        // 7) Solo el admin: recordatorio de carga (la versión de hoy ya tiene sus días)
        window.App.avisos.recordatorios(ahora).forEach(a => avisos.push(a));

        avisos.sort((a, b) => (b.fijo ? 1 : 0) - (a.fijo ? 1 : 0) || b.t - a.t);
        window.App.avisos.lista = avisos.slice(0, 40);
        return window.App.avisos.lista;
    };

    // Límites del plan gratis de Supabase (si se cambia de plan, se ajustan aquí)
    window.App.avisos.LIMITES = { base: 500 * 1024 * 1024, archivos: 1024 * 1024 * 1024 };
    window.App.avisos.usoEspacio = function(e) {
        if (!e) return null;
        const L = window.App.avisos.LIMITES;
        const base = (e.base_bytes || 0) / L.base * 100, archivos = (e.archivos_bytes || 0) / L.archivos * 100;
        return { base, archivos, mayor: Math.max(base, archivos) };
    };
    const NOMBRE_FUENTE = { recetas: 'CloseUp', fichero: 'el fichero médico' };
    window.App.avisos.recordatorios = function(ahora = Date.now()) {
        const st = window.App.state;
        if (st.rolReal !== 'admin') return [];
        const dias = st.RECORDATORIO_CARGAS || {};
        return ['recetas', 'fichero'].map(tipo => {
            const cada = Number(dias[tipo]);
            const v = (st.VERSIONES || []).find(x => x.tipo === tipo && x.es_vigente);
            if (!v || !(cada > 0)) return null;
            const base = Date.parse(v.publicado_en || v.creado_en || v.fecha);
            if (!base) return null;
            const vence = base + cada * DIA;
            if (ahora < vence) return null;
            const hace = Math.floor((ahora - base) / DIA);
            return { tipo: 'recordatorio', fuente: tipo, fijo: true, t: vence, icono: 'event_upcoming', color: 'bg-indigo-50 text-indigo-800',
                texto: `Toca cargar <b>${NOMBRE_FUENTE[tipo]}</b>: la versión de hoy (${escV(v.nombre)}) se cargó hace ${fmtV(hace)} días. Toca aquí para cargar la nueva.` };
        }).filter(Boolean).concat(avisoEspacio());
    };
    // Aviso diario mientras el espacio pase del 80% del plan
    const avisoEspacio = () => {
        const u = window.App.avisos.usoEspacio(window.App.avisos._espacio);
        if (!u || u.mayor < 80) return [];
        const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
        const que = u.base >= u.archivos ? `la base de datos (${Math.round(u.base)}%)` : `los archivos guardados (${Math.round(u.archivos)}%)`;
        return [{ tipo: 'espacio', fijo: true, t: hoy.getTime(), icono: 'database', color: u.mayor >= 95 ? 'bg-rose-50 text-rose-800' : 'bg-amber-50 text-amber-800',
            texto: `El espacio de Supabase está casi lleno: ${que} del plan gratis. Revisa Ajustes → Salud de los datos.` }];
    };

    window.App.avisos.sinLeer = () => window.App.avisos.lista.filter(a => a.t > window.App.avisos.vistoHasta).length;

    /* ============================================================
       CAMPANITA Y PANEL
    ============================================================ */
    window.App.avisos.actualizar = function() {
        const btn = document.getElementById('btnAvisos');
        if (!btn) return;
        const ver = aplica();
        btn.classList.toggle('hidden', !ver);
        btn.classList.toggle('flex', ver);
        if (!ver) return;
        window.App.avisos.generar();
        const n = window.App.avisos.sinLeer();
        const num = document.getElementById('avisosNumero');
        num.textContent = n > 99 ? '99+' : String(n);
        num.classList.toggle('hidden', !n);
        num.classList.toggle('flex', !!n);
        btn.setAttribute('aria-label', n ? `Avisos: ${n} sin leer` : 'Avisos');
        if (!document.getElementById('panelAvisos').classList.contains('hidden')) window.App.avisos.renderPanel();
    };

    const hace = (t) => {
        const m = Math.round((Date.now() - t) / 60000);
        if (m < 1) return 'ahora';
        if (m < 60) return `hace ${m} min`;
        const h = Math.round(m / 60);
        if (h < 24) return `hace ${h} h`;
        const d = Math.round(h / 24);
        return d === 1 ? 'ayer' : `hace ${d} días`;
    };

    window.App.avisos.renderPanel = function() {
        const zona = document.getElementById('avisosLista');
        const avisos = window.App.avisos.lista;
        const n = window.App.avisos.sinLeer();
        window.App.ui.safeSetText('avisosSubtitulo', n ? `${fmtV(n)} sin leer · últimos ${DIAS_ATRAS} días` : `Al día · últimos ${DIAS_ATRAS} días`);
        document.getElementById('btnAvisosLeidos').classList.toggle('invisible', !n);
        zona.innerHTML = avisos.length ? avisos.map((a, i) => {
            const nuevo = a.t > window.App.avisos.vistoHasta;
            return `<li><button type="button" class="w-full text-left flex gap-3 px-4 py-3 ${nuevo ? 'bg-blue-50/60' : ''}" onclick="App.avisos.ir(${i})">
                <span class="w-10 h-10 rounded-full ${a.color} flex items-center justify-center shrink-0"><span class="material-symbols-outlined text-[20px]">${a.icono}</span></span>
                <span class="flex-1 min-w-0"><span class="block text-sm text-slate-800 leading-snug">${a.texto}</span>
                    <span class="block text-[11px] text-slate-500 mt-0.5">${hace(a.t)}</span></span>
                ${nuevo ? '<span class="w-2.5 h-2.5 rounded-full bg-blue-600 mt-1.5 shrink-0" aria-label="Sin leer"></span>' : ''}
            </button></li>`;
        }).join('') : `<li class="px-5 py-10 text-center text-sm text-slate-500"><span class="material-symbols-outlined text-4xl block mb-2 text-slate-400">notifications_off</span>Sin avisos en los últimos ${DIAS_ATRAS} días.</li>`;
    };

    window.App.avisos.abrir = function() {
        window.App.avisos.generar();
        window.App.avisos.renderPanel();
        document.getElementById('panelAvisos').classList.remove('hidden');
    };
    window.App.avisos.cerrar = function() {
        document.getElementById('panelAvisos')?.classList.add('hidden');
    };

    // Tocar un aviso lleva a donde está el detalle
    window.App.avisos.ir = function(i) {
        const a = window.App.avisos.lista[i];
        window.App.avisos.cerrar();
        if (!a) return;
        if (a.tipo === 'recordatorio') { window.App.carga.abrirPanel('nueva'); return; }
        if (a.tipo === 'nombres') { window.App.ajustes.verNombres(); return; }
        if (a.tipo === 'resumen') { window.App.ux.irA('equipo'); window.App.equipo.abrirResumen(); return; }
        if (a.tipo === 'espacio') { window.App.ux.irA('ajustes'); window.App.ajustes.irA && window.App.ajustes.irA('ajSalud'); return; }
        window.App.ux.irA('equipo');
        if (a.tipo === 'alerta') { window.App.equipo.verVista('alertas'); return; }
        window.App.equipo.verVista('visitadores');
        if (a.vm) {
            const vm = window.App.equipo.estadisticas().vms.find(v => v.nombre === a.vm);
            if (vm && window.App.state.rolReal !== 'gd') window.App.equipo.elegirDistrito(vm.gerente);
            if (window.App.equipo.irAVisitador) window.App.equipo.irAVisitador(a.vm);
            setTimeout(() => {
                const tarjeta = [...document.querySelectorAll('#equipoContenido article')].find(t => t.textContent.includes(nomV(a.vm)));
                if (tarjeta) { tarjeta.querySelector('button[aria-expanded]')?.click(); tarjeta.scrollIntoView && tarjeta.scrollIntoView({ block: 'center' }); }
            }, 50);
        }
    };

    window.App.avisos.marcarLeidos = async function() {
        const st = window.App.state;
        const ahora = new Date();
        window.App.avisos.vistoHasta = ahora.getTime();
        try { localStorage.setItem(claveLocal(), String(ahora.getTime())); } catch (e) { /* sin almacenamiento */ }
        window.App.avisos.actualizar();
        window.App.avisos.renderPanel();
        try { await window.App.sb.marcarAvisosVistos(st.usuarioId, ahora.toISOString()); }
        catch (e) { console.error('[SegmentApp] No se pudo guardar "visto hasta":', e); }   // queda guardado en este equipo
    };

    /* ============================================================
       INICIO DE SESIÓN Y EVALUACIONES NUEVAS CADA 2 MINUTOS
    ============================================================ */
    window.App.avisos.alEntrar = async function() {
        const st = window.App.state;
        window.App.avisos._cargado = false;
        if (!aplica()) { window.App.avisos.actualizar(); return; }
        // Lo guardado en este equipo; luego lo del servidor (el más reciente gana)
        let visto = 0;
        try { visto = Number(localStorage.getItem(claveLocal())) || 0; } catch (e) { /* sin almacenamiento */ }
        // Primera vez: se empieza "al día" (no aparecen como nuevos los avisos viejos)
        if (!visto) visto = Date.now() - DIA;
        window.App.avisos.vistoHasta = visto;
        window.App.avisos.actualizar();
        // Solo el admin: cuánto espacio se usa (para el aviso de "casi lleno")
        if (st.rolReal === 'admin' && window.App.sb.espacio) {
            window.App.sb.espacio().then(e => { window.App.avisos._espacio = e; window.App.avisos.actualizar(); }).catch(() => { /* sin la migración 20 o sin conexión */ });
        }
        try {
            const delServidor = await window.App.sb.avisosVistos(st.usuarioId);
            const t = delServidor ? Date.parse(delServidor) : 0;
            if (t > window.App.avisos.vistoHasta) window.App.avisos.vistoHasta = t;
            window.App.avisos.actualizar();
        } catch (e) { /* sin conexión o sin la migración 12: se usa lo de este equipo */ }
        window.App.avisos._cargado = true;
    };

    // Trae solo lo nuevo y lo mezcla con lo que ya está en memoria
    window.App.avisos.buscarNuevas = async function() {
        const st = window.App.state;
        if (!aplica() || !navigator.onLine || document.hidden || window.App.avisos._buscando) return 0;
        const ultimas = (st.ALL_EVALUATIONS || []).map(e => e.timestamp).filter(Boolean).sort();
        const desde = ultimas.length ? ultimas[ultimas.length - 1] : new Date(Date.now() - DIAS_ATRAS * DIA).toISOString();
        window.App.avisos._buscando = true;
        let nuevas = 0;
        try {
            const cambios = await window.App.sb.evaluacionesDesde(desde);
            if (!cambios.length) return 0;
            const lista = st.ALL_EVALUATIONS.slice();
            window.App.data.sinOcultos(cambios).forEach(c => {
                const i = lista.findIndex(e => e.id === c.id || e.firebaseId === c.firebaseId);
                if (c.eliminado) { if (i >= 0) lista.splice(i, 1); return; }
                const { eliminado, ...ev } = c;
                if (i >= 0) lista[i] = ev; else { lista.push(ev); nuevas++; }
            });
            st.ALL_EVALUATIONS = lista;
            window.App.evaluation.marcarCambio();
            st._lastUniverseSignature = null;
            if (window.localforage) localforage.setItem('EQUIPO_EVALS_CACHE', st.ALL_EVALUATIONS);
            window.App.matrix.aggregateAndCalculate();
            if (window.App.admin) window.App.admin.renderAdminDashboard();
            const antes = window.App.avisos.sinLeer();
            window.App.avisos.actualizar();
            if (window.App.avisos.sinLeer() > antes) {
                window.App.ui.showToast(nuevas === 1 ? 'Hay 1 evaluación nueva de tu equipo.' : `Hay ${fmtV(Math.max(nuevas, 1))} evaluaciones nuevas de tu equipo.`,
                    { accion: 'Ver', alAccionar: window.App.avisos.abrir });
            }
            return nuevas;
        } catch (e) {
            console.error('[SegmentApp] Evaluaciones nuevas:', e);
            return 0;
        } finally {
            window.App.avisos._buscando = false;
        }
    };

    setInterval(() => { if (typeof window !== 'undefined' && window.App && window.App.avisos) window.App.avisos.buscarNuevas(); }, CADA);
    document.addEventListener('visibilitychange', () => { if (!document.hidden && window.App.avisos) window.App.avisos.buscarNuevas(); });
})();

console.log('[SegmentApp] avisos.js cargado.');

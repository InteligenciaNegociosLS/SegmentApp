/* ============================================================
   SegmentApp - Selector de versión de datos
   Archivo: js/versiones.js
   Cualquier usuario con sesión puede ver los datos de "Hoy"
   (la versión vigente) o de una versión anterior publicada.
   Solo cambia lo que ve esta persona en esta pestaña; no afecta
   a nadie más.
============================================================ */

window.App = window.App || {};
window.App.versiones = {};

function escV(t) {
    return String(t == null ? '' : t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

/* Texto del botón de la barra superior: "Datos: Hoy" o "Datos: <nombre>" */
window.App.versiones.actualizarEtiqueta = function() {
    const st = window.App.state;
    const etiqueta = document.getElementById('lblVersionDatos');
    const btn = document.getElementById('btnVersionDatos');
    if (!etiqueta || !btn) return;
    const enUso = st.VERSIONES_EN_USO || {};
    const historica = ['recetas', 'fichero'].some(t => enUso[t] && !enUso[t].es_vigente);
    etiqueta.textContent = historica ? 'Datos: versión anterior' : 'Datos: Hoy';
    btn.classList.toggle('bg-amber-50', historica);
    btn.classList.toggle('text-amber-800', historica);
    btn.classList.toggle('border-amber-200', historica);
    btn.title = historica
        ? 'Estás viendo una versión anterior de los datos. Toca para cambiar.'
        : 'Estás viendo los datos vigentes. Toca para ver una versión anterior.';
};

window.App.versiones.abrir = async function() {
    const st = window.App.state;
    const modal = document.getElementById('versionModal');
    const zona = document.getElementById('versionModalCuerpo');
    modal.classList.remove('hidden');
    zona.innerHTML = '<div class="p-6 text-center text-indigo-600 font-bold">Cargando versiones…</div>';
    let versiones = st.VERSIONES || [];
    try {
        versiones = await window.App.sb.versiones();
        st.VERSIONES = versiones;
    } catch (e) {
        console.error('[SegmentApp] No se pudo actualizar la lista de versiones:', e);
    }
    const enUso = st.VERSIONES_EN_USO || {};
    const selector = (tipo, titulo) => {
        const publicadas = versiones.filter(v => v.tipo === tipo && v.estado === 'publicado' && v.archivo);
        if (!publicadas.length) return `<div class="mb-4"><div class="text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">${titulo}</div><div class="text-xs text-slate-400 italic">Sin versiones publicadas.</div></div>`;
        const actual = enUso[tipo] && enUso[tipo].id;
        return `<label class="block mb-4"><span class="text-xs font-bold text-slate-600 uppercase tracking-wider mb-2 block">${titulo}</span>
            <select id="versionSel_${tipo}" class="w-full border border-slate-300 rounded-xl p-3 text-sm bg-white focus:ring-2 focus:ring-indigo-500 outline-none">
                ${publicadas.map(v => `<option value="${escV(v.id)}" data-vigente="${v.es_vigente ? 1 : 0}" ${v.id === actual ? 'selected' : ''}>${v.es_vigente ? '(Hoy) ' : ''}${escV(v.nombre)} · corte ${escV(v.fecha)}</option>`).join('')}
            </select></label>`;
    };
    zona.innerHTML = selector('recetas', 'Recetas (CloseUp)') + selector('fichero', 'Fichero médico')
        + '<p class="text-[11px] text-slate-500 leading-relaxed">Elegir una versión anterior solo cambia lo que ves tú, en esta pestaña. Al cerrar la pestaña vuelves a "Hoy".</p>';
};

window.App.versiones.cerrar = function() {
    document.getElementById('versionModal').classList.add('hidden');
};

window.App.versiones.aplicar = async function() {
    ['recetas', 'fichero'].forEach(tipo => {
        const sel = document.getElementById(`versionSel_${tipo}`);
        if (!sel) return;
        const opcion = sel.options[sel.selectedIndex];
        // La vigente no se "fija": así, cuando el admin publique otra, se verá la nueva
        window.App.data.elegirVersion(tipo, opcion && opcion.dataset.vigente === '1' ? null : sel.value);
    });
    window.App.versiones.cerrar();
    await window.App.main.reintentarCarga();
};

window.App.versiones.volverAHoy = async function() {
    window.App.data.elegirVersion('recetas', null);
    window.App.data.elegirVersion('fichero', null);
    window.App.versiones.cerrar();
    await window.App.main.reintentarCarga();
};

/* ============================================================
   ALIAS GLOBALES
============================================================ */
window.abrirVersiones = window.App.versiones.abrir;

console.log('[SegmentApp] versiones.js cargado.');

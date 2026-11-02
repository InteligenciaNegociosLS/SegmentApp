/* ============================================================
   SegmentApp - Comparativos
   Archivo: js/comparar.js
   1. Movimientos: qué médicos cambiaron de cuadrante respecto a la
      versión de recetas anterior (con los MISMOS filtros y umbrales).
   2. Tendencia: cuánto subió o bajó la participación de La Santé.
   3. Concordancia: cuántos médicos clasifica igual CloseUp que la
      encuesta del visitador.
   No cambia ningún cálculo de la matriz: usa la misma regla
   (App.matrix.calcularMedicos) sobre la versión anterior.
============================================================ */

window.App = window.App || {};
window.App.comparar = { estado: null };

const escC = (v) => window.App.ui.escapeHtml(v);
const fmtC = (n, d = 0) => window.App.ui.formatNumber(n || 0, d);

// Puntaje de un cuadrante: pesa más la adopción (lo que el visitador puede mover)
const VALOR_LETRA = { A: 2, B: 1, C: 0 };
function puntaje(etiqueta) {
    const m = String(etiqueta || '').match(/^([ABC])([+-]?)$/);
    if (!m) return null;
    const adopcion = m[2] === '+' ? 2 : (m[2] === '-' ? 0 : 1);
    return adopcion * 3 + VALOR_LETRA[m[1]];
}
window.App.comparar.puntaje = puntaje;

/* ---------- Versión anterior ---------- */
window.App.comparar.versionAnterior = function() {
    const st = window.App.state;
    const actual = st.VERSIONES_EN_USO && st.VERSIONES_EN_USO.recetas;
    if (!actual) return null;
    const antes = (st.VERSIONES || []).filter(v => v.tipo === 'recetas' && v.estado === 'publicado' && v.archivo && v.id !== actual.id
        && (v.fecha < actual.fecha || (v.fecha === actual.fecha && String(v.creado_en) < String(actual.creado_en))));
    antes.sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)) || String(b.creado_en).localeCompare(String(a.creado_en)));
    return antes[0] || null;
};

const esModoEquipo = () => !['admin', 'gte_nacional'].includes(window.App.state.rolReal);

// automatico: al entrar (VM y GD, pocos KB). El admin la pide con un botón (archivo completo).
window.App.comparar.cargar = async function(automatico = false) {
    const st = window.App.state;
    const previa = window.App.comparar.versionAnterior();
    if (!previa) { window.App.comparar.estado = { sinAnterior: true }; window.App.comparar.render(); return; }
    if (automatico && !esModoEquipo()) {
        window.App.comparar.estado = { version: previa, pendiente: true };
        window.App.comparar.render();
        return;
    }
    window.App.comparar.estado = { version: previa, cargando: true };
    window.App.comparar.render();
    try {
        let filas;
        if (esModoEquipo()) {
            const fichero = st.VERSIONES_EN_USO.fichero ? st.VERSIONES_EN_USO.fichero.id : null;
            const paquete = await window.App.sb.datosEquipo(previa.id, fichero);
            filas = window.App.data.convertirRecetas(window.App.data.filasDelPaquete(paquete));
        } else {
            const url = await window.App.sb.urlArchivo(previa.archivo);
            filas = window.App.data.convertirRecetas(await window.App.data.fetchFileAsJson(url, 'la versión anterior'));
        }
        window.App.comparar.estado = { version: previa, filas };
        window.App.matrix.aggregateAndCalculate();   // vuelve a dibujar con movimientos y tendencias
    } catch (e) {
        console.error('[SegmentApp] No se pudo cargar la versión anterior:', e);
        window.App.comparar.estado = { version: previa, error: true };
        window.App.comparar.render();
    }
};

/* ---------- Se llama cada vez que la matriz se recalcula ---------- */
window.App.comparar.alRecalcular = function() {
    const st = window.App.state;
    const est = window.App.comparar.estado;
    const docs = st.PROCESSED_DATA || [];
    docs.forEach(d => { d.movimiento = null; d.antes = null; d.deltaShare = null; });
    if (est && est.filas) {
        const r = window.App.matrix.calcularMedicos(est.filas, false);
        const previos = new Map(r.doctors.filter(d => !d.isZeroRx).map(d => [d.id, d]));
        const resumen = { mejor: 0, peor: 0, igual: 0, nuevo: 0, salieron: 0 };
        const actuales = new Set();
        docs.forEach(d => {
            if (d.isZeroRx) return;
            actuales.add(d.id);
            const p = previos.get(d.id);
            if (!p) { d.movimiento = 'nuevo'; resumen.nuevo++; return; }
            d.antes = p.closeupLabel;
            d.deltaShare = d.share - p.share;
            const a = puntaje(p.closeupLabel), b = puntaje(d.closeupLabel);
            d.movimiento = a === b ? 'igual' : (b > a ? 'mejor' : 'peor');
            resumen[d.movimiento]++;
        });
        previos.forEach((p, id) => { if (!actuales.has(id)) resumen.salieron++; });
        const totalAntes = r.grandTotalRx;
        const phqAntes = r.doctors.reduce((s, d) => s + (d.isZeroRx ? 0 : d.rxPhq), 0);
        est.resumen = resumen;
        est.previos = previos;   // por médico: lo usa la pantalla Equipo para la tendencia de cada VM
        est.kpis = { totalRx: totalAntes, rxPhq: phqAntes, share: totalAntes ? phqAntes / totalAntes * 100 : 0, medicos: previos.size };
    }
    window.App.comparar.render();
};

/* ---------- Concordancia CloseUp vs encuesta ---------- */
window.App.comparar.concordancia = function() {
    const docs = (window.App.state.PROCESSED_DATA || []).filter(d => !d.isZeroRx && d.surveyLabel && d.surveyLabel !== 'N/A');
    const r = { total: docs.length, iguales: 0, encuestaMejor: 0, encuestaPeor: 0 };
    docs.forEach(d => {
        const a = puntaje(d.closeupLabel), b = puntaje(d.surveyLabel);
        if (a === b) r.iguales++; else if (b > a) r.encuestaMejor++; else r.encuestaPeor++;
    });
    return r;
};

/* ---------- Dibujo ---------- */
function delta(actual, antes, decimales, sufijo) {
    if (antes == null) return '';
    const dlt = actual - antes;
    if (Math.abs(dlt) < Math.pow(10, -decimales) / 2) return `<span class="tendencia igual">= sin cambio</span>`;
    return `<span class="tendencia ${dlt > 0 ? 'sube' : 'baja'}">${dlt > 0 ? '▲' : '▼'} ${fmtC(Math.abs(dlt), decimales)}${sufijo}</span>`;
}

window.App.comparar.render = function() {
    const st = window.App.state;
    const est = window.App.comparar.estado;
    const zona = document.getElementById('tarjetaMovimientos');
    if (zona) {
        let html;
        if (!est || est.sinAnterior) {
            html = `<div class="text-sm font-bold text-slate-800 flex items-center gap-2"><span class="material-symbols-outlined text-[20px] text-blue-700">swap_vert</span> Movimientos</div>
                <p class="text-xs text-slate-500 mt-2">Cuando se publique una nueva versión de recetas verás aquí qué médicos subieron o bajaron de cuadrante respecto al mes anterior.</p>`;
        } else if (est.pendiente || est.error) {
            html = `<div class="text-sm font-bold text-slate-800 flex items-center gap-2"><span class="material-symbols-outlined text-[20px] text-blue-700">swap_vert</span> Movimientos</div>
                <p class="text-xs text-slate-500 mt-2">${est.error ? 'No se pudo cargar la versión anterior. ' : ''}Compara con <b>${escC(est.version.nombre)}</b> para ver qué médicos cambiaron de cuadrante.</p>
                <button class="mt-3 px-4 py-2 rounded-full bg-blue-50 text-blue-800 text-sm font-bold" onclick="App.comparar.cargar(false)">Comparar</button>`;
        } else if (est.cargando) {
            html = `<div class="text-sm font-bold text-slate-800">Movimientos</div><p class="text-xs text-slate-500 mt-2">Comparando con ${escC(est.version.nombre)}…</p>`;
        } else {
            const r = est.resumen || {};
            const fila = (tipo, icono, texto, n, clase) => `<button class="chip w-full justify-between ${clase}" aria-pressed="${st.FILTRO_RAPIDO === tipo}" onclick="App.ux.filtroRapido('${tipo}', true)"><span class="flex items-center gap-2"><span class="material-symbols-outlined text-[18px]">${icono}</span>${texto}</span><span class="cuenta">${fmtC(n)}</span></button>`;
            html = `<div class="text-sm font-bold text-slate-800 flex items-center gap-2"><span class="material-symbols-outlined text-[20px] text-blue-700">swap_vert</span> Movimientos <span class="text-xs font-medium text-slate-500">desde ${escC(est.version.nombre)}</span></div>
                <div class="grid grid-cols-2 gap-2 mt-3">
                    ${fila('mejoraron', 'trending_up', 'Mejoraron', r.mejor, 'mov-mejor')}
                    ${fila('bajaron', 'trending_down', 'Bajaron', r.peor, 'mov-peor')}
                </div>
                <p class="text-[11px] text-slate-500 mt-2">${fmtC(r.igual)} sin cambio · ${fmtC(r.nuevo)} nuevos con recetas${r.salieron ? ` · ${fmtC(r.salieron)} sin recetas ahora` : ''}</p>`;
        }
        zona.innerHTML = html;
    }
    // Tendencia en los indicadores
    const k = est && est.kpis;
    const docs = (st.PROCESSED_DATA || []).filter(d => !d.isZeroRx);
    const total = docs.reduce((s, d) => s + d.totalRx, 0), phq = docs.reduce((s, d) => s + d.rxPhq, 0);
    const poner = (id, html) => { const el = document.getElementById(id); if (el) el.innerHTML = html; };
    poner('tendDocs', k ? delta(docs.length, k.medicos, 0, '') : '');
    poner('tendMkt', k ? delta(total, k.totalRx, 0, '') : '');
    poner('tendPhq', k ? delta(phq, k.rxPhq, 0, '') : '');
    poner('tendShare', k ? delta(total ? phq / total * 100 : 0, k.share, 2, ' pts') : '');

    // Concordancia
    const zc = document.getElementById('tarjetaConcordancia');
    if (zc) {
        const c = window.App.comparar.concordancia();
        const pct = (n) => c.total ? Math.round(n / c.total * 100) : 0;
        zc.innerHTML = `<div class="text-sm font-bold text-slate-800 flex items-center gap-2"><span class="material-symbols-outlined text-[20px] text-blue-700">compare_arrows</span> CloseUp vs. encuesta</div>
            ${c.total ? `
            <div class="flex h-2.5 rounded-full overflow-hidden mt-3 bg-slate-100" title="De ${fmtC(c.total)} médicos evaluados">
                <span class="bg-green-600" style="width:${pct(c.iguales)}%"></span><span class="bg-blue-400" style="width:${pct(c.encuestaMejor)}%"></span><span class="bg-amber-400" style="width:${pct(c.encuestaPeor)}%"></span>
            </div>
            <div class="grid grid-cols-3 gap-2 mt-3 text-center">
                <div><div class="text-lg font-extrabold text-green-800">${fmtC(c.iguales)}</div><div class="text-[11px] text-slate-500">coinciden</div></div>
                <div><div class="text-lg font-extrabold text-blue-800">${fmtC(c.encuestaMejor)}</div><div class="text-[11px] text-slate-500">la encuesta los ve mejor</div></div>
                <div><div class="text-lg font-extrabold text-amber-800">${fmtC(c.encuestaPeor)}</div><div class="text-[11px] text-slate-500">la encuesta los ve peor</div></div>
            </div>
            <button class="chip mt-3" aria-pressed="${st.FILTRO_RAPIDO === 'discrepan'}" onclick="App.ux.filtroRapido('discrepan', true)"><span class="material-symbols-outlined text-[18px]">rule</span> Ver los que no coinciden <span class="cuenta">${fmtC(c.encuestaMejor + c.encuestaPeor)}</span></button>`
            : '<p class="text-xs text-slate-500 mt-2">Cuando haya médicos evaluados con encuesta verás aquí si su clasificación coincide con la de CloseUp.</p>'}`;
    }
};

console.log('[SegmentApp] comparar.js cargado.');

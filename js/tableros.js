/* ============================================================
   SegmentApp - Tableros del Inicio según el rol (Fase 9B)
   Archivo: js/tableros.js
   GD, Gerente Nacional y administrador:
   - Embudo de cobertura: fichero → con recetas → evaluados → potencial A
   - Mercados con más oportunidad (recetas que faltan para subir)
   (El mapa por estado y la evolución mes a mes se quitaron en la 9C:
    el dueño prefiere gráficos más fáciles de leer.)
   - Comparativo de distritos (Gerente Nacional y admin)
   - Resumen ejecutivo en PDF (una página para reuniones)
   VM:
   - Sus 10 médicos con más oportunidad
   - Su avance frente al promedio de su distrito (migración 11)
   Se dibuja solo cuando se ve el Inicio y respeta los filtros elegidos.
============================================================ */

// Todo queda dentro de esta función: sus nombres internos no chocan con los de otros archivos
(function() {
    window.App = window.App || {};
    window.App.tableros = { _pendiente: true, avance: null };

    const escT = (v) => window.App.ui.escapeHtml(v);
    const fmtT = (n, d = 0) => window.App.ui.formatNumber(n || 0, d);
    const nomT = (n) => window.App.ui.nombreVisible(n);
    const argT = (v) => escT(JSON.stringify(String(v == null ? '' : v)));
    const esEquipoT = () => window.App.state.isAdmin;
    const esNacionalT = () => ['admin', 'gte_nacional'].includes(window.App.ux ? window.App.ux.rolVisible() : window.App.state.rolReal);
    const tarjeta = (icono, titulo, cuerpo, extra = '', clase = '') => `<section class="bg-white rounded-3xl border border-slate-200 p-4 sm:p-5 ${clase}">
        <div class="flex items-center justify-between gap-2 mb-3"><h3 class="text-sm font-bold text-slate-800 flex items-center gap-2"><span class="material-symbols-outlined text-[20px] text-blue-700">${icono}</span>${titulo}</h3>${extra}</div>${cuerpo}</section>`;

    /* ============================================================
       CUÁNDO DIBUJAR
    ============================================================ */
    window.App.tableros.alRecalcular = function() {
        if (window.App.ux && window.App.ux.seVe('inicio')) window.App.tableros.render();
        else window.App.tableros._pendiente = true;
    };

    window.App.tableros.render = function() {
        const zona = document.getElementById('tablerosInicio');
        if (!zona) return;
        window.App.tableros._pendiente = false;
        const st = window.App.state;
        if (!(st.PROCESSED_DATA || []).length || st.currentUserRole === 'guest') { zona.innerHTML = ''; return; }
        if (!esEquipoT()) { zona.innerHTML = renderVm(); window.App.tableros.cargarAvance(); return; }
        const c = window.App.tableros.calcular();
        zona.innerHTML = `
            <div class="flex flex-wrap items-center justify-between gap-2 mb-3">
                <h2 class="font-display font-bold text-slate-800 text-xl">${esNacionalT() ? 'El país de un vistazo' : 'Tu distrito de un vistazo'}</h2>
                <button class="h-10 px-4 rounded-full bg-blue-700 text-white text-sm font-bold flex items-center gap-2" onclick="App.tableros.resumenPdf()"><span class="material-symbols-outlined text-[20px]">summarize</span> Resumen en PDF</button>
            </div>
            <div class="grid lg:grid-cols-2 gap-3">
                ${tarjeta('filter_alt', 'Cobertura', renderEmbudo(c))}
                ${tarjeta('trending_up', 'Mercados con más oportunidad', renderMercados(c))}
                ${esNacionalT() ? tarjeta('leaderboard', 'Distritos', renderDistritosMini(), '<button class="text-xs font-bold text-blue-700 px-3 py-1.5 rounded-full" onclick="App.ux.irA(\'equipo\'); App.equipo.verVista(\'distritos\')">Ver todo</button>', 'lg:col-span-2') : ''}
            </div>`;
    };

    /* ============================================================
       CÁLCULOS (una vez por cambio de datos)
    ============================================================ */
    let memoTab = null;

    window.App.tableros.calcular = function() {
        const st = window.App.state;
        const d = window.App.data;
        const firma = [st.PROCESSED_DATA, st._versionEvaluaciones, st.ALL_EVALUATIONS.length, st.FICHERO_MAP, st.TH_LOY_LOW, st.TH_LOY_HIGH, st.FILTER_STATE.Product];
        if (memoTab && memoTab.firma.every((v, i) => v === firma[i])) return memoTab.datos;

        const docs = st.PROCESSED_DATA || [];
        const permitido = (rep) => !st.REPS_PERMITIDOS || st.REPS_PERMITIDOS.has(rep);
        // Médicos del fichero del alcance de la persona
        let fichados = 0;
        st.FICHERO_MAP.forEach(filas => {
            if (filas.some(r => { const k = d.getFicheroRepKey(r); return k && r[k] && permitido(String(r[k]).trim().toUpperCase()); })) fichados++;
        });
        const conFichero = docs.filter(x => !x.isZeroRx && x.ficheroData && x.ficheroData.length);
        const evaluados = conFichero.filter(x => window.App.ux.estaEvaluado(x));
        const embudo = {
            fichados, conRx: conFichero.length, evaluados: evaluados.length,
            enA: evaluados.filter(x => x.closeupPotency === 'A').length,
            sinFichero: docs.filter(x => !x.isZeroRx && !(x.ficheroData && x.ficheroData.length)).length
        };

        // Oportunidad por mercado: lo que le falta a cada médico para subir de adopción EN ESE mercado
        const todos = st.FILTER_STATE.Product.length === st.FILTER_OPTIONS.Product.length;
        const elegidos = new Set(st.FILTER_STATE.Product);
        const mercados = new Map();
        docs.forEach(doc => {
            if (doc.isZeroRx) return;
            const porMk = new Map();
            (doc.rows || []).forEach(r => {
                // Igual que la matriz: cada producto de un médico cuenta una vez (su valor mayor) por mercado
                const m = porMk.get(r.market) || { total: 0, phq: 0, prods: new Map() };
                m.prods.set(r.prod, Math.max(m.prods.get(r.prod) || 0, r.rx));
                porMk.set(r.market, m);
            });
            porMk.forEach((m, mk) => {
                m.prods.forEach((rx, prod) => { m.total += rx; if (d.isPhq(prod) && (todos || elegidos.has(prod))) m.phq += rx; });
                const share = m.total ? m.phq / m.total * 100 : 0;
                let gap = 0;
                if (share < st.TH_LOY_LOW) gap = Math.ceil(m.total * st.TH_LOY_LOW / 100) - m.phq;
                else if (share < st.TH_LOY_HIGH) gap = Math.ceil(m.total * st.TH_LOY_HIGH / 100) - m.phq;
                const a = mercados.get(mk) || { mercado: mk, total: 0, phq: 0, gap: 0, medicos: 0 };
                a.total += m.total; a.phq += m.phq; a.gap += Math.max(0, gap); a.medicos++;
                mercados.set(mk, a);
            });
        });
        const listaMercados = [...mercados.values()].sort((a, b) => b.gap - a.gap);

        const datos = { embudo, mercados: listaMercados };
        memoTab = { firma, datos };
        return datos;
    };

    /* ============================================================
       EMBUDO DE COBERTURA
    ============================================================ */
    function renderEmbudo(c) {
        const e = c.embudo;
        const pasos = [
            ['Médicos en el fichero', e.fichados, 'bg-blue-700'],
            ['Con recetas en CloseUp', e.conRx, 'bg-blue-500'],
            ['Evaluados', e.evaluados, 'bg-green-600'],
            ['Evaluados de potencial alto (A)', e.enA, 'bg-green-800']
        ];
        const max = Math.max(1, ...pasos.map(p => p[1]));
        return `<ol class="space-y-2.5">${pasos.map(([t, n, color], i) => `<li>
            <div class="flex items-baseline justify-between gap-2 text-sm"><span class="text-slate-700">${t}</span>
                <span class="font-bold text-slate-800">${fmtT(n)}${i ? ` <span class="text-[11px] font-semibold text-slate-500">${fmtT(pasos[i - 1][1] ? n / pasos[i - 1][1] * 100 : 0, 0)}%</span>` : ''}</span></div>
            <div class="h-3 rounded-full bg-slate-100 mt-1 overflow-hidden"><div class="h-full rounded-full ${color}" style="width:${(n / max * 100).toFixed(1)}%"></div></div>
        </li>`).join('')}</ol>
        ${e.sinFichero ? `<p class="text-[11px] text-slate-500 mt-3">Además, ${fmtT(e.sinFichero)} médicos con recetas no están en el fichero.</p>` : ''}`;
    }

    /* ============================================================
       MERCADOS CON MÁS OPORTUNIDAD
    ============================================================ */
    function renderMercados(c) {
        const top = c.mercados.slice(0, 6);
        if (!top.length) return '<p class="text-sm text-slate-500">Sin recetas con estos filtros.</p>';
        const max = Math.max(1, ...top.map(m => m.gap));
        return `<p class="text-[11px] text-slate-500 mb-2">Recetas que faltan para que cada médico suba de adopción en ese mercado.</p>
            <ul class="space-y-2.5">${top.map(m => `<li>
            <button type="button" class="w-full text-left" onclick="App.ux.elegirMercado(${argT(m.mercado)}); App.ux.irA('matriz')" title="Ver este mercado en la matriz">
                <div class="flex items-baseline justify-between gap-2 text-sm"><span class="font-semibold text-slate-800 truncate">${escT(m.mercado)}</span><span class="font-bold text-green-800 shrink-0">+${fmtT(m.gap)} Rx</span></div>
                <div class="h-2.5 rounded-full bg-slate-100 mt-1 overflow-hidden"><div class="h-full rounded-full bg-green-600" style="width:${(m.gap / max * 100).toFixed(1)}%"></div></div>
                <div class="text-[11px] text-slate-500 mt-0.5">${fmtT(m.medicos)} médicos · La Santé ${fmtT(m.total ? m.phq / m.total * 100 : 0, 1)}% de ${fmtT(m.total)} recetas</div>
            </button></li>`).join('')}</ul>`;
    }

    /* ============================================================
       DISTRITOS (resumen para Gerente Nacional y admin)
    ============================================================ */
    function renderDistritosMini() {
        const lista = window.App.equipo ? window.App.equipo.estadisticas().distritos : [];
        if (!lista.length) return '<p class="text-sm text-slate-500">Sin distritos.</p>';
        return `<div class="grid sm:grid-cols-2 gap-x-6 gap-y-3">${lista.map(g => `
            <button type="button" class="text-left" onclick="App.ux.irA('equipo'); App.equipo.verDistrito(${argT(g.nombre)})">
                <div class="flex items-baseline justify-between gap-2 text-sm"><span class="font-semibold text-slate-800 truncate">${escT(g.nombre)}</span>
                    <span class="text-xs text-slate-600 shrink-0"><b class="text-slate-800">${fmtT(g.pct, 0)}%</b> evaluado · La Santé ${fmtT(g.share, 1)}%</span></div>
                <div class="h-2.5 rounded-full bg-slate-100 mt-1 overflow-hidden"><div class="h-full rounded-full ${g.pct >= 67 ? 'bg-green-600' : (g.pct >= 34 ? 'bg-amber-400' : 'bg-rose-400')}" style="width:${Math.min(100, g.pct).toFixed(1)}%"></div></div>
            </button>`).join('')}</div>`;
    }

    /* ============================================================
       VISITADOR: sus 10 con más oportunidad y avance vs. su distrito
    ============================================================ */
    function renderVm() {
        const st = window.App.state;
        const top = (st.PROCESSED_DATA || []).filter(x => !x.isZeroRx && x.gap > 0).sort((a, b) => b.gap - a.gap).slice(0, 10);
        if (!top.length) return '';
        return tarjeta('rocket_launch', 'Tus 10 médicos con más oportunidad', `
            <p class="text-[11px] text-slate-500 mb-2">Recetas de La Santé que le faltan a cada uno para subir de adopción.</p>
            <ol class="divide-y divide-slate-100">${top.map((doc, i) => `<li><button type="button" class="w-full text-left flex items-center gap-3 py-2.5" onclick="App.ficha.abrir(${argT(doc.id)})">
                <span class="w-5 text-xs font-bold text-slate-500 text-center shrink-0">${i + 1}</span>
                <span class="eval-cuadrante ${window.App.ux.claseDeEtiqueta(doc.closeupLabel)} shrink-0">${escT(doc.closeupLabel)}</span>
                <span class="flex-1 min-w-0"><span class="block text-sm font-semibold text-slate-800 truncate">${escT(nomT(doc.name))}</span>
                    <span class="block text-[11px] text-slate-500 truncate">${escT(doc.targetLabel)}${window.App.ux.estaEvaluado(doc) ? ' · Evaluado' : ''}</span></span>
                <span class="text-sm font-bold text-green-800 shrink-0">+${fmtT(doc.gap)} Rx</span>
            </button></li>`).join('')}</ol>`);
    }

    window.App.tableros.cargarAvance = async function() {
        const st = window.App.state;
        const zona = document.getElementById('visPromedioDistrito');
        if (!zona) return;
        // Solo el VM con su propia sesión (no el admin que "ve como")
        if (st.rolReal !== 'vm' || st.verComo) { zona.classList.add('hidden'); return; }
        try {
            if (!window.App.tableros.avance) window.App.tableros.avance = await window.App.sb.avanceDistrito();
            const a = window.App.tableros.avance;
            if (!a || !a.visitadores) { zona.classList.add('hidden'); return; }
            const total = parseInt(document.getElementById('visTotalFichero')?.textContent.replace(/\D/g, '') || '0', 10);
            const mios = parseInt(document.getElementById('visTotalEvaluados')?.textContent.replace(/\D/g, '') || '0', 10);
            const mio = total ? mios / total * 100 : 0;
            const prom = Number(a.promedio_pct) || 0;
            const faltan = Math.ceil((prom - mio) / 100 * total);
            zona.innerHTML = `Promedio de tu distrito: <b>${fmtT(prom, 0)}%</b> · ${faltan <= 0 ? '<span class="tendencia sube">▲ vas en o por encima del promedio</span>' : `<span class="tendencia baja">te faltan ${fmtT(faltan)} ${faltan === 1 ? 'médico' : 'médicos'} para el promedio</span>`}`;
            zona.classList.remove('hidden');
        } catch (e) {
            zona.classList.add('hidden');   // sin conexión: no se muestra
        }
    };

    /* ============================================================
       RESUMEN EJECUTIVO EN PDF
    ============================================================ */
    window.App.tableros.resumenPdf = async function() {
        const st = window.App.state;
        const ui = window.App.ui;
        ui.showToast('Preparando el resumen en PDF...');
        try {
            await window.App.data.loadLibrary('jspdf');
            const { jsPDF } = window.jspdf;
            const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
            const c = window.App.tableros.calcular();
            const eq = window.App.equipo ? window.App.equipo.estadisticas() : { vms: [], distritos: [], alertas: [] };
            const docs = (st.PROCESSED_DATA || []).filter(x => !x.isZeroRx);
            const total = docs.reduce((s, x) => s + x.totalRx, 0), phq = docs.reduce((s, x) => s + x.rxPhq, 0);
            let y = 16;
            const texto = (t, tam = 10, estilo = 'normal', color = [25, 28, 32], x = 15) => {
                pdf.setFont('helvetica', estilo); pdf.setFontSize(tam); pdf.setTextColor(...color);
                pdf.splitTextToSize(String(t), 180).forEach(l => { if (y > 282) { pdf.addPage(); y = 16; } pdf.text(l, x, y); y += tam * 0.45; });
            };
            const titulo = (t) => { y += 3; texto(t, 12, 'bold', [11, 87, 208]); y += 1; };
            pdf.setFillColor(11, 87, 208); pdf.rect(0, 0, 210, 6, 'F');
            texto('SegmentApp · La Santé', 9, 'normal', [93, 96, 104]);
            texto(esNacionalT() ? 'Resumen ejecutivo nacional' : `Resumen ejecutivo · ${st.currentVisitadorName || 'Distrito'}`, 18, 'bold');
            const version = st.VERSIONES_EN_USO && st.VERSIONES_EN_USO.recetas ? st.VERSIONES_EN_USO.recetas.nombre : '';
            const mercados = st.FILTER_STATE.Market.length === st.FILTER_OPTIONS.Market.length ? 'Todos los mercados' : `${st.FILTER_STATE.Market.length} mercados elegidos`;
            texto(`Datos: ${version} · ${mercados} · ${new Date().toLocaleDateString('es-VE')}`, 9, 'normal', [68, 71, 78]);

            titulo('Indicadores');
            texto(`Médicos con recetas: ${fmtT(docs.length)}   ·   Recetas del mercado: ${fmtT(total)}   ·   Recetas La Santé: ${fmtT(phq)}   ·   Participación: ${fmtT(total ? phq / total * 100 : 0, 2)}%`);
            titulo('Cobertura');
            const e = c.embudo;
            texto(`Fichero ${fmtT(e.fichados)}  →  con recetas ${fmtT(e.conRx)}  →  evaluados ${fmtT(e.evaluados)} (${fmtT(e.conRx ? e.evaluados / e.conRx * 100 : 0, 0)}%)  →  de potencial A ${fmtT(e.enA)}`);
            titulo('Mercados con más oportunidad');
            c.mercados.slice(0, 6).forEach((m, i) => texto(`${i + 1}. ${m.mercado}: +${fmtT(m.gap)} Rx · La Santé ${fmtT(m.total ? m.phq / m.total * 100 : 0, 1)}% · ${fmtT(m.medicos)} médicos`));
            if (esNacionalT() && eq.distritos.length) {
                titulo('Distritos (por avance)');
                eq.distritos.forEach((g, i) => texto(`${i + 1}. ${g.nombre}: ${fmtT(g.pct, 0)}% evaluado · ${fmtT(g.vms)} VM · La Santé ${fmtT(g.share, 1)}% · +${fmtT(g.gap)} Rx`));
            }
            const vms = eq.vms.slice().sort((a, b) => b.pct - a.pct);
            if (vms.length) {
                titulo('Visitadores con más avance');
                vms.slice(0, 5).forEach(v => texto(`• ${nomT(v.nombre)}: ${fmtT(v.pct, 0)}% (${fmtT(v.evaluados.size)} de ${fmtT(v.fichero.size)})`));
                titulo('Visitadores que necesitan apoyo');
                vms.slice(-5).reverse().forEach(v => texto(`• ${nomT(v.nombre)}: ${fmtT(v.pct, 0)}%${v.dias === null ? ' · sin evaluaciones' : (v.dias >= 7 ? ` · ${v.dias} días sin evaluar` : '')}`));
            }
            titulo('Alertas');
            texto(`${fmtT(eq.alertas.length)} evaluaciones con potencial distinto a CloseUp (${fmtT(eq.alertas.filter(a => a.distancia === 2).length)} muy distintas).`);
            pdf.setFontSize(8); pdf.setTextColor(115, 119, 127);
            pdf.text(`Generado con SegmentApp el ${new Date().toLocaleString('es-VE')}`, 15, 290);
            pdf.save(`Resumen_SegmentApp_${new Date().toISOString().slice(0, 10)}.pdf`);
            ui.showToast('Resumen descargado.');
        } catch (err) {
            console.error('[SegmentApp] Resumen PDF:', err);
            ui.showToast('No se pudo generar el PDF.');
        }
    };
})();

console.log('[SegmentApp] tableros.js cargado.');

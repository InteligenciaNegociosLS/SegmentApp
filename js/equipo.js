/* ============================================================
   SegmentApp - Pantalla "Equipo" (GD, Gerente Nacional y admin)
   Archivo: js/equipo.js   (Fase 9B)
   Vistas:
   - Distritos (Gerente Nacional y admin): avance, participación,
     oportunidad y calidad de cada distrito.
   - Visitadores: ranking con avance, ritmo de la semana, último día
     que evaluó, calidad de la evaluación, participación de La Santé
     (y su tendencia), oportunidad y mini matriz de cada VM.
   - Prioridades: médicos con más recetas que nadie ha evaluado.
   - Alertas: médicos donde la evaluación del VM y CloseUp no
     coinciden en el potencial (A, B o C).
   Todo se calcula con lo que la persona ya tiene cargado (sin pedir
   nada nuevo al servidor) y respeta los filtros elegidos (mercado...).
============================================================ */

// Todo queda dentro de esta función: sus nombres internos no chocan con los de otros archivos
(function() {
    window.App = window.App || {};
    window.App.equipo = { vista: null, distrito: 'todos', orden: 'cobertura', cruce: 'todos', linea: 'todas', matrizVm: 'evaluaciones', mostrar: {} };

    const escE = (v) => window.App.ui.escapeHtml(v);
    const fmtE = (n, d = 0) => window.App.ui.formatNumber(n || 0, d);
    const nomE = (n) => window.App.ui.nombreVisible(n);
    // Texto seguro como argumento de un botón: onclick="f(${argE(x)})" (sirve con comillas y apóstrofos)
    const argE = (v) => escE(JSON.stringify(String(v == null ? '' : v)));
    const normE = (v) => String(v || '').trim().toUpperCase();
    const DIA = 86400000;
    const NIVEL = { A: 0, B: 1, C: 2 };
    const CELDAS_E = ['A_C', 'A_B', 'A_A', 'B_C', 'B_B', 'B_A', 'C_C', 'C_B', 'C_A'];
    const SIGNO_E = { A: '+', B: '', C: '-' };

    const esNacional = () => ['admin', 'gte_nacional'].includes(window.App.ux ? window.App.ux.rolVisible() : window.App.state.rolReal);
    // Línea del visitador según la columna "Equipo" del fichero (1 LINEA_HIBRIDA_1 … 7 OTC … 9 LINEA_2, Fase 12G)
    const lineaDeFila = (r) => {
        const k = Object.keys(r).find(x => /^equipo$/i.test(x.trim()));
        if (!k || r[k] === undefined || r[k] === '') return '';
        return window.App.data.nombreLinea(r[k]);
    };
    // Celda de la matriz que corresponde a una evaluación ("A+" → A_A, "B" → B_B, "C-" → C_C)
    const celdaDeEvaluacion = (cuadrante) => {
        const c = String(cuadrante || '').trim().toUpperCase();
        if (!/^[ABC][+-]?$/.test(c)) return null;
        return `${c[0]}_${c[1] === '+' ? 'A' : (c[1] === '-' ? 'C' : 'B')}`;
    };
    const repsDeFilas = (filas) => {
        const d = window.App.data;
        return [...new Set((filas || []).map(r => { const k = d.getFicheroRepKey(r); return k && r[k] ? normE(r[k]) : ''; }).filter(Boolean))];
    };

    /* ============================================================
       ESTADÍSTICAS (se calculan una vez por cambio de datos)
    ============================================================ */
    let memoEquipo = null;

    window.App.equipo.estadisticas = function() {
        const st = window.App.state;
        const d = window.App.data;
        const comp = window.App.comparar && window.App.comparar.estado;
        const previos = comp && comp.previos;
        const firma = [st.PROCESSED_DATA, st._versionEvaluaciones, st.ALL_EVALUATIONS, st.ALL_EVALUATIONS.length, st.FICHERO_MAP,
            st.REPS_PERMITIDOS, previos, window.App.equipo.cruce, window.App.equipo.linea, st.REPS_FUERA_METRICAS];
        if (memoEquipo && memoEquipo.firma.every((v, i) => v === firma[i])) return memoEquipo.datos;

        // Línea de cada visitador (de su fichero) y filtro por línea
        const lineas = new Map();
        st.FICHERO_MAP.forEach(filas => filas.forEach(r => {
            const k = d.getFicheroRepKey(r);
            if (!k || !r[k]) return;
            const rep = normE(r[k]);
            if (!lineas.has(rep)) { const l = lineaDeFila(r); if (l) lineas.set(rep, l); }
        }));
        const linea = window.App.equipo.linea || 'todas';
        const permitido = (rep) => (!st.REPS_PERMITIDOS || st.REPS_PERMITIDOS.has(rep)) && (linea === 'todas' || lineas.get(rep) === linea);
        const vms = new Map();
        const vmDe = (rep) => {
            let v = vms.get(rep);
            if (!v) {
                v = { nombre: rep, gerente: st.REP_MANAGER_MAP[rep] || 'Sin distrito', fichero: new Set(), evaluados: new Set(),
                    encuestas: 0, semana: 0, ultima: null, coinciden: 0, comparables: 0, rx: 0, phq: 0, gap: 0, conRx: 0,
                    celdas: {}, celdasEval: {}, rxAntes: 0, phqAntes: 0, evals: [], linea: lineas.get(rep) || '' };
                vms.set(rep, v);
            }
            return v;
        };

        // 1) Médicos del fichero de cada VM (incluye los que no tienen recetas)
        st.FICHERO_MAP.forEach((filas, clave) => repsDeFilas(filas).forEach(rep => { if (permitido(rep)) vmDe(rep).fichero.add(clave); }));

        // 2) Recetas de sus médicos (con los filtros elegidos)
        const docPorClave = new Map();
        (st.PROCESSED_DATA || []).forEach(doc => {
            const clave = doc._clave || d.normalizeKey(doc.id);
            if (!docPorClave.has(clave)) docPorClave.set(clave, doc);
            if (doc.isZeroRx) return;
            repsDeFilas(doc.ficheroData).forEach(rep => {
                const v = vms.get(rep);
                if (!v) return;
                v.conRx++; v.rx += doc.totalRx; v.phq += doc.rxPhq; v.gap += doc.gap;
                const celda = `${doc.closeupPotency}_${doc.closeupLoyalty}`;
                v.celdas[celda] = (v.celdas[celda] || 0) + 1;
                const p = previos && (comp.buscarPrevio ? comp.buscarPrevio(doc) : previos.get(doc.id));
                if (p) { v.rxAntes += p.totalRx; v.phqAntes += p.rxPhq; }
            });
        });

        // 3) Evaluaciones: avance, ritmo, calidad y alertas
        const ahora = Date.now();
        const alertas = [];
        const cruce = window.App.equipo.cruce;
        (st.ALL_EVALUATIONS || []).forEach(ev => {
            if (cruce === 'validos' && ev.cruceErrado) return;
            if (cruce === 'cruce' && !ev.cruceErrado) return;
            const rep = normE(ev.visitador);
            if (!rep || !permitido(rep)) return;
            const v = vmDe(rep);
            const clave = d.normalizeKey(ev.medico_id);
            v.encuestas++;
            v.evals.push(ev);
            const ce = celdaDeEvaluacion(ev.cuadrante);
            if (ce) v.celdasEval[ce] = (v.celdasEval[ce] || 0) + 1;
            if (v.fichero.has(clave)) v.evaluados.add(clave);
            const t = Date.parse(ev.timestamp);
            if (t) {
                if (ahora - t <= 7 * DIA) v.semana++;
                if (!v.ultima || t > v.ultima) v.ultima = t;
            }
            // Calidad y alertas: solo evaluaciones comparables (no "cruce errado")
            if (ev.cruceErrado || !ev.cuadrante) return;
            const doc = docPorClave.get(clave);
            if (!doc || doc.isZeroRx || !doc.closeupPotency) return;
            const suya = ev.cuadrante.charAt(0);
            if (!(suya in NIVEL)) return;
            v.comparables++;
            if (suya === doc.closeupPotency) v.coinciden++;
            else alertas.push({ ev, doc, vm: rep, gerente: v.gerente, distancia: Math.abs(NIVEL[suya] - NIVEL[doc.closeupPotency]) });
        });
        alertas.sort((a, b) => b.distancia - a.distancia || b.doc.totalRx - a.doc.totalRx);

        // Valores listos para mostrar
        const lista = [...vms.values()].filter(v => v.fichero.size || v.encuestas).map(v => ({
            ...v,
            pct: v.fichero.size ? v.evaluados.size / v.fichero.size * 100 : 0,
            share: v.rx ? v.phq / v.rx * 100 : 0,
            shareAntes: v.rxAntes ? v.phqAntes / v.rxAntes * 100 : null,
            calidad: v.comparables ? v.coinciden / v.comparables * 100 : null,
            dias: v.ultima ? Math.floor((ahora - v.ultima) / DIA) : null,
            fueraMetricas: !d.cuentaEnMetricas(v.nombre)
        }));

        // 4) Distritos (suma de sus VM)
        // Los que no cuentan en las métricas (Fase 12E) no suman al distrito
        const distritos = new Map();
        lista.filter(v => !v.fueraMetricas).forEach(v => {
            let g = distritos.get(v.gerente);
            if (!g) { g = { nombre: v.gerente, vms: 0, medicos: new Set(), hechos: new Set(), encuestas: 0, semana: 0, rx: 0, phq: 0, gap: 0, coinciden: 0, comparables: 0, terminaron: 0, inactivos: 0 }; distritos.set(v.gerente, g); }
            // Un médico que atienden dos visitadores del distrito cuenta una sola vez
            g.vms++; v.fichero.forEach(m => g.medicos.add(m)); v.evaluados.forEach(m => g.hechos.add(m)); g.encuestas += v.encuestas; g.semana += v.semana;
            g.rx += v.rx; g.phq += v.phq; g.gap += v.gap; g.coinciden += v.coinciden; g.comparables += v.comparables;
            if (v.fichero.size && v.pct >= 100) g.terminaron++;
            if (v.dias === null || v.dias >= 7) g.inactivos++;
        });
        const listaDistritos = [...distritos.values()].map(g => ({
            ...g,
            fichero: g.medicos.size, evaluados: g.hechos.size,
            pct: g.medicos.size ? g.hechos.size / g.medicos.size * 100 : 0,
            share: g.rx ? g.phq / g.rx * 100 : 0,
            calidad: g.comparables ? g.coinciden / g.comparables * 100 : null
        })).sort((a, b) => b.pct - a.pct);

        const datos = { vms: lista, distritos: listaDistritos, alertas, docPorClave, lineas, permitido };
        memoEquipo = { firma, datos };
        return datos;
    };

    // Lo que corresponde al distrito elegido
    const delDistrito = (lista, campo = 'gerente') => {
        const g = window.App.equipo.distrito;
        return !esNacional() || g === 'todos' ? lista : lista.filter(x => x[campo] === g);
    };

    /* ============================================================
       DIBUJO
    ============================================================ */
    window.App.equipo.render = function() {
        const st = window.App.state;
        if (!st.isAdmin || !document.getElementById('equipoContenido')) return;
        const nacional = esNacional();
        const vistas = nacional ? ['distritos', 'visitadores', 'prioridades', 'alertas'] : ['visitadores', 'prioridades', 'alertas'];
        if (!vistas.includes(window.App.equipo.vista)) window.App.equipo.vista = vistas[0];
        const e = window.App.equipo.estadisticas();

        // Distrito (solo quien ve varios)
        const sel = document.getElementById('equipoDistrito');
        const zona = document.getElementById('equipoDistritoZona');
        if (zona) zona.classList.toggle('hidden', !nacional);
        if (sel && nacional) {
            const opciones = ['todos', ...e.distritos.map(g => g.nombre)];
            if (!opciones.includes(window.App.equipo.distrito)) window.App.equipo.distrito = 'todos';
            sel.innerHTML = opciones.map(o => `<option value="${escE(o)}" ${o === window.App.equipo.distrito ? 'selected' : ''}>${o === 'todos' ? 'Todos los distritos' : escE(o)}</option>`).join('');
        }
        window.App.ui.safeSetText('equipoSubtitulo', nacional
            ? (window.App.equipo.distrito === 'todos' ? `${fmtE(e.distritos.length)} distritos · ${fmtE(e.vms.length)} visitadores` : `Distrito de ${window.App.equipo.distrito}`)
            : `Tu distrito · ${fmtE(e.vms.length)} visitadores`);

        // Resumen
        const todosVms = delDistrito(e.vms);
        const vms = todosVms.filter(v => !v.fueraMetricas);
        const fueraM = todosVms.length - vms.length;
        // Médicos distintos (los compartidos entre visitadores cuentan una vez)
        const unicos = new Set(), hechos = new Set();
        vms.forEach(v => { v.fichero.forEach(m => unicos.add(m)); v.evaluados.forEach(m => hechos.add(m)); });
        const fichero = unicos.size, evaluados = hechos.size;
        const semana = vms.reduce((s, v) => s + v.semana, 0);
        const encuestas = vms.reduce((s, v) => s + v.encuestas, 0);
        const terminaron = vms.filter(v => v.fichero.size && v.pct >= 100).length;
        const inactivos = vms.filter(v => v.dias === null || v.dias >= 7).length;
        const kpi = (icono, titulo, valor, extra, clase) => `<div class="kpi-card ${clase} p-4"><p class="text-xs font-semibold flex items-center gap-1.5 opacity-90"><span class="material-symbols-outlined text-[18px]">${icono}</span>${titulo}</p>
            <p class="text-2xl font-display font-extrabold mt-1">${valor}</p><p class="text-[11px] mt-0.5 opacity-80">${extra}</p></div>`;
        document.getElementById('equipoResumen').innerHTML = [
            kpi('groups', 'Visitadores', fmtE(vms.length), [nacional && window.App.equipo.distrito === 'todos' ? `${fmtE(e.distritos.length)} distritos` : '', terminaron ? `${fmtE(terminaron)} terminaron` : '', fueraM ? `${fmtE(fueraM)} no cuentan` : ''].filter(Boolean).join(' · '), 'bg-white border border-slate-200 text-slate-800'),
            kpi('stethoscope', 'Médicos en fichero', fmtE(fichero), 'de sus visitadores', 'bg-white border border-slate-200 text-slate-800'),
            kpi('task_alt', 'Médicos evaluados', fmtE(evaluados), `cobertura ${fmtE(fichero ? evaluados / fichero * 100 : 0, 1)}%`, 'bg-blue-50 text-blue-900'),
            kpi('assignment', 'Evaluaciones', fmtE(encuestas), `${fmtE(semana)} esta semana`, 'bg-green-50 text-green-900'),
            kpi('schedule', 'Sin evaluar 7+ días', fmtE(inactivos), 'visitadores', (inactivos ? 'bg-amber-50 text-amber-900' : 'bg-white border border-slate-200 text-slate-800') + ' col-span-2 lg:col-span-1')
        ].join('');
        // Línea: las que hay en el fichero, en el orden de la tabla de líneas
        const selL = document.getElementById('equipoLinea');
        if (selL) {
            const orden = Object.values((window.App.config && window.App.config.LINEAS_EQUIPO) || {});
            const hay = [...new Set([...e.lineas.values()])].sort((a, b) => ((orden.indexOf(a) + 1) || 99) - ((orden.indexOf(b) + 1) || 99) || a.localeCompare(b));
            if (window.App.equipo.linea !== 'todas' && !hay.includes(window.App.equipo.linea)) hay.push(window.App.equipo.linea);
            selL.innerHTML = '<option value="todas">Todas las líneas</option>' + hay.map(l => `<option value="${escE(l)}">${escE(l)}</option>`).join('');
            selL.value = window.App.equipo.linea || 'todas';
        }
        const ocultos = st.REPS_OCULTOS ? st.REPS_OCULTOS.size : 0;
        const notaOcultos = document.getElementById('equipoOcultos');
        if (notaOcultos) {
            notaOcultos.classList.toggle('hidden', !ocultos);
            notaOcultos.textContent = ocultos ? `${fmtE(ocultos)} ${ocultos === 1 ? 'visitador desactivado no se muestra' : 'visitadores desactivados no se muestran'} (sus datos siguen guardados).` : '';
        }

        // Pestañas
        const nombres = { distritos: ['map', 'Distritos'], visitadores: ['person', 'Visitadores'], prioridades: ['priority_high', 'Prioridades'], alertas: ['warning', 'Alertas'] };
        const cuenta = { distritos: delDistrito(e.distritos, 'nombre').length, visitadores: todosVms.length, prioridades: window.App.equipo.prioridades(e).length, alertas: delDistrito(e.alertas).length };
        document.getElementById('equipoPestanas').innerHTML = vistas.map(v => `<button type="button" role="tab" data-vista="${v}" class="chip" aria-pressed="${window.App.equipo.vista === v}" aria-selected="${window.App.equipo.vista === v}" onclick="App.equipo.verVista('${v}')">
            ${window.App.equipo.vista === v ? '' : `<span class="material-symbols-outlined text-[18px]">${nombres[v][0]}</span>`}${nombres[v][1]}<span class="cuenta">${fmtE(cuenta[v])}</span></button>`).join('');

        const zonaC = document.getElementById('equipoContenido');
        zonaC.innerHTML = ({ distritos: renderDistritos, visitadores: renderVisitadores, prioridades: renderPrioridades, alertas: renderAlertas })[window.App.equipo.vista](e);
    };

    /* ============================================================
       RESUMEN DE LA SEMANA (Fase 12G): texto listo para WhatsApp
       Con el distrito y la línea elegidos; sin los visitadores "fuera de métricas".
    ============================================================ */
    window.App.equipo.resumenSemanal = function() {
        const e = window.App.equipo.estadisticas();
        const nacional = esNacional();
        const g = window.App.equipo.distrito;
        const vms = delDistrito(e.vms).filter(v => !v.fueraMetricas);
        const unicos = new Set(), hechos = new Set();
        vms.forEach(v => { v.fichero.forEach(m => unicos.add(m)); v.evaluados.forEach(m => hechos.add(m)); });
        const pct = unicos.size ? hechos.size / unicos.size * 100 : 0;
        const semana = vms.reduce((s, v) => s + v.semana, 0), total = vms.reduce((s, v) => s + v.encuestas, 0);
        const quietos = vms.filter(v => v.fichero.size && v.pct < 100 && (v.dias === null || v.dias >= 7)).sort((a, b) => (b.dias ?? 999) - (a.dias ?? 999));
        const terminaron = vms.filter(v => v.fichero.size && v.pct >= 100);
        const masSemana = vms.filter(v => v.semana).sort((a, b) => b.semana - a.semana).slice(0, 3);
        const alertas = delDistrito(e.alertas).filter(a => vms.some(v => v.nombre === a.vm));
        const prioridades = window.App.equipo.prioridades(e).slice(0, 3);
        const linea = window.App.equipo.linea && window.App.equipo.linea !== 'todas' ? ` · línea ${window.App.equipo.linea}` : '';
        const alcance = (nacional ? (g === 'todos' ? 'Todo el país' : `Distrito de ${g}`) : 'Tu distrito') + linea;
        const hoy = new Date().toLocaleDateString('es-VE', { day: '2-digit', month: 'long', year: 'numeric' });
        const n = (x) => fmtE(x);
        const lineas = [
            `*SegmentApp · Resumen de la semana*`, `${alcance} · ${hoy}`, '',
            `📊 *Cobertura:* ${fmtE(pct, 0)}% (${n(hechos.size)} de ${n(unicos.size)} médicos evaluados)`,
            `📝 *Evaluaciones esta semana:* ${n(semana)} (en total ${n(total)})`,
            masSemana.length ? `🏃 *Más activos:* ${masSemana.map(v => `${nomE(v.nombre)} (${n(v.semana)})`).join(', ')}` : '',
            terminaron.length ? `🎉 *Terminaron su fichero:* ${terminaron.map(v => nomE(v.nombre)).join(', ')}` : '',
            quietos.length ? `⏰ *Sin evaluar 7 días o más:* ${quietos.slice(0, 8).map(v => `${nomE(v.nombre)}${v.dias === null ? ' (nunca)' : ` (${n(v.dias)} días)`}`).join(', ')}${quietos.length > 8 ? ` y ${n(quietos.length - 8)} más` : ''}` : '✅ Todos evaluaron en los últimos 7 días',
            alertas.length ? `⚠️ *Evaluaciones distintas a CloseUp:* ${n(alertas.length)}${alertas.filter(a => a.distancia === 2).length ? ` (${n(alertas.filter(a => a.distancia === 2).length)} muy distintas)` : ''}` : '',
            prioridades.length ? `🎯 *Prioridades (más recetas, sin evaluar):* ${prioridades.map(d => `${nomE(d.name)} (${n(d.totalRx)} Rx)`).join(', ')}` : ''
        ];
        // Nacional con todos los distritos: una línea por distrito
        if (nacional && g === 'todos') {
            const ds = e.distritos.slice().sort((a, b) => b.pct - a.pct);
            if (ds.length) lineas.push('', '*Por distrito:*', ...ds.map(d => `• ${d.nombre}: ${fmtE(d.pct, 0)}% · ${n(d.semana)} esta semana${d.inactivos ? ` · ${n(d.inactivos)} sin evaluar 7+ días` : ''}`));
        }
        return { texto: lineas.filter(x => x !== '').join('\n').replace(/\n\n\n+/g, '\n\n'), alcance };
    };
    window.App.equipo.abrirResumen = function() {
        const r = window.App.equipo.resumenSemanal();
        document.getElementById('resumenTexto').value = r.texto;
        document.getElementById('resumenAlcance').textContent = r.alcance;
        document.getElementById('resumenModal').classList.remove('hidden');
    };
    window.App.equipo.cerrarResumen = function() { document.getElementById('resumenModal').classList.add('hidden'); };
    window.App.equipo.copiarResumen = async function() {
        const t = document.getElementById('resumenTexto').value;
        let ok = false;
        try { await navigator.clipboard.writeText(t); ok = true; } catch (e) { /* sin portapapeles */ }
        window.App.ui.showToast(ok ? 'Resumen copiado. Pégalo en WhatsApp o en un correo.' : 'No se pudo copiar: selecciona el texto y cópialo.');
    };
    window.App.equipo.whatsappResumen = function() {
        const t = document.getElementById('resumenTexto').value;
        window.open(`https://wa.me/?text=${encodeURIComponent(t)}`, '_blank', 'noopener');
    };

    window.App.equipo.verVista = function(v) {
        window.App.equipo.vista = v;
        window.App.equipo.mostrar = {};
        window.App.equipo.render();
    };
    window.App.equipo.elegirDistrito = function(g) {
        window.App.equipo.distrito = g || 'todos';
        window.App.equipo.mostrar = {};
        window.App.equipo.render();
    };
    window.App.equipo.verDistrito = function(g) {
        window.App.equipo.distrito = g;
        window.App.equipo.verVista('visitadores');
    };
    window.App.equipo.elegirLinea = function(l) {
        window.App.equipo.linea = l || 'todas';
        window.App.equipo.mostrar = {};
        window.App.equipo.render();
    };
    window.App.equipo.ordenar = function(k) {
        window.App.equipo.orden = k;
        window.App.equipo.render();
    };
    window.App.equipo.verCruce = function(v) {
        window.App.equipo.cruce = v;
        window.App.equipo.render();
    };
    // Listas largas: de 10 en 10, con Anterior / Siguiente (Fase 12E). "mostrar" guarda la página de cada lista.
    const paginaDe = (tipo, lista) => window.App.ui.paginar(lista, window.App.equipo.mostrar[tipo] || 1);
    const controles = (tipo, pag, total) => window.App.ui.paginacion({ pagina: pag.pagina, paginas: pag.paginas, total, accion: `App.equipo.pagina_${tipo}` });
    ['visitadores', 'prioridades', 'alertas'].forEach(tipo => {
        window.App.equipo['pagina_' + tipo] = function(p) {
            window.App.equipo.mostrar[tipo] = p;
            window.App.equipo.render();
            const zona = document.getElementById('equipoPestanas');
            if (zona && zona.scrollIntoView) zona.scrollIntoView({ block: 'start', behavior: 'smooth' });
        };
    });
    window.App.equipo.verMas = function(tipo) { window.App.equipo['pagina_' + tipo]((window.App.equipo.mostrar[tipo] || 1) + 1); };
    // Lleva a la página donde está un visitador (desde la campanita)
    window.App.equipo.irAVisitador = function(nombre) {
        const e = window.App.equipo.estadisticas();
        const orden = ORDENES[window.App.equipo.orden] ? ORDENES[window.App.equipo.orden][1] : ORDENES.cobertura[1];
        const lista = delDistrito(e.vms).slice().sort((a, b) => (a.fueraMetricas ? 1 : 0) - (b.fueraMetricas ? 1 : 0) || orden(a, b));
        const i = lista.findIndex(v => v.nombre === nombre);
        if (i >= 0) { window.App.equipo.mostrar.visitadores = Math.floor(i / window.App.ui.POR_PAGINA) + 1; window.App.equipo.render(); }
    };

    // Barra de avance con color según cuánto falta
    const colorAvance = (pct) => pct >= 100 ? 'bg-green-600' : (pct >= 67 ? 'bg-green-500' : (pct >= 34 ? 'bg-amber-400' : 'bg-rose-400'));
    const barra = (pct) => `<div class="h-2 rounded-full bg-slate-100 overflow-hidden"><div class="h-full rounded-full ${colorAvance(pct)}" style="width:${Math.min(100, pct).toFixed(1)}%"></div></div>`;
    const pastilla = (icono, texto, clase = 'bg-slate-100 text-slate-700', titulo = '') => `<span class="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ${clase}" ${titulo ? `title="${escE(titulo)}"` : ''}><span class="material-symbols-outlined text-[15px]">${icono}</span>${texto}</span>`;
    const pastillaCalidad = (calidad, comparables) => comparables < 3
        ? pastilla('fact_check', 'Calidad: pocos datos', 'bg-slate-100 text-slate-600', 'Hacen falta al menos 3 evaluaciones comparables')
        : pastilla('fact_check', `Coincide ${fmtE(calidad, 0)}%`, calidad >= 70 ? 'bg-green-50 text-green-800' : (calidad >= 40 ? 'bg-amber-50 text-amber-800' : 'bg-rose-50 text-rose-800'),
            'En cuántas de sus evaluaciones el potencial (A, B o C) coincide con CloseUp');
    const pastillaUltima = (dias) => dias === null
        ? pastilla('event_busy', 'Sin evaluaciones', 'bg-rose-50 text-rose-800')
        : pastilla('event', dias === 0 ? 'Evaluó hoy' : (dias === 1 ? 'Evaluó ayer' : `Hace ${dias} días`), dias >= 7 ? 'bg-amber-50 text-amber-800' : 'bg-slate-100 text-slate-700');
    const tendenciaE = (actual, antes) => antes == null || Math.abs(actual - antes) < 0.05 ? ''
        : ` <span class="tendencia ${actual > antes ? 'sube' : 'baja'}">${actual > antes ? '▲' : '▼'}${fmtE(Math.abs(actual - antes), 1)}</span>`;

    /* ---------- Distritos ---------- */
    function renderDistritos(e) {
        const lista = delDistrito(e.distritos, 'nombre');
        if (!lista.length) return vacio('No hay distritos con estos filtros.');
        return `<div class="grid md:grid-cols-2 xl:grid-cols-3 gap-3">${lista.map((g, i) => `
            <article class="bg-white rounded-3xl border border-slate-200 p-4 flex flex-col gap-3">
                <div class="flex items-start justify-between gap-3">
                    <div class="min-w-0">
                        <div class="text-[11px] font-bold text-slate-500">#${i + 1} · Gerente de distrito</div>
                        <h3 class="text-base font-bold text-slate-800 truncate">${escE(g.nombre)}</h3>
                        <div class="text-xs text-slate-500">${fmtE(g.vms)} visitadores · ${fmtE(g.fichero)} médicos</div>
                    </div>
                    <div class="text-right shrink-0"><div class="text-2xl font-display font-extrabold text-slate-800">${fmtE(g.pct, 0)}%</div><div class="text-[11px] text-slate-500">evaluado</div></div>
                </div>
                ${barra(g.pct)}
                <div class="flex flex-wrap gap-1.5">
                    ${pastilla('donut_large', `La Santé ${fmtE(g.share, 1)}%`, 'bg-blue-50 text-blue-800')}
                    ${pastilla('trending_up', `+${fmtE(g.gap)} Rx`, 'bg-green-50 text-green-800', 'Recetas que faltan para subir de adopción')}
                    ${pastillaCalidad(g.calidad, g.comparables)}
                    ${pastilla('calendar_month', `${fmtE(g.semana)} esta semana`)}
                    ${g.terminaron ? pastilla('emoji_events', `${fmtE(g.terminaron)} terminaron`, 'bg-green-50 text-green-800') : ''}
                    ${g.inactivos ? pastilla('schedule', `${fmtE(g.inactivos)} sin evaluar 7+ días`, 'bg-amber-50 text-amber-800') : ''}
                </div>
                <button class="self-start h-9 px-4 rounded-full text-sm font-bold text-blue-700 bg-blue-50" onclick="App.equipo.verDistrito(${argE(g.nombre)})">Ver sus visitadores</button>
            </article>`).join('')}</div>`;
    }

    /* ---------- Visitadores ---------- */
    // Cobertura = médicos evaluados ÷ médicos de su fichero (empates: más evaluados, luego por nombre)
    const porNombre = (a, b) => nomE(a.nombre).localeCompare(nomE(b.nombre), 'es');
    const ORDENES = {
        cobertura: ['Cobertura', (a, b) => b.pct - a.pct || b.evaluados.size - a.evaluados.size || porNombre(a, b)],
        nombre: ['Nombre', porNombre]
    };

    function miniMatriz(celdas, etiqueta = 'Por cuadrante') {
        const total = Object.values(celdas).reduce((s, n) => s + n, 0) || 1;
        return `<div class="grid grid-cols-3 gap-1 w-[168px] shrink-0" aria-label="${escE(etiqueta)}">${CELDAS_E.map(k => {
            const [p, l] = k.split('_');
            const n = celdas[k] || 0;
            return `<div class="cell-${k} rounded-lg px-1 py-1 text-center" style="opacity:${n ? Math.max(0.55, Math.min(1, 0.55 + n / total * 2)) : 0.35}"><div class="text-[10px] font-display font-extrabold">${p}${SIGNO_E[l]}</div><div class="text-xs font-bold">${fmtE(n)}</div></div>`;
        }).join('')}</div>`;
    }

    function renderVisitadores(e) {
        const st = window.App.state;
        if (!ORDENES[window.App.equipo.orden]) window.App.equipo.orden = 'cobertura';
        // Los que no cuentan en las métricas van al final, marcados
        const ordenar = (a, b) => (a.fueraMetricas ? 1 : 0) - (b.fueraMetricas ? 1 : 0) || ORDENES[window.App.equipo.orden][1](a, b);
        const lista = delDistrito(e.vms).slice().sort(ordenar);
        const orden = `<p class="text-sm text-slate-600 bg-blue-50 rounded-2xl p-3 mb-3">Cada visitador con su <b>cobertura</b>: cuántos médicos de su fichero ya evaluó. Toca uno para ver su detalle y sus últimas evaluaciones.</p>
            <div class="flex flex-wrap items-center gap-2 mb-3"><span class="text-xs font-semibold text-slate-500">Ordenar por</span>${Object.entries(ORDENES).map(([k, [t]]) =>
            `<button type="button" class="chip !h-8" aria-pressed="${window.App.equipo.orden === k}" onclick="App.equipo.ordenar('${k}')">${t}</button>`).join('')}
            <span class="flex-1"></span>
            <label class="text-xs font-semibold text-slate-600 flex items-center gap-2">Evaluaciones
                <select class="filter-select !rounded-full !py-1.5 !text-xs" onchange="App.equipo.verCruce(this.value)">
                    ${[['todos', 'Todas'], ['validos', 'Sin cruce errado'], ['cruce', 'Solo cruce errado']].map(([v, t]) => `<option value="${v}" ${window.App.equipo.cruce === v ? 'selected' : ''}>${t}</option>`).join('')}
                </select></label></div>`;
        if (!lista.length) return orden + vacio('No hay visitadores con estos filtros.');
        const pag = paginaDe('visitadores', lista);
        const tarjetas = pag.items.map((v, j) => {
            const i = pag.desde + j;
            const iniciales = v.nombre.split(/\s+/).filter(Boolean).slice(0, 2).map(x => x[0]).join('');
            const completo = v.fichero.size && v.pct >= 100;
            return `<article class="bg-white rounded-3xl border border-slate-200 overflow-hidden" id="vm_${i}">
                <button type="button" class="w-full text-left p-4 flex flex-col gap-3" onclick="App.equipo.abrirVm(${i}, ${argE(v.nombre)})" aria-expanded="false">
                    <div class="flex items-center gap-3">
                        <span class="w-11 h-11 rounded-full ${completo ? 'bg-green-100 text-green-800' : 'bg-blue-50 text-blue-800'} font-bold flex items-center justify-center shrink-0">${completo ? '<span class="material-symbols-outlined">emoji_events</span>' : escE(iniciales)}</span>
                        <div class="flex-1 min-w-0">
                            <div class="text-sm font-bold text-slate-800 truncate">${escE(nomE(v.nombre))}</div>
                            <div class="text-[11px] text-slate-500 truncate">${esNacional() ? escE(v.gerente) + ' · ' : ''}${fmtE(v.evaluados.size)} de ${fmtE(v.fichero.size)} médicos · ${fmtE(v.encuestas)} evaluaciones</div>
                        </div>
                        <div class="text-right shrink-0"><div class="text-xl font-display font-extrabold text-slate-800">${fmtE(v.pct, 0)}%</div></div>
                        <span class="material-symbols-outlined text-slate-500 transition" data-flecha>expand_more</span>
                    </div>
                    ${barra(v.pct)}
                    <div class="flex flex-wrap gap-1.5">
                        ${pastillaUltima(v.dias)}
                        ${pastillaCalidad(v.calidad, v.comparables)}
                        ${v.linea && esNacional() ? pastilla('category', v.linea) : ''}
                        ${v.fueraMetricas ? pastilla('query_stats', 'No cuenta en las métricas', 'bg-slate-200 text-slate-700', 'Tiene acceso, pero no suma en los números del distrito ni nacionales') : ''}
                    </div>
                </button>
                <div class="hidden border-t border-slate-100 p-4" data-detalle></div>
            </article>`;
        }).join('');
        return orden + `<div class="grid lg:grid-cols-2 gap-3 items-start">${tarjetas}</div>` + controles('visitadores', pag, lista.length);
    }

    window.App.equipo.abrirVm = function(i, nombre) {
        const st = window.App.state;
        const tarjeta = document.getElementById('vm_' + i);
        if (!tarjeta) return;
        const zona = tarjeta.querySelector('[data-detalle]');
        const boton = tarjeta.querySelector('button[aria-expanded]');
        const abierto = !zona.classList.contains('hidden');
        zona.classList.toggle('hidden', abierto);
        boton.setAttribute('aria-expanded', String(!abierto));
        const flecha = tarjeta.querySelector('[data-flecha]');
        if (flecha) flecha.style.transform = abierto ? '' : 'rotate(180deg)';
        if (abierto) return;
        const v = window.App.equipo.estadisticas().vms.find(x => x.nombre === nombre);
        if (!v) return;
        const evals = v.evals.slice().sort((a, b) => String(b.timestamp || '').localeCompare(String(a.timestamp || '')));
        const fecha = (t) => t ? new Date(t).toLocaleDateString('es-VE', { day: '2-digit', month: 'short' }) : '';
        const filas = evals.slice(0, 30).map(ev => `<li class="flex items-center gap-2 py-2">
            <span class="eval-cuadrante ${window.App.ux.claseDeEtiqueta(ev.cuadrante)}">${escE(ev.cuadrante || '—')}</span>
            <button type="button" class="flex-1 min-w-0 text-left" onclick="App.ficha.abrir(${argE(ev.medico_id)})">
                <div class="text-sm font-semibold text-slate-800 truncate">${ev.cruceErrado ? '<span title="Cruce errado">⚠️ </span>' : ''}${escE(nomE(ev.medico_name))}</div>
                <div class="text-[11px] text-slate-500 truncate">${escE(ev.mercado || 'General')} · ${fecha(ev.timestamp)}${ev.cruceErrado && ev.nombreFichero ? ' · Fichero: ' + escE(ev.nombreFichero) : ''}</div>
            </button>
            ${st.soloLectura ? '' : `<button class="w-9 h-9 rounded-full text-blue-700 flex items-center justify-center" title="Editar" onclick="adminEditEval(${argE(ev.firebaseId)})"><span class="material-symbols-outlined text-[18px]">edit</span></button>
            <button class="w-9 h-9 rounded-full text-rose-700 flex items-center justify-center" title="Eliminar" onclick="adminDeleteEval(${argE(ev.firebaseId)})"><span class="material-symbols-outlined text-[18px]">delete</span></button>`}
        </li>`).join('');
        const modo = window.App.equipo.matrizVm === 'closeup' ? 'closeup' : 'evaluaciones';
        const totalCu = Object.values(v.celdas).reduce((s, n) => s + n, 0);
        const dato = (titulo, valor, extra = '') => `<div class="rounded-2xl bg-slate-50 px-3 py-2"><div class="text-[11px] text-slate-500">${titulo}</div><div class="text-sm font-bold text-slate-800">${valor}</div>${extra ? `<div class="text-[11px] text-slate-500">${extra}</div>` : ''}</div>`;
        zona.innerHTML = `<div class="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
                ${dato('Médicos evaluados', `${fmtE(v.evaluados.size)} de ${fmtE(v.fichero.size)}`, `cobertura ${fmtE(v.pct, 0)}%`)}
                ${dato('Evaluaciones', fmtE(v.encuestas), `${fmtE(v.semana)} esta semana`)}
                ${dato('La Santé', `${fmtE(v.share, 1)}%${tendenciaE(v.share, v.shareAntes)}`, 'de las recetas de sus médicos')}
                ${dato('Oportunidad', `+${fmtE(v.gap)} Rx`, 'para subir de adopción')}
            </div>
            <div class="flex flex-col sm:flex-row gap-4">
                <div>
                    <div class="flex gap-1 mb-2" role="group" aria-label="Qué muestra la matriz">
                        <button type="button" class="chip !h-8 !px-3 !text-xs" aria-pressed="${modo === 'evaluaciones'}" onclick="App.equipo.verMatrizVm(${i}, ${argE(nombre)}, 'evaluaciones')">Su evaluación</button>
                        <button type="button" class="chip !h-8 !px-3 !text-xs" aria-pressed="${modo === 'closeup'}" onclick="App.equipo.verMatrizVm(${i}, ${argE(nombre)}, 'closeup')">CloseUp</button>
                    </div>
                    ${miniMatriz(modo === 'closeup' ? v.celdas : v.celdasEval, modo === 'closeup' ? 'Sus médicos con recetas según CloseUp' : 'Sus evaluaciones por cuadrante')}
                    <p class="text-[11px] text-slate-500 mt-1.5 max-w-[168px]">${modo === 'closeup'
                        ? `Sus ${fmtE(totalCu)} médicos <b>con recetas</b>, según CloseUp (con los filtros elegidos).`
                        : `Sus ${fmtE(v.encuestas)} evaluaciones, según el cuadrante que eligió.`}</p>
                </div>
                <div class="flex-1 min-w-0">
                    <div class="flex items-center justify-between gap-2 mb-1"><div class="text-xs font-bold text-slate-600">Últimas evaluaciones (${fmtE(evals.length)})</div>
                        <button class="h-8 px-3 rounded-full text-xs font-bold text-blue-700 bg-blue-50" onclick="App.equipo.verMedicosDe(${argE(nombre)})">Ver sus médicos</button></div>
                    ${filas ? `<ul class="divide-y divide-slate-100">${filas}</ul>` : '<p class="text-sm text-slate-500 py-2">Todavía no tiene evaluaciones.</p>'}
                    ${evals.length > 30 ? `<p class="text-[11px] text-slate-500 mt-1">Se muestran las 30 más recientes. Todas están en "Evaluaciones" (Excel).</p>` : ''}
                </div>
            </div>`;
    };

    // Resumen por visitador para Excel (lo mismo que se ve, con los filtros de distrito y línea).
    // Reemplaza a "Reportes avanzados" (Fase 11).
    window.App.equipo.resumenCsv = function() {
        const e = window.App.equipo.estadisticas();
        const lista = delDistrito(e.vms).slice().sort(ORDENES.cobertura[1]);
        const celda = (v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
        const num = (n, d = 1) => (Math.round((n || 0) * 10 ** d) / 10 ** d).toString().replace('.', ',');
        const enc = ['visitador', 'distrito', 'linea', 'medicos_fichero', 'medicos_evaluados', 'cobertura_%', 'evaluaciones', 'esta_semana',
            'dias_desde_ultima', 'coincide_con_closeup_%', 'la_sante_%', 'oportunidad_rx'];
        const filas = lista.map(v => [nomE(v.nombre), v.gerente, v.linea, v.fichero.size, v.evaluados.size, num(v.pct), v.encuestas, v.semana,
            v.dias === null ? 'nunca' : v.dias, v.comparables >= 3 ? num(v.calidad) : '', num(v.share), Math.round(v.gap)]);
        return '\ufeff' + [enc.join(';'), ...filas.map(f => f.map(celda).join(';'))].join('\n') + '\n';
    };
    window.App.equipo.descargarResumen = function() {
        const url = URL.createObjectURL(new Blob([window.App.equipo.resumenCsv()], { type: 'text/csv;charset=utf-8' }));
        const a = document.createElement('a');
        a.href = url; a.download = `resumen-equipo-${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
        window.App.ui.showToast('Resumen descargado. Ábrelo con Excel.');
    };

    // Cambia la mini matriz del detalle (su evaluación o CloseUp) sin cerrar la tarjeta
    window.App.equipo.verMatrizVm = function(i, nombre, modo) {
        window.App.equipo.matrizVm = modo;
        const tarjeta = document.getElementById('vm_' + i);
        if (!tarjeta) return;
        tarjeta.querySelector('[data-detalle]').classList.add('hidden');
        window.App.equipo.abrirVm(i, nombre);
    };

    // Lleva a "Médicos" con el filtro de ese visitador
    window.App.equipo.verMedicosDe = function(nombre) {
        const lista = document.querySelectorAll('#listRep input[type="checkbox"]');
        if (!lista.length) return;
        lista.forEach(cb => { cb.checked = cb.value === nombre; });
        window.App.filters.updateGenericSelected('Rep');
        window.App.ux.irA('medicos');
        window.App.ui.showToast(`Médicos de ${nomE(nombre)}`);
    };

    /* ---------- Prioridades ---------- */
    window.App.equipo.prioridades = function(e) {
        const g = window.App.equipo.distrito;
        const linea = window.App.equipo.linea || 'todas';
        return (window.App.state.PROCESSED_DATA || []).filter(doc => {
            if (doc.isZeroRx || !doc.ficheroData || !doc.ficheroData.length || window.App.ux.estaEvaluado(doc)) return false;
            if (linea !== 'todas' && !repsDeFilas(doc.ficheroData).some(rep => e.lineas.get(rep) === linea)) return false;
            if (!esNacional() || g === 'todos') return true;
            return repsDeFilas(doc.ficheroData).some(rep => window.App.state.REP_MANAGER_MAP[rep] === g);
        }).sort((a, b) => b.totalRx - a.totalRx);
    };

    function renderPrioridades(e) {
        const lista = window.App.equipo.prioridades(e);
        if (!lista.length) return vacio('¡Todos los médicos con recetas ya están evaluados! 🎉');
        const ayuda = `<p class="text-sm text-slate-600 bg-blue-50 rounded-2xl p-3 mb-3">Médicos <b>sin evaluar</b> ordenados por sus recetas: los primeros son los que más mueven el mercado.</p>`;
        const pagP = paginaDe('prioridades', lista);
        return ayuda + `<ul class="bg-white rounded-3xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">${pagP.items.map((doc, j) => `
            <li><button type="button" class="w-full text-left flex items-center gap-3 p-3 sm:p-4" onclick="App.ficha.abrir(${argE(doc.id)})">
                <span class="w-8 text-center text-xs font-bold text-slate-500 shrink-0">${pagP.desde + j + 1}</span>
                <span class="eval-cuadrante ${window.App.ux.claseDeEtiqueta(doc.closeupLabel)} !h-10 !min-w-[44px] !rounded-xl text-sm shrink-0">${escE(doc.closeupLabel)}</span>
                <span class="flex-1 min-w-0"><span class="block text-sm font-semibold text-slate-800 truncate">${escE(nomE(doc.name))}</span>
                    <span class="block text-[11px] text-slate-500 truncate">${escE(repsDeFilas(doc.ficheroData).map(nomE).join(', '))} · ${escE(doc.spec || '')}</span></span>
                <span class="text-right shrink-0"><span class="block text-sm font-bold text-slate-800">${fmtE(doc.totalRx)} Rx</span><span class="block text-[11px] text-slate-500">La Santé ${fmtE(doc.share, 1)}%</span></span>
            </button></li>`).join('')}</ul>` + controles('prioridades', pagP, lista.length);
    }

    /* ---------- Alertas ---------- */
    function renderAlertas(e) {
        const todas = delDistrito(e.alertas);
        const filtro = window.App.equipo.filtroAlertas || 'todas';
        const lista = filtro === 'graves' ? todas.filter(a => a.distancia === 2) : todas;
        const graves = todas.filter(a => a.distancia === 2).length;
        const ayuda = `<div class="text-sm text-slate-700 bg-amber-50 rounded-2xl p-3 mb-3 flex gap-3"><span class="material-symbols-outlined text-amber-700">info</span>
            <p>El visitador clasificó el <b>potencial</b> del médico distinto a lo que dicen las recetas de CloseUp. Revisar estos casos mejora la calidad de la matriz. <b>Muy distintas</b>: uno dice A y el otro C.</p></div>
            <div class="flex flex-wrap gap-2 mb-3">
                <button class="chip" aria-pressed="${filtro === 'todas'}" onclick="App.equipo.filtroAlertas='todas'; App.equipo.mostrar={}; App.equipo.render()">Todas <span class="cuenta">${fmtE(todas.length)}</span></button>
                <button class="chip" aria-pressed="${filtro === 'graves'}" onclick="App.equipo.filtroAlertas='graves'; App.equipo.mostrar={}; App.equipo.render()">Muy distintas (A ↔ C) <span class="cuenta">${fmtE(graves)}</span></button>
            </div>`;
        if (!lista.length) return ayuda + vacio('No hay diferencias entre las evaluaciones y CloseUp. ✅');
        const pagA = paginaDe('alertas', lista);
        return ayuda + `<ul class="bg-white rounded-3xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">${pagA.items.map(a => `
            <li><button type="button" class="w-full text-left flex flex-col sm:flex-row sm:items-center gap-3 p-3 sm:p-4" onclick="App.ficha.abrir(${argE(a.doc.id)})">
                <span class="flex-1 min-w-0"><span class="block text-sm font-semibold text-slate-800 truncate">${escE(nomE(a.doc.name))}</span>
                    <span class="block text-[11px] text-slate-500 truncate">Evaluado por <b>${escE(nomE(a.vm))}</b> en ${escE(a.ev.mercado || 'General')}${esNacional() ? ' · ' + escE(a.gerente) : ''}</span></span>
                <span class="flex items-center gap-2 shrink-0 text-xs font-semibold">
                    <span class="flex flex-col items-center"><span class="text-[10px] text-slate-500">CloseUp</span><span class="eval-cuadrante ${window.App.ux.claseDeEtiqueta(a.doc.closeupLabel)}">${escE(a.doc.closeupLabel)}</span></span>
                    <span class="material-symbols-outlined ${a.distancia === 2 ? 'text-rose-600' : 'text-amber-600'}">compare_arrows</span>
                    <span class="flex flex-col items-center"><span class="text-[10px] text-slate-500">Visitador</span><span class="eval-cuadrante ${window.App.ux.claseDeEtiqueta(a.ev.cuadrante)}">${escE(a.ev.cuadrante)}</span></span>
                    ${a.distancia === 2 ? '<span class="rounded-full bg-rose-50 text-rose-800 px-2 py-0.5 text-[10px] font-bold">Muy distinta</span>' : ''}
                </span>
            </button></li>`).join('')}</ul>` + controles('alertas', pagA, lista.length);
    }

    function vacio(texto) {
        return `<div class="bg-white rounded-3xl border border-slate-200 p-8 text-center text-sm text-slate-600">${texto}</div>`;
    }
})();

console.log('[SegmentApp] equipo.js cargado.');

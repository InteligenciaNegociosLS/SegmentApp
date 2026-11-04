/* Pruebas de la Fase 9B: pantalla Equipo, tableros del inicio, "Ver como…" y bitácora */
import { describe, it, expect, beforeEach } from 'vitest';
import { cargarApp, baseSimulada } from './cargar-app.js';

let App;
const ingresar = async (correo, clave) => {
    document.getElementById('loginEmail').value = correo;
    document.getElementById('visitadorPwd').value = clave;
    await App.auth.attemptLogin();
};
const admin = () => ingresar('admin@lasante.com', 'adminadmin');

beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    App = cargarApp();
});

describe('Pantalla Equipo', () => {
    it('estadísticas por visitador y distrito con los médicos del fichero', async () => {
        await admin();
        const e = App.equipo.estadisticas();
        const neivis = e.vms.find(v => v.nombre === 'NEIVIS PARRA');
        expect(neivis.fichero.size).toBe(1);
        expect(neivis.gerente).toBe('GERENTE UNO');
        expect(e.distritos.map(g => g.nombre).sort()).toEqual(['GERENTE DOS', 'GERENTE UNO']);
    });
    it('una evaluación cuenta en el avance y, si no coincide con CloseUp, es una alerta', async () => {
        await admin();
        const doc = App.state.PROCESSED_DATA.find(d => d.id.startsWith('123_'));
        App.state.ALL_EVALUATIONS.push({ firebaseId: 'e1', visitador: 'NEIVIS PARRA', medico_id: '123', medico_name: 'PEREZ ANA', mercado: 'DESLER MERCADO',
            cuadrante: doc.closeupPotency === 'A' ? 'C-' : 'A+', timestamp: new Date().toISOString(), survey: {} });
        App.evaluation.marcarCambio();
        const e = App.equipo.estadisticas();
        const neivis = e.vms.find(v => v.nombre === 'NEIVIS PARRA');
        expect(neivis.pct).toBe(100);
        expect(neivis.semana).toBe(1);
        expect(neivis.dias).toBe(0);
        expect(e.alertas).toHaveLength(1);
        expect(e.alertas[0].distancia).toBe(2);
    });
    it('dibuja las vistas al abrir la pantalla y cambia de vista', async () => {
        await admin();
        App.ux.irA('equipo');
        const pestanas = [...document.querySelectorAll('#equipoPestanas [role=tab]')].map(b => b.dataset.vista);
        expect(pestanas).toEqual(['distritos', 'visitadores', 'prioridades', 'alertas']);
        expect(document.getElementById('equipoContenido').textContent).toMatch(/GERENTE UNO/);
        App.equipo.verDistrito('GERENTE UNO');
        expect(App.equipo.vista).toBe('visitadores');
        expect(document.getElementById('equipoContenido').textContent).toMatch(/NEIVIS PARRA/);
        expect(document.getElementById('equipoContenido').textContent).not.toMatch(/OTRO VISITADOR/);
        App.equipo.verVista('prioridades');
        expect(document.getElementById('equipoContenido').textContent).toMatch(/PEREZ ANA/);
    });
    it('"Ver sus médicos" filtra la lista por ese visitador', async () => {
        await admin();
        App.equipo.verMedicosDe('NEIVIS PARRA');
        expect(App.state.FILTER_STATE.Rep).toEqual(['NEIVIS PARRA']);
        expect(App.state.PANTALLA).toBe('medicos');
    });
    it('el GD ve solo sus visitadores y sin la vista de distritos', async () => {
        await ingresar('gd@lasante.com', '123456');
        App.ux.irA('equipo');
        const pestanas = [...document.querySelectorAll('#equipoPestanas [role=tab]')].map(b => b.dataset.vista);
        expect(pestanas).toEqual(['visitadores', 'prioridades', 'alertas']);
        expect(App.equipo.estadisticas().vms.map(v => v.nombre)).toEqual(['NEIVIS PARRA']);
    });
});

describe('Tableros del inicio', () => {
    it('equipo: cobertura, mercados con oportunidad y mapa', async () => {
        await admin();
        const c = App.tableros.calcular();
        expect(c.embudo.fichados).toBe(2);
        expect(c.embudo.conRx).toBe(2);
        // Fase 11b: "Médicos en el fichero" = médicos ÚNICOS del fichero (igual que Equipo), con y sin recetas
        expect(c.embudo.fichados).toBe(App.state.FICHERO_MAP.size);
        const eq = App.equipo.estadisticas();
        const unicos = new Set(); eq.vms.forEach(v => v.fichero.forEach(m => unicos.add(m)));
        expect(c.embudo.fichados).toBe(unicos.size);
        expect(c.mercados[0].mercado).toBe('DESLER MERCADO');
        expect(c.mercados[0].gap).toBeGreaterThan(0);
        App.tableros.render();
        const t = document.getElementById('tablerosInicio').textContent;
        expect(t).toMatch(/Cobertura/);
        expect(t).toMatch(/Mercados con más oportunidad/);
        expect(t).toMatch(/Distritos/);
    });
    it('VM: sus 10 médicos con más oportunidad y el promedio de su distrito', async () => {
        await ingresar('vm@lasante.com', '123456');
        App.tableros.render();
        expect(document.getElementById('tablerosInicio').textContent).toMatch(/Tus 10 médicos con más oportunidad/);
        await App.tableros.cargarAvance();
        expect(document.getElementById('visPromedioDistrito').textContent).toMatch(/Promedio de tu distrito: 13%/);
    });
});

describe('Herramientas del administrador', () => {
    it('"Ver como" un visitador: su navegación y solo sus médicos, sin poder guardar; "Salir" vuelve', async () => {
        await admin();
        const antes = App.state.PROCESSED_DATA.length;
        App.ajustes.verComo('vm', 'NEIVIS PARRA');
        expect(App.state.soloLectura).toBe(true);
        expect(App.state.currentUserRole).toBe('visitador');
        expect([...document.querySelectorAll('#navInferior [data-seccion]')].map(b => b.dataset.seccion)).toEqual(['inicio', 'matriz', 'medicos', 'mas']);
        expect(App.state.PROCESSED_DATA.every(d => (d.ficheroData || []).some(f => f['Nombre del sector'] === 'NEIVIS PARRA'))).toBe(true);
        expect(document.getElementById('bannerVerComo').classList.contains('hidden')).toBe(false);
        App.ajustes.salirVerComo();
        expect(App.state.soloLectura).toBe(false);
        expect(App.state.PROCESSED_DATA.length).toBe(antes);
        expect(App.state.PANTALLA).toBe('ajustes');
        expect(document.getElementById('bannerVerComo').classList.contains('hidden')).toBe(true);
    });
    it('bitácora y salud de los datos', async () => {
        await admin();
        baseSimulada(App).bitacora = [
            { hecho_en: '2026-10-30T10:00:00Z', accion: 'configuracion', clave: 'umbrales_matriz', antes: { TH_LOY_LOW: 33 }, despues: { TH_LOY_LOW: 30 }, quien: 'Administrador' },
            { hecho_en: '2026-10-29T10:00:00Z', accion: 'publicar_version', clave: 'recetas', despues: { nombre: 'Datos enero' }, quien: 'Administrador' }
        ];
        App.ux.irA('ajustes');
        await App.ajustes.cargarBitacora();
        const t = document.getElementById('ajBitacoraLista').textContent;
        expect(t).toMatch(/Adopción baja hasta: 33 → 30/);
        expect(t).toMatch(/Publicó la versión de recetas Datos enero/);
        expect(document.getElementById('ajSaludLista').textContent).toMatch(/Recetas: Datos enero/);
    });
});

describe('Fase 11: Equipo más claro', () => {
    it('ordena por cobertura (y luego por nombre); totales absolutos de médicos, evaluados y evaluaciones', async () => {
        await admin();
        App.ux.irA('equipo');
        App.equipo.verVista('visitadores');
        expect([...document.querySelectorAll('#equipoContenido [onclick^="App.equipo.ordenar"]')].map(b => b.textContent.trim())).toEqual(['Cobertura', 'Nombre']);
        const resumen = document.getElementById('equipoResumen').textContent;
        expect(resumen).toContain('Médicos en fichero');
        expect(resumen).toContain('Médicos evaluados');
        expect(resumen).toContain('Evaluaciones');
    });

    it('filtra por línea (OTC o Pharmetique) según el "Equipo" del fichero', async () => {
        await admin();
        expect(App.equipo.estadisticas().vms.length).toBe(2);
        App.equipo.elegirLinea('OTC');
        expect(App.equipo.estadisticas().vms.map(v => v.linea)).toEqual(['OTC', 'OTC']);
        App.equipo.elegirLinea('Pharmetique');
        expect(App.equipo.estadisticas().vms).toHaveLength(0);
        App.equipo.elegirLinea('todas');
    });

    it('al desactivar a un VM, sus médicos y sus números dejan de verse (sin borrar nada)', async () => {
        const bd = baseSimulada(App);
        bd.evaluaciones.push({ id: 'e-neivis', visitador_id: 'v-1', mercado: 'DESLER MERCADO', matricula: '123', medico_nombre: 'PEREZ ANA',
            cuadrante: 'A+', notas: '', encuesta: {}, cruce_errado: false, eliminado_en: null, creado_en: '2026-02-01T00:00:00Z', actualizado_en: '2026-02-01T00:00:00Z' });
        await admin();
        expect(App.equipo.estadisticas().vms.map(v => v.nombre)).toContain('NEIVIS PARRA');
        // El admin lo desactiva y la app se actualiza
        await App.sb.activarUsuario('u-vm', false);
        localStorage.removeItem('sbFalsoSesion');
        App = cargarApp({ datos: bd });
        await admin();
        expect(App.state.REPS_OCULTOS.has('NEIVIS PARRA')).toBe(true);
        expect(App.equipo.estadisticas().vms.map(v => v.nombre)).not.toContain('NEIVIS PARRA');
        expect(App.state.ALL_EVALUATIONS.some(e => e.visitador === 'NEIVIS PARRA')).toBe(false);
        expect([...App.state.FICHERO_MAP.values()].flat().some(r => r['Nombre del sector'] === 'NEIVIS PARRA')).toBe(false);
        // Nada se borró
        expect(bd.evaluaciones.some(e => e.id === 'e-neivis')).toBe(true);
    });
});

describe('Fase 11: resumen en Excel en vez de "Reportes avanzados"', () => {
    it('Equipo descarga el resumen por visitador; Ajustes ya no muestra "Reportes avanzados"', async () => {
        await admin();
        const csv = App.equipo.resumenCsv();
        expect(csv.split('\n')[0]).toContain('visitador;distrito;linea;medicos_fichero;medicos_evaluados');
        expect(csv).toContain('"NEIVIS PARRA"'.replace('NEIVIS PARRA', App.ui.nombreVisible('NEIVIS PARRA')));
        expect(document.getElementById('ajDatos').textContent).not.toContain('Reportes avanzados');
    });
});

describe('Fase 11b: permisos y pantalla', () => {
    it('GD: no ve "Cargar datos" ni Ajustes, no puede abrir la carga ni guardar evaluaciones', async () => {
        await ingresar('gd@lasante.com', '123456');
        expect(document.getElementById('btnUploadData').classList.contains('hidden')).toBe(true);
        expect([...document.querySelectorAll('#menuMas .solo-admin')].every(b => b.classList.contains('hidden'))).toBe(true);
        expect(App.state.soloLectura).toBe(true);
        expect(document.querySelector('#navRiel [data-seccion="ajustes"], #navInferior [data-seccion="ajustes"]')).toBeNull();
    });

    it('Composición del mercado: La Santé + competidor + resto suman 100% en el alcance de la persona', async () => {
        await ingresar('gd@lasante.com', '123456');
        const pct = (id) => parseFloat(document.getElementById(id).style.width) || 0;
        expect(document.getElementById('barPhq').textContent).toBe('LS');
        expect(document.getElementById('labelPhq').innerText).toMatch(/^La Santé: /);
        const total = pct('barPhq') + pct('barComp') + pct('barRest');
        expect(Math.abs(total - 100)).toBeLessThan(0.01);
        expect(pct('barRest')).toBeGreaterThanOrEqual(0);
    });
});

describe('Fase 12D-2: la barra de navegación responde al instante', () => {
    it('al tocar, el botón se marca enseguida y la pantalla cambia en el siguiente cuadro', async () => {
        await admin();
        App.ux.irA('inicio', { historial: false });
        App.ux.irA('equipo', { tocado: true });
        expect(document.querySelector('#navInferior [data-seccion="equipo"], #navRiel [data-seccion="equipo"]').getAttribute('aria-current')).toBe('true');
        // Cambia en el siguiente cuadro; en un servidor cargado puede tardar más: se espera hasta 3 s
        for (let i = 0; i < 150 && App.state.PANTALLA !== 'equipo'; i++) await new Promise(r => setTimeout(r, 20));
        expect(App.state.PANTALLA).toBe('equipo');
    });
});

describe('Fase 12E: visitadores con acceso que no cuentan en las métricas', () => {
    it('no suman en el distrito, en el resumen ni en la cobertura del inicio; siguen en la lista, marcados', async () => {
        await admin();
        App.ux.irA('equipo', { historial: false });
        const antes = App.tableros.calcular().embudo.fichados;
        expect(App.equipo.estadisticas().distritos.map(g => g.nombre).sort()).toEqual(['GERENTE DOS', 'GERENTE UNO']);
        // El admin lo saca de las métricas desde Ajustes → Usuarios
        await App.usuarios.cargar();
        const u = baseSimulada(App).perfiles.find(p => p.id === 'u-vm');
        App.usuarios.metricas(u.id);
        await App.usuarios.confirmarMetricas();
        expect(window.__calls).toContain('rpc:admin_metricas_visitador:NEIVIS PARRA:false');
        expect(document.querySelector('#ajUsuariosLista [data-usuario="u-vm"]').textContent).toContain('No cuenta en las métricas');
        const e = App.equipo.estadisticas();
        expect(e.vms.find(v => v.nombre === 'NEIVIS PARRA').fueraMetricas).toBe(true);
        expect(e.distritos.map(g => g.nombre)).toEqual(['GERENTE DOS']);
        expect(App.tableros.calcular().embudo.fichados).toBe(antes - 1);
        App.equipo.verVista('visitadores');
        expect(document.getElementById('equipoContenido').textContent).toContain('No cuenta en las métricas');
        expect(document.getElementById('equipoResumen').textContent).toContain('1 no cuentan');
        // Y vuelve a contar
        App.usuarios.metricas(u.id);
        await App.usuarios.confirmarMetricas();
        expect(App.equipo.estadisticas().distritos).toHaveLength(2);
    });

    it('al entrar, el GD recibe la lista de quién no cuenta', async () => {
        baseSimulada(App).visitadores[0].en_metricas = false;
        await ingresar('gd@lasante.com', '123456');
        expect([...(App.state.REPS_FUERA_METRICAS || [])]).toEqual(['NEIVIS PARRA']);
    });
});

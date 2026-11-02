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
        // Fase 11: "Médicos en el fichero" y "Evaluados" son los mismos números que los filtros rápidos
        App.ux.renderChipsRapidos();
        const chip = (t) => Number([...document.querySelectorAll('#chipsRapidos .chip')].find(b => b.textContent.includes(t)).querySelector('.cuenta').textContent.replace(/\D/g, ''));
        const conFichero = App.state.PROCESSED_DATA.filter(x => x.isZeroRx || (x.ficheroData && x.ficheroData.length));
        expect(c.embudo.fichados).toBe(conFichero.length);
        expect(c.embudo.evaluadosFichero).toBe(conFichero.filter(x => App.ux.estaEvaluado(x)).length);
        if (conFichero.length === App.state.PROCESSED_DATA.length) {
            expect(chip('Todos')).toBe(c.embudo.fichados);
            expect(chip('Evaluados')).toBe(c.embudo.evaluadosFichero);
        }
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

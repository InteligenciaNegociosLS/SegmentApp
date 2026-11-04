/* Pruebas de la Fase 9C: campanita de avisos */
import { describe, it, expect, beforeEach } from 'vitest';
import { cargarApp, baseSimulada } from './cargar-app.js';

let App;
const ingresar = async (correo, clave) => {
    document.getElementById('loginEmail').value = correo;
    document.getElementById('visitadorPwd').value = clave;
    await App.auth.attemptLogin();
};
const hace = (min) => new Date(Date.now() - min * 60000).toISOString();
const evaluacion = (extra) => ({ visitador: 'NEIVIS PARRA', medico_id: '123', medico_name: 'PEREZ ANA', mercado: 'DESLER MERCADO', cuadrante: 'A+', survey: {}, ...extra });

beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    App = cargarApp();
});

describe('Avisos', () => {
    it('el VM no tiene campanita; el GD sí', async () => {
        await ingresar('vm@lasante.com', '123456');
        expect(document.getElementById('btnAvisos').classList.contains('hidden')).toBe(true);
        await App.auth.logoutSession();
        await ingresar('gd@lasante.com', '123456');
        await App.avisos.alEntrar();
        expect(document.getElementById('btnAvisos').classList.contains('hidden')).toBe(false);
    });

    it('evaluación nueva, VM que terminó y alerta: con número de no leídos', async () => {
        await ingresar('gd@lasante.com', '123456');
        await App.avisos.alEntrar();
        App.state.ALL_EVALUATIONS.push(evaluacion({ firebaseId: 'e1', id: 'e1', timestamp: hace(5) }));
        App.evaluation.marcarCambio();
        App.matrix.aggregateAndCalculate();
        App.avisos.actualizar();
        const tipos = App.avisos.lista.map(a => a.tipo);
        expect(tipos).toContain('evaluacion');
        expect(tipos).toContain('completo');          // NEIVIS PARRA tiene 1 médico en el fichero de prueba
        expect(App.avisos.lista.find(a => a.tipo === 'evaluacion').texto).toMatch(/NEIVIS PARRA<\/b> evaluó a <b>PEREZ ANA/);
        expect(App.avisos.sinLeer()).toBeGreaterThanOrEqual(2);
        expect(document.getElementById('avisosNumero').classList.contains('hidden')).toBe(false);
    });

    it('"Marcar todo como leído" se guarda en el servidor y en el equipo', async () => {
        await ingresar('gd@lasante.com', '123456');
        await App.avisos.alEntrar();
        App.state.ALL_EVALUATIONS.push(evaluacion({ firebaseId: 'e1', id: 'e1', timestamp: hace(5) }));
        App.evaluation.marcarCambio();
        App.avisos.actualizar();
        App.avisos.abrir();
        await App.avisos.marcarLeidos();
        expect(App.avisos.sinLeer()).toBe(0);
        expect(baseSimulada(App).avisos_vistos).toHaveLength(1);
        expect(document.getElementById('avisosNumero').classList.contains('hidden')).toBe(true);
        // Otro dispositivo: toma la marca del servidor
        App.avisos.vistoHasta = 0;
        localStorage.clear();
        await App.avisos.alEntrar();
        expect(App.avisos.sinLeer()).toBe(0);
    });

    it('cada 2 minutos trae SOLO lo nuevo y avisa', async () => {
        await ingresar('gd@lasante.com', '123456');
        await App.avisos.alEntrar();
        const bd = baseSimulada(App);
        const vis = bd.visitadores.find(v => v.nombre_sector === 'NEIVIS PARRA').id;
        bd.evaluaciones.push({ id: 'n1', visitador_id: vis, matricula: '00123', matricula_norm: '123', medico_nombre: 'PEREZ ANA', mercado: 'DESLER MERCADO',
            cuadrante: 'A', eliminado_en: null, creado_en: hace(1), actualizado_en: new Date().toISOString() });
        const n = await App.avisos.buscarNuevas();
        expect(n).toBe(1);
        expect(App.state.ALL_EVALUATIONS.some(e => e.id === 'n1')).toBe(true);
        expect(document.getElementById('toast').innerText).toMatch(/evaluación nueva/);
        expect(await App.avisos.buscarNuevas()).toBe(0);
    });

    it('tocar un aviso de alerta lleva a Equipo → Alertas', async () => {
        await ingresar('admin@lasante.com', 'adminadmin');
        App.avisos.lista = [{ tipo: 'alerta', t: Date.now(), vm: 'NEIVIS PARRA', texto: '', icono: 'warning', color: '' }];
        App.avisos.ir(0);
        expect(App.state.PANTALLA).toBe('equipo');
        expect(App.equipo.vista).toBe('alertas');
    });
});

describe('Fase 12E: recordatorio de carga (solo admin)', () => {
    const DIA = 86400000;
    const vigente = (tipo, dias) => ({ id: 'v-' + tipo, nombre: tipo === 'recetas' ? 'CloseUp 06/2026' : 'Fichero junio', tipo, es_vigente: true, estado: 'publicado',
        fecha: '2026-06-30', publicado_en: new Date(Date.now() - dias * DIA).toISOString() });

    it('a los 90 días avisa que toca cargar CloseUp; va arriba y lleva a Cargar datos', async () => {
        await ingresar('admin@lasante.com', 'adminadmin');
        App.state.VERSIONES = [vigente('recetas', 95), vigente('fichero', 20)];
        const r = App.avisos.recordatorios();
        expect(r).toHaveLength(1);
        expect(r[0]).toMatchObject({ tipo: 'recordatorio', fuente: 'recetas', fijo: true });
        expect(r[0].texto).toContain('Toca cargar <b>CloseUp</b>');
        expect(r[0].texto).toContain('hace 95 días');
        App.avisos.generar();
        expect(App.avisos.lista[0].tipo).toBe('recordatorio');
        App.avisos.ir(0);
        expect(document.getElementById('cargaDatosModal').classList.contains('hidden')).toBe(false);
    });

    it('se puede cambiar o apagar (0 = nunca); el GD no lo recibe', async () => {
        await ingresar('admin@lasante.com', 'adminadmin');
        App.state.VERSIONES = [vigente('recetas', 40)];
        expect(App.avisos.recordatorios()).toHaveLength(0);
        await App.catalogos.guardarRecordatorio('closeup', '30');
        expect(baseSimulada(App).configuracion.find(c => c.clave === 'recordatorio_cargas').valor).toEqual({ recetas: 30, fichero: 90 });
        expect(App.avisos.recordatorios()).toHaveLength(1);
        await App.catalogos.guardarRecordatorio('closeup', '0');
        expect(App.avisos.recordatorios()).toHaveLength(0);
        await App.auth.logoutSession();
        await ingresar('gd@lasante.com', '123456');
        App.state.VERSIONES = [vigente('recetas', 400)];
        expect(App.avisos.recordatorios()).toHaveLength(0);
    });
});

describe('Fase 12E: espacio usado en Supabase (solo admin)', () => {
    it('Salud de los datos muestra la base y los archivos frente al plan gratis', async () => {
        await ingresar('admin@lasante.com', 'adminadmin');
        await App.ajustes.renderSalud();
        await new Promise(r => setTimeout(r, 0));
        await App.ajustes.renderEspacio();
        const li = document.getElementById('ajSaludEspacio');
        expect(li.textContent).toContain('Espacio en Supabase');
        expect(li.textContent).toContain('120 MB de 500 MB · 24%');
        expect(li.textContent).toContain('Hay espacio de sobra');
    });

    it('al pasar del 80% avisa en la campanita y lleva a Salud de los datos', async () => {
        baseSimulada(App).espacio = { base_bytes: 450 * 1048576, archivos_bytes: 10, archivos: 1, tablas: [], versiones: [] };
        await ingresar('admin@lasante.com', 'adminadmin');
        await App.avisos.alEntrar();
        await new Promise(r => setTimeout(r, 0));
        const a = App.avisos.lista.find(x => x.tipo === 'espacio');
        expect(a.texto).toContain('la base de datos (90%)');
        expect(App.avisos.lista[0].fijo).toBe(true);
    });
});

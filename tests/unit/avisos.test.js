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

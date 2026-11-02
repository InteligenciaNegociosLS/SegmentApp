/* Pruebas de la Fase 8: app sin internet (cola de evaluaciones, sesión guardada) */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { cargarApp, baseSimulada, RAIZ } from './cargar-app.js';

let App;
let enLinea = true;
Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => enLinea });

async function ingresar(correo, clave) {
    document.getElementById('loginEmail').value = correo;
    document.getElementById('visitadorPwd').value = clave;
    await App.auth.attemptLogin();
}
const evaluacion = (medico, mercado, cuadrante, visitador = 'v-1') => ({
    visitador_id: visitador, visitador: 'NEIVIS PARRA', medico_id: medico, medico_name: 'PEREZ ANA',
    mercado, cuadrante, notas: 'sin internet', survey: { q1: '10 a 20' }, timestamp: new Date().toISOString(), _user_role: 'vm'
});

beforeEach(() => {
    enLinea = true;
    localStorage.clear();
    sessionStorage.clear();
    App = cargarApp();
});
afterEach(() => { enLinea = true; });

describe('Evaluar sin conexión', () => {
    it('sin internet la evaluación queda en la cola del dispositivo y cuenta como evaluada', async () => {
        await ingresar('vm@lasante.com', '123456');
        enLinea = false;
        await App.evaluation.guardarOEncolar(evaluacion('00123', 'DESLER MERCADO', 'A'), 'ok');
        expect(App.state.OFFLINE_QUEUE).toHaveLength(1);
        expect(await window.localforage.getItem('OFFLINE_QUEUE')).toHaveLength(1);
        expect(document.getElementById('toast').innerText).toMatch(/Sin conexión/);
        // Al volver a leer las evaluaciones (sin las del servidor), la pendiente sigue contando
        App.evaluation.armarMapaVisitador([]);
        expect(App.state.EVALUACIONES_VISITADOR['123']['DESLER MERCADO']).toMatchObject({ cuadrante: 'A', porSubir: true });
        expect(document.getElementById('chipPendientes').classList.contains('hidden')).toBe(false);
        expect(document.getElementById('lblPendientes').textContent).toBe('1');
    });

    it('el mismo médico y mercado evaluado dos veces sin internet deja solo la última', async () => {
        await ingresar('vm@lasante.com', '123456');
        enLinea = false;
        await App.evaluation.guardarOEncolar(evaluacion('00123', 'DESLER MERCADO', 'A'));
        await App.evaluation.guardarOEncolar(evaluacion('123', 'DESLER MERCADO', 'B+'));
        await App.evaluation.guardarOEncolar(evaluacion('123', 'OTRO MERCADO', 'C'));
        expect(App.state.OFFLINE_QUEUE.map(i => i.evaluacion.cuadrante)).toEqual(['B+', 'C']);
    });

    it('al volver internet se suben solas y la cola queda vacía', async () => {
        await ingresar('vm@lasante.com', '123456');
        enLinea = false;
        await App.evaluation.guardarOEncolar(evaluacion('00123', 'DESLER MERCADO', 'A'));
        enLinea = true;
        await App.offline.syncOfflineEvaluations();
        expect(App.state.OFFLINE_QUEUE).toHaveLength(0);
        expect(await window.localforage.getItem('OFFLINE_QUEUE')).toHaveLength(0);
        expect(baseSimulada(App).evaluaciones.filter(e => e.cuadrante === 'A')).toHaveLength(1);
        expect(document.getElementById('chipPendientes').classList.contains('hidden')).toBe(true);
    });

    it('si el servidor falla, la evaluación NO se borra de la cola', async () => {
        await ingresar('vm@lasante.com', '123456');
        enLinea = false;
        await App.evaluation.guardarOEncolar(evaluacion('00123', 'DESLER MERCADO', 'A'));
        enLinea = true;
        App.sb.guardarEvaluacion = async () => { throw new Error('Failed to fetch'); };
        await App.offline.syncOfflineEvaluations();
        expect(App.state.OFFLINE_QUEUE).toHaveLength(1);
    });

    it('las de otra persona que usó el mismo equipo se quedan esperando a esa persona', async () => {
        await ingresar('vm@lasante.com', '123456');
        App.state.OFFLINE_QUEUE.push({ tipo: 'evaluacion', evaluacion: evaluacion('456', 'DESLER MERCADO', 'C', 'v-2') });
        await App.offline.syncOfflineEvaluations();
        expect(App.state.OFFLINE_QUEUE).toHaveLength(1);
        expect(App.state.OFFLINE_QUEUE[0].evaluacion.visitador_id).toBe('v-2');
        expect(App.offline.pendientesPropias()).toHaveLength(0);
    });

    it('cerrar sesión no borra las evaluaciones por subir y lo avisa', async () => {
        await ingresar('vm@lasante.com', '123456');
        enLinea = false;
        await App.evaluation.guardarOEncolar(evaluacion('00123', 'DESLER MERCADO', 'A'));
        await App.auth.logoutSession();
        expect(await window.localforage.getItem('OFFLINE_QUEUE')).toHaveLength(1);
        expect(document.getElementById('toast').innerText).toMatch(/1 evaluación sin subir/);
    });
});

describe('Sesión sin internet', () => {
    const guardarSesion = () => localStorage.setItem('sb-prueba-auth-token',
        JSON.stringify({ access_token: 'vencido', refresh_token: 'r', user: { id: 'u-vm', email: 'vm@lasante.com' } }));
    const clienteSinRed = () => {
        App.supabase._cliente.auth.getSession = async () => ({ data: { session: null }, error: { name: 'AuthRetryableFetchError', message: 'Failed to fetch' } });
    };

    it('con la sesión vencida y sin internet abre con la persona guardada', async () => {
        guardarSesion(); clienteSinRed(); enLinea = false;
        expect(await App.sb.usuarioActual()).toMatchObject({ id: 'u-vm' });
    });
    it('con internet y sin sesión pide iniciar sesión', async () => {
        guardarSesion();
        App.supabase._cliente.auth.getSession = async () => ({ data: { session: null }, error: null });
        expect(await App.sb.usuarioActual()).toBeNull();
    });
    it('sin sesión guardada, aunque no haya internet, pide iniciar sesión', async () => {
        clienteSinRed(); enLinea = false;
        expect(await App.sb.usuarioActual()).toBeNull();
    });
});

describe('App instalable', () => {
    it('la página enlaza el manifiesto y los íconos', () => {
        const html = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');
        expect(html).toContain('rel="manifest" href="manifest.webmanifest"');
        expect(html).toContain('apple-touch-icon');
    });
});

/* Pruebas de login, permisos en pantalla y evaluaciones (Firebase simulado) */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { cargarApp } from './cargar-app.js';

let App;
const visible = (id) => !document.getElementById(id).classList.contains('hidden');

function usuarioFalso(claims, uid = 'u1') {
    return { uid, getIdTokenResult: vi.fn(async () => ({ claims })) };
}

beforeEach(() => {
    localStorage.clear();
    App = cargarApp();
});

describe('Perfil desde el token de Firebase', () => {
    it('acepta visitador con nombre y admin; rechaza sin rol', () => {
        expect(App.auth.isValidProfile({ role: 'visitador', name: 'ANA' })).toBe(true);
        expect(App.auth.isValidProfile({ role: 'admin', name: 'Administrador' })).toBe(true);
        expect(App.auth.isValidProfile({ role: 'visitador', name: '' })).toBe(false);
        expect(App.auth.isValidProfile({ role: null })).toBe(false);
        expect(App.auth.isValidProfile(null)).toBe(false);
    });
    it('sin conexión usa el último perfil verificado del MISMO usuario', async () => {
        await App.auth.getProfile(usuarioFalso({ role: 'visitador', visitadorName: 'ANA' }, 'u1'));
        const sinRed = { uid: 'u1', getIdTokenResult: async () => { throw new Error('red'); } };
        expect(await App.auth.getProfile(sinRed)).toMatchObject({ role: 'visitador', name: 'ANA' });
        const otro = { uid: 'u2', getIdTokenResult: async () => { throw new Error('red'); } };
        await expect(App.auth.getProfile(otro)).rejects.toThrow();
    });
});

describe('Pantalla de ingreso', () => {
    it('sin sesión no muestra datos', () => {
        App.auth.showLoginRequired();
        expect(visible('loginRequiredState')).toBe(true);
        expect(visible('dashboardContent')).toBe(false);
        expect(visible('filterBar')).toBe(false);
    });
    it('clave incorrecta muestra mensaje y no entra', async () => {
        window.firebaseAuthApi = { signIn: async () => { const e = new Error('x'); e.code = 'auth/invalid-credential'; throw e; }, signOut: vi.fn() };
        document.getElementById('loginEmail').value = 'vm@empresa.com';
        document.getElementById('visitadorPwd').value = 'mala';
        await App.auth.attemptLogin();
        expect(document.getElementById('toast').innerText).toBe('Correo o clave incorrectos.');
        expect(App.state.currentUserRole).toBe('guest');
    });
    it('usuario sin rol asignado: se cierra su sesión', async () => {
        const signOut = vi.fn(async () => {});
        window.firebaseAuthApi = { signIn: async () => ({ user: usuarioFalso({}) }), signOut };
        document.getElementById('loginEmail').value = 'x@empresa.com';
        document.getElementById('visitadorPwd').value = '123456';
        await App.auth.attemptLogin();
        expect(signOut).toHaveBeenCalled();
        expect(App.state.currentUserRole).toBe('guest');
    });
    it('visitador entra y ve su tablero (no el del admin)', async () => {
        window.firebaseAuthApi = { signIn: async () => ({ user: usuarioFalso({ role: 'visitador', visitadorName: 'ANA' }) }), signOut: vi.fn() };
        document.getElementById('loginEmail').value = 'ana@empresa.com';
        document.getElementById('visitadorPwd').value = '123456';
        await App.auth.attemptLogin();
        expect(App.state.currentUserRole).toBe('visitador');
        expect(App.state.currentVisitadorName).toBe('ANA');
        expect(visible('visitadorDashboard')).toBe(true);
        expect(visible('adminDashboard')).toBe(false);
        expect(document.getElementById('visitadorPwd').value).toBe('');
    });
    it('editar sessionStorage ya no da permisos de admin', async () => {
        sessionStorage.setItem('userRole', 'admin');
        window.firebaseAuthReady = Promise.resolve(null);
        await App.auth.checkAuthentication();
        expect(App.state.isAdmin).toBe(false);
        expect(App.state.currentUserRole).toBe('guest');
    });
    it('recuperar clave pide el correo y envía el mensaje', async () => {
        const sendReset = vi.fn(async () => {});
        window.firebaseAuthApi = { sendReset };
        document.getElementById('loginEmail').value = '';
        await App.auth.sendPasswordReset();
        expect(sendReset).not.toHaveBeenCalled();
        document.getElementById('loginEmail').value = 'Ana@Empresa.com';
        await App.auth.sendPasswordReset();
        expect(sendReset).toHaveBeenCalledWith('ana@empresa.com');
    });
});

describe('Evaluaciones', () => {
    it('admin: el índice por médico se actualiza al agregar evaluaciones', () => {
        App.state.currentUserRole = 'admin';
        App.state.ALL_EVALUATIONS = [{ medico_id: '00123', mercado: 'M1' }];
        expect(App.evaluation.getEvaluationsForDoc('123_PEREZ')).toHaveLength(1);
        App.state.ALL_EVALUATIONS.push({ medico_id: '123', mercado: 'M2' });
        expect(App.evaluation.getEvaluationsForDoc('123')).toHaveLength(2);
        expect(App.evaluation.getEvaluationsForDoc('999')).toEqual([]);
    });
    it('"Recargar" conserva las evaluaciones pendientes sin conexión', async () => {
        const pendiente = [{ docRefId: 'ANA_1_M', payload: { visitador: 'ANA' } }];
        await localforage.setItem('OFFLINE_QUEUE', pendiente);
        await localforage.setItem('RAW_DATA_STR', '[]');
        await App.ui.executeClearSession().catch(() => {});   // jsdom no recarga la página
        expect(await localforage.getItem('OFFLINE_QUEUE')).toEqual(pendiente);
        expect(await localforage.getItem('RAW_DATA_STR')).toBeNull();
    });
    it('borrado masivo desactivado', () => {
        App.admin.executeClearAllEvals();
        App.admin.executeClearRepEvals();
        expect(window.__calls.filter(c => c.startsWith('deleteDoc'))).toEqual([]);
    });
});

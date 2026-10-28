/* Pruebas de login, permisos en pantalla, evaluaciones y versiones (Supabase simulado) */
import { describe, it, expect, beforeEach } from 'vitest';
import { cargarApp, baseSimulada } from './cargar-app.js';

let App;
const visible = (id) => !document.getElementById(id).classList.contains('hidden');
const toast = () => document.getElementById('toast').innerText;

async function ingresar(correo, clave) {
    document.getElementById('loginEmail').value = correo;
    document.getElementById('visitadorPwd').value = clave;
    await App.auth.attemptLogin();
}

beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    App = cargarApp();
});

describe('Perfil desde la base', () => {
    it('acepta vm con visitador, admin, gd y gte_nacional; rechaza sin rol', () => {
        expect(App.auth.isValidProfile({ rol: 'vm', visitadorNombre: 'ANA' })).toBe(true);
        expect(App.auth.isValidProfile({ rol: 'admin' })).toBe(true);
        expect(App.auth.isValidProfile({ rol: 'gd' })).toBe(true);
        expect(App.auth.isValidProfile({ rol: 'gte_nacional' })).toBe(true);
        expect(App.auth.isValidProfile({ rol: 'vm', visitadorNombre: '' })).toBe(false);
        expect(App.auth.isValidProfile({ rol: null })).toBe(false);
        expect(App.auth.isValidProfile(null)).toBe(false);
    });
    it('sin conexión usa el último perfil verificado del MISMO usuario', async () => {
        await App.auth.getProfile({ id: 'u-vm' });
        App.sb.perfil = async () => { throw new Error('red'); };
        expect(await App.auth.getProfile({ id: 'u-vm' })).toMatchObject({ rol: 'vm', visitadorNombre: 'NEIVIS PARRA' });
        await expect(App.auth.getProfile({ id: 'u-otro' })).rejects.toThrow();
    });
});

describe('Pantalla de ingreso', () => {
    it('sin sesión no muestra datos', async () => {
        await App.auth.checkAuthentication();
        expect(visible('loginRequiredState')).toBe(true);
        expect(visible('dashboardContent')).toBe(false);
        expect(visible('filterBar')).toBe(false);
    });
    it('clave incorrecta muestra mensaje y no entra', async () => {
        await ingresar('vm@lasante.com', 'mala');
        expect(toast()).toBe('Correo o clave incorrectos.');
        expect(App.state.currentUserRole).toBe('guest');
    });
    it('usuario sin rol asignado: se cierra su sesión', async () => {
        await ingresar('norole@lasante.com', '123456');
        expect(window.__calls).toContain('signOut');
        expect(toast()).toContain('permisos');
        expect(App.state.currentUserRole).toBe('guest');
    });
    it('visitador entra, descarga la versión vigente y ve su tablero', async () => {
        await ingresar('vm@lasante.com', '123456');
        expect(App.state.currentUserRole).toBe('visitador');
        expect(App.state.currentVisitadorName).toBe('NEIVIS PARRA');
        expect(App.state.rolReal).toBe('vm');
        expect(visible('visitadorDashboard')).toBe(true);
        expect(visible('adminDashboard')).toBe(false);
        expect(document.getElementById('visitadorPwd').value).toBe('');
        expect(window.__calls).toContain('descargar:https://archivos.prueba/snapshots/s-rec-1/datos.csv.gz');
        expect(App.state.RAW_DATA).toHaveLength(3);
        expect(document.getElementById('lblVersionDatos').textContent).toBe('Datos: Hoy');
        expect(visible('btnUploadData')).toBe(false);
    });
    it('segunda entrada usa la copia local (no descarga de nuevo)', async () => {
        await ingresar('vm@lasante.com', '123456');
        const descargas = () => window.__calls.filter(c => c.startsWith('descargar:')).length;
        const antes = descargas();
        await App.main.reintentarCarga();
        expect(descargas()).toBe(antes);
    });
    it('admin ve el panel del equipo y el botón de cargar datos', async () => {
        await ingresar('admin@lasante.com', 'adminadmin');
        expect(App.state.isAdmin).toBe(true);
        expect(App.state.soloLectura).toBe(false);
        expect(visible('adminDashboard')).toBe(true);
        expect(visible('btnUploadData')).toBe(true);
    });
    it('GD entra en modo consulta: sin herramientas de admin', async () => {
        await ingresar('gd@lasante.com', '123456');
        expect(App.state.rolReal).toBe('gd');
        expect(App.state.soloLectura).toBe(true);
        expect(visible('btnUploadData')).toBe(false);
        expect(visible('analysisTools')).toBe(false);
        expect(App.state.REPS_PERMITIDOS).toBeInstanceOf(Set);
    });
    it('editar sessionStorage ya no da permisos de admin', async () => {
        sessionStorage.setItem('userRole', 'admin');
        await App.auth.checkAuthentication();
        expect(App.state.isAdmin).toBe(false);
        expect(App.state.currentUserRole).toBe('guest');
    });
    it('recuperar clave pide el correo y envía el mensaje', async () => {
        document.getElementById('loginEmail').value = '';
        await App.auth.sendPasswordReset();
        expect(window.__calls.some(c => c.startsWith('reset:'))).toBe(false);
        document.getElementById('loginEmail').value = 'Ana@Empresa.com';
        await App.auth.sendPasswordReset();
        expect(window.__calls).toContain('reset:ana@empresa.com');
    });
    it('nueva clave: exige 8 caracteres y que coincidan', async () => {
        await ingresar('vm@lasante.com', '123456');
        document.getElementById('nuevaClave1').value = 'corta';
        document.getElementById('nuevaClave2').value = 'corta';
        await App.auth.guardarNuevaClave();
        expect(window.__calls).not.toContain('updateUser');
        document.getElementById('nuevaClave1').value = 'claveNueva1';
        document.getElementById('nuevaClave2').value = 'claveNueva1';
        await App.auth.guardarNuevaClave();
        expect(window.__calls).toContain('updateUser');
    });
    it('si no hay versión publicada: mensaje claro y el admin puede cargar', async () => {
        baseSimulada(App).data_snapshots.length = 0;
        await ingresar('admin@lasante.com', 'adminadmin');
        expect(visible('emptyState')).toBe(true);
        expect(document.getElementById('emptyStateMsg').innerText).toContain('no hay una versión de recetas publicada');
        expect(visible('btnCargaDesdeVacio')).toBe(true);
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
    it('guardar crea una vez y luego actualiza la misma (sin duplicar)', async () => {
        await ingresar('vm@lasante.com', '123456');
        const ev = { visitador_id: 'v-1', medico_id: '00123', medico_name: 'PEREZ ANA', mercado: 'DESLER MERCADO', cuadrante: 'A', survey: { q1: '10 a 20' } };
        const a = await App.sb.guardarEvaluacion(ev);
        const b = await App.sb.guardarEvaluacion({ ...ev, cuadrante: 'B' });
        expect(b.id).toBe(a.id);
        expect(b.visitador).toBe('NEIVIS PARRA');
        expect(baseSimulada(App).evaluaciones.filter(e => !e.eliminado_en)).toHaveLength(1);
    });
    it('eliminar solo marca la evaluación (no se borra)', async () => {
        await ingresar('admin@lasante.com', 'adminadmin');
        const a = await App.sb.guardarEvaluacion({ visitador_id: 'v-1', medico_id: '123', mercado: 'M', survey: {} });
        await App.sb.eliminarEvaluacion(a.id);
        const bd = baseSimulada(App).evaluaciones;
        expect(bd).toHaveLength(1);
        expect(bd[0].eliminado_en).toBeTruthy();
        expect(await App.sb.evaluaciones()).toHaveLength(0);
    });
    it('"Recargar" conserva las evaluaciones pendientes sin conexión', async () => {
        const pendiente = [{ tipo: 'evaluacion', evaluacion: { visitador_id: 'v-1' } }];
        await localforage.setItem('OFFLINE_QUEUE', pendiente);
        await localforage.setItem('DATA_COPIA', { x: 1 });
        await App.ui.executeClearSession().catch(() => {});   // jsdom no recarga la página
        expect(await localforage.getItem('OFFLINE_QUEUE')).toEqual(pendiente);
        expect(await localforage.getItem('DATA_COPIA')).toBeNull();
    });
    it('borrado masivo desactivado', () => {
        App.admin.executeClearAllEvals();
        App.admin.executeClearRepEvals();
        expect(window.__calls.filter(c => c.startsWith('update:evaluaciones'))).toEqual([]);
    });
});

describe('Versiones de datos', () => {
    it('elegir una versión anterior la descarga y la etiqueta lo avisa', async () => {
        const bd = baseSimulada(App);
        bd.data_snapshots.push({ id: 's-rec-0', nombre: 'Datos diciembre', tipo: 'recetas', fecha: '2025-12-31', estado: 'publicado', es_vigente: false, archivo: 'snapshots/s-rec-0/datos.csv.gz', creado_en: '2025-12-31' });
        await ingresar('vm@lasante.com', '123456');
        await App.versiones.abrir();
        const sel = document.getElementById('versionSel_recetas');
        expect(sel.options).toHaveLength(2);
        expect(sel.options[sel.selectedIndex].textContent).toContain('(Hoy)');
        sel.value = 's-rec-0';
        await App.versiones.aplicar();
        expect(window.__calls).toContain('descargar:https://archivos.prueba/snapshots/s-rec-0/datos.csv.gz');
        expect(document.getElementById('lblVersionDatos').textContent).toBe('Datos: versión anterior');
        await App.versiones.volverAHoy();
        expect(document.getElementById('lblVersionDatos').textContent).toBe('Datos: Hoy');
    });
    it('los borradores no aparecen en el selector', async () => {
        baseSimulada(App).data_snapshots.push({ id: 's-b', nombre: 'Borrador', tipo: 'recetas', fecha: '2026-02-28', estado: 'borrador', es_vigente: false, archivo: 'x', creado_en: '2026-02-28' });
        await ingresar('admin@lasante.com', 'adminadmin');
        await App.versiones.abrir();
        expect(document.getElementById('versionSel_recetas').options).toHaveLength(1);
    });
});

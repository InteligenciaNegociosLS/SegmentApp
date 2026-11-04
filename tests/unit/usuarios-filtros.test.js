/* Fase 12F: filtros de Usuarios (acceso, métricas, línea) y "Salud de los datos" con el fichero de hoy */
import { describe, it, expect, beforeEach } from 'vitest';
import { cargarApp, baseSimulada } from './cargar-app.js';

let App;
const ingresar = async (correo, clave) => {
    document.getElementById('loginEmail').value = correo;
    document.getElementById('visitadorPwd').value = clave;
    await App.auth.attemptLogin();
};
const elegir = (id, v) => { document.getElementById(id).value = v; App.usuarios.pintar(); };
const vistos = () => [...document.querySelectorAll('#ajUsuariosLista [data-usuario]')].map(li => li.dataset.usuario);
beforeEach(() => { localStorage.clear(); sessionStorage.clear(); App = cargarApp(); });

describe('Usuarios: filtros y línea', () => {
    it('la línea sale del campo "Equipo" del fichero (7 → OTC, 6 → LA SANTE)', () => {
        expect(App.data.nombreLinea('7')).toBe('OTC');
        expect(App.data.nombreLinea('06')).toBe('LA SANTE');
        expect(App.data.nombreLinea('1')).toBe('LINEA_HIBRIDA_1');
        expect(App.data.nombreLinea('otc')).toBe('OTC');
        expect(App.data.nombreLinea('')).toBe('');
    });

    it('filtra por acceso activo, por métricas y por línea; el VM muestra su línea', async () => {
        await ingresar('admin@lasante.com', 'adminadmin');
        await App.usuarios.cargar();
        const todos = vistos().length;
        expect(document.querySelector('#ajUsuariosLista [data-usuario="u-vm"]').textContent).toContain('OTC');
        expect([...document.getElementById('ajUsuariosLinea').options].map(o => o.value)).toEqual(['', 'OTC']);
        elegir('ajUsuariosLinea', 'OTC');
        expect(vistos()).toContain('u-vm');
        expect(vistos().every(id => ['u-vm', 'u-gd'].includes(id))).toBe(true);
        elegir('ajUsuariosLinea', '');
        // Métricas: solo visitadores
        elegir('ajUsuariosMetricas', 'si');
        expect(vistos()).toEqual(['u-vm']);
        App.state.REPS_FUERA_METRICAS = new Set(['NEIVIS PARRA']);
        elegir('ajUsuariosMetricas', 'no');
        expect(vistos()).toEqual(['u-vm']);
        elegir('ajUsuariosMetricas', 'si');
        expect(vistos()).toEqual([]);
        elegir('ajUsuariosMetricas', '');
        // Acceso
        baseSimulada(App).perfiles.find(p => p.id === 'u-vm').activo = false;
        await App.usuarios.cargar();
        elegir('ajUsuariosActivo', 'no');
        expect(vistos()).toEqual(['u-vm']);
        elegir('ajUsuariosActivo', 'si');
        expect(vistos().length).toBe(todos - 1);
    });

    it('"Salud de los datos" cuenta solo los visitadores del fichero de hoy', async () => {
        baseSimulada(App).visitadores.push({ id: 'v-viejo', nombre_sector: 'VISITADOR VIEJO', perfil_id: null, activo: true, distrito: 'D9' });
        await ingresar('admin@lasante.com', 'adminadmin');
        await App.ajustes.renderSalud();
        const texto = document.getElementById('ajSaludLista').textContent;
        expect(texto).toContain('1 de 2 visitadores del fichero de hoy todavía no tienen usuario');
        expect(texto).toContain('OTRO VISITADOR');
        expect(texto).toContain('1 de ficheros anteriores sin usuario');
    });
});

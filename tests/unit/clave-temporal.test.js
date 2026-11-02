/* Fase 10: sin correo automático. Quien entra con la clave temporal que le
   envió el administrador debe crear su propia clave. */
import { describe, it, expect, beforeEach } from 'vitest';
import { cargarApp, baseSimulada } from './cargar-app.js';

let App;
const visible = (id) => !document.getElementById(id).classList.contains('hidden');
const ingresar = async (correo, clave) => {
    document.getElementById('loginEmail').value = correo;
    document.getElementById('visitadorPwd').value = clave;
    await App.auth.attemptLogin();
};

beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    App = cargarApp();
});

describe('Clave temporal', () => {
    it('al entrar con clave temporal pide crear la propia (sin "Ahora no")', async () => {
        const u = baseSimulada(App).usuarios.find(x => x.email === 'vm@lasante.com');
        u.clave = 'maro-kebi-4821';
        u.metadata = { clave_temporal: true };
        await ingresar('vm@lasante.com', 'maro-kebi-4821');
        expect(visible('nuevaClaveModal')).toBe(true);
        expect(document.getElementById('nuevaClaveTitulo').innerText).toBe('Crea tu clave personal');
        expect(visible('btnCancelarNuevaClave')).toBe(false);
        document.getElementById('nuevaClave1').value = 'mi-clave-propia';
        document.getElementById('nuevaClave2').value = 'mi-clave-propia';
        await App.auth.guardarNuevaClave();
        expect(visible('nuevaClaveModal')).toBe(false);
        expect(u.clave).toBe('mi-clave-propia');
        expect(u.metadata.clave_temporal).toBe(false);
    });

    it('con su clave de siempre no pide nada; puede cambiarla desde "Más"', async () => {
        await ingresar('vm@lasante.com', '123456');
        expect(visible('nuevaClaveModal')).toBe(false);
        App.auth.mostrarNuevaClave('cambiar');
        expect(visible('nuevaClaveModal')).toBe(true);
        expect(visible('btnCancelarNuevaClave')).toBe(true);
        expect(document.querySelector('#menuMas [onclick*="mostrarNuevaClave"]')).not.toBeNull();
    });
});

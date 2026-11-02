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

describe('Fase 11: ingreso más claro', () => {
    it('el ojo muestra y oculta la clave', () => {
        const campo = document.getElementById('visitadorPwd');
        const ojo = campo.parentElement.querySelector('.ver-clave');
        App.ui.verClave(ojo, 'visitadorPwd');
        expect(campo.type).toBe('text');
        expect(ojo.getAttribute('aria-pressed')).toBe('true');
        App.ui.verClave(ojo, 'visitadorPwd');
        expect(campo.type).toBe('password');
        expect(document.querySelectorAll('#nuevaClaveModal .ver-clave')).toHaveLength(2);
    });

    it('"¿Olvidaste tu clave?" explica qué hacer dentro de la ventana, sin enviar correos', async () => {
        await App.auth.sendPasswordReset();
        const m = document.getElementById('loginMensaje');
        expect(m.classList.contains('hidden')).toBe(false);
        expect(m.textContent).toContain('administrador');
        expect(window.__calls.some(c => c.startsWith('reset:'))).toBe(false);
    });

    it('la guía rápida espera a que la persona cree su clave', async () => {
        const u = baseSimulada(App).usuarios.find(x => x.email === 'vm@lasante.com');
        u.clave = 'maro-kebi-4821';
        u.metadata = { clave_temporal: true };
        await ingresar('vm@lasante.com', 'maro-kebi-4821');
        App.ux.iniciarGuia(true);
        expect(document.getElementById('guia').classList.contains('hidden')).toBe(true);
        expect(App.ux.guiaEnEspera).toBe(true);
        document.getElementById('nuevaClave1').value = 'corta';
        document.getElementById('nuevaClave2').value = 'corta';
        await App.auth.guardarNuevaClave();
        expect(document.getElementById('nuevaClaveMensaje').textContent).toContain('8 caracteres');
        document.getElementById('nuevaClave1').value = 'mi-clave-propia';
        document.getElementById('nuevaClave2').value = 'mi-clave-propia';
        await App.auth.guardarNuevaClave();
        expect(document.getElementById('guia').classList.contains('hidden')).toBe(false);
    });
});

/* Fase 10C: el administrador gestiona usuarios desde Ajustes → Usuarios
   (nombre, correo, clave temporal y acceso), sin Cloud Shell. */
import { describe, it, expect, beforeEach } from 'vitest';
import { cargarApp, baseSimulada } from './cargar-app.js';
import { SILABAS, generarClaveTemporal, mensajeAcceso } from '../../scripts/migracion/usuarios.mjs';

let App;
const ingresar = async (correo, clave) => {
    document.getElementById('loginEmail').value = correo;
    document.getElementById('visitadorPwd').value = clave;
    await App.auth.attemptLogin();
};
const fila = (id) => document.querySelector(`#ajUsuariosLista [data-usuario="${id}"]`);
const boton = (id, accion) => fila(id).querySelector(`[data-accion="${accion}"]`);
const modalVisible = () => !document.getElementById('usuarioModal').classList.contains('hidden');
// El botón "confirmar" de la ventana llama a esta función (se revisa que exista y se llama directo)
const confirmar = async () => {
    const llamada = document.querySelector('#usuarioModalCuerpo [data-accion="confirmar"]').getAttribute('onclick');
    await App.usuarios[llamada.match(/App\.usuarios\.(\w+)\(\)/)[1]]();
};

beforeEach(async () => {
    localStorage.clear();
    sessionStorage.clear();
    App = cargarApp();
});

describe('Ajustes → Usuarios', () => {
    it('la clave temporal y el mensaje son iguales a los del script de Cloud Shell', () => {
        expect(App.usuarios.SILABAS).toEqual(SILABAS);
        const azar = (n) => (n * 7 + 3) % n;   // determinista
        expect(App.usuarios.generarClave(azar)).toBe(generarClaveTemporal(azar));
        expect(App.usuarios.generarClave()).toMatch(/^[a-z]{4}-[a-z]{4}-\d{4}$/);
        const a = { nombre: 'Ada', correo: 'ada@lasante.com.ve', clave: 'maro-kebi-4821', tipo: 'temporal' };
        expect(App.usuarios.mensaje(a, 'https://app.x')).toBe(mensajeAcceso(a, 'https://app.x'));
        expect(App.usuarios.mensaje({ ...a, tipo: 'actual' }, 'https://app.x')).toBe(mensajeAcceso({ ...a, tipo: 'actual' }, 'https://app.x'));
    });

    it('el admin ve la lista; no puede darse clave temporal ni desactivarse a sí mismo', async () => {
        await ingresar('admin@lasante.com', 'adminadmin');
        await App.usuarios.cargar();
        expect(document.querySelectorAll('#ajUsuariosLista [data-usuario]')).toHaveLength(3);
        expect(fila('u-vm').textContent).toContain('vm@lasante.com');
        expect(boton('u-admin', 'clave')).toBeNull();
        expect(boton('u-admin', 'activar')).toBeNull();
        expect(boton('u-vm', 'clave')).not.toBeNull();
        // Buscar y filtrar por rol
        document.getElementById('ajUsuariosBuscar').value = 'gerente';
        App.usuarios.pintar();
        expect(document.querySelectorAll('#ajUsuariosLista [data-usuario]')).toHaveLength(1);
        document.getElementById('ajUsuariosBuscar').value = '';
        document.getElementById('ajUsuariosRol').value = 'vm';
        App.usuarios.pintar();
        expect([...document.querySelectorAll('#ajUsuariosLista [data-usuario]')].map(x => x.dataset.usuario)).toEqual(['u-vm']);
    });

    it('cambia el correo: la persona entra con el nuevo y la misma clave; muestra el mensaje para enviar', async () => {
        await ingresar('admin@lasante.com', 'adminadmin');
        await App.usuarios.cargar();
        App.usuarios.editar('u-vm');
        expect(modalVisible()).toBe(true);
        document.getElementById('usuarioCorreo').value = 'Neivis.Parra@LaSante.com.ve';
        await App.usuarios.guardarEdicion();
        expect(window.__calls).toContain('rpc:admin_editar_usuario:neivis.parra@lasante.com.ve');
        expect(document.getElementById('usuarioMensaje').value).toContain('Usa la misma clave de siempre');
        expect(document.getElementById('usuarioMensaje').value).toContain('neivis.parra@lasante.com.ve');
        expect(fila('u-vm').textContent).toContain('neivis.parra@lasante.com.ve');
        App.usuarios.cerrar();
        expect(modalVisible()).toBe(false);
        // Un correo que ya usa otra persona: se avisa y no se cierra
        App.usuarios.editar('u-gd');
        document.getElementById('usuarioCorreo').value = 'admin@lasante.com';
        await App.usuarios.guardarEdicion();
        expect(document.getElementById('usuarioError').innerText).toContain('ya lo usa otra persona');
        expect(modalVisible()).toBe(true);
        // Correo mal escrito: ni siquiera se envía
        document.getElementById('usuarioCorreo').value = 'sin-arroba';
        await App.usuarios.guardarEdicion();
        expect(document.getElementById('usuarioError').innerText).toBe('El correo no es válido.');
    });

    it('da una clave temporal: se ve una vez con el mensaje, y al entrar la app pide crear la propia', async () => {
        await ingresar('admin@lasante.com', 'adminadmin');
        await App.usuarios.cargar();
        App.usuarios.clave('u-gd');
        await confirmar();
        const clave = document.getElementById('usuarioClave').textContent;
        expect(clave).toMatch(/^[a-z]{4}-[a-z]{4}-\d{4}$/);
        expect(document.getElementById('usuarioMensaje').value).toContain(`Clave temporal: ${clave}`);
        expect(fila('u-gd').textContent).toContain('Clave temporal pendiente');
        const u = baseSimulada(App).usuarios.find(x => x.id === 'u-gd');
        expect(u.clave).toBe(clave);
        // El GD entra con ella y la app le pide su clave personal
        App.usuarios.cerrar();
        await App.auth.logout?.();
        localStorage.removeItem('sbFalsoSesion');
        App = cargarApp({ datos: baseSimulada(App) });
        await ingresar('gd@lasante.com', clave);
        expect(document.getElementById('nuevaClaveModal').classList.contains('hidden')).toBe(false);
    });

    it('desactiva y reactiva el acceso sin borrar nada', async () => {
        await ingresar('admin@lasante.com', 'adminadmin');
        await App.usuarios.cargar();
        App.usuarios.activar('u-vm');
        await confirmar();
        expect(window.__calls).toContain('rpc:admin_activar_usuario:false');
        expect(fila('u-vm').textContent).toContain('Acceso desactivado');
        App.usuarios.activar('u-vm');
        await confirmar();
        expect(window.__calls).toContain('rpc:admin_activar_usuario:true');
        expect(baseSimulada(App).perfiles.find(x => x.id === 'u-vm').activo).toBe(true);
    });

    it('un visitador no puede leer la lista', async () => {
        await ingresar('vm@lasante.com', '123456');
        await App.usuarios.cargar();
        expect(document.querySelectorAll('#ajUsuariosLista [data-usuario]')).toHaveLength(0);
        expect(document.getElementById('ajUsuariosLista').textContent).toContain('Solo el administrador');
    });
});

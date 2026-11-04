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

describe('Ajustes → Usuarios: varios a la vez', () => {
    it('da claves temporales a todos los de la lista (menos al admin), y se pueden descargar', async () => {
        await ingresar('admin@lasante.com', 'adminadmin');
        await App.usuarios.cargar();
        expect(document.querySelector('#btnClavesMasivas [data-cuenta]').textContent).toBe('2');
        App.usuarios.clavesMasivas();
        expect(document.getElementById('usuarioModalCuerpo').textContent).toContain('2 personas');
        await confirmar();
        expect(window.__calls).toContain('rpc:admin_claves_temporales:2');
        const bd = baseSimulada(App);
        const vm = bd.usuarios.find(x => x.id === 'u-vm'), gd = bd.usuarios.find(x => x.id === 'u-gd');
        expect(vm.clave).toMatch(/^[a-z]{4}-[a-z]{4}-\d{4}$/);
        expect(gd.clave).not.toBe(vm.clave);
        expect(bd.usuarios.find(x => x.id === 'u-admin').clave).toBe('adminadmin');
        // Se ven una vez, con el mensaje de cada uno, y el archivo para descargar
        expect(document.querySelectorAll('#usuarioAccesos li')).toHaveLength(2);
        expect(document.getElementById('usuarioAccesos').textContent).toContain(vm.clave);
        const archivo = App.usuarios.accesosCsv();
        expect(archivo.startsWith('﻿correo,nombre,rol,clave,mensaje')).toBe(true);
        expect(archivo).toContain(`Clave temporal: ${vm.clave}`);
        expect(archivo).toContain(gd.clave);
        expect(fila('u-vm').textContent).toContain('Clave temporal pendiente');
    });

    it('solo a los filtrados: con el rol "Gerentes de distrito" solo cambia la del GD', async () => {
        await ingresar('admin@lasante.com', 'adminadmin');
        await App.usuarios.cargar();
        document.getElementById('ajUsuariosRol').value = 'gd';
        App.usuarios.pintar();
        expect(document.querySelector('#btnClavesMasivas [data-cuenta]').textContent).toBe('1');
        App.usuarios.clavesMasivas();
        await confirmar();
        expect(window.__calls).toContain('rpc:admin_claves_temporales:1');
        expect(baseSimulada(App).usuarios.find(x => x.id === 'u-vm').clave).toBe('123456');
    });

    it('la lista de usuarios para descargar no lleva claves', async () => {
        await ingresar('admin@lasante.com', 'adminadmin');
        await App.usuarios.cargar();
        const lista = App.usuarios.listaCsv();
        expect(lista.split('\n')[0]).toBe('﻿nombre,correo,rol,visitador,distritos,acceso,clave_temporal_pendiente,ultimo_ingreso');
        expect(lista).toContain('"vm@lasante.com"');
        expect(lista).not.toContain('123456');
        expect(lista).not.toContain('adminadmin');
    });
});

describe('Fase 12C: crear el acceso de personas nuevas desde la app', () => {
    it('lista quién no tiene acceso y crea el usuario de un visitador nuevo con clave temporal', async () => {
        await ingresar('admin@lasante.com', 'adminadmin');
        await App.usuarios.cargar();
        await App.usuarios.cargarPendientes();
        const p = App.usuarios.pendientes();
        const i = p.visitadores.findIndex(v => v.nombre === 'OTRO VISITADOR');
        expect(i).toBeGreaterThanOrEqual(0);
        expect(document.getElementById('ajUsuariosPendientes').textContent).toContain('OTRO VISITADOR');
        App.usuarios.nuevo('vm', i);
        document.getElementById('nuevoCorreo').value = 'Otro.Vm@LaSante.com.ve';
        await App.usuarios.crearNuevo();
        expect(window.__calls).toContain('rpc:admin_crear_usuario:vm:otro.vm@lasante.com.ve');
        const clave = document.getElementById('usuarioClave').textContent;
        expect(clave).toMatch(/^[a-z]{4}-[a-z]{4}-\d{4}$/);
        expect(document.getElementById('usuarioMensaje').value).toContain('otro.vm@lasante.com.ve');
        const bd = baseSimulada(App);
        expect(bd.visitadores.find(v => v.nombre_sector === 'OTRO VISITADOR').perfil_id).toBe('u-otro.vm@lasante.com.ve');
        // Ya no aparece como pendiente
        expect(App.usuarios.pendientes().visitadores.some(v => v.nombre === 'OTRO VISITADOR')).toBe(false);
    });

    it('"Nuevo usuario" crea un Gerente Nacional; un correo repetido se avisa', async () => {
        await ingresar('admin@lasante.com', 'adminadmin');
        await App.usuarios.cargar();
        App.usuarios.nuevo(null);
        document.getElementById('nuevoNombre').value = 'Isabel Medina';
        document.getElementById('nuevoCorreo').value = 'isabel@lasante.com.ve';
        await App.usuarios.crearNuevo();
        expect(window.__calls).toContain('rpc:admin_crear_usuario:gte_nacional:isabel@lasante.com.ve');
        App.usuarios.nuevo(null);
        document.getElementById('nuevoNombre').value = 'Otra';
        document.getElementById('nuevoCorreo').value = 'vm@lasante.com';
        await App.usuarios.crearNuevo();
        expect(document.getElementById('usuarioError').innerText).toContain('ya lo usa otra persona');
    });
});

describe('Fase 12E: listas de 10 en 10 y correo automático', () => {
    it('el correo se arma solo: nombre.apellido@lasante.com.ve (sin tildes ni ñ)', () => {
        const c = App.usuarios.correoSugerido;
        expect(c('NEIVIS PARRA')).toBe('neivis.parra@lasante.com.ve');
        expect(c('José Peña')).toBe('jose.pena@lasante.com.ve');
        expect(c('MARIA JOSE PEREZ GOMEZ')).toBe('maria.perez@lasante.com.ve');
        expect(c('ANA DE LA ROSA')).toBe('ana.rosa@lasante.com.ve');
        expect(c('EI-LING LOPEZ')).toBe('eiling.lopez@lasante.com.ve');
        expect(c('')).toBe('');
    });

    it('"Crear acceso" ya trae el correo sugerido', async () => {
        await ingresar('admin@lasante.com', 'adminadmin');
        await App.usuarios.cargar();
        const i = App.usuarios.pendientes().visitadores.findIndex(v => v.nombre === 'OTRO VISITADOR');
        App.usuarios.nuevo('vm', i);
        expect(document.getElementById('nuevoCorreo').value).toBe('otro.visitador@lasante.com.ve');
    });

    it('crear varios a la vez: revisa los correos, crea los marcados y muestra sus claves', async () => {
        const bd = baseSimulada(App);
        bd.visitadores.push({ id: 'v-n1', nombre_sector: 'LUIS ÑAÑEZ', distrito: '100007', activo: true, perfil_id: null },
            { id: 'v-n2', nombre_sector: 'CARLA DIAZ', distrito: '100007', activo: true, perfil_id: null });
        await ingresar('admin@lasante.com', 'adminadmin');
        await App.usuarios.cargar();
        App.usuarios.nuevosEnBloque();
        const correos = [...document.querySelectorAll('[data-bloque-correo]')].map(x => x.value);
        expect(correos).toEqual(expect.arrayContaining(['luis.nanez@lasante.com.ve', 'carla.diaz@lasante.com.ve', 'otro.visitador@lasante.com.ve']));
        // Desmarca a uno y corrige otro
        const idx = (correo) => [...document.querySelectorAll('[data-bloque-correo]')].findIndex(x => x.value === correo);
        document.querySelector(`[data-bloque-marca="${idx('otro.visitador@lasante.com.ve')}"]`).checked = false;
        document.querySelector(`[data-bloque-correo="${idx('carla.diaz@lasante.com.ve')}"]`).value = 'carla.diaz2@lasante.com.ve';
        await App.usuarios.crearEnBloque();
        expect(window.__calls).toContain('rpc:admin_crear_usuario:vm:luis.nanez@lasante.com.ve');
        expect(window.__calls).toContain('rpc:admin_crear_usuario:vm:carla.diaz2@lasante.com.ve');
        expect(window.__calls).not.toContain('rpc:admin_crear_usuario:vm:otro.visitador@lasante.com.ve');
        expect(document.getElementById('usuarioAccesos').querySelectorAll('li')).toHaveLength(2);
    });

    it('la lista de usuarios va de 10 en 10', async () => {
        const bd = baseSimulada(App);
        for (let n = 0; n < 23; n++) {
            const id = 'u-extra-' + n;
            bd.usuarios.push({ id, email: `extra${n}@lasante.com.ve`, clave: 'x' });
            bd.perfiles.push({ id, correo: `extra${n}@lasante.com.ve`, nombre: `EXTRA ${String(n).padStart(2, '0')}`, rol: 'vm', activo: true });
        }
        await ingresar('admin@lasante.com', 'adminadmin');
        await App.usuarios.cargar();
        expect(document.querySelectorAll('#ajUsuariosLista [data-usuario]')).toHaveLength(10);
        expect(document.getElementById('ajUsuariosPaginas').textContent).toMatch(/Página 1 de \d/);
        App.usuarios.irAPagina(3);
        const total = App.usuarios.filtrados().length;
        expect(document.querySelectorAll('#ajUsuariosLista [data-usuario]')).toHaveLength(total - 20);
        // Buscar vuelve a la primera página
        document.getElementById('ajUsuariosBuscar').value = 'extra';
        App.usuarios.pintar();
        expect(document.getElementById('ajUsuariosPaginas').textContent).toContain('Página 1 de 3');
    });
});

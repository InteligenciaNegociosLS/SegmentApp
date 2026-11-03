/* Fase 12C: cada rol descarga sus datos crudos (VM lo suyo, GD su equipo, admin todo) */
import { describe, it, expect, beforeEach } from 'vitest';
import { cargarApp } from './cargar-app.js';

let App;
const ingresar = async (correo, clave) => {
    document.getElementById('loginEmail').value = correo;
    document.getElementById('visitadorPwd').value = clave;
    await App.auth.attemptLogin();
};
beforeEach(() => { localStorage.clear(); sessionStorage.clear(); App = cargarApp(); });
const filas = (texto) => texto.replace(/^﻿/, '').trim().split('\r\n');

describe('Descargar datos (crudos)', () => {
    it('el admin descarga todo: recetas, fichero y evaluaciones', async () => {
        await ingresar('admin@lasante.com', 'adminadmin');
        const rec = filas(App.descargas.recetasCsv());
        expect(rec[0]).toBe('Medico;Matricula;Mercado;Producto;Px_Product;Domicilio;Cod.Postal;Localidad;Region;Especialidad;Molecula;Clase Terapeutica;Generico;Laboratorio;La Sante');
        expect(rec.length - 1).toBe(App.state.RAW_DATA.length);
        const fic = filas(App.descargas.ficheroCsv());
        expect(fic[0]).toContain('Nombre del sector');
        expect(fic.some(l => l.includes('OTRO VISITADOR'))).toBe(true);
        expect(App.descargas.alcance()).toBe('Todo el país');
        App.descargas.abrir();
        expect(document.getElementById('descargasModal').classList.contains('hidden')).toBe(false);
        expect(document.querySelectorAll('#descargasOpciones button')).toHaveLength(3);
    });

    it('el visitador descarga solo lo suyo', async () => {
        await ingresar('vm@lasante.com', '123456');
        const fic = filas(App.descargas.ficheroCsv());
        expect(fic.slice(1).every(l => l.includes('NEIVIS PARRA'))).toBe(true);
        expect(fic.some(l => l.includes('OTRO VISITADOR'))).toBe(false);
        expect(App.descargas.alcance()).toContain('Tus médicos');
        expect(App.descargas.filasEvaluaciones().every(e => e.visitador === 'NEIVIS PARRA')).toBe(true);
    });

    it('"Ver como" un visitador: el admin descarga solo lo de ese visitador', async () => {
        await ingresar('admin@lasante.com', 'adminadmin');
        App.ajustes.verComo('vm', 'NEIVIS PARRA');
        expect(App.descargas.filasFichero().every(r => r['Nombre del sector'] === 'NEIVIS PARRA')).toBe(true);
        expect(App.descargas.alcance()).toBe('Visitador NEIVIS PARRA');
        App.ajustes.salirVerComo();
    });
});

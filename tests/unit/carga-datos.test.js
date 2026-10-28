/* Pruebas del panel de carga de datos: revisión de archivos y subida por lotes */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { cargarApp, baseSimulada, textoReal } from './cargar-app.js';

let App;
let RECETAS, FICHERO;
beforeAll(() => {
    RECETAS = textoReal('datacloseup.csv.gz');
    FICHERO = textoReal('fichero_medico.csv.gz');
});
beforeEach(() => { localStorage.clear(); App = cargarApp(); });

describe('Revisión con los archivos reales del repositorio', () => {
    it('recetas: 0 errores y el mismo total de filas y recetas', () => {
        const v = App.carga.validarRecetas(App.carga.parsearCsv(RECETAS));
        expect(v.errores).toEqual([]);
        expect(v.ok).toBe(true);
        expect(v.resumen.filas).toBe(231729);
        expect(v.resumen.rx).toBe(801007);
        expect(v.avisos.some(a => a.includes('repiten'))).toBe(true);
    });
    it('fichero: 0 errores, 7.308 filas (las 3 con ";" entre comillas se leen bien)', () => {
        const v = App.carga.validarFichero(App.carga.parsearCsv(FICHERO));
        expect(v.errores).toEqual([]);
        expect(v.resumen.filas).toBe(7308);
        expect(v.resumen.distritos).toBe(7);
    });
});

describe('Revisión de archivos con problemas', () => {
    const encabezado = App => App.carga.COLUMNAS_RECETAS.join(';');
    it('avisa la fila exacta y el motivo', () => {
        const texto = encabezado(App) + '\n' +
            'ANA;1;M;P;5;a;b;c;d;e;f;g;h;i;j\n' +
            ';2;M;P;5;a;b;c;d;e;f;g;h;i;j\n' +
            'LUIS;3;M;P;cinco;a;b;c;d;e;f;g;h;i;j\n';
        const v = App.carga.validarRecetas(App.carga.parsearCsv(texto));
        expect(v.ok).toBe(false);
        expect(v.errores).toEqual([
            { fila: 3, mensaje: 'falta Medico' },
            { fila: 4, mensaje: 'Px_Product "cinco" no es un número entero' }
        ]);
    });
    it('si faltan columnas lo dice antes de revisar filas', () => {
        const v = App.carga.validarRecetas(App.carga.parsearCsv('Medico;Matricula\nANA;1\n'));
        expect(v.ok).toBe(false);
        expect(v.errores[0].mensaje).toContain('Faltan columnas');
    });
    it('columnas en otro orden: se reordenan solas', () => {
        const C = App.carga.COLUMNAS_RECETAS;
        const orden = [1, 0, ...C.slice(2).map((_, i) => i + 2)];
        const fila = ['ANA', '1', 'M', 'P', '5', 'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'];
        const texto = orden.map(i => C[i]).join(';') + '\n' + orden.map(i => fila[i]).join(';') + '\n';
        const v = App.carga.validarRecetas(App.carga.parsearCsv(texto));
        expect(v.ok).toBe(true);
        expect(v.filasCanonicas[0].slice(0, 2)).toEqual(['ANA', '1']);
        expect(v.avisos[0]).toContain('otro orden');
    });
    it('fichero: avisa visitadores nuevos y los que no aparecen (sin borrarlos)', () => {
        const texto = App.carga.COLUMNAS_FICHERO.join(';') + '\n1;ANA;NUEVO VM;S;100001;G;OTC\n';
        const v = App.carga.validarFichero(App.carga.parsearCsv(texto), ['VIEJO VM']);
        expect(v.ok).toBe(true);
        expect(v.avisos.join(' ')).toContain('NUEVOS que se crearán (1): NUEVO VM');
        expect(v.avisos.join(' ')).toContain('no se borran');
    });
});

describe('Archivo de la versión', () => {
    it('el CSV generado se lee igual en la app (comillas, ";" y saltos de línea)', () => {
        const filas = [['A;B', 'con "comillas"', 'dos\nlíneas'], ['x', '', 'tab\taquí']];
        const csv = App.carga.aCsv(['c1', 'c2', 'c3'], filas);
        expect(App.data.parseCSVFast(csv)).toEqual([
            { c1: 'A;B', c2: 'con "comillas"', c3: 'dos\nlíneas' },
            { c1: 'x', c2: '', c3: 'tab aquí' }
        ]);
    });
});

describe('Subida por lotes como borrador', () => {
    it('sube, verifica, guarda el archivo y no publica sola', async () => {
        document.getElementById('loginEmail').value = 'admin@lasante.com';
        document.getElementById('visitadorPwd').value = 'adminadmin';
        await App.auth.attemptLogin();
        App.carga.comprimir = async (t) => new Blob([t]);   // jsdom no comprime
        const C = App.carga.COLUMNAS_RECETAS;
        const texto = C.join(';') + '\n' + Array.from({ length: 4500 }, (_, i) => `DR ${i};${i};M;P;1;a;b;c;d;e;f;g;h;i;j`).join('\n');
        const v = App.carga.validarRecetas(App.carga.parsearCsv(texto));
        const avances = [];
        const id = await App.carga.subir({ tipo: 'recetas', nombre: 'Prueba', fecha: '2026-02-28', validacion: v }, p => avances.push(p.etapa));
        const bd = baseSimulada(App);
        const version = bd.data_snapshots.find(s => s.id === id);
        expect(version).toMatchObject({ estado: 'borrador', es_vigente: false, filas: 4500, archivo: `snapshots/${id}/datos.csv.gz` });
        expect(bd.lotes[id].size).toBe(4500);
        expect(window.__calls.filter(c => c.startsWith('rpc:lote:'))).toEqual(['rpc:lote:2000', 'rpc:lote:2000', 'rpc:lote:500']);
        expect(avances.at(-1)).toBe('listo');
        // Reintentar sobre el mismo borrador no duplica
        await App.carga.subir({ tipo: 'recetas', nombre: 'Prueba', fecha: '2026-02-28', validacion: v, snapshotId: id });
        expect(bd.lotes[id].size).toBe(4500);
        expect(bd.data_snapshots.filter(s => s.nombre === 'Prueba')).toHaveLength(1);
    });
    it('el panel solo abre para el administrador', async () => {
        document.getElementById('loginEmail').value = 'vm@lasante.com';
        document.getElementById('visitadorPwd').value = '123456';
        await App.auth.attemptLogin();
        App.carga.abrirPanel();
        expect(document.getElementById('cargaDatosModal').classList.contains('hidden')).toBe(true);
    });
});

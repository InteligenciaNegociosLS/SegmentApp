/* Fase 12D: CloseUp en un solo paso (lo mismo que hacía Power Query, en la app) */
import { describe, it, expect, beforeEach } from 'vitest';
import { cargarApp } from './cargar-app.js';

let App;
beforeEach(() => { localStorage.clear(); App = cargarApp(); });

// Igual a un archivo del portal: títulos, encabezado doble, "Localidad " con espacio y columnas Domicilio 2…4
const TITULOS = [
    'Medicos Prescriptores por Mercado;;;;;;;;;;;;;;;;;;;;;;;;;;;;;', 'Edicion: 09/2026;;;;', 'Linea: Todas;;;', 'Mercados: ARAII Mercado C09C0;;;',
    'Periodos: TAM 09/26 - ;;;', 'Geografia: VENEZUELA;;;', 'Especialidades: TOTAL ESPECIALIDADES;;;', 'Sin filtros avanzados;;;',
    'Medico;;;;;;TAM 09/26;;;;TAM 09/26;;;;Domicilio;;;;'
];
const CAB = 'Nombre;Matricula;Esp1;Esp2;Representantes;Mercado;Categ;%MS;Px;Productos1;Rnk1;%MS1;Px1;Medico Unico;Domicilio;Cod.Postal;Localidad ;Region;Domicilio 2;Cod.Postal 2;Localidad  2;Region 2';
const fila = (nom, mat, esp, prod, px) => `${nom};${mat};${esp};;;ARAII Mercado C09C0;1;2,377301;434;${prod};1;40,552995;${px};1000382890;CTRA 17 CON CLL 12;3001;CASCO CENTRAL;REG CTRO OCCIDENTE;;;;`;
const archivo = (filas) => [...TITULOS, CAB, ...filas].join('\r\n');
const ARAII = archivo([
    fila('SEIJAS G FRANCYS E', '107041', 'CAR', 'NEFROTAL RWE', 176),
    fila('SEIJAS G FRANCYS E', '107041', 'CAR', 'CANDETIQUE PHQ', 1),
    fila('SEIJAS G FRANCYS E', '107041', 'CAR', 'CANDETIQUE PHQ', 1),        // repetida: se quita
    fila('CLINICA X', '0', 'CAR', 'NEFROTAL RWE', 50),                    // matrícula 0: se quita
    fila('HOSPITAL Y', '555', 'INS', 'NEFROTAL RWE', 40),                 // institución: se quita
    fila('DR UCI', '777', 'UCI', 'NEFROTAL RWE', 9),                      // "UNIDAD DE CUIDADOS INTENS": se quita
    fila('DR NUEVO', '888', 'XXX', 'PRODUCTO RARO ZZZ', 3)                // especialidad y producto sin catálogo
]);

const ctx = () => ({
    especialidades: new Map([['CAR', 'CARDIOLOGIA'], ['UCI', 'UNIDAD DE CUIDADOS INTENS']]),
    laboratorios: new Map([['RWE', 'ROWE-OSMOPHARM'], ['PHQ', 'PHARMETIQUE']]),
    productos: new Map([['NEFROTAL RWE', { laboratorio: 'RWE', molecula: 'LOSARTAN', clase_terapeutica: 'C09C0', generico: 'NO' }],
        ['CANDETIQUE PHQ', { laboratorio: 'PHQ', molecula: 'CANDESARTAN', clase_terapeutica: 'C09C0', generico: 'NO' }]]),
    claseDe: (c) => (c.startsWith('C09C') ? { codigo: 'C09C', nombre: 'ANTAG.ANGIOTENSINA II SOLOS' } : null),
    filtros: { especialidades_excluir: ['DCR', 'INS', 'OTR'], nombres_especialidad_excluir: ['UNIDAD DE CUIDADOS INTENS'], excluir_matricula_cero: true },
    esPropio: (p) => /PHQ|LST/.test(p)
});

describe('Lectura de un archivo de mercado tal como sale del portal', () => {
    it('reconoce el archivo crudo y toma el mercado del nombre del archivo', () => {
        expect(App.closeup.esCrudo(ARAII)).toBe(true);
        expect(App.closeup.esCrudo('Medico;Matricula;Mercado;Producto;Px_Product')).toBe(false);
        const r = App.closeup.leerArchivo(ARAII, 'ARAII MCDO.csv', ctx());
        expect(r.mercado).toBe('ARAII MCDO');
        expect(r.edicion).toBe('09/2026');
        expect(r.leidas).toBe(7);
        expect(r.quitadas).toEqual({ matricula: 1, especialidad: 1, nombreEspecialidad: 1 });
    });

    it('cruza con los catálogos y deja las 15 columnas de siempre', () => {
        const r = App.closeup.leerArchivo(ARAII, 'ARAII MCDO.csv', ctx());
        expect(r.filas[0]).toEqual(['SEIJAS G FRANCYS E', '0000107041', 'ARAII MCDO', 'NEFROTAL RWE', 176, '1000382890', 'CTRA 17 CON CLL 12', '3001',
            'CASCO CENTRAL', 'REG CTRO OCCIDENTE', 'CARDIOLOGIA', 'LOSARTAN', 'C09C ANTAG.ANGIOTENSINA II SOLOS', 'NO', 'ROWE-OSMOPHARM']);
        const raro = r.filas.find(f => f[3] === 'PRODUCTO RARO ZZZ');
        expect(raro[10]).toBe('XXX');
        expect(raro[12]).toBe('SIN DATOS');
        expect([...r.sinCatalogo.productos]).toEqual(['PRODUCTO RARO ZZZ']);
        expect([...r.sinCatalogo.especialidades]).toEqual(['XXX']);
    });

    it('lee el texto en Windows-1252 (Ñ y tildes) y la fecha de corte sale de la edición', () => {
        const bytes = new Uint8Array([0x4E, 0xDA, 0xD1, 0x45, 0x5A]);   // "NÚÑEZ" en Windows-1252
        expect(App.closeup.decodificar(bytes)).toBe('NÚÑEZ');
        expect(App.closeup.fechaDeEdicion('09/2026')).toBe('2026-09-30');
        expect(App.closeup.fechaDeEdicion('02/2028')).toBe('2028-02-29');
    });
});

describe('Varios mercados juntos: consolidado e informe', () => {
    const OTRO = archivo([fila('PEREZ ANA', '123', 'CAR', 'NEFROTAL RWE', 4)]);
    it('consolida, quita repetidas y valida con la revisión de siempre', () => {
        const r = App.closeup.consolidar([{ nombre: 'ARAII MCDO.csv', texto: ARAII }, { nombre: 'OTRO MCDO.csv', texto: OTRO }], ctx());
        expect(r.errores).toEqual([]);
        expect(r.porMercado.map(m => [m.mercado, m.filas])).toEqual([['ARAII MCDO', 3], ['OTRO MCDO', 1]]);
        expect(r.repetidas).toBe(1);
        expect(r.resumen).toMatchObject({ archivos: 2, filas: 4, rx: 176 + 1 + 3 + 4, rxPropio: 1 });
        expect(r.edicion).toBe('09/2026');
        const v = App.carga.validarRecetas(r.leido);
        expect(v.errores).toEqual([]);
        expect(v.ok).toBe(true);
        expect(v.resumen).toMatchObject({ filas: 4, mercados: 2, rx: 184 });
        expect(App.closeup.consolidadoCsv(r.leido).split('\r\n')[0]).toBe('﻿Medico;Matricula;Mercado;Producto;Px_Product;Medico Unico;Domicilio;Cod.Postal;Localidad;Region;Especialidad;Molecula;Clase Terapeutica;Generico;Laboratorio');
    });

    it('alertas: mercado con muchas menos filas, mercado faltante, producto propio ausente y productos sin catálogo', () => {
        const anterior = { porMercado: new Map([['ARAII MCDO', { filas: 100, rx: 900 }], ['VIEJO MCDO', { filas: 10, rx: 50 }]]), rx: 950, rxPropio: 20,
            productosPropios: new Set(['CANDETIQUE PHQ', 'DESLER PHQ']) };
        const r = App.closeup.consolidar([{ nombre: 'ARAII MCDO.csv', texto: ARAII }], ctx(), anterior);
        const t = r.alertas.map(a => a.texto + ' ' + (a.lista || []).join(', ')).join('\n');
        expect(t).toMatch(/"ARAII MCDO" trae \d+% menos filas/);
        expect(t).toContain('VIEJO MCDO');
        expect(t).toContain('DESLER PHQ');
        expect(t).toContain('no están en el catálogo');
    });

    it('dos archivos del mismo mercado o un archivo que no es de CloseUp: error claro', () => {
        const r = App.closeup.consolidar([{ nombre: 'ARAII MCDO.csv', texto: ARAII }, { nombre: 'araii mcdo.csv', texto: ARAII },
            { nombre: 'otra cosa.csv', texto: 'a;b;c\n1;2;3' }], ctx());
        expect(r.errores.join('\n')).toContain('dos archivos para el mercado "ARAII MCDO"');
        expect(r.errores.join('\n')).toContain('no parece un archivo de mercado');
    });

    it('comparación con el archivo de Power Query: iguales si suman lo mismo', () => {
        const r = App.closeup.consolidar([{ nombre: 'ARAII MCDO.csv', texto: ARAII }], ctx());
        const pq = { encabezados: r.leido.encabezados, filas: r.leido.filas.map(f => f.map((v, i) => (i === 12 ? 'SIN DATOS' : v))) };
        expect(App.closeup.comparar(r.leido, pq).iguales).toBe(true);
        pq.filas[0][4] = '170';
        const c = App.closeup.comparar(r.leido, pq);
        expect(c.iguales).toBe(false);
        expect(c.diferencias[0]).toEqual({ clave: '107041|ARAII MCDO|NEFROTAL RWE', app: 176, powerQuery: 170 });
    });
});

describe('En "Cargar datos": de los archivos del portal a la versión', () => {
    it('admin: elige los mercados, ve el informe, sube y quedan guardados los originales', async () => {
        document.getElementById('loginEmail').value = 'admin@lasante.com';
        document.getElementById('visitadorPwd').value = 'adminadmin';
        await App.auth.attemptLogin();
        const { baseSimulada } = await import('./cargar-app.js');
        const bd = baseSimulada(App);
        bd.catalogo_especialidades.push({ codigo: 'CAR', nombre: 'CARDIOLOGIA' });
        bd.catalogo_productos.push({ producto: 'NEFROTAL RWE', laboratorio: 'RWE', molecula: 'LOSARTAN', clase_terapeutica: 'C09C0', generico: 'NO' });
        App.carga.comprimir = async (t) => new Blob([t]);   // jsdom no comprime
        App.carga.abrirPanel();
        const archivos = [new File([ARAII], 'ARAII MCDO.csv'), new File([archivo([fila('PEREZ ANA', '123', 'CAR', 'NEFROTAL RWE', 4)])], 'OTRO MCDO.csv')];
        expect(await App.carga.intentarCloseUp(archivos)).toBe(true);
        const est = App.carga._estado;
        expect(est.validacion.ok).toBe(true);
        expect(est.validacion.resumen).toMatchObject({ mercados: 2 });
        expect(document.getElementById('cargaNombre').value).toBe('CloseUp 09/2026');
        expect(document.getElementById('cargaFecha').value).toBe('2026-09-30');
        expect(document.getElementById('informeCloseUp').textContent).toContain('ARAII MCDO');
        // Sube como siempre (una sola versión) y guarda los originales
        const id = await App.carga.subir({ tipo: 'recetas', nombre: 'CloseUp 09/2026', fecha: '2026-09-30', validacion: est.validacion });
        expect(await App.carga.guardarOriginalesCloseUp(id)).toBe(2);
        expect(bd.catalogo_versiones.filter(v => v.tipo === 'closeup').map(v => v.nombre_archivo).sort()).toEqual(['ARAII MCDO.csv', 'OTRO MCDO.csv']);
        expect(Object.keys(bd.archivos).filter(k => k.startsWith(`closeup/${id}/`))).toHaveLength(2);
    });

    it('un consolidado de siempre (un solo archivo con Px_Product) sigue por el camino de antes', async () => {
        const consolidado = new File([App.carga.COLUMNAS_RECETAS.join(';') + '\nDR;1;M;P;1;a;b;c;d;e;f;g;h;i;j'], 'consolidado.csv');
        expect(await App.carga.intentarCloseUp([consolidado])).toBe(false);
    });
});

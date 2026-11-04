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
const fila = (nom, mat, esp, prod, px, mer = 'ARAII Mercado C09C0') => `${nom};${mat};${esp};;;${mer};1;2,377301;434;${prod};1;40,552995;${px};1000382890;CTRA 17 CON CLL 12;3001;CASCO CENTRAL;REG CTRO OCCIDENTE;;;;`;
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
    esPropio: (p) => /PHQ|LST/.test(p),
    nombresMercado: { 'ARAII MERCADO C09C0': 'ARAII MCDO', 'OTRO': 'OTRO MCDO' }
});

describe('Lectura de un archivo de mercado tal como sale del portal', () => {
    it('reconoce el archivo crudo y toma el mercado de la columna "Mercado" con la tabla de nombres', () => {
        expect(App.closeup.esCrudo(ARAII)).toBe(true);
        expect(App.closeup.esCrudo('Medico;Matricula;Mercado;Producto;Px_Product')).toBe(false);
        const r = App.closeup.leerArchivo(ARAII, 'descarga 1.csv', ctx());
        expect(r.filas[0][2]).toBe('ARAII MCDO');
        expect([...r.nombresCrudos.keys()]).toEqual(['ARAII MERCADO C09C0']);
        // Sin nombre en la tabla: el del portal en mayúsculas
        const sin = App.closeup.leerArchivo(ARAII, 'descarga 1.csv', { ...ctx(), nombresMercado: {} });
        expect(sin.filas[0][2]).toBe('ARAII MERCADO C09C0');
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
    const OTRO = archivo([fila('PEREZ ANA', '123', 'CAR', 'NEFROTAL RWE', 4, 'Otro')]);
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

    it('productos de La Santé que ya no aparecen: en qué mercado estaban, sus recetas y el posible motivo', () => {
        const anterior = { porMercado: new Map([['ARAII MCDO', { filas: 2, rx: 177 }], ['VIEJO MCDO', { filas: 10, rx: 50 }]]), rx: 227, rxPropio: 31,
            productosPropios: new Set(['CANDETIQUE PHQ', 'TRALIX PHQ', 'CANDETIQUE FORTE PHQ', 'NEFROX PHQ']),
            detallePropios: new Map([['TRALIX PHQ', { rx: 20, mercados: new Set(['VIEJO MCDO']) }], ['CANDETIQUE FORTE PHQ', { rx: 9, mercados: new Set(['ARAII MCDO']) }],
                ['NEFROX PHQ', { rx: 2, mercados: new Set(['ARAII MCDO']) }], ['CANDETIQUE PHQ', { rx: 1, mercados: new Set(['ARAII MCDO']) }]]) };
        const r = App.closeup.consolidar([{ nombre: 'ARAII MCDO.csv', texto: ARAII }], ctx(), anterior);
        const a = r.alertas.find(x => /producto\(s\) de La Santé/.test(x.texto));
        expect(a.texto).toContain('3 producto(s) de La Santé que estaban y ya no aparecen (1 porque su mercado no vino en esta carga)');
        expect(a.lista).toEqual([
            'CANDETIQUE FORTE PHQ (antes ARAII MCDO, 9 Rx) → ¿cambió de nombre? ahora hay "CANDETIQUE PHQ"',
            'NEFROX PHQ (antes ARAII MCDO, 2 Rx) → sin recetas en esta edición (o no está en el catálogo de productos)',
            'TRALIX PHQ (antes VIEJO MCDO, 20 Rx) → su mercado no vino en esta carga']);
    });

    it('médico repetido en el mismo mercado y producto: queda la fila de más recetas y se ve en qué se diferenciaban', () => {
        const otraDireccion = fila('SEIJAS G FRANCYS E', '107041', 'CAR', 'NEFROTAL RWE', 90).replace('CTRA 17 CON CLL 12', 'AV BOLIVAR LOCAL 3');
        const r = App.closeup.consolidar([{ nombre: 'ARAII MCDO.csv', texto: archivo([fila('SEIJAS G FRANCYS E', '107041', 'CAR', 'NEFROTAL RWE', 176), otraDireccion,
            fila('SEIJAS G FRANCYS E', '107041', 'CAR', 'CANDETIQUE PHQ', 1)]) }], ctx());
        const nefrotal = r.leido.filas.filter(f => f[3] === 'NEFROTAL RWE');
        expect(nefrotal).toHaveLength(1);                 // único por médico + mercado + producto
        expect(nefrotal[0][4]).toBe('176');                // el de más recetas
        expect(nefrotal[0][6]).toBe('CTRA 17 CON CLL 12');
        expect(r.porMercado[0]).toMatchObject({ filas: 2, rx: 177 });
        expect(r.unificados).toHaveLength(1);
        expect(r.unificados[0]).toMatchObject({ medico: 'SEIJAS G FRANCYS E', producto: 'NEFROTAL RWE', rx: [176, 90], rxQueda: 176 });
        expect(r.unificados[0].difieren.map(d => d.col)).toEqual(['Px_Product', 'Domicilio']);
        expect(r.alertas.find(a => /venían repetidos/.test(a.texto)).texto).toContain('Se diferenciaban en: Px_Product (1), Domicilio (1)');
        // Ya no queda el aviso de la revisión
        expect(App.carga.validarRecetas(r.leido).avisos.some(a => /repiten médico/.test(a))).toBe(false);
        // Y el informe muestra el detalle
        const html = App.carga.bloqueUnificados(r);
        expect(html).toContain('Repetidos unificados · 1');
        expect(html).toContain('AV BOLIVAR LOCAL 3');
    });

    it('el mismo mercado en dos archivos o un archivo que no es de CloseUp: error claro', () => {
        const r = App.closeup.consolidar([{ nombre: 'tanda 1.csv', texto: ARAII }, { nombre: 'tanda 2.csv', texto: ARAII },
            { nombre: 'otra cosa.csv', texto: 'a;b;c\n1;2;3' }], ctx());
        expect(r.errores.join('\n')).toContain('"ARAII MERCADO C09C0" viene en dos archivos');
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

    it('comparación con Power Query: el nombre viejo del mercado ("ARAII VIEJO") cuenta como el de hoy', () => {
        const r = App.closeup.consolidar([{ nombre: 'ARAII MCDO.csv', texto: ARAII }], ctx());
        const pq = { encabezados: r.leido.encabezados, filas: r.leido.filas.map(f => f.map((v, i) => (i === 2 ? 'Araii Viejo' : v))) };
        expect(App.closeup.comparar(r.leido, pq).iguales).toBe(false);
        expect(App.closeup.comparar(r.leido, pq, { 'ARAII VIEJO': 'ARAII MCDO' }).iguales).toBe(true);
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
        bd.configuracion.push({ clave: 'nombres_mercado', valor: { 'ARAII MERCADO C09C0': 'ARAII MCDO', OTRO: 'OTRO MCDO' } });
        App.carga.comprimir = async (t) => new Blob([t]);   // jsdom no comprime
        App.carga.abrirPanel();
        const archivos = [new File([ARAII], 'ARAII MCDO.csv'), new File([archivo([fila('PEREZ ANA', '123', 'CAR', 'NEFROTAL RWE', 4, 'Otro')])], 'OTRO MCDO.csv')];
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

    it('corregir un solo mercado: los demás se toman, tal cual, de la versión de hoy', async () => {
        document.getElementById('loginEmail').value = 'admin@lasante.com';
        document.getElementById('visitadorPwd').value = 'adminadmin';
        await App.auth.attemptLogin();
        const { baseSimulada } = await import('./cargar-app.js');
        const bd = baseSimulada(App);
        bd.catalogo_especialidades.push({ codigo: 'CAR', nombre: 'CARDIOLOGIA' });
        bd.catalogo_productos.push({ producto: 'NEFROTAL RWE', laboratorio: 'RWE', molecula: 'LOSARTAN', clase_terapeutica: 'C09C0', generico: 'NO' });
        bd.configuracion.push({ clave: 'nombres_mercado', valor: { 'ARAII MERCADO C09C0': 'ARAII MCDO' } });
        App.carga.abrirPanel();
        await App.carga.intentarCloseUp([new File([ARAII], 'ARAII corregido.csv')]);
        let c = App.carga._estado.closeup;
        expect(c.res.faltan).toEqual(['DESLER MERCADO']);   // el mercado de la versión de hoy que no viene
        expect(document.getElementById('informeCloseUp').textContent).toContain('Completar con los 1 mercados de hoy');
        await App.carga.completarConHoy();
        c = App.carga._estado.closeup;
        expect(c.res.completado).toBe(1);
        expect(c.res.porMercado.map(m => m.mercado)).toEqual(['ARAII MCDO', 'DESLER MERCADO']);
        expect(c.res.leido.filas.filter(f => f[2] === 'DESLER MERCADO')).toHaveLength(3);
        expect(c.res.leido.filas.find(f => f[2] === 'DESLER MERCADO')).toEqual(['PEREZ ANA', '00123', 'DESLER MERCADO', 'DESLER PHQ', '12', 'MG', 'C1', '1010', 'CCS', 'DC', 'MG', 'DESLORATADINA', 'R06', 'N', 'LST']);
        expect(App.carga._estado.validacion.ok).toBe(true);
        expect(App.carga._estado.validacion.resumen).toMatchObject({ mercados: 2 });
        expect(c.res.alertas.some(a => /Se completó con 1 mercado/.test(a.texto))).toBe(true);
        expect(c.res.alertas.some(a => /^Faltan/.test(a.texto))).toBe(false);
    });

    it('un consolidado de siempre (un solo archivo con Px_Product) sigue por el camino de antes', async () => {
        const consolidado = new File([App.carga.COLUMNAS_RECETAS.join(';') + '\nDR;1;M;P;1;a;b;c;d;e;f;g;h;i;j'], 'consolidado.csv');
        expect(await App.carga.intentarCloseUp([consolidado])).toBe(false);
    });
});

describe('Fase 12D-2: descarga en tandas (varios mercados por archivo) y tabla de nombres', () => {
    const TANDA = archivo([fila('DR A', '1', 'CAR', 'NEFROTAL RWE', 10, 'Bumetin Retard Mercado 2'), fila('DR A', '1', 'CAR', 'CANDETIQUE PHQ', 2, 'Esoz'),
        fila('DR B', '2', 'CAR', 'NEFROTAL RWE', 5, 'FLUDIL SOLO')]);
    it('un archivo con varios mercados se separa por la columna "Mercado"; los nuevos piden nombre con la regla Mdo + producto', () => {
        const anterior = { porMercado: new Map([['ESOZ MERCADO A02B2', { filas: 1, rx: 1 }], ['MDO BUMETIN', { filas: 1, rx: 1 }]]), rx: 2, rxPropio: 0, productosPropios: new Set() };
        const r = App.closeup.consolidar([{ nombre: 'tanda 1.csv', texto: TANDA }], { ...ctx(), nombresMercado: { 'FLUDIL SOLO': 'Mdo Fludil' } }, anterior);
        // El nombre oficial se respeta tal como se escribió (sin pasarlo a mayúsculas)
        expect(r.porMercado.map(m => m.mercado)).toEqual(['BUMETIN RETARD MERCADO 2', 'ESOZ', 'Mdo Fludil']);
        expect(r.sinNombre.map(n => n.crudo)).toEqual(['BUMETIN RETARD MERCADO 2', 'ESOZ']);
        // Sugerencia: "Mdo " + el producto; si ya existe con otras mayúsculas, se usa esa forma
        expect(r.nombres.find(n => n.crudo === 'ESOZ').sugerencia).toBe('Mdo Esoz');
        expect(r.nombres.find(n => n.crudo === 'BUMETIN RETARD MERCADO 2').sugerencia).toBe('MDO BUMETIN');
        expect(r.nombres.find(n => n.crudo === 'FLUDIL SOLO').oficial).toBe('Mdo Fludil');
    });

    it('avisa los mercados que no siguen la regla Mdo + producto (cuando ya todos tienen nombre)', () => {
        const tabla = { 'BUMETIN RETARD MERCADO 2': 'Mdo Bumetin', ESOZ: 'ESOZ VIEJO', 'FLUDIL SOLO': 'Mdo Fludil' };
        const r = App.closeup.consolidar([{ nombre: 'tanda 1.csv', texto: TANDA }], { ...ctx(), nombresMercado: tabla });
        const a = r.alertas.find(x => /no siguen la regla/.test(x.texto));
        expect(a.texto).toContain('1 mercado(s) no siguen la regla "Mdo + producto": ESOZ VIEJO');
        const ok = App.closeup.consolidar([{ nombre: 'tanda 1.csv', texto: TANDA }], { ...ctx(), nombresMercado: { ...tabla, ESOZ: 'Mdo Esoz' } });
        expect(ok.alertas.some(x => /no siguen la regla/.test(x.texto))).toBe(false);
    });

    it('regla de nombres: Mdo + producto, sin relleno ni códigos ATC', () => {
        const s = App.closeup.sugerirNombre;
        expect(s('ESOZ MERCADO A02B2')).toBe('Mdo Esoz');
        expect(s('FLUDIL SOLO')).toBe('Mdo Fludil');
        expect(s('Bumetin Retard Mercado 2')).toBe('Mdo Bumetin');
        expect(s('MDO. LIPITOR')).toBe('Mdo Lipitor');
        expect(s('Mdo Esoz')).toBe('Mdo Esoz');
        expect(App.closeup.unificarNombre(' mdo  esoz ', ['Mdo Esoz'])).toBe('Mdo Esoz');
        expect(App.closeup.unificarNombre('Mdo Nuevo', ['Mdo Esoz'])).toBe('Mdo Nuevo');
    });

    it('en "Cargar datos": no deja subir hasta confirmar los nombres; al guardarlos se recuerdan', async () => {
        document.getElementById('loginEmail').value = 'admin@lasante.com';
        document.getElementById('visitadorPwd').value = 'adminadmin';
        await App.auth.attemptLogin();
        App.carga.abrirPanel();
        const archivos = [new File([TANDA], 'tanda 1.csv')];
        await App.carga.intentarCloseUp(archivos);
        expect(App.carga._estado.validacion.ok).toBe(false);
        expect(document.querySelectorAll('[data-mercado-crudo]')).toHaveLength(3);
        expect(document.querySelector('[data-mercado-crudo="BUMETIN RETARD MERCADO 2"]').value).toBe('Mdo Bumetin');
        document.querySelector('[data-mercado-crudo="ESOZ"]').value = '  Mdo   Esoz ';
        await App.carga.guardarNombresMercado();
        const { baseSimulada } = await import('./cargar-app.js');
        const tabla = baseSimulada(App).configuracion.find(c => c.clave === 'nombres_mercado').valor;
        expect(tabla.ESOZ).toBe('Mdo Esoz');
        expect(tabla['FLUDIL SOLO']).toBe('Mdo Fludil');
        expect(Object.keys(tabla).sort()).toEqual(['BUMETIN RETARD MERCADO 2', 'ESOZ', 'FLUDIL SOLO']);
        // Revisado de nuevo con los nombres: ya se puede subir y el mercado es el oficial
        expect(App.carga._estado.validacion.ok).toBe(true);
        expect(App.carga._estado.closeup.res.porMercado.map(m => m.mercado)).toContain('Mdo Esoz');
    });
});

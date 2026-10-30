/* ============================================================
   Fase 7 · datos_equipo() con los DATOS REALES del repositorio.
   Prueba que un VM y un GD que reciben SOLO sus médicos obtienen
   exactamente los mismos resultados en la app que con el archivo
   completo, y que nadie recibe médicos ajenos.
   (Corre en el navegador simulado porque usa la app real.)
============================================================ */
import { describe, it, expect, beforeAll } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { crearBase, como } from './supabase-simulado.js';
import { importar } from '../../scripts/migracion/importar.mjs';
import { leerExportacion } from '../../scripts/migracion/transformar.mjs';
import { cargarApp, cargarDatosReales } from '../unit/cargar-app.js';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const U = {
    vm:  '00000000-0000-0000-0000-00000000f001',
    gd:  '00000000-0000-0000-0000-00000000f002',
    vm2: '00000000-0000-0000-0000-00000000f003',
    admin: '00000000-0000-0000-0000-00000000f004'
};
const VM = 'NEIVIS PARRA';
let db, ids, visitadoresDistrito, otroVm;
let MERCADOS = [];   // los 32 mercados nacionales (para comparar la clasificación en todos)

// Lo que ve una persona en la matriz y en la clasificación por mercado
function foto(App, reps) {
    const st = App.state;
    st.rolReal = reps.size === 1 ? 'vm' : 'gd';
    st.REPS_PERMITIDOS = reps;
    st.currentUserRole = reps.size === 1 ? 'visitador' : 'admin';
    st.currentVisitadorName = reps.size === 1 ? [...reps][0] : 'GD';
    st._lastUniverseSignature = null;
    App.filters.populateFilters();
    App.matrix.aggregateAndCalculate();
    const docs = st.PROCESSED_DATA;
    return {
        // Médicos CON recetas: todo idéntico y en el mismo orden
        conRx: docs.filter(d => !d.isZeroRx).map(d => [d.id, d.name, d.totalRx, d.rxPhq, d.gap, d.closeupLabel, d.share]),
        // Médicos del fichero SIN recetas: matrícula y nombre
        sinRx: new Map(docs.filter(d => d.isZeroRx).map(d => [d.id, d.name])),
        clasificacion: new Map(docs.map(d => [d.id, MERCADOS.map(m => App.matrix.getDoctorMarketClassification(d.id, m)).join(',')])),
        opcionesRep: st.FILTER_OPTIONS.Rep,
        opcionesMercado: st.FILTER_OPTIONS.Market
    };
}

// Compara y devuelve cuántos médicos sin recetas cambiaron de nombre
function comparar(antes, ahora, ficheroCompleto, reps) {
    expect(ahora.conRx).toEqual(antes.conRx);
    expect([...ahora.sinRx.keys()].sort()).toEqual([...antes.sinRx.keys()].sort());
    expect(ahora.clasificacion).toEqual(antes.clasificacion);
    const cambiados = [...antes.sinRx].filter(([id, nombre]) => ahora.sinRx.get(id) !== nombre);
    // Cada cambio es una matrícula que el fichero comparte con OTRO visitador
    cambiados.forEach(([id]) => {
        const filas = ficheroCompleto.get(id);
        expect(filas.some(f => !reps.has(String(f['Nombre del sector']).trim().toUpperCase()))).toBe(true);
    });
    return cambiados.length;
}

async function datosComo(uid) {
    const r = await como(db, uid, 'select public.datos_equipo($1, $2) as d', [ids.recetas, ids.fichero]);
    return r.rows[0].d;
}

beforeAll(async () => {
    db = await crearBase();
    await importar({ db, raiz: RAIZ, exportacion: leerExportacion({ documentos: {} }), log: () => {} });
    const snaps = (await db.query(`select id, tipo from public.data_snapshots where es_vigente`)).rows;
    ids = Object.fromEntries(snaps.map(s => [s.tipo, s.id]));
    MERCADOS = (await db.query(`select nombre from public.cat_mercados order by nombre`)).rows.map(r => r.nombre);

    await db.query(`insert into auth.users (id, email, raw_app_meta_data) values
        ($1, 'vm@x.com', '{"rol":"vm"}'), ($2, 'gd@x.com', '{"rol":"gd"}'), ($3, 'vm2@x.com', '{"rol":"vm"}'), ($4, 'admin@x.com', '{"rol":"admin"}')`, [U.vm, U.gd, U.vm2, U.admin]);
    const vis = (await db.query(`select id, distrito_id from public.visitadores where nombre_sector = $1`, [VM])).rows[0];
    await db.query(`update public.visitadores set perfil_id = $1 where id = $2`, [U.vm, vis.id]);
    await db.query(`insert into public.perfil_distritos (perfil_id, distrito_id) values ($1, $2)`, [U.gd, vis.distrito_id]);
    visitadoresDistrito = (await db.query(`select nombre_sector from public.visitadores where distrito_id = $1`, [vis.distrito_id])).rows.map(r => r.nombre_sector);
    // Un VM de OTRO distrito
    otroVm = (await db.query(`select id, nombre_sector from public.visitadores where distrito_id <> $1 order by nombre_sector limit 1`, [vis.distrito_id])).rows[0];
    await db.query(`update public.visitadores set perfil_id = $1 where id = $2`, [U.vm2, otroVm.id]);

    // Antes de preparar la versión, el VM recibe un aviso claro (no un "timeout")
    await expect(datosComo(U.vm)).rejects.toThrow(/aún no está preparada/);
    // El admin la prepara: un mercado por llamada hasta que no falte ninguno
    const pasos = [];
    for (let faltan = -1; faltan !== 0;) {
        faltan = (await como(db, U.admin, 'select public.preparar_orden_mercado($1) as n', [ids.recetas])).rows[0].n;
        pasos.push(faltan);
    }
    expect(pasos).toHaveLength(MERCADOS.length);
    expect(pasos.at(-2)).toBe(1);
}, 600000);

describe('Un VM recibe solo lo suyo y ve lo mismo que antes', () => {
    let paquete;
    beforeAll(async () => { paquete = await datosComo(U.vm); });

    it('el paquete es pequeño (antes: 8,8 MB comprimidos por persona)', () => {
        const kb = JSON.stringify(paquete).length / 1024;
        console.log(`  datos_equipo de ${VM}: ${Math.round(kb)} KB sin comprimir, ${paquete.recetas.length} filas de recetas, ${paquete.fichero.length} del fichero\n`);
        expect(kb).toBeLessThan(400);
        expect(paquete.fichero).toHaveLength(142);
    });

    it('matriz, recetas, brecha y clasificación por mercado: idénticas al archivo completo', () => {
        const completo = cargarApp();
        cargarDatosReales(completo);
        const reps = new Set([VM]);
        const antes = foto(completo, reps);

        const equipo = cargarApp();
        equipo.data.aplicarDatosEquipo(paquete);
        const ahora = foto(equipo, reps);

        expect(antes.conRx.length + antes.sinRx.size).toBe(142);
        const cambiados = comparar(antes, ahora, completo.state.FICHERO_MAP, reps);
        process.stdout.write(`  ${VM}: ${cambiados} médico(s) sin recetas ahora muestran el nombre de SU fila del fichero\n`);
        expect([...ahora.clasificacion.values()].some(v => /[ABC]/.test(v))).toBe(true);
    });

    it('no recibe médicos de otros visitadores', async () => {
        const mios = new Set(paquete.fichero.map(f => f[paquete.columnas.indexOf('Nombre del sector')].trim().toUpperCase()));
        expect([...mios]).toEqual([VM]);
        const otro = await datosComo(U.vm2);
        const deOtro = new Set(otro.fichero.map(f => f[otro.columnas.indexOf('Nombre del sector')].trim().toUpperCase()));
        expect([...deOtro]).toEqual([otroVm.nombre_sector]);
    });
});

describe('Un GD recibe solo su distrito y ve lo mismo que antes', () => {
    it('matriz y clasificación idénticas al archivo completo', async () => {
        const paquete = await datosComo(U.gd);
        const reps = new Set(visitadoresDistrito);
        const completo = cargarApp();
        cargarDatosReales(completo);
        const antes = foto(completo, reps);
        const equipo = cargarApp();
        equipo.data.aplicarDatosEquipo(paquete);
        const ahora = foto(equipo, reps);

        expect(antes.conRx.length + antes.sinRx.size).toBeGreaterThan(142);
        const cambiados = comparar(antes, ahora, completo.state.FICHERO_MAP, reps);
        process.stdout.write(`  GD (${reps.size} visitadores): ${antes.conRx.length + antes.sinRx.size} médicos, ${cambiados} sin recetas con nombre corregido · ${Math.round(JSON.stringify(paquete).length / 1024)} KB\n`);
        expect(ahora.opcionesRep).toEqual(antes.opcionesRep);
        const visRecibidos = new Set(paquete.fichero.map(f => f[paquete.columnas.indexOf('Nombre del sector')].trim().toUpperCase()));
        expect([...visRecibidos].every(v => reps.has(v))).toBe(true);
    });
});

describe('Historial de un médico (migración 10)', () => {
    it('el VM ve el historial de recetas y de clasificación de SUS médicos; el de otros, no', async () => {
        const paquete = await datosComo(U.vm);
        const mat = paquete.fichero[0][paquete.columnas.indexOf('Matricula')];
        const h = (await como(db, U.vm, 'select public.historial_medico($1) as h', [mat])).rows[0].h;
        expect(h).toHaveLength(1);
        expect(h[0].nombre).toBe('Datos enero');
        const recetas = paquete.recetas.filter(r => String(paquete.medicos[r[0]][0]).trim().replace(/^0+/, '') === String(mat).trim().replace(/^0+/, ''));
        expect(Number(h[0].total)).toBe(recetas.reduce((s, r) => s + r[3], 0));
        // Mismos datos de clasificación por mercado que recibe la matriz
        const deEste = paquete.clasificacion.filter(c => c[1] === String(mat).trim().replace(/^0+/, ''));
        expect(h[0].mercados.length).toBe(deEste.length);
        const otro = await datosComo(U.vm2);
        const matOtro = otro.fichero[0][otro.columnas.indexOf('Matricula')];
        await expect(como(db, U.vm, 'select public.historial_medico($1)', [matOtro])).rejects.toThrow(/no está en tu fichero/);
    });
});

describe('Tableros por rol (migración 11)', () => {
    it('evolución por mercado: el admin ve todo el país; el VM, solo sus médicos', async () => {
        const nacional = (await como(db, U.admin, 'select public.evolucion_mercados() as e')).rows[0].e;
        expect(nacional).toHaveLength(1);
        const totalNacional = (await db.query('select sum(rx)::int as t from public.recetas where snapshot_id = $1', [ids.recetas])).rows[0].t;
        expect(nacional[0].mercados.reduce((s, m) => s + Number(m[1]), 0)).toBe(totalNacional);
        expect(nacional[0].mercados).toHaveLength(MERCADOS.length);
        const delVm = (await como(db, U.vm, 'select public.evolucion_mercados() as e')).rows[0].e;
        const paquete = await datosComo(U.vm);
        expect(delVm[0].mercados.reduce((s, m) => s + Number(m[1]), 0)).toBe(paquete.recetas.reduce((s, r) => s + r[3], 0));
        expect(delVm[0].mercados.every(m => Number(m[2]) <= Number(m[1]))).toBe(true);
    });
    it('avance del VM frente al promedio de su distrito (sin nombres de otros)', async () => {
        const antes = (await como(db, U.vm, 'select public.avance_distrito() as a')).rows[0].a;
        expect(antes.total).toBe(142);
        const vis = (await db.query('select id from public.visitadores where nombre_sector = $1', [VM])).rows[0].id;
        const mat = (await db.query(`select f.matricula from public.fichero f where f.snapshot_id = $1 and f.visitador_id = $2 limit 1`, [ids.fichero, vis])).rows[0].matricula;
        await db.query(`insert into public.evaluaciones (visitador_id, matricula, mercado, cuadrante) values ($1, $2, 'M1', 'A')`, [vis, mat]);
        const despues = (await como(db, U.vm, 'select public.avance_distrito() as a')).rows[0].a;
        expect(despues.evaluados).toBe(antes.evaluados + 1);
        expect(despues.visitadores).toBeGreaterThan(1);
        expect(Number(despues.promedio_pct)).toBeGreaterThan(0);
        expect(Object.keys(despues).sort()).toEqual(['evaluados', 'promedio_pct', 'total', 'visitadores']);
        // Para quien no es VM no devuelve nada
        expect((await como(db, U.gd, 'select public.avance_distrito() as a')).rows[0].a).toBeNull();
    });
    it('bitácora: registra cambios de configuración y publicaciones; solo la lee el admin', async () => {
        await como(db, U.admin, `update public.configuracion set valor = '{"TH_LOY_LOW": 30, "TH_LOY_HIGH": 66, "TH_POT_LOW": 33, "TH_POT_HIGH": 66}' where clave = 'umbrales_matriz'`);
        const b = (await como(db, U.admin, 'select public.bitacora_reciente(10) as b')).rows[0].b;
        expect(b[0]).toMatchObject({ accion: 'configuracion', clave: 'umbrales_matriz' });
        expect(b[0].antes.TH_LOY_LOW).toBe(33);
        expect(b[0].despues.TH_LOY_LOW).toBe(30);
        await expect(como(db, U.vm, 'select public.bitacora_reciente(10)')).rejects.toThrow(/Solo el administrador/);
        expect((await como(db, U.vm, 'select count(*)::int as n from public.bitacora')).rows[0].n).toBe(0);
        await expect(como(db, U.admin, `insert into public.bitacora (accion) values ('falsa')`)).rejects.toThrow();
        // Sin cambios reales no se registra nada
        const n = (await db.query('select count(*)::int as n from public.bitacora')).rows[0].n;
        await como(db, U.admin, `update public.configuracion set descripcion = descripcion where clave = 'umbrales_matriz'`);
        expect((await db.query('select count(*)::int as n from public.bitacora')).rows[0].n).toBe(n);
    });
});

describe('Permisos', () => {
    it('solo el admin prepara versiones', async () => {
        await expect(como(db, U.vm, 'select public.preparar_orden_mercado($1)', [ids.recetas])).rejects.toThrow(/Solo el administrador/);
        await expect(como(db, U.vm, 'select public._calcular_orden_mercado($1, 1)', [ids.recetas])).rejects.toThrow();
    });
    it('sin sesión no se puede pedir', async () => {
        await expect(como(db, null, 'select public.datos_equipo($1, $2)', [ids.recetas, ids.fichero])).rejects.toThrow();
    });
    it('un borrador no se entrega a un VM', async () => {
        const borrador = (await db.query(`insert into public.data_snapshots (nombre, tipo, fecha) values ('B', 'recetas', '2026-02-28') returning id`)).rows[0].id;
        await expect(como(db, U.vm, 'select public.datos_equipo($1, $2)', [borrador, ids.fichero])).rejects.toThrow(/no está publicada/);
    });
});

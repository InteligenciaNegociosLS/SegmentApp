// @vitest-environment node
/* ============================================================
   Migración 6: carga por lotes, comparación de versiones y
   permisos del almacén privado de archivos.
============================================================ */
import { describe, it, expect, beforeAll } from 'vitest';
import { crearBase, como } from './supabase-simulado.js';

const U = {
    admin: '00000000-0000-0000-0000-0000000000a1',
    vm: '00000000-0000-0000-0000-0000000000b1',
    gte: '00000000-0000-0000-0000-0000000000c1'
};
let db;
const ids = {};
const falla = async (uid, sql, p) => { try { await como(db, uid, sql, p); return false; } catch { return true; } };
const n = async (sql, p) => Number((await db.query(sql, p)).rows[0].n);

const receta = (fila, medico, matricula, mercado, producto, rx, extra = {}) => ({
    fila, medico, matricula, mercado, producto, rx, medico_unico: '', domicilio: 'CALLE 1', cod_postal: '1010',
    localidad: 'CARACAS', region: 'CAPITAL', especialidad: 'CARDIO', molecula: 'MOL', clase_terapeutica: 'SIN DATOS',
    generico: 'NO', laboratorio: 'LAB', ...extra
});

beforeAll(async () => {
    db = await crearBase();
    await db.query(`insert into auth.users (id, email, raw_app_meta_data) values ($1,'a@x.com','{"rol":"admin"}'), ($2,'v@x.com','{"rol":"vm"}'), ($3,'g@x.com','{"rol":"gte_nacional"}')`, [U.admin, U.vm, U.gte]);
    const s = await como(db, U.admin, `insert into public.data_snapshots (nombre, tipo, fecha) values
        ('Datos enero','recetas','2026-01-31'), ('Datos febrero','recetas','2026-02-28'), ('Fichero febrero','fichero','2026-02-28')
        returning id`);
    [ids.r1, ids.r2, ids.f2] = s.rows.map(r => r.id);
});

describe('Cargar recetas por lotes', () => {
    it('el admin carga un lote en un borrador (crea catálogos y no duplica al repetir)', async () => {
        const lote = [
            receta(1, 'DR UNO', '0100', 'DESLER MERCADO', 'DESLER PHQ', 10),
            receta(2, 'DR UNO', '0100', 'DESLER MERCADO', 'COMPETIDOR', 5),
            receta(3, 'DR DOS', '200', 'ESOZ MERCADO', 'ESOZ PHQ', 7)
        ];
        const r = await como(db, U.admin, 'select public.cargar_recetas_lote($1, $2) as n', [ids.r1, JSON.stringify(lote)]);
        expect(r.rows[0].n).toBe(3);
        const r2 = await como(db, U.admin, 'select public.cargar_recetas_lote($1, $2) as n', [ids.r1, JSON.stringify(lote)]);
        expect(r2.rows[0].n).toBe(0);
        expect(await n('select count(*) as n from public.cat_medicos')).toBe(2);
        expect((await como(db, U.admin, 'select public.contar_filas_snapshot($1) as n', [ids.r1])).rows[0].n).toBe(3);
        const v = (await db.query('select medico, matricula_norm, rx from public.v_recetas where snapshot_id = $1 and fila = 1', [ids.r1])).rows[0];
        expect(v).toEqual({ medico: 'DR UNO', matricula_norm: '100', rx: 10 });
    });

    it('un VM no puede cargar datos', async () => {
        expect(await falla(U.vm, 'select public.cargar_recetas_lote($1, $2)', [ids.r2, JSON.stringify([receta(1, 'X', '1', 'M', 'P', 1)])])).toBe(true);
    });

    it('no se puede cargar en una versión ya publicada', async () => {
        await como(db, U.admin, 'select public.publicar_snapshot($1)', [ids.r1]);
        expect(await falla(U.admin, 'select public.cargar_recetas_lote($1, $2)', [ids.r1, JSON.stringify([receta(9, 'X', '1', 'M', 'P', 1)])])).toBe(true);
    });

    it('rechaza recetas negativas o sin número de fila', async () => {
        expect(await falla(U.admin, 'select public.cargar_recetas_lote($1, $2)', [ids.r2, JSON.stringify([receta(1, 'X', '1', 'M', 'P', -3)])])).toBe(true);
        expect(await falla(U.admin, 'select public.cargar_recetas_lote($1, $2)', [ids.r2, JSON.stringify([{ ...receta(1, 'X', '1', 'M', 'P', 1), fila: null }])])).toBe(true);
    });
});

describe('Comparar versiones', () => {
    it('cuenta filas nuevas, eliminadas y cambiadas', async () => {
        const lote = [
            receta(1, 'DR UNO', '0100', 'DESLER MERCADO', 'DESLER PHQ', 12),   // cambiada (10 → 12)
            receta(2, 'DR UNO', '0100', 'DESLER MERCADO', 'COMPETIDOR', 5),    // igual
            receta(3, 'DR TRES', '300', 'ESOZ MERCADO', 'ESOZ PHQ', 4)         // nueva (DR DOS eliminado)
        ];
        await como(db, U.admin, 'select public.cargar_recetas_lote($1, $2)', [ids.r2, JSON.stringify(lote)]);
        const c = (await como(db, U.admin, 'select public.comparar_snapshots($1, $2) as c', [ids.r2, ids.r1])).rows[0].c;
        expect(c).toMatchObject({ tipo: 'recetas', nuevas: 1, eliminadas: 1, cambiadas: 1, iguales: 1, rx_nuevo: 21, rx_base: 22 });
        expect(c.ejemplos.map(e => e.estado).sort()).toEqual(['cambiada', 'eliminada', 'nueva']);
        expect(await falla(U.vm, 'select public.comparar_snapshots($1, $2)', [ids.r2, ids.r1])).toBe(true);
    });
});

describe('Cargar fichero por lotes', () => {
    it('crea distritos y visitadores nuevos, con la línea según el equipo, y vincula las filas', async () => {
        const lote = [
            { fila: 1, matricula: '100', nombre: 'DR UNO', visitador_nombre: ' ana perez ', sector: '111', distrito_codigo: '900', distrito_nombre: 'GD NUEVO', equipo: '7', datos: { Nombre: 'DR UNO' } },
            { fila: 2, matricula: '200', nombre: 'DR DOS', visitador_nombre: 'LUIS ROJAS', sector: '222', distrito_codigo: '900', distrito_nombre: 'GD NUEVO', equipo: '1', datos: { Nombre: 'DR DOS' } }
        ];
        const r = await como(db, U.admin, 'select public.cargar_fichero_lote($1, $2) as n', [ids.f2, JSON.stringify(lote)]);
        expect(r.rows[0].n).toBe(2);
        const vis = (await db.query(`select nombre_sector, linea from public.visitadores order by 1`)).rows;
        expect(vis).toEqual([{ nombre_sector: 'ANA PEREZ', linea: 'OTC' }, { nombre_sector: 'LUIS ROJAS', linea: 'Pharmetique' }]);
        expect(await n(`select count(*) as n from public.fichero where snapshot_id = $1 and visitador_id is null`, [ids.f2])).toBe(0);
        expect(await n(`select count(*) as n from public.distritos where codigo = '900'`)).toBe(1);
    });
});

describe('Almacén privado de archivos', () => {
    beforeAll(async () => {
        await db.query(`update public.data_snapshots set archivo = 'snapshots/' || id || '/datos.csv.gz' where id in ($1, $2)`, [ids.r1, ids.r2]);
    });
    it('solo el admin sube archivos', async () => {
        await como(db, U.admin, `insert into storage.objects (bucket_id, name) values ('datos', 'snapshots/' || $1 || '/datos.csv.gz')`, [ids.r1]);
        await como(db, U.admin, `insert into storage.objects (bucket_id, name) values ('datos', 'snapshots/' || $1 || '/datos.csv.gz')`, [ids.r2]);
        expect(await falla(U.vm, `insert into storage.objects (bucket_id, name) values ('datos', 'otro.gz')`)).toBe(true);
    });
    it('el archivo COMPLETO de una versión publicada: solo admin y Gerente Nacional (Fase 7)', async () => {
        const gteVe = (await como(db, U.gte, `select name from storage.objects`)).rows.map(r => r.name);
        expect(gteVe).toEqual([`snapshots/${ids.r1}/datos.csv.gz`]);
        const vmVe = (await como(db, U.vm, `select name from storage.objects`)).rows;
        expect(vmVe).toEqual([]);
        const adminVe = (await como(db, U.admin, `select name from storage.objects`)).rows;
        expect(adminVe).toHaveLength(2);
    });
    it('sin sesión no se ve ningún archivo', async () => {
        expect(await falla(null, `select name from storage.objects`)).toBe(true);
    });
});

// @vitest-environment node
/* ============================================================
   Pruebas de seguridad por fila (RLS) del esquema de Supabase.
   Demuestran qué puede ver y hacer cada rol:
   vm, gd, gte_nacional, admin, usuario inactivo y anónimo.
============================================================ */
import { describe, it, expect, beforeAll } from 'vitest';
import { crearBase, como } from './supabase-simulado.js';

const U = {
    admin: '00000000-0000-0000-0000-00000000000a',
    gte:   '00000000-0000-0000-0000-00000000000b',
    gd1:   '00000000-0000-0000-0000-00000000000c',
    vm1:   '00000000-0000-0000-0000-000000000001',
    vm2:   '00000000-0000-0000-0000-000000000002',
    vm3:   '00000000-0000-0000-0000-000000000003',   // desactivado
    nuevo: '00000000-0000-0000-0000-00000000000f'    // se registró solo, sin rol
};
let db;
const ids = {};
const filas = async (uid, sql, p) => (await como(db, uid, sql, p)).rows;
const falla = async (uid, sql, p) => {
    try { await como(db, uid, sql, p); return false; } catch { return true; }
};

beforeAll(async () => {
    db = await crearBase();
    // Usuarios (el trigger crea sus perfiles)
    const usuario = (id, email, meta) => db.query(
        'insert into auth.users (id, email, raw_app_meta_data) values ($1, $2, $3)', [id, email, meta]);
    await usuario(U.admin, 'Admin@LaSante.com', { rol: 'admin', nombre: 'ADMIN' });
    await usuario(U.gte, 'gte@lasante.com', { rol: 'gte_nacional' });
    await usuario(U.gd1, 'gd1@lasante.com', { rol: 'gd' });
    await usuario(U.vm1, 'vm1@lasante.com', { rol: 'vm' });
    await usuario(U.vm2, 'vm2@lasante.com', { rol: 'vm' });
    await usuario(U.vm3, 'vm3@lasante.com', { rol: 'vm' });
    await usuario(U.nuevo, 'intruso@gmail.com', {});
    await db.query(`update public.perfiles set activo = false where id = $1`, [U.vm3]);

    // Distritos y visitadores
    const d = await db.query(`insert into public.distritos (codigo, nombre) values ('100007','EI-LING LOPEZ'), ('100005','TONNY ESPINOZA') returning id`);
    ids.d1 = d.rows[0].id; ids.d2 = d.rows[1].id;
    await db.query('insert into public.perfil_distritos values ($1, $2)', [U.gd1, ids.d1]);
    const v = await db.query(`insert into public.visitadores (nombre_sector, distrito_id, perfil_id) values
        ('NEIVIS PARRA', $1, $2), ('ARIES CARRIZALES', $3, $4), ('VM INACTIVO', $1, $5) returning id`,
        [ids.d1, U.vm1, ids.d2, U.vm2, U.vm3]);
    ids.v1 = v.rows[0].id; ids.v2 = v.rows[1].id; ids.v3 = v.rows[2].id;

    // Versiones: fichero vigente, recetas vigente y un borrador
    const s = await db.query(`insert into public.data_snapshots (nombre, tipo, fecha, estado) values
        ('Datos enero','fichero','2026-01-31','borrador'),
        ('Datos enero','recetas','2026-01-31','borrador'),
        ('Datos noviembre','recetas','2026-11-30','borrador') returning id`);
    ids.sf = s.rows[0].id; ids.sr1 = s.rows[1].id; ids.sr2 = s.rows[2].id;
    await como(db, U.admin, 'select public.publicar_snapshot($1)', [ids.sf]);
    await como(db, U.admin, 'select public.publicar_snapshot($1)', [ids.sr1]);

    await db.query(`insert into public.fichero (snapshot_id, fila, matricula, nombre, visitador_nombre, visitador_id, datos) values
        ($1, 1, '00100', 'DR UNO',  'NEIVIS PARRA',     $2, '{"Nombre":"DR UNO"}'),
        ($1, 2, '200',   'DR DOS',  'ARIES CARRIZALES', $3, '{"Nombre":"DR DOS"}')`, [ids.sf, ids.v1, ids.v2]);
    const m = await db.query(`insert into public.cat_medicos (matricula, nombre) values
        ('100','DR UNO'), ('200','DR DOS'), ('300','DR TRES') returning id`);
    await db.query(`insert into public.cat_mercados (nombre) values ('DESLER MERCADO')`);
    await db.query(`insert into public.cat_productos (producto) values ('DESLER PHQ')`);
    await db.query(`insert into public.recetas (snapshot_id, fila, medico_id, mercado_id, producto_id, rx) values
        ($1, 1, $3, 1, 1, 10), ($1, 2, $4, 1, 1, 20), ($1, 3, $5, 1, 1, 30), ($2, 1, $3, 1, 1, 99)`,
        [ids.sr1, ids.sr2, m.rows[0].id, m.rows[1].id, m.rows[2].id]);

    // Evaluaciones (una de cada VM)
    const e = await db.query(`insert into public.evaluaciones (visitador_id, matricula, mercado, cuadrante, firebase_id) values
        ($1, '100', 'DESLER MERCADO', 'A+', 'NEIVISPARRA_100_DESLERMERCADO'),
        ($2, '200', 'DESLER MERCADO', 'B',  'ARIESCARRIZALES_200_DESLERMERCADO') returning id`, [ids.v1, ids.v2]);
    ids.e1 = e.rows[0].id; ids.e2 = e.rows[1].id;
});

describe('Alta de usuarios', () => {
    it('el perfil se crea solo, con el rol que fijó el admin y el correo en minúsculas', async () => {
        const p = (await db.query('select correo, rol, activo from public.perfiles where id = $1', [U.admin])).rows[0];
        expect(p).toEqual({ correo: 'admin@lasante.com', rol: 'admin', activo: true });
    });
    it('quien se registra por su cuenta queda INACTIVO y no ve nada', async () => {
        const p = (await db.query('select activo from public.perfiles where id = $1', [U.nuevo])).rows[0];
        expect(p.activo).toBe(false);
        expect(await filas(U.nuevo, 'select * from public.evaluaciones')).toEqual([]);
        expect(await filas(U.nuevo, 'select * from public.configuracion')).toEqual([]);
    });
});

describe('Un GD por distrito', () => {
    it('un distrito no puede quedar asignado a dos GD (cada VM tiene un solo GD)', async () => {
        let rechazado = false;
        try { await db.query('insert into public.perfil_distritos values ($1, $2)', [U.gte, ids.d1]); }
        catch { rechazado = true; }
        expect(rechazado).toBe(true);
    });
    it('un GD sí puede tener varios distritos', async () => {
        await db.query('insert into public.perfil_distritos values ($1, $2)', [U.gd1, ids.d2]);
        const n = (await db.query('select count(*)::int as n from public.perfil_distritos where perfil_id = $1', [U.gd1])).rows[0].n;
        expect(n).toBe(2);
        await db.query('delete from public.perfil_distritos where perfil_id = $1 and distrito_id = $2', [U.gd1, ids.d2]);
    });
});

describe('Visitador (vm)', () => {
    it('ve SOLO sus evaluaciones', async () => {
        const r = await filas(U.vm1, 'select id from public.evaluaciones');
        expect(r.map(x => x.id)).toEqual([ids.e1]);
    });
    it('ve SOLO sus médicos del fichero y sus recetas (versión publicada)', async () => {
        expect((await filas(U.vm1, 'select nombre from public.fichero')).map(x => x.nombre)).toEqual(['DR UNO']);
        const rx = await filas(U.vm1, 'select medico, rx from public.v_recetas order by rx');
        expect(rx).toEqual([{ medico: 'DR UNO', rx: 10 }]);
    });
    it('no ve versiones en borrador', async () => {
        const s = await filas(U.vm1, 'select nombre from public.data_snapshots order by nombre');
        expect(s.map(x => x.nombre)).toEqual(['Datos enero', 'Datos enero']);
    });
    it('crea y edita evaluaciones a SU nombre', async () => {
        await como(db, U.vm1, `insert into public.evaluaciones (visitador_id, matricula, mercado, cuadrante) values ($1,'100','OTRO MCDO','B')`, [ids.v1]);
        await como(db, U.vm1, `update public.evaluaciones set notas = 'visitado' where id = $1`, [ids.e1]);
        const e = (await db.query('select notas, actualizado_por from public.evaluaciones where id = $1', [ids.e1])).rows[0];
        expect(e).toEqual({ notas: 'visitado', actualizado_por: U.vm1 });
    });
    it('NO puede crear ni editar evaluaciones de otro VM', async () => {
        expect(await falla(U.vm1, `insert into public.evaluaciones (visitador_id, matricula, mercado) values ($1,'200','X')`, [ids.v2])).toBe(true);
        await como(db, U.vm1, `update public.evaluaciones set notas = 'hackeo' where id = $1`, [ids.e2]);
        expect((await db.query('select notas from public.evaluaciones where id = $1', [ids.e2])).rows[0].notas).toBe('');
        expect(await falla(U.vm1, `update public.evaluaciones set visitador_id = $1 where id = $2`, [ids.v2, ids.e1])).toBe(true);
    });
    it('NO puede eliminar (ni marcar como eliminada) una evaluación', async () => {
        expect(await falla(U.vm1, 'delete from public.evaluaciones where id = $1', [ids.e1])).toBe(true);
        expect(await falla(U.vm1, 'update public.evaluaciones set eliminado_en = now() where id = $1', [ids.e1])).toBe(true);
    });
    it('lee la configuración compartida pero no la cambia', async () => {
        expect((await filas(U.vm1, 'select clave from public.configuracion')).length).toBe(5);
        await como(db, U.vm1, `update public.configuracion set valor = '{}' where clave = 'umbrales_matriz'`);
        const v = (await db.query(`select valor from public.configuracion where clave = 'umbrales_matriz'`)).rows[0].valor;
        expect(v.TH_LOY_HIGH).toBe(66);
    });
    it('no puede publicar versiones', async () => {
        expect(await falla(U.vm1, 'select public.publicar_snapshot($1)', [ids.sr2])).toBe(true);
    });
});

describe('Gerente de Distrito (gd)', () => {
    it('ve SOLO a los VM y evaluaciones de su distrito', async () => {
        expect((await filas(U.gd1, 'select nombre_sector from public.visitadores order by 1')).map(x => x.nombre_sector))
            .toEqual(['NEIVIS PARRA', 'VM INACTIVO']);
        const e = await filas(U.gd1, 'select visitador_id from public.evaluaciones');
        expect(e.every(x => x.visitador_id === ids.v1)).toBe(true);
        expect(e.some(x => x.visitador_id === ids.v2)).toBe(false);
    });
    it('NO ve el fichero ni las recetas de otro distrito', async () => {
        expect((await filas(U.gd1, 'select nombre from public.fichero')).map(x => x.nombre)).toEqual(['DR UNO']);
        expect((await filas(U.gd1, 'select rx from public.v_recetas')).map(x => x.rx)).toEqual([10]);
    });
    it('no puede crear ni editar evaluaciones', async () => {
        expect(await falla(U.gd1, `insert into public.evaluaciones (visitador_id, matricula, mercado) values ($1,'100','Y')`, [ids.v1])).toBe(true);
        await como(db, U.gd1, `update public.evaluaciones set notas = 'gd' where id = $1`, [ids.e1]);
        expect((await db.query('select notas from public.evaluaciones where id = $1', [ids.e1])).rows[0].notas).toBe('visitado');
    });
});

describe('Gerente Nacional (gte_nacional)', () => {
    it('ve TODO: todos los VM, evaluaciones, fichero y recetas publicadas', async () => {
        expect((await filas(U.gte, 'select id from public.visitadores')).length).toBe(3);
        expect((await filas(U.gte, 'select id from public.evaluaciones')).length).toBe(3);
        expect((await filas(U.gte, 'select nombre from public.fichero')).length).toBe(2);
        expect((await filas(U.gte, 'select rx from public.v_recetas order by rx')).map(x => x.rx)).toEqual([10, 20, 30]);
    });
    it('NO puede editar, crear ni eliminar nada', async () => {
        expect(await falla(U.gte, `insert into public.evaluaciones (visitador_id, matricula, mercado) values ($1,'100','Z')`, [ids.v1])).toBe(true);
        await como(db, U.gte, `update public.evaluaciones set notas = 'gte' where id = $1`, [ids.e2]);
        await como(db, U.gte, `update public.configuracion set valor = '{}' where clave = 'umbrales_encuesta'`);
        expect((await db.query('select notas from public.evaluaciones where id = $1', [ids.e2])).rows[0].notas).toBe('');
        expect((await db.query(`select valor from public.configuracion where clave = 'umbrales_encuesta'`)).rows[0].valor.A).toBe(70);
        expect(await falla(U.gte, 'select public.publicar_snapshot($1)', [ids.sr2])).toBe(true);
    });
});

describe('Administrador (admin)', () => {
    it('ve todo, incluidos los borradores', async () => {
        expect((await filas(U.admin, 'select id from public.data_snapshots')).length).toBe(3);
        expect((await filas(U.admin, 'select rx from public.v_recetas')).length).toBe(4);
    });
    it('"eliminar" una evaluación la marca (no la borra) y queda en el historial', async () => {
        await como(db, U.admin, 'update public.evaluaciones set eliminado_en = now() where id = $1', [ids.e2]);
        const e = (await db.query('select eliminado_en, eliminado_por from public.evaluaciones where id = $1', [ids.e2])).rows[0];
        expect(e.eliminado_en).not.toBeNull();
        expect(e.eliminado_por).toBe(U.admin);
        const h = await filas(U.admin, 'select accion from public.evaluaciones_historial where evaluacion_id = $1', [ids.e2]);
        expect(h.map(x => x.accion)).toContain('eliminada');
        // El VM dueño ya no la ve; el Gte. Nacional sí (para auditoría)
        expect((await filas(U.vm2, 'select id from public.evaluaciones')).length).toBe(0);
        expect((await filas(U.gte, 'select id from public.evaluaciones where id = $1', [ids.e2])).length).toBe(1);
    });
    it('ni el admin puede BORRAR filas de verdad', async () => {
        expect(await falla(U.admin, 'delete from public.evaluaciones where id = $1', [ids.e1])).toBe(true);
    });
    it('publica una versión nueva y puede volver a la anterior', async () => {
        await como(db, U.admin, 'select public.publicar_snapshot($1)', [ids.sr2]);
        let vig = (await db.query(`select nombre from public.data_snapshots where tipo='recetas' and es_vigente`)).rows;
        expect(vig).toEqual([{ nombre: 'Datos noviembre' }]);
        await como(db, U.admin, 'select public.publicar_snapshot($1)', [ids.sr1]);
        vig = (await db.query(`select nombre from public.data_snapshots where tipo='recetas' and es_vigente`)).rows;
        expect(vig).toEqual([{ nombre: 'Datos enero' }]);
        // La versión anterior sigue consultable (no se borró nada)
        expect((await db.query('select count(*)::int as n from public.recetas where snapshot_id = $1', [ids.sr2])).rows[0].n).toBe(1);
    });
    it('nunca hay dos versiones vigentes del mismo tipo', async () => {
        let duplicado = false;
        try { await db.query(`update public.data_snapshots set es_vigente = true where id = $1`, [ids.sr2]); }
        catch { duplicado = true; }
        expect(duplicado).toBe(true);
    });
});

describe('Usuario desactivado y anónimo', () => {
    it('un VM desactivado no ve nada (sus datos se conservan)', async () => {
        expect(await filas(U.vm3, 'select * from public.evaluaciones')).toEqual([]);
        expect(await filas(U.vm3, 'select * from public.fichero')).toEqual([]);
        expect((await db.query('select count(*)::int as n from public.visitadores where id = $1', [ids.v3])).rows[0].n).toBe(1);
    });
    it('sin sesión no puede leer nada', async () => {
        for (const t of ['evaluaciones', 'fichero', 'recetas', 'perfiles', 'configuracion', 'app_errores']) {
            expect(await falla(null, `select * from public.${t}`)).toBe(true);
        }
    });
    it('sin sesión sí puede reportar una falla (pero no leerlas)', async () => {
        await como(db, null, `insert into public.app_errores (tipo, mensaje) values ('error', 'prueba')`);
        expect((await filas(U.admin, 'select mensaje from public.app_errores')).map(x => x.mensaje)).toEqual(['prueba']);
        expect(await filas(U.vm1, 'select * from public.app_errores')).toEqual([]);
    });
});

describe('Datos', () => {
    it('la matrícula se normaliza igual que en la app (sin ceros a la izquierda)', async () => {
        const f = (await db.query(`select matricula, matricula_norm from public.fichero where fila = 1`)).rows[0];
        expect(f).toEqual({ matricula: '00100', matricula_norm: '100' });
    });
    it('una sola evaluación activa por visitador + médico + mercado', async () => {
        let duplicado = false;
        try { await db.query(`insert into public.evaluaciones (visitador_id, matricula, mercado) values ($1, '0100', 'DESLER MERCADO')`, [ids.v1]); }
        catch { duplicado = true; }
        expect(duplicado).toBe(true);
    });
});

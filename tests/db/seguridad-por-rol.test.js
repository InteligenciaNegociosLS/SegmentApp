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
        expect((await filas(U.vm1, 'select clave from public.configuracion')).length).toBe(9)   // + filtros_closeup (17), laboratorios_propios, productos_phq_excluidos, instructivos_descarga (18);
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

describe('Historial de evaluaciones (migración 9)', () => {
    it('cada VM ve el historial de SUS evaluaciones; el GD, el de su distrito; otro VM, no', async () => {
        await como(db, U.vm1, `update public.evaluaciones set cuadrante = 'B' where id = $1`, [ids.e1]);
        const propio = await filas(U.vm1, 'select accion from public.evaluaciones_historial where evaluacion_id = $1', [ids.e1]);
        expect(propio.length).toBeGreaterThan(0);
        expect((await filas(U.gd1, 'select 1 from public.evaluaciones_historial where evaluacion_id = $1', [ids.e1])).length).toBe(propio.length);
        expect((await filas(U.vm2, 'select 1 from public.evaluaciones_historial where evaluacion_id = $1', [ids.e1])).length).toBe(0);
    });
    it('nadie puede borrar ni cambiar el historial', async () => {
        expect(await falla(U.admin, 'delete from public.evaluaciones_historial')).toBe(true);
        expect(await falla(U.vm1, `update public.evaluaciones_historial set accion = 'x'`)).toBe(true);
    });
});

describe('Avisos vistos (migración 12)', () => {
    it('cada persona guarda y lee SOLO su marca de "visto hasta"', async () => {
        await como(db, U.gd1, `insert into public.avisos_vistos (perfil_id, visto_hasta) values ($1, '2026-10-30T10:00:00Z')`, [U.gd1]);
        await como(db, U.gd1, `update public.avisos_vistos set visto_hasta = '2026-10-30T12:00:00Z' where perfil_id = $1`, [U.gd1]);
        const propia = await filas(U.gd1, 'select visto_hasta from public.avisos_vistos');
        expect(propia).toHaveLength(1);
        expect(new Date(propia[0].visto_hasta).toISOString()).toBe('2026-10-30T12:00:00.000Z');
        expect(await filas(U.admin, 'select 1 from public.avisos_vistos')).toHaveLength(0);
        expect(await falla(U.vm1, `insert into public.avisos_vistos (perfil_id) values ($1)`, [U.gd1])).toBe(true);
        expect(await falla(U.nuevo, `insert into public.avisos_vistos (perfil_id) values ($1)`, [U.nuevo])).toBe(true);
        expect(await falla(null, 'select * from public.avisos_vistos')).toBe(true);
        expect(await falla(U.gd1, 'delete from public.avisos_vistos')).toBe(true);
    });
});

describe('Latido para que Supabase no se pause (migración 13)', () => {
    it('cualquiera puede dar el latido (solo cuenta); nadie lee ni cambia la tabla', async () => {
        const uno = (await filas(null, 'select public.latido() as r'))[0].r;
        const dos = (await filas(null, 'select public.latido() as r'))[0].r;
        expect(uno.ok).toBe(true);
        expect(Number(dos.veces)).toBe(Number(uno.veces) + 1);
        expect(await falla(null, 'select * from public.latidos')).toBe(true);
        expect(await falla(U.vm1, 'update public.latidos set veces = 0')).toBe(true);
        expect((await filas(U.admin, 'select * from public.latidos').catch(() => []))).toHaveLength(0);
    });
});

describe('Usuarios desde la app, solo admin (migración 14)', () => {
    const OTRO = '00000000-0000-0000-0000-000000000009';
    beforeAll(async () => {
        await db.query('insert into auth.users (id, email, raw_app_meta_data) values ($1, $2, $3)',
            [OTRO, 'ada.dascenzo@segmentapp.internal', { rol: 'vm', nombre: 'ADA DASCENZO' }]);
        await db.query(`insert into auth.identities (user_id, provider, provider_id, identity_data) values ($1, 'email', $3, $2)`,
            [OTRO, { sub: OTRO, email: 'ada.dascenzo@segmentapp.internal' }, OTRO]);
    });
    const usuario = async () => (await db.query(
        'select email, raw_app_meta_data, raw_user_meta_data, encrypted_password from auth.users where id = $1', [OTRO])).rows[0];

    it('solo el admin ve la lista de usuarios, con su rol, visitador y distritos', async () => {
        const lista = await filas(U.admin, 'select * from public.admin_usuarios()');
        expect(lista.map(u => u.rol)[0]).toBe('admin');
        expect(lista.find(u => u.id === U.vm1)).toMatchObject({ correo: 'vm1@lasante.com', visitador: 'NEIVIS PARRA', clave_temporal: false });
        expect(lista.find(u => u.id === U.gd1).distritos).toBe('EI-LING LOPEZ (100007)');
        for (const quien of [U.gte, U.gd1, U.vm1, U.vm3, U.nuevo, null]) {
            expect(await falla(quien, 'select * from public.admin_usuarios()')).toBe(true);
        }
    });

    it('el admin cambia nombre y correo: cambian el usuario, su identidad y su perfil', async () => {
        const r = (await filas(U.admin, 'select public.admin_editar_usuario($1, $2, $3) as r',
            [OTRO, ' Ada D\'Ascenzo ', ' Ada.Dascenzo@LaSante.com.ve ']))[0].r;
        expect(r).toEqual({ ok: true, correo: 'ada.dascenzo@lasante.com.ve', nombre: 'Ada D\'Ascenzo' });
        const u = await usuario();
        expect(u.email).toBe('ada.dascenzo@lasante.com.ve');
        expect(u.raw_app_meta_data).toMatchObject({ rol: 'vm', nombre: 'Ada D\'Ascenzo' });
        const ident = (await db.query('select identity_data from auth.identities where user_id = $1', [OTRO])).rows[0].identity_data;
        expect(ident.email).toBe('ada.dascenzo@lasante.com.ve');
        const p = (await db.query('select correo, nombre from public.perfiles where id = $1', [OTRO])).rows[0];
        expect(p).toEqual({ correo: 'ada.dascenzo@lasante.com.ve', nombre: 'Ada D\'Ascenzo' });
    });

    it('no deja un correo repetido, inválido o un nombre vacío; nadie más puede editar', async () => {
        const editar = (quien, correo, nombre = 'X') => falla(quien, 'select public.admin_editar_usuario($1, $2, $3)', [OTRO, nombre, correo]);
        expect(await editar(U.admin, 'VM1@lasante.com')).toBe(true);
        expect(await editar(U.admin, 'sin-arroba')).toBe(true);
        expect(await editar(U.admin, 'bien@lasante.com', '  ')).toBe(true);
        expect(await editar(U.gte, 'otro@lasante.com')).toBe(true);
        expect(await editar(U.vm1, 'otro@lasante.com')).toBe(true);
        expect(await editar(null, 'otro@lasante.com')).toBe(true);
        expect((await usuario()).email).toBe('ada.dascenzo@lasante.com.ve');
    });

    it('el admin da una clave temporal: queda cifrada y marcada para que la app pida cambiarla', async () => {
        await filas(U.admin, 'select public.admin_clave_temporal($1, $2)', [OTRO, 'maro-kebi-4821']);
        const u = await usuario();
        expect(u.encrypted_password).toMatch(/^\$2a\$/);
        expect(u.encrypted_password).not.toContain('maro-kebi-4821');
        expect(u.raw_user_meta_data).toEqual({ clave_temporal: true });
        const lista = await filas(U.admin, 'select * from public.admin_usuarios()');
        expect(lista.find(x => x.id === OTRO).clave_temporal).toBe(true);
        // Clave corta, la propia, o alguien que no es admin: no
        expect(await falla(U.admin, 'select public.admin_clave_temporal($1, $2)', [OTRO, 'corta'])).toBe(true);
        expect(await falla(U.admin, 'select public.admin_clave_temporal($1, $2)', [U.admin, 'larga-larga-1234'])).toBe(true);
        expect(await falla(U.gd1, 'select public.admin_clave_temporal($1, $2)', [OTRO, 'larga-larga-1234'])).toBe(true);
        expect(await falla(null, 'select public.admin_clave_temporal($1, $2)', [OTRO, 'larga-larga-1234'])).toBe(true);
    });

    it('el admin desactiva y reactiva un acceso (sin borrar), pero no el suyo', async () => {
        await filas(U.admin, 'select public.admin_activar_usuario($1, false)', [OTRO]);
        expect((await db.query('select activo from public.perfiles where id = $1', [OTRO])).rows[0].activo).toBe(false);
        await filas(U.admin, 'select public.admin_activar_usuario($1, true)', [OTRO]);
        expect((await db.query('select activo from public.perfiles where id = $1', [OTRO])).rows[0].activo).toBe(true);
        expect(await falla(U.admin, 'select public.admin_activar_usuario($1, false)', [U.admin])).toBe(true);
        expect(await falla(U.gd1, 'select public.admin_activar_usuario($1, false)', [OTRO])).toBe(true);
    });
});

describe('Claves temporales para varios a la vez (migración 15)', () => {
    const marca = async (id) => (await db.query('select raw_user_meta_data, encrypted_password from auth.users where id = $1', [id])).rows[0];

    it('el admin da claves temporales a varios en una sola llamada', async () => {
        const n = (await filas(U.admin, 'select public.admin_claves_temporales($1) as n',
            [JSON.stringify([{ id: U.vm1, clave: 'bago-tefi-1234' }, { id: U.gd1, clave: 'mira-sole-5678' }])]))[0].n;
        expect(n).toBe(2);
        for (const id of [U.vm1, U.gd1]) {
            const u = await marca(id);
            expect(u.raw_user_meta_data.clave_temporal).toBe(true);
            expect(u.encrypted_password).toMatch(/^\$2a\$/);
        }
        expect((await marca(U.vm1)).encrypted_password).not.toContain('bago-tefi-1234');
    });

    it('todo o nada: si una falla (clave corta, el propio admin, alguien que no existe) no cambia ninguna', async () => {
        const antes = (await marca(U.vm2)).encrypted_password;
        const lote = (extra) => JSON.stringify([{ id: U.vm2, clave: 'nueva-clave-9999' }, extra]);
        expect(await falla(U.admin, 'select public.admin_claves_temporales($1)', [lote({ id: U.gte, clave: 'corta' })])).toBe(true);
        expect(await falla(U.admin, 'select public.admin_claves_temporales($1)', [lote({ id: U.admin, clave: 'larga-larga-1234' })])).toBe(true);
        expect(await falla(U.admin, 'select public.admin_claves_temporales($1)', [lote({ id: '00000000-0000-0000-0000-0000000000ff', clave: 'larga-larga-1234' })])).toBe(true);
        expect((await marca(U.vm2)).encrypted_password).toBe(antes);
    });

    it('nadie más que el admin puede usarla', async () => {
        const lote = JSON.stringify([{ id: U.vm2, clave: 'larga-larga-1234' }]);
        for (const quien of [U.gte, U.gd1, U.vm1, U.nuevo, null]) {
            expect(await falla(quien, 'select public.admin_claves_temporales($1)', [lote])).toBe(true);
        }
    });
});

describe('Desactivar a un VM oculta su visitador sin borrar nada (migración 16)', () => {
    it('al desactivar su acceso, su visitador queda inactivo; al reactivarlo vuelve', async () => {
        const activo = async () => (await db.query('select activo from public.visitadores where id = $1', [ids.v2])).rows[0].activo;
        const evalsAntes = Number((await db.query('select count(*) as n from public.evaluaciones')).rows[0].n);
        await filas(U.admin, 'select public.admin_activar_usuario($1, false)', [U.vm2]);
        expect(await activo()).toBe(false);
        // El GD de ese distrito todavía lee la lista (para ocultarlo en la app), y nada se borró
        expect(Number((await db.query('select count(*) as n from public.evaluaciones')).rows[0].n)).toBe(evalsAntes);
        await filas(U.admin, 'select public.admin_activar_usuario($1, true)', [U.vm2]);
        expect(await activo()).toBe(true);
    });
});

describe('Catálogos de CloseUp (migración 17)', () => {
    const guardar = (quien, tipo, filas) => filas_(quien, 'select public.admin_guardar_catalogo($1, $2) as r', [tipo, JSON.stringify(filas)]);
    const filas_ = async (uid, sql, p) => (await como(db, uid, sql, p)).rows;

    it('el admin guarda un catálogo: agrega, actualiza y cuenta (nunca borra)', async () => {
        let r = (await guardar(U.admin, 'productos', [
            { producto: 'DESLER PHQ', laboratorio: 'PHQ', molecula: 'DESLORATADINA', clase_terapeutica: 'R06A0', generico: 'NO', variantes: 3, clases_distintas: [] },
            { producto: 'AZITROMICINA SAL SAL', laboratorio: 'SAL', molecula: 'AZITROMICINA', clase_terapeutica: 'J01F0', generico: 'SI' }
        ]))[0].r;
        expect(r).toMatchObject({ total: 2, nuevas: 2, cambiadas: 0, iguales: 0 });
        r = (await guardar(U.admin, 'productos', [
            { producto: 'DESLER PHQ', laboratorio: 'PHQ', molecula: 'DESLORATADINA', clase_terapeutica: 'R06A0', generico: 'NO', variantes: 3, clases_distintas: [] },
            { producto: 'XAROX PHQ', laboratorio: 'PHQ', molecula: 'RIVAROXABAN', clase_terapeutica: 'B01F0', generico: 'NO' }
        ]))[0].r;
        expect(r).toMatchObject({ total: 2, nuevas: 1, cambiadas: 0, iguales: 1 });
        // La que no vino en la segunda carga sigue ahí
        expect((await filas_(U.admin, 'select count(*)::int as n from public.catalogo_productos'))[0].n).toBe(3);
        r = (await guardar(U.admin, 'especialidades', [{ codigo: 'CAR', nombre: 'CARDIOLOGIA' }, { codigo: 'CIR', nombre: 'CIRUGIA' }]))[0].r;
        expect(r.nuevas).toBe(2);
        r = (await guardar(U.admin, 'especialidades', [{ codigo: 'CAR', nombre: 'CARDIOLOGÍA' }]))[0].r;
        expect(r).toMatchObject({ nuevas: 0, cambiadas: 1 });
        r = (await guardar(U.admin, 'laboratorios', [{ abreviatura: 'PHQ', nombre: 'PHARMETIQUE', codigo: '123' }]))[0].r;
        expect(r.nuevas).toBe(1);
        r = (await guardar(U.admin, 'clases', [{ codigo: 'R06A0', nombre: 'ANTIHISTAMINICOS' }]))[0].r;
        expect(r.nuevas).toBe(1);
    });

    it('solo el admin los lee o los cambia', async () => {
        for (const quien of [U.gte, U.gd1, U.vm1, null]) {
            expect(await falla(quien, 'select public.admin_guardar_catalogo($1, $2)', ['especialidades', '[]'])).toBe(true);
        }
        for (const quien of [U.gte, U.gd1, U.vm1]) {
            expect(await filas(quien, 'select * from public.catalogo_productos')).toHaveLength(0);
            expect(await falla(quien, `insert into public.catalogo_especialidades values ('XX', 'X')`)).toBe(true);
        }
        expect(await falla(null, 'select * from public.catalogo_productos')).toBe(true);
    });

    it('los filtros de la carga vienen con los de Power Query', async () => {
        const f = (await filas(U.admin, `select valor from public.configuracion where clave = 'filtros_closeup'`))[0].valor;
        expect(f.especialidades_excluir).toEqual(['DCR', 'INS', 'OTR']);
        expect(f.nombres_especialidad_excluir).toEqual(['UNIDAD DE CUIDADOS INTENS']);
        expect(f.excluir_matricula_cero).toBe(true);
    });
});

describe('Catálogos: lo corregido a mano se respeta (migración 17)', () => {
    it('subir el catálogo del portal no pisa un producto corregido en la app', async () => {
        const g = (filas) => como(db, U.admin, 'select public.admin_guardar_catalogo($1, $2)', ['productos', JSON.stringify(filas)]);
        await g([{ producto: 'TRALIX PHQ', laboratorio: 'PHQ', molecula: 'X', clase_terapeutica: 'A01', generico: 'NO', clases_distintas: ['A01', 'B02'] }]);
        await g([{ producto: 'TRALIX PHQ', laboratorio: 'PHQ', molecula: 'X', clase_terapeutica: 'B02', generico: 'NO', clases_distintas: ['A01', 'B02'], editado_a_mano: true }]);
        await g([{ producto: 'TRALIX PHQ', laboratorio: 'PHQ', molecula: 'X', clase_terapeutica: 'A01', generico: 'NO', clases_distintas: ['A01', 'B02'] }]);
        const p = (await db.query(`select clase_terapeutica, editado_a_mano from public.catalogo_productos where producto = 'TRALIX PHQ'`)).rows[0];
        expect(p).toEqual({ clase_terapeutica: 'B02', editado_a_mano: true });
    });
});

describe('Accesos y catálogos (migración 18)', () => {
    const crear = (quien, ...a) => como(db, quien, 'select public.admin_crear_usuario($1, $2, $3, $4, $5, $6) as r', a);

    it('el admin crea el acceso de un VM: usuario, identidad, perfil y su visitador enlazados, con clave temporal cifrada', async () => {
        await db.query(`insert into public.visitadores (nombre_sector, distrito_id) values ('VM NUEVO', $1)`, [ids.d1]);
        const r = (await crear(U.admin, ' Nuevo.VM@LaSante.com.ve ', 'Vm Nuevo', 'vm', 'tati-roke-1234', 'vm nuevo', null)).rows[0].r;
        expect(r).toMatchObject({ ok: true, correo: 'nuevo.vm@lasante.com.ve', rol: 'vm' });
        const u = (await db.query('select email, aud, role, encrypted_password, raw_user_meta_data, raw_app_meta_data, email_confirmed_at, confirmation_token from auth.users where id = $1', [r.id])).rows[0];
        expect(u).toMatchObject({ email: 'nuevo.vm@lasante.com.ve', aud: 'authenticated', role: 'authenticated', confirmation_token: '' });
        expect(u.encrypted_password).toMatch(/^\$2a\$/);
        expect(u.raw_user_meta_data).toEqual({ clave_temporal: true });
        expect(u.raw_app_meta_data).toMatchObject({ provider: 'email', rol: 'vm', nombre: 'Vm Nuevo' });
        expect(u.email_confirmed_at).not.toBeNull();
        const ident = (await db.query('select provider, provider_id, identity_data from auth.identities where user_id = $1', [r.id])).rows[0];
        expect(ident).toMatchObject({ provider: 'email', provider_id: r.id });
        expect(ident.identity_data.email).toBe('nuevo.vm@lasante.com.ve');
        expect((await db.query('select rol, activo from public.perfiles where id = $1', [r.id])).rows[0]).toEqual({ rol: 'vm', activo: true });
        expect((await db.query(`select perfil_id from public.visitadores where nombre_sector = 'VM NUEVO'`)).rows[0].perfil_id).toBe(r.id);
    });

    it('crea un GD con su distrito; no deja correos repetidos, distritos con GD activo ni a quien no es admin', async () => {
        const d = (await db.query(`insert into public.distritos (codigo, nombre) values ('100099', 'VACANTE') returning id`)).rows[0].id;
        const r = (await crear(U.admin, 'gd.nuevo@lasante.com.ve', 'GD Nuevo', 'gd', 'tati-roke-1234', null, ['100099'])).rows[0].r;
        expect((await db.query('select perfil_id from public.perfil_distritos where distrito_id = $1', [d])).rows[0].perfil_id).toBe(r.id);
        const falla_ = async (...a) => { try { await crear(...a); return false; } catch { return true; } };
        expect(await falla_(U.admin, 'gd.nuevo@lasante.com.ve', 'Otro', 'gte_nacional', 'tati-roke-1234', null, null)).toBe(true);
        expect(await falla_(U.admin, 'otro@lasante.com.ve', 'Otro', 'gd', 'tati-roke-1234', null, ['100099'])).toBe(true);
        expect(await falla_(U.admin, 'otro@lasante.com.ve', 'Otro', 'vm', 'tati-roke-1234', 'NO EXISTE', null)).toBe(true);
        expect(await falla_(U.admin, 'otro@lasante.com.ve', 'Otro', 'vm', 'corta', 'VM NUEVO', null)).toBe(true);
        expect(await falla_(U.gd1, 'otro2@lasante.com.ve', 'Otro', 'gte_nacional', 'tati-roke-1234', null, null)).toBe(true);
        expect(await falla_(null, 'otro3@lasante.com.ve', 'Otro', 'gte_nacional', 'tati-roke-1234', null, null)).toBe(true);
    });

    it('pendientes de acceso: distritos sin GD (y solo el admin lo ve)', async () => {
        const p = (await filas(U.admin, 'select public.admin_pendientes_acceso() as p'))[0].p;
        expect(Array.isArray(p.visitadores)).toBe(true);
        expect(p.distritos.map(x => x.codigo)).not.toContain('100099');
        expect(await falla(U.gd1, 'select public.admin_pendientes_acceso()')).toBe(true);
    });

    it('clases con niveles e historial de catálogos (solo admin)', async () => {
        const r = (await filas(U.admin, 'select public.admin_guardar_clases($1) as r', [JSON.stringify([
            { codigo: 'A', nombre: 'APARAT.DIGEST.Y METAB.', nivel: 1, padre: null },
            { codigo: 'A01', nombre: 'ESTOMATOLOGICOS', nivel: 2, padre: 'A' },
            { codigo: 'A01A', nombre: 'ESTOMATOLOGICOS', nivel: 3, padre: 'A01' }])]))[0].r;
        expect(r.nuevas).toBe(3);
        expect((await db.query(`select nivel, padre from public.catalogo_clases where codigo = 'A01A'`)).rows[0]).toEqual({ nivel: 3, padre: 'A01' });
        await como(db, U.admin, `insert into public.catalogo_versiones (tipo, nombre_archivo, registros) values ('clases', 'Clases.xls', 3)`);
        expect(await filas(U.admin, 'select * from public.catalogo_versiones')).toHaveLength(1);
        expect(await filas(U.gd1, 'select * from public.catalogo_versiones')).toHaveLength(0);
        expect(await falla(U.vm1, `insert into public.catalogo_versiones (tipo, nombre_archivo) values ('x', 'y')`)).toBe(true);
        expect(await falla(U.gd1, 'select public.admin_guardar_clases($1)', ['[]'])).toBe(true);
    });
});

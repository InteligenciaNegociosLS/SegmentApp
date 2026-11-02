// @vitest-environment node
/* ============================================================
   Migración completa Firebase → Supabase, de punta a punta, en un
   Postgres 16 real (PGlite) con los DATOS REALES del repositorio y
   una exportación de Firebase de prueba:
   simulacro → importación → repetición sin duplicar → validación →
   usuarios → permisos por rol después de migrar.
============================================================ */
import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { crearBase, como } from './supabase-simulado.js';
import { leerCsvGz, leerExportacion, normalizarVisitador } from '../../scripts/migracion/transformar.mjs';
import { importar } from '../../scripts/migracion/importar.mjs';
import { validar, informeMarkdown } from '../../scripts/migracion/validar.mjs';
import { plantillaCsv, leerCsvUsuarios, aplicarUsuarios } from '../../scripts/migracion/usuarios.mjs';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const silencio = () => {};
let db, exportacion, visitadores;
const n = async (sql, p) => Number((await db.query(sql, p)).rows[0].n);

// Exportación de Firebase de prueba, con casos difíciles a propósito
function exportacionDePrueba() {
    const fichero = leerCsvGz(path.join(RAIZ, 'fichero_medico.csv.gz'));
    const iVis = fichero.encabezados.indexOf('Nombre del sector');
    const iMat = fichero.encabezados.indexOf('Matricula');
    const porVis = new Map();
    fichero.filas.forEach(r => {
        const v = normalizarVisitador(r[iVis]);
        if (!porVis.has(v)) porVis.set(v, []);
        porVis.get(v).push(r[iMat]);
    });
    visitadores = [...porVis.keys()].sort();
    const docs = {};
    const base = 'artifacts/segmentapp-local/public/data';
    let k = 0;
    visitadores.slice(0, 10).forEach((vis, iv) => {
        porVis.get(vis).slice(0, 25).forEach((mat, im) => {
            const mercado = im % 2 ? 'DESLER MERCADO' : 'ESOZ MERCADO A02B2';
            const id = `${vis.replace(/[^a-zA-Z0-9_-]/g, '')}_${mat}_${mercado.replace(/[^a-zA-Z0-9_-]/g, '')}`;
            docs[`${base}/evaluaciones_matriz/${id}`] = {
                visitador: vis, medico_id: mat, medico_name: `MEDICO ${mat}`, mercado,
                cuadrante: ['A+', 'B', 'C-'][k % 3], notas: k % 7 ? `Nota ${k} con "comillas" y ñ` : '',
                survey: { q1: '10 a 20', q2: '1 a 5', q3: '0', q4: k % 5 ? 'COMPETIDOR X' : '', q5: '$30 a $50' },
                timestamp: new Date(Date.UTC(2026, 0, 1 + (k % 28), iv, im)).toISOString(),
                _user_role: 'visitador', cruceErrado: k % 11 === 0, nombreFichero: k % 11 === 0 ? `NOMBRE ${mat}` : null
            };
            k++;
        });
    });
    // Duplicado: mismo médico y mercado con la matrícula escrita con ceros (más viejo)
    const [v0] = visitadores; const m0 = porVis.get(v0)[0];
    docs[`${base}/evaluaciones_matriz/DUPLICADO_VIEJO`] = { visitador: v0, medico_id: '000' + m0, mercado: 'ESOZ MERCADO A02B2',
        cuadrante: 'C', notas: 'versión vieja', survey: {}, timestamp: '2025-12-01T00:00:00.000Z' };
    // Visitador que ya no está en el fichero
    docs[`${base}/evaluaciones_matriz/EXVISITADOR_1_M`] = { visitador: 'EX VISITADOR', medico_id: '1', mercado: 'AIREX MCDO',
        cuadrante: 'B', notas: '', survey: { q1: 'Más de 70' }, timestamp: '2026-01-15T10:00:00.000Z' };
    // Sin fecha
    docs[`${base}/evaluaciones_matriz/SINFECHA_2_M`] = { visitador: visitadores[1], medico_id: '2', mercado: 'AIREX MCDO', cuadrante: 'A' };
    // Claves (una corta, para probar la recuperación) y clave de admin
    visitadores.forEach((v, i) => { docs[`${base}/claves_visitadores/${v}`] = { clave: i === 1 ? '123' : `clave-${i}-segura` }; });
    docs['artifacts/segmentapp-local/config/admin_settings'] = { clave: 'clave-admin-larga' };
    return leerExportacion({ creado_en: '2026-10-28T12:00:00.000Z', documentos: docs });
}

beforeAll(async () => {
    db = await crearBase();
    exportacion = exportacionDePrueba();
}, 300000);

describe('Paso 2 · Importación', () => {
    it('el SIMULACRO valida todo y no deja nada guardado', async () => {
        const r = await importar({ db, raiz: RAIZ, exportacion, simulacro: true, log: silencio });
        expect(r.recetas.filas).toBe(231729);
        expect(r.evaluaciones.total).toBe(253);
        expect(await n('select count(*) as n from public.recetas')).toBe(0);
        expect(await n('select count(*) as n from public.evaluaciones')).toBe(0);
        expect(await n('select count(*) as n from public.visitadores')).toBe(0);
    }, 300000);

    it('la importación real carga fichero, recetas y evaluaciones', async () => {
        await db.close();
        db = await crearBase();   // base limpia (el motor de pruebas tiene poca memoria)
        const r = await importar({ db, raiz: RAIZ, exportacion, log: silencio });
        expect(r.fichero.filas).toBe(7308);
        expect(r.recetas.filas).toBe(231729);
        expect(r.evaluaciones.nuevas).toBe(253);
        expect(r.evaluaciones.duplicadas).toHaveLength(1);
        expect(r.evaluaciones.faltantes).toEqual(['EX VISITADOR']);
        expect(await n('select count(*) as n from public.distritos')).toBe(7);
        expect(await n('select count(*) as n from public.visitadores where activo')).toBe(51);
        expect(await n(`select count(*) as n from public.data_snapshots where es_vigente and nombre = 'Datos enero'`)).toBe(2);
        // Espacio en la base: recetas + catálogos + fichero de la primera versión (≈ 65 MB)
        const mb = await n(`select sum(pg_total_relation_size(c.oid)) / 1000000 as n from pg_class c
                            join pg_namespace s on s.oid = c.relnamespace where s.nspname = 'public' and c.relkind = 'r'`);
        expect(mb).toBeLessThan(90);
        // El fichero conserva sus 119 columnas (incluida la repetida y las direcciones con ";")
        const d = (await db.query('select datos from public.fichero where fila = 1')).rows[0].datos;
        expect(Object.keys(d)).toHaveLength(119);
        expect(d).toHaveProperty('Cumpleaños (2)');
        const conPuntoYComa = await n(`select count(*) as n from public.fichero where datos->>'Dirección' like '%;%'`);
        expect(conPuntoYComa).toBeGreaterThan(0);
    }, 300000);

    it('el duplicado se guarda como ELIMINADO (no se pierde) y el visitador que se fue queda inactivo', async () => {
        const viejo = (await db.query(`select eliminado_en, notas from public.evaluaciones where firebase_id = 'DUPLICADO_VIEJO'`)).rows[0];
        expect(viejo.eliminado_en).not.toBeNull();
        expect(viejo.notas).toBe('versión vieja');
        const ex = (await db.query(`select activo from public.visitadores where nombre_sector = 'EX VISITADOR'`)).rows[0];
        expect(ex.activo).toBe(false);
    });

    it('repetir la importación no duplica nada', async () => {
        const antes = await n('select count(*) as n from public.evaluaciones');
        const r = await importar({ db, raiz: RAIZ, exportacion, log: silencio });
        expect(r.fichero.nueva).toBe(false);
        expect(r.recetas.nueva).toBe(false);
        expect(r.evaluaciones.nuevas).toBe(0);
        expect(await n('select count(*) as n from public.evaluaciones')).toBe(antes);
        expect(await n('select count(*) as n from public.recetas')).toBe(231729);
    }, 300000);
});

describe('Paso 4 · Validación', () => {
    let resultado;
    it('todo coincide con Firebase y con los archivos originales', async () => {
        resultado = await validar({ db, raiz: RAIZ, exportacion });
        const malos = resultado.chequeos.filter(c => !c.ok);
        expect(malos).toEqual([]);
        expect(resultado.muestra).toHaveLength(20);
        const md = informeMarkdown(resultado, { destino: 'pruebas', proyecto: 'test', exportacion });
        expect(md).toContain('✅ TODO COINCIDE');
        expect(md).toContain('DUPLICADO_VIEJO');
    }, 300000);

    it('detecta si algo cambia (una evaluación o una receta)', async () => {
        const id = resultado.muestra[0].firebase_id;
        await db.query(`update public.evaluaciones set notas = notas || ' (alterada)' where firebase_id = $1`, [id]);
        await db.query(`update public.recetas set rx = rx + 1 where fila = 1`);
        const r2 = await validar({ db, raiz: RAIZ, exportacion });
        const fallidos = r2.chequeos.filter(c => !c.ok).map(c => c.nombre);
        expect(fallidos).toContain('Muestra aleatoria de 20, campo por campo');
        expect(fallidos).toContain('Total de recetas (suma de Rx)');
        expect(fallidos).toContain('Reconstrucción fila por fila, idéntica al archivo');
        expect(r2.todoOk).toBe(false);
        // Dejar todo como estaba
        await db.query(`update public.evaluaciones set notas = replace(notas, ' (alterada)', '') where firebase_id = $1`, [id]);
        await db.query(`update public.recetas set rx = rx - 1 where fila = 1`);
    }, 300000);
});

describe('Paso 3 · Usuarios', () => {
    const authFalso = {
        async buscarPorCorreo(email) {
            return (await db.query('select id from auth.users where email = $1', [email])).rows[0]?.id || null;
        },
        async crear({ email, password, app_metadata }) {
            const id = crypto.randomUUID();
            await db.query('insert into auth.users (id, email, raw_app_meta_data) values ($1, $2, $3)', [id, email, app_metadata]);
            authFalso.claves[email] = password;
            return id;
        },
        async actualizar(id, { app_metadata }) {
            await db.query('update auth.users set raw_app_meta_data = $2 where id = $1', [id, app_metadata]);
        },
        claves: {}
    };

    it('la plantilla trae los 51 visitadores, los 7 distritos y las filas de admin y Gte. Nacional', async () => {
        const { texto: csv } = await plantillaCsv(db);
        const lineas = csv.trim().split('\n');
        expect(lineas[0]).toBe('correo,nombre,rol,visitador,distritos');
        expect(lineas.filter(l => l.includes(',vm,'))).toHaveLength(51);
        expect(lineas.filter(l => l.includes(',gd,'))).toHaveLength(7);
    });

    it('la plantilla trae los correos que ya existían en Firebase Auth', async () => {
        const exp = leerExportacion({ documentos: {}, usuarios_con_correo: [
            { correo: 'Jefe@LaSante.com', claims: { role: 'admin' } },
            { correo: 'vm0@lasante.com', claims: { role: 'visitador', visitadorName: visitadores[0] } },
            { correo: 'baja@lasante.com', desactivado: true, claims: { role: 'visitador', visitadorName: visitadores[1] } }
        ] });
        const { texto, llenos } = await plantillaCsv(db, exp);
        expect(llenos).toBe(2);
        expect(texto).toContain('jefe@lasante.com,ADMINISTRADOR,admin,,');
        expect(texto).toContain(`vm0@lasante.com,${visitadores[0]},vm,${visitadores[0]},`);
        expect(texto).toContain(`\n,${visitadores[1]},vm,${visitadores[1]},`);
    });

    it('el CSV se valida antes de crear nada', () => {
        const { errores } = leerCsvUsuarios('correo,nombre,rol,visitador,distritos\nmalo,X,vm,,\na@x.com,A,gd,,100001\nb@x.com,B,gd,,100001\n');
        expect(errores.join(' | ')).toContain('correo inválido');
        expect(errores.join(' | ')).toContain('falta "visitador"');
        expect(errores.join(' | ')).toContain('Distrito 100001 asignado a dos GD');
        expect(errores.join(' | ')).toContain('al menos un usuario con rol admin');
    });

    it('crea admin, Gte. Nacional, un GD y dos VM con su clave actual (o recuperación si es corta)', async () => {
        const csv = ['correo,nombre,rol,visitador,distritos',
            'Admin@LaSante.com,ADMIN,admin,,',
            'gte@lasante.com,GERENTE NACIONAL,gte_nacional,,',
            'gd@lasante.com,GD UNO,gd,,100007',
            `vm0@lasante.com,VM CERO,vm,${visitadores[0]},`,
            `vm1@lasante.com,VM UNO,vm,${visitadores[1]},`,
            ',SIN CORREO,vm,OTRO,'].join('\n');
        const { filas, errores } = leerCsvUsuarios(csv);
        expect(errores).toEqual([]);
        expect(filas).toHaveLength(5);
        const r = await aplicarUsuarios({ db, authAdmin: authFalso, filas, claves: exportacion.claves, claveAdmin: exportacion.claveAdmin, log: silencio });
        expect(r.errores).toEqual([]);
        expect(r.creados).toBe(5);
        expect(r.conRecuperacion).toEqual(['gte@lasante.com', 'gd@lasante.com', 'vm1@lasante.com']);
        expect(authFalso.claves['vm0@lasante.com']).toBe('clave-0-segura');
        expect(authFalso.claves['admin@lasante.com']).toBe('clave-admin-larga');
        // Repetir no crea usuarios nuevos
        const r2 = await aplicarUsuarios({ db, authAdmin: authFalso, filas, claves: exportacion.claves, claveAdmin: exportacion.claveAdmin, log: silencio });
        expect(r2.creados).toBe(0);
        expect(r2.actualizados).toBe(5);
    });

    it('después de migrar, cada rol ve lo que le toca', async () => {
        const id = async (email) => (await db.query('select id from auth.users where email = $1', [email])).rows[0].id;
        const vm0 = await id('vm0@lasante.com'), gd = await id('gd@lasante.com'), gte = await id('gte@lasante.com'), admin = await id('admin@lasante.com');
        const total = await n('select count(*) as n from public.evaluaciones where eliminado_en is null');
        // VM: solo las suyas
        const propias = (await como(db, vm0, `select distinct v.nombre_sector from public.evaluaciones e join public.visitadores v on v.id = e.visitador_id`)).rows;
        expect(propias).toEqual([{ nombre_sector: visitadores[0] }]);
        expect((await como(db, vm0, 'select count(*)::int as n from public.fichero')).rows[0].n).toBeGreaterThan(0);
        // GD del distrito 100007: solo VM de ese distrito
        const deGd = (await como(db, gd, `select distinct d.codigo from public.visitadores v join public.distritos d on d.id = v.distrito_id`)).rows;
        expect(deGd).toEqual([{ codigo: '100007' }]);
        // Gte. Nacional y admin: todas
        expect((await como(db, gte, 'select count(*)::int as n from public.evaluaciones where eliminado_en is null')).rows[0].n).toBe(total);
        expect((await como(db, admin, 'select count(*)::int as n from public.evaluaciones where eliminado_en is null')).rows[0].n).toBe(total);
        // VM: sus recetas son solo de médicos de su fichero
        const rx = (await como(db, vm0, 'select count(distinct matricula_norm)::int as n from public.v_recetas')).rows[0].n;
        const suyos = (await como(db, vm0, 'select count(distinct matricula_norm)::int as n from public.fichero')).rows[0].n;
        expect(rx).toBeGreaterThan(0);
        expect(rx).toBeLessThanOrEqual(suyos);
    }, 120000);
});

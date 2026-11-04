// @vitest-environment node
/* Fase 10 · Paso 0: crear las tablas en una base NUEVA (producción) */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { spawnSync } from 'node:child_process';
import { BASE_SUPABASE, crearBase } from './supabase-simulado.js';
import { aplicarMigraciones, listarMigraciones } from '../../scripts/migracion/migraciones.mjs';

const CARPETA = path.resolve('supabase/migrations');
const nueva = async () => { const db = new PGlite(); await db.exec(BASE_SUPABASE); return db; };
const silencio = () => {};

describe('Crear la base de producción', () => {
    it('simulacro: muestra las 12 y no crea nada', async () => {
        const db = await nueva();
        const r = await aplicarMigraciones({ db, carpeta: CARPETA, simulacro: true, log: silencio });
        expect(r.pendientes).toEqual(listarMigraciones(CARPETA));
        expect(r.pendientes.length).toBeGreaterThanOrEqual(12);
        expect((await db.query(`select to_regclass('public.perfiles') as t`)).rows[0].t).toBeNull();
    });

    it('aplica todas en orden, deja el registro y repetir no hace nada', async () => {
        const db = await nueva();
        const r = await aplicarMigraciones({ db, carpeta: CARPETA, log: silencio });
        expect(r.aplicadas).toEqual(listarMigraciones(CARPETA));
        const funciones = (await db.query(`select proname from pg_proc where proname in ('datos_equipo','historial_medico','evolucion_mercados','avance_distrito','bitacora_reciente')`)).rows.map(x => x.proname).sort();
        expect(funciones).toEqual(['avance_distrito', 'bitacora_reciente', 'datos_equipo', 'evolucion_mercados', 'historial_medico']);
        expect((await db.query(`select to_regclass('public.avisos_vistos') is not null as hay`)).rows[0].hay).toBe(true);
        const otra = await aplicarMigraciones({ db, carpeta: CARPETA, log: silencio });
        expect(otra.pendientes).toEqual([]);
        // Las personas de la app no ven el registro
        await db.exec('set role authenticated');
        const visto = await db.query('select * from public.migraciones_aplicadas').then(r => r.rows.length, () => 0);
        expect(visto).toBe(0);
        await db.exec('reset role');
    });

    it('si un archivo falla, ese no queda a medias y los siguientes no se aplican', async () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mig-'));
        fs.writeFileSync(path.join(dir, '1_bien.sql'), 'create table public.perfiles (id int);');
        fs.writeFileSync(path.join(dir, '2_mal.sql'), 'create table public.a_medias (id int); select esto_no_existe();');
        fs.writeFileSync(path.join(dir, '3_despues.sql'), 'create table public.despues (id int);');
        const db = await nueva();
        await expect(aplicarMigraciones({ db, carpeta: dir, log: silencio })).rejects.toThrow(/Falló 2_mal\.sql/);
        expect((await db.query('select archivo from public.migraciones_aplicadas')).rows.map(x => x.archivo)).toEqual(['1_bien.sql']);
        expect((await db.query(`select to_regclass('public.a_medias') as t, to_regclass('public.despues') as d`)).rows[0]).toEqual({ t: null, d: null });
    });

    it('en una base con las tablas aplicadas a mano (como PRUEBAS) se detiene sin tocar nada', async () => {
        const db = await crearBase();
        await expect(aplicarMigraciones({ db, carpeta: CARPETA, log: silencio })).rejects.toThrow(/aplicadas a mano/);
        expect((await db.query(`select to_regclass('public.migraciones_aplicadas') as t`)).rows[0].t).toBeNull();
    });
});

describe('Preparar las versiones importadas (paso 6)', () => {
    it('calcula el orden de cada mercado de las versiones sin preparar; repetir no cambia nada', async () => {
        const { prepararVersiones } = await import('../../scripts/migracion/orden.mjs');
        const db = await nueva();
        await aplicarMigraciones({ db, carpeta: CARPETA, log: silencio });
        // Datos importados DESPUÉS de crear la base (como en producción)
        const snap = (await db.query(`insert into public.data_snapshots (nombre, tipo, fecha, estado, es_vigente)
            values ('Datos enero', 'recetas', '2026-01-31', 'publicado', true) returning id`)).rows[0].id;
        await db.exec(`insert into public.cat_medicos (matricula, nombre) values ('100', 'DR UNO'), ('200', 'DR DOS');
            insert into public.cat_mercados (nombre) values ('M1'), ('M2'); insert into public.cat_productos (producto) values ('P');`);
        await db.query(`insert into public.recetas (snapshot_id, fila, medico_id, mercado_id, producto_id, rx)
            select $1, n, m, mk, 1, rx from (values (1, 1, 1, 5), (2, 2, 1, 3), (3, 1, 2, 4)) v(n, m, mk, rx)`, [snap]);
        expect((await db.query('select orden_listo from public.data_snapshots where id = $1', [snap])).rows[0].orden_listo).toBe(false);
        const simulado = await prepararVersiones({ db, simulacro: true, log: silencio });
        expect(simulado).toEqual([]);
        expect(await prepararVersiones({ db, log: silencio })).toEqual(['Datos enero']);
        expect((await db.query('select orden_listo from public.data_snapshots where id = $1', [snap])).rows[0].orden_listo).toBe(true);
        expect((await db.query('select count(*)::int as n from public.recetas_orden_mercado')).rows[0].n).toBe(3);
        expect(await prepararVersiones({ db, log: silencio })).toEqual([]);
        expect((await db.query('select count(*)::int as n from public.recetas_orden_mercado')).rows[0].n).toBe(3);
    });
});

describe('Revisión final de seguridad', () => {
    it('todas las tablas tienen reglas de seguridad por fila (RLS) y nadie anónimo puede leerlas', async () => {
        const db = await nueva();
        await aplicarMigraciones({ db, carpeta: CARPETA, log: silencio });
        const sinRls = (await db.query(`select tablename from pg_tables where schemaname = 'public' and not rowsecurity order by 1`)).rows.map(r => r.tablename);
        expect(sinRls).toEqual([]);
        const tablas = (await db.query(`select tablename from pg_tables where schemaname = 'public' order by 1`)).rows.map(r => r.tablename);
        await db.exec('set role anon');
        for (const t of tablas) {
            const filas = await db.query(`select * from public.${t} limit 1`).then(r => r.rows.length, () => 0);
            expect(filas, `anónimo lee ${t}`).toBe(0);
        }
        await db.exec('reset role');
    });
});

describe('Fase 12E: aplicar en producción desde GitHub (sin nadie que escriba)', () => {
    const correr = (extra) => spawnSync(process.execPath, ['--input-type=module', '-e',
        `import { destinoSeguro } from './scripts/migracion/comun.mjs'; const r = await destinoSeguro(); console.log('OK', r.ref);`],
        { env: { PATH: process.env.PATH, DESTINO: 'produccion', SUPABASE_URL: 'https://abcd.supabase.co',
            SUPABASE_DB_URL: 'postgresql://postgres.abcd:x@aws-0.pooler.supabase.com:5432/postgres', ...extra }, encoding: 'utf8', input: '' });
    it('con CONFIRMACION=MIGRAR PRODUCCION sigue sin preguntar', () => {
        const r = correr({ CONFIRMACION: 'MIGRAR PRODUCCION' });
        expect(r.status).toBe(0);
        expect(r.stdout).toContain('confirmado por el trabajo automático');
        expect(r.stdout).toContain('OK abcd');
    });
    it('con otra palabra se detiene sin cambiar nada', () => {
        const r = correr({ CONFIRMACION: 'si' });
        expect(r.status).toBe(1);
        expect(r.stderr).toContain('No se hizo ningún cambio');
    });
    it('sin CONFIRMACION pregunta como siempre (y sin respuesta, cancela)', () => {
        const r = correr({});
        expect(r.status).not.toBe(0);
        expect(r.stdout).not.toContain('OK abcd');
        expect(r.stdout).toContain('Para continuar escribe exactamente');
    });
});

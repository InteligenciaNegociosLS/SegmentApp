// @vitest-environment node
/* ============================================================
   Migración 8: al aplicarla sobre una base que YA tiene versiones
   (como el Supabase de pruebas), las deja preparadas sola.
============================================================ */
import { it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { BASE_SUPABASE } from './supabase-simulado.js';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const MIG = path.join(RAIZ, 'supabase', 'migrations');

it('aplicar la migración 8 sobre datos existentes calcula el orden de cada mercado', async () => {
    const db = new PGlite();
    await db.exec(BASE_SUPABASE);
    const archivos = fs.readdirSync(MIG).filter(f => f.endsWith('.sql')).sort();
    const ocho = archivos.findIndex(f => f.startsWith('20261030130000'));
    for (const f of archivos.slice(0, ocho)) await db.exec(fs.readFileSync(path.join(MIG, f), 'utf8'));

    // Una versión publicada con dos mercados, cargada ANTES de la migración 8
    const snap = (await db.query(`insert into public.data_snapshots (nombre, tipo, fecha, estado, es_vigente)
        values ('Datos enero', 'recetas', '2026-01-31', 'publicado', true) returning id`)).rows[0].id;
    await db.exec(`
        insert into public.cat_medicos (matricula, nombre) values ('0100', 'DR UNO'), ('200', 'DR DOS'), ('100', 'DR UNO BIS');
        insert into public.cat_mercados (nombre) values ('M1'), ('M2');
        insert into public.cat_productos (producto) values ('P');`);
    await db.query(`insert into public.recetas (snapshot_id, fila, medico_id, mercado_id, producto_id, rx)
        select $1, n, m, mk, 1, rx from (values (1, 1, 1, 5), (2, 2, 1, 5), (3, 3, 1, 9), (4, 1, 2, 4)) v(n, m, mk, rx)`, [snap]);

    await db.exec(fs.readFileSync(path.join(MIG, archivos[ocho]), 'utf8'));

    expect((await db.query(`select orden_listo from public.data_snapshots where id = $1`, [snap])).rows[0].orden_listo).toBe(true);
    const filas = (await db.query(`select mk.nombre, o.matricula, o.total::int, o.acumulado::int, o.total_mercado::int, o.es_primero
        from public.recetas_orden_mercado o join public.cat_mercados mk on mk.id = o.mercado_id
        order by mk.nombre, o.acumulado`)).rows;
    // M1: empate 5 y 5 → la matrícula numérica "limpia" (200) va antes que "0100"; "100" (9) primero
    expect(filas).toEqual([
        { nombre: 'M1', matricula: '100', total: 9, acumulado: 9, total_mercado: 19, es_primero: true },
        { nombre: 'M1', matricula: '200', total: 5, acumulado: 14, total_mercado: 19, es_primero: true },
        { nombre: 'M1', matricula: '0100', total: 5, acumulado: 19, total_mercado: 19, es_primero: false },
        { nombre: 'M2', matricula: '0100', total: 4, acumulado: 4, total_mercado: 4, es_primero: true }
    ]);
});

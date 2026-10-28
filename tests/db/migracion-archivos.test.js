// @vitest-environment node
/* Paso 5 de la migración: subir los .gz de "Datos enero" al almacén privado */
import { describe, it, expect, beforeAll } from 'vitest';
import { crearBase } from './supabase-simulado.js';
import { subirArchivosVersion } from '../../scripts/migracion/archivos.mjs';
import { RAIZ } from '../../scripts/migracion/comun.mjs';

let db;
beforeAll(async () => {
    db = await crearBase();
    await db.query(`insert into public.data_snapshots (nombre, tipo, fecha, estado, es_vigente) values
        ('Datos enero','recetas','2026-01-31','publicado',true), ('Datos enero','fichero','2026-01-31','publicado',true)`);
});

describe('Subir archivos de la versión', () => {
    it('simulacro: no sube ni cambia nada', async () => {
        const subidos = [];
        await subirArchivosVersion({ db, storage: { subir: async (r) => subidos.push(r) }, raiz: RAIZ, simulacro: true, log: () => {} });
        expect(subidos).toEqual([]);
        expect((await db.query('select count(*)::int as n from public.data_snapshots where archivo is not null')).rows[0].n).toBe(0);
    });
    it('sube los dos archivos y los asocia; repetirlo no duplica', async () => {
        const subidos = new Map();
        const storage = { subir: async (r, b) => subidos.set(r, b.length) };
        await subirArchivosVersion({ db, storage, raiz: RAIZ, log: () => {} });
        await subirArchivosVersion({ db, storage, raiz: RAIZ, log: () => {} });
        const filas = (await db.query('select tipo, id, archivo, archivo_bytes from public.data_snapshots order by tipo')).rows;
        expect(filas).toHaveLength(2);
        filas.forEach(f => {
            expect(f.archivo).toBe(`snapshots/${f.id}/datos.csv.gz`);
            expect(Number(f.archivo_bytes)).toBe(subidos.get(f.archivo));
        });
        expect(subidos.size).toBe(2);
    });
});

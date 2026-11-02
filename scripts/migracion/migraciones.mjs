/* ============================================================
   SegmentApp · Migración · Crear las tablas en una base NUEVA
   Aplica, en orden, los archivos de supabase/migrations/ que falten
   y anota cada uno en public.migraciones_aplicadas. Pensado para el
   Supabase de PRODUCCIÓN (vacío): evita pegar 12 archivos a mano.
   - Cada archivo se aplica completo o nada (si uno falla, ese no
     queda a medias y los siguientes no se tocan).
   - Se puede repetir: solo aplica lo que falte.
   - Si la base ya tiene las tablas de SegmentApp pero sin registro
     (como PRUEBAS, donde se aplicaron a mano), se detiene sin tocar nada.
============================================================ */
import fs from 'node:fs';
import path from 'node:path';

export function listarMigraciones(carpeta) {
    return fs.readdirSync(carpeta).filter(f => f.endsWith('.sql')).sort();
}

// pg (Cloud Shell) ejecuta varios comandos con query(); PGlite (pruebas) con exec()
const ejecutar = (db, sql) => (typeof db.exec === 'function' ? db.exec(sql) : db.query(sql));

export async function aplicarMigraciones({ db, carpeta, simulacro = false, log = console.log }) {
    const archivos = listarMigraciones(carpeta);
    const registro = (await db.query(`select to_regclass('public.migraciones_aplicadas') is not null as hay`)).rows[0].hay;
    let aplicadas = new Set();
    if (registro) {
        aplicadas = new Set((await db.query('select archivo from public.migraciones_aplicadas')).rows.map(r => r.archivo));
    } else if ((await db.query(`select to_regclass('public.perfiles') is not null as hay`)).rows[0].hay) {
        throw new Error('Esta base ya tiene las tablas de SegmentApp, aplicadas a mano (sin registro). '
            + 'Este paso es solo para una base NUEVA (producción). No se cambió nada.');
    }
    const pendientes = archivos.filter(a => !aplicadas.has(a));
    log(`Migraciones: ${archivos.length} en total · ${aplicadas.size} ya aplicadas · ${pendientes.length} por aplicar`);
    pendientes.forEach(a => log(`   • ${a}`));
    if (simulacro || !pendientes.length) return { pendientes, aplicadas: [] };

    if (!registro) {
        await ejecutar(db, `
            create table public.migraciones_aplicadas (
                archivo     text primary key,
                aplicada_en timestamptz not null default now()
            );
            alter table public.migraciones_aplicadas enable row level security;
            revoke all on public.migraciones_aplicadas from public;`);
        // Las personas de la app no lo necesitan ver (sin reglas = nadie lo lee desde la app)
        await ejecutar(db, `do $$ begin
            if exists (select 1 from pg_roles where rolname = 'anon') then revoke all on public.migraciones_aplicadas from anon; end if;
            if exists (select 1 from pg_roles where rolname = 'authenticated') then revoke all on public.migraciones_aplicadas from authenticated; end if;
        end $$;`);
    }
    const hechas = [];
    for (const archivo of pendientes) {
        const sql = fs.readFileSync(path.join(carpeta, archivo), 'utf8');
        await ejecutar(db, 'begin');
        try {
            await ejecutar(db, sql);
            await db.query('insert into public.migraciones_aplicadas (archivo) values ($1)', [archivo]);
            await ejecutar(db, 'commit');
            hechas.push(archivo);
            log(`   ✅ ${archivo}`);
        } catch (e) {
            await ejecutar(db, 'rollback');
            throw new Error(`Falló ${archivo}: ${e.message}\n   Ese archivo no quedó a medias y los siguientes no se aplicaron. Cópiame este mensaje.`);
        }
    }
    return { pendientes, aplicadas: hechas };
}

/* ============================================================
   Supabase simulado para pruebas: Postgres 16 real (PGlite) con
   lo mínimo de Supabase (roles anon/authenticated, auth.users y
   auth.uid()), y las migraciones de supabase/migrations aplicadas.
============================================================ */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const MIGRACIONES = path.join(RAIZ, 'supabase', 'migrations');

const BASE_SUPABASE = `
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
    create schema auth;
    create table auth.users (
        id uuid primary key,
        email text,
        raw_app_meta_data jsonb not null default '{}'
    );
    create function auth.uid() returns uuid language sql stable as
        $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema public, auth to anon, authenticated;
    grant execute on function auth.uid() to public;
`;

export async function crearBase() {
    const db = new PGlite();
    await db.exec(BASE_SUPABASE);
    for (const archivo of fs.readdirSync(MIGRACIONES).filter(f => f.endsWith('.sql')).sort()) {
        await db.exec(fs.readFileSync(path.join(MIGRACIONES, archivo), 'utf8'));
    }
    return db;
}

// Ejecuta una consulta como un usuario (uid) con sesión, o como anónimo (uid = null)
export async function como(db, uid, sql, params = []) {
    await db.exec(`set role ${uid ? 'authenticated' : 'anon'}`);
    await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [uid || '']);
    try {
        return await db.query(sql, params);
    } finally {
        await db.exec('reset role');
        await db.query(`select set_config('request.jwt.claim.sub', '', false)`);
    }
}

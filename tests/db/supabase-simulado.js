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

export const BASE_SUPABASE = `
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
    create schema auth;
    create table auth.users (
        id uuid primary key,
        email text,
        raw_app_meta_data jsonb not null default '{}',
        raw_user_meta_data jsonb not null default '{}',
        encrypted_password text,
        last_sign_in_at timestamptz,
        updated_at timestamptz,
        -- Columnas que llena Supabase al crear un usuario (para admin_crear_usuario, migración 18)
        instance_id uuid, aud text, role text, email_confirmed_at timestamptz, created_at timestamptz,
        confirmation_token text, recovery_token text, email_change_token_new text, email_change text
    );
    create table auth.identities (
        id uuid primary key default gen_random_uuid(),
        user_id uuid not null references auth.users (id) on delete cascade,
        provider text not null default 'email',
        provider_id text,
        identity_data jsonb not null default '{}',
        last_sign_in_at timestamptz,
        created_at timestamptz,
        updated_at timestamptz
    );
    -- pgcrypto no existe en PGlite: imitación mínima con la misma firma que en Supabase
    create schema extensions;
    create function extensions.gen_salt(text) returns text language sql as $$ select '$2a$06$sal' $$;
    create function extensions.crypt(clave text, sal text) returns text language sql as $$ select sal || md5(clave) $$;
    create function auth.uid() returns uuid language sql stable as
        $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema public, auth to anon, authenticated;
    grant execute on function auth.uid() to public;

    -- Almacenamiento de archivos (versión mínima de Supabase Storage)
    create schema storage;
    create table storage.buckets (id text primary key, name text not null, public boolean default false);
    create table storage.objects (
        id uuid primary key default gen_random_uuid(),
        bucket_id text references storage.buckets (id),
        name text not null,
        owner uuid default auth.uid(),
        metadata jsonb,
        unique (bucket_id, name)
    );
    alter table storage.objects enable row level security;
    grant usage on schema storage to anon, authenticated;
    grant select, insert, update on storage.objects to authenticated;
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

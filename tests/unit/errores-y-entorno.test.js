/* Pruebas del registro de fallas, del entorno y de la construcción */
import { describe, it, expect, beforeEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { cargarApp, RAIZ } from './cargar-app.js';

let App;
beforeEach(() => { localStorage.clear(); App = cargarApp(); });

describe('Registro de fallas', () => {
    it('guarda la falla con fecha, tipo y usuario', () => {
        App.state.currentUserRole = 'visitador';
        App.state.currentVisitadorName = 'ANA';
        App.errores.registrar('error', 'Algo falló', new Error('detalle'));
        const [f] = App.errores.lista();
        expect(f).toMatchObject({ tipo: 'error', mensaje: 'Algo falló', usuario: 'visitador:ANA' });
        expect(f.detalle).toContain('detalle');
        expect(new Date(f.fecha).toString()).not.toBe('Invalid Date');
    });
    it('también registra los console.error de la app', () => {
        console.error('Error cargando visitadores', new Error('red caída'));
        expect(App.errores.lista().some(f => f.tipo === 'consola' && f.mensaje.includes('Error cargando'))).toBe(true);
    });
    it('guarda como máximo las últimas 100 fallas', () => {
        for (let i = 0; i < 130; i++) App.errores.registrar('error', 'f' + i);
        const lista = App.errores.lista();
        expect(lista).toHaveLength(100);
        expect(lista[99].mensaje).toBe('f129');
    });
});

describe('Errores externos', () => {
    it('un error de una extensión o librería externa se registra pero NO avisa al usuario', () => {
        document.getElementById('toast').innerText = '';
        window.dispatchEvent(new ErrorEvent('error', { message: 'Script error.', filename: '' }));
        expect(App.errores.lista().at(-1).tipo).toBe('externo');
        expect(document.getElementById('toast').innerText).toBe('');
    });
    it('un error de la app sí avisa al usuario', () => {
        window.dispatchEvent(new ErrorEvent('error', { message: 'falla real', filename: location.origin + '/js/matrix.js', error: new Error('falla real') }));
        expect(App.errores.lista().at(-1).tipo).toBe('error');
        expect(document.getElementById('toast').innerText).toContain('Algo no funcionó');
    });
});

describe('Entorno', () => {
    it('sin configuración se considera entorno local, sin Supabase', () => {
        expect(App.env.APP_ENV).toBe('development');
        expect(App.supabase.configurado()).toBe(false);
    });
});

describe('Construcción para Vercel (scripts/build.mjs)', () => {
    const construir = (env) => spawnSync(process.execPath, ['scripts/build.mjs'], {
        cwd: RAIZ, encoding: 'utf8', env: { PATH: process.env.PATH, ...env }
    });
    it('en Preview genera env.js con la configuración pública', () => {
        const r = construir({ VERCEL_ENV: 'preview', SUPABASE_URL: 'https://abcd.supabase.co/', SUPABASE_ANON_KEY: 'sb_publishable_123' });
        expect(r.status).toBe(0);
        const envJs = fs.readFileSync(path.join(RAIZ, 'dist', 'js', 'env.js'), 'utf8');
        expect(envJs).toContain('"APP_ENV": "preview"');
        expect(envJs).toContain('"SUPABASE_URL": "https://abcd.supabase.co"');
        expect(fs.existsSync(path.join(RAIZ, 'dist', 'docs'))).toBe(false);
        expect(fs.existsSync(path.join(RAIZ, 'dist', 'datacloseup.xlsx'))).toBe(false);
    });
    it('corrige la URL de Supabase si trae algo de más, y avisa si no es de Supabase', () => {
        construir({ VERCEL_ENV: 'preview', SUPABASE_URL: 'https://abcd.supabase.co/rest/v1/', SUPABASE_ANON_KEY: 'sb_publishable_1' });
        let envJs = fs.readFileSync(path.join(RAIZ, 'dist', 'js', 'env.js'), 'utf8');
        expect(envJs).toContain('"SUPABASE_URL": "https://abcd.supabase.co"');
        construir({ VERCEL_ENV: 'preview', SUPABASE_URL: 'https://supabase.com/dashboard/project/abcd', SUPABASE_ANON_KEY: 'sb_publishable_1' });
        envJs = fs.readFileSync(path.join(RAIZ, 'dist', 'js', 'env.js'), 'utf8');
        expect(envJs).toContain('"SUPABASE_URL": ""');
        expect(envJs).toContain('no es de un proyecto Supabase');
    });
    it('se niega a publicar una clave secreta de Supabase', () => {
        const r1 = construir({ SUPABASE_ANON_KEY: 'sb_secret_abc' });
        expect(r1.status).toBe(1);
        const payload = Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url');
        const r2 = construir({ SUPABASE_ANON_KEY: `x.${payload}.y` });
        expect(r2.status).toBe(1);
    });
});

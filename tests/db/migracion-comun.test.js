// @vitest-environment node
/* La URL de Supabase se acepta aunque venga con una ruta de más */
import { describe, it, expect } from 'vitest';
import { normalizarUrlSupabase } from '../../scripts/migracion/comun.mjs';

it('deja solo https://xxxx.supabase.co', () => {
    expect(normalizarUrlSupabase('https://abcd.supabase.co/rest/v1/')).toBe('https://abcd.supabase.co');
    expect(normalizarUrlSupabase(' https://abcd.supabase.co ')).toBe('https://abcd.supabase.co');
    expect(normalizarUrlSupabase('')).toBe('');
});

describe('Claves temporales (sin correo automático)', async () => {
    const { generarClaveTemporal, mensajeAcceso } = await import('../../scripts/migracion/usuarios.mjs');
    it('son fáciles de escribir y distintas cada vez', () => {
        const claves = new Set(Array.from({ length: 50 }, () => generarClaveTemporal()));
        expect(claves.size).toBe(50);
        [...claves].forEach(c => expect(c).toMatch(/^[a-z]{4}-[a-z]{4}-\d{4}$/));
    });
    it('el mensaje dice qué hacer en cada caso', () => {
        expect(mensajeAcceso({ nombre: 'ANA', correo: 'a@x.com', clave: 'maro-kebi-4821', tipo: 'temporal' }, 'https://app.x'))
            .toMatch(/https:\/\/app\.x.*a@x\.com.*maro-kebi-4821.*crear tu propia clave/);
        expect(mensajeAcceso({ nombre: 'LUIS', correo: 'l@x.com', tipo: 'actual' })).toMatch(/misma clave de siempre/);
    });
});

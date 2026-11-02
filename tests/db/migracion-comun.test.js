// @vitest-environment node
/* La URL de Supabase se acepta aunque venga con una ruta de más */
import { describe, it, expect } from 'vitest';
import { normalizarUrlSupabase } from '../../scripts/migracion/comun.mjs';

it('deja solo https://xxxx.supabase.co', () => {
    expect(normalizarUrlSupabase('https://abcd.supabase.co/rest/v1/')).toBe('https://abcd.supabase.co');
    expect(normalizarUrlSupabase(' https://abcd.supabase.co ')).toBe('https://abcd.supabase.co');
    expect(normalizarUrlSupabase('')).toBe('');
});

describe('Correos de bienvenida "Crea tu clave" (Fase 10)', async () => {
    const { quienesNecesitanEnlace, enviarEnlaces } = await import('../../scripts/migracion/usuarios.mjs');
    const filas = [
        { correo: 'admin@x.com', nombre: 'ADMIN', rol: 'admin', visitador: '', distritos: [] },
        { correo: 'vm1@x.com', nombre: 'VM UNO', rol: 'vm', visitador: 'VM UNO', distritos: [] },
        { correo: 'vm2@x.com', nombre: 'VM DOS', rol: 'vm', visitador: 'VM DOS', distritos: [] },
        { correo: 'gd@x.com', nombre: 'GD', rol: 'gd', visitador: '', distritos: ['1'] }
    ];
    const claves = new Map([['VM UNO', 'clave-larga'], ['VM DOS', '123']]);
    it('solo a quien no conserva una clave (o a todos, o a una persona)', () => {
        expect(quienesNecesitanEnlace({ filas, claves, claveAdmin: 'adminadmin' }).map(f => f.correo)).toEqual(['vm2@x.com', 'gd@x.com']);
        expect(quienesNecesitanEnlace({ filas, claves, todos: true })).toHaveLength(4);
        expect(quienesNecesitanEnlace({ filas, claves, solo: 'VM1@x.com' }).map(f => f.correo)).toEqual(['vm1@x.com']);
    });
    it('envía uno por uno; si uno falla, sigue con los demás', async () => {
        const enviados = [];
        const authAdmin = { async enviarEnlace(correo, url) { if (correo === 'gd@x.com') throw new Error('límite'); enviados.push([correo, url]); } };
        const r = await enviarEnlaces({ authAdmin, destinatarios: filas, appUrl: 'https://app.x', esperaMs: 0, log: () => {} });
        expect(r.enviados).toEqual(['admin@x.com', 'vm1@x.com', 'vm2@x.com']);
        expect(r.fallidos).toEqual(['gd@x.com: límite']);
        expect(enviados[0][1]).toBe('https://app.x');
        const simulado = await enviarEnlaces({ authAdmin: null, destinatarios: filas, appUrl: 'https://app.x', simulacro: true, log: () => {} });
        expect(simulado.enviados).toEqual([]);
    });
});

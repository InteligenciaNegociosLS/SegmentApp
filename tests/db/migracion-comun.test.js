// @vitest-environment node
/* La URL de Supabase se acepta aunque venga con una ruta de más */
import { it, expect } from 'vitest';
import { normalizarUrlSupabase } from '../../scripts/migracion/comun.mjs';

it('deja solo https://xxxx.supabase.co', () => {
    expect(normalizarUrlSupabase('https://abcd.supabase.co/rest/v1/')).toBe('https://abcd.supabase.co');
    expect(normalizarUrlSupabase(' https://abcd.supabase.co ')).toBe('https://abcd.supabase.co');
    expect(normalizarUrlSupabase('')).toBe('');
});

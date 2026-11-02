/* Pruebas de los cálculos básicos (no necesitan los datos reales) */
import { describe, it, expect, beforeAll } from 'vitest';
import { cargarApp } from './cargar-app.js';

let App;
beforeAll(() => { App = cargarApp(); });

describe('Matrícula del médico (normalizeKey)', () => {
    it('quita ceros a la izquierda y el sufijo _NOMBRE', () => {
        expect(App.data.normalizeKey('00057378')).toBe('57378');
        expect(App.data.normalizeKey('57378_ABADHECTOR')).toBe('57378');
        expect(App.data.normalizeKey(' 123 ')).toBe('123');
        expect(App.data.normalizeKey(null)).toBe('');
    });
});

describe('Productos del laboratorio (isPhq)', () => {
    it('reconoce productos de la lista PHQ', () => {
        expect(App.data.isPhq('DESLER PHQ')).toBe(true);
        expect(App.data.isPhq('amlodipina lst lst')).toBe(true);
    });
    it('no marca productos de la competencia', () => {
        expect(App.data.isPhq('AMLODIPINA SAL SAL')).toBe(false);
        expect(App.data.isPhq('')).toBe(false);
    });
});

describe('Lectura de CSV (parseCSVFast)', () => {
    it('detecta punto y coma, respeta comillas y omite filas vacías', () => {
        const filas = App.data.parseCSVFast('Medico;Matricula;Nota\nPEREZ;001;"hola; mundo"\n\nGOMEZ;002;"dice ""sí"""\n');
        expect(filas).toEqual([
            { Medico: 'PEREZ', Matricula: '001', Nota: 'hola; mundo' },
            { Medico: 'GOMEZ', Matricula: '002', Nota: 'dice "sí"' }
        ]);
    });
});

describe('Recetas CloseUp (parseAuditData)', () => {
    it('toma las columnas por posición (la columna 5 se ignora)', () => {
        App.data.parseAuditData([{ a: 'DR X', b: '0123', c: 'MCDO', d: 'DESLER PHQ', e: '7', f: 'ignorar',
            g: 'CALLE 1', h: '1010', i: 'CARACAS', j: 'CAPITAL', k: 'CARDIO', l: 'MOL', m: 'CLASE', n: 'NO', o: 'LAB' }]);
        expect(App.state.RAW_DATA[0]).toMatchObject({ doc: 'DR X', license: '0123', market: 'MCDO', prod: 'DESLER PHQ',
            rx: 7, address: 'CALLE 1', region: 'CAPITAL', spec: 'CARDIO', lab: 'LAB' });
    });
});

describe('Encuesta: rangos y puntaje objetivo', () => {
    it('convierte los rangos de texto en números', () => {
        expect(App.matrix.parseSurveyRange('10 a 20')).toBe(15);
        expect(App.matrix.parseSurveyRange('Más de 40')).toBe(45);
        expect(App.matrix.parseSurveyRange('Menos de 10')).toBe(5);
        expect(App.matrix.parseSurveyRange('0')).toBe(0);
    });
    it('clasifica A/B/C con la ponderación por defecto', () => {
        // q1 41-50 (25) + q2 21-30 (30) + q5 $81-120 (10) = 65 → B (A ≥ 70, B ≥ 35)
        const r = App.matrix.calculateObjectiveScore({ q1: '41 a 50', q2: '21 a 30', q3: '16 a 20', q5: '$81 a $120' });
        expect(r.score).toBe(65);
        expect(r.pot).toBe('B');
        // Adopción: q3/q2 = 18/25.5 = 70,6 % ≥ 66 → A (+)
        expect(r.loy).toBe('A');
        expect(r.label).toBe('B+');
    });
    it('sin encuesta devuelve N/A', () => {
        expect(App.matrix.calculateObjectiveScore(null).label).toBe('N/A');
    });
});

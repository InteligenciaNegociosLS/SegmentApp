/* ============================================================
   "Foto" de los resultados actuales de la matriz con los DATOS REALES
   del repositorio. Si una mejora futura (velocidad, rediseño,
   Supabase) cambia alguno de estos números, esta prueba falla y
   avisa ANTES de que llegue al equipo.
   Valores tomados de la versión en producción el 28/10/2026.
   Si los datos se actualizan a propósito, se actualizan estos números.
============================================================ */
import { describe, it, expect, beforeAll } from 'vitest';
import { cargarApp, cargarDatosReales } from './cargar-app.js';

let App, st;
const cuadrantes = (docs) => {
    const c = {};
    docs.filter(d => !d.isZeroRx).forEach(d => { const k = d.catPotency + d.catLoyalty; c[k] = (c[k] || 0) + 1; });
    return c;
};
const suma = (docs, campo) => docs.reduce((s, d) => s + d[campo], 0);

beforeAll(() => {
    App = cargarApp();
    cargarDatosReales(App);
    st = App.state;
});

describe('Datos cargados', () => {
    it('lee todas las filas de recetas y del fichero', () => {
        expect(st.RAW_DATA.length).toBe(231729);
        expect(st.FICHERO_MAP.size).toBe(5645);
        expect(st.FILTER_OPTIONS.Market.length).toBe(32);
        expect(st.FILTER_OPTIONS.Rep.length).toBe(51);
        expect(new Set(Object.values(st.REP_MANAGER_MAP)).size).toBe(7);
    });
});

describe('Matriz general (todos los médicos, umbrales 33/66)', () => {
    beforeAll(() => {
        st.currentUserRole = 'admin';
        st._lastUniverseSignature = null;
        App.matrix.aggregateAndCalculate();
    });
    it('totales de médicos y recetas', () => {
        expect(st.PROCESSED_DATA.length).toBe(28712);
        expect(suma(st.PROCESSED_DATA, 'totalRx')).toBe(584795);
        expect(suma(st.PROCESSED_DATA, 'rxPhq')).toBe(24082);
        expect(suma(st.PROCESSED_DATA, 'gap')).toBe(184143);
    });
    it('médicos por cuadrante', () => {
        expect(cuadrantes(st.PROCESSED_DATA)).toEqual({ AC: 595, AB: 9, BC: 2930, BB: 35, CC: 24214, CB: 686, CA: 243 });
    });
    it('principal competidor y simulador de impacto', () => {
        expect(st.CURRENT_COMP_BREAKDOWN[0]).toEqual({ prod: 'DICLOFENAC SAL SAL', rx: 41203, type: 'Comp' });
        expect(document.getElementById('simImpactRx').innerText).toBe('+2.627 Rx');
    });
});

describe('Vista de un visitador (NEIVIS PARRA)', () => {
    beforeAll(() => {
        st.currentUserRole = 'visitador';
        st.currentVisitadorName = 'NEIVIS PARRA';
        st._lastUniverseSignature = null;
        App.matrix.aggregateAndCalculate();
    });
    it('solo ve los médicos de su fichero', () => {
        expect(st.PROCESSED_DATA.length).toBe(142);
        expect(st.PROCESSED_DATA.filter(d => d.isZeroRx).length).toBe(97);
        expect(document.getElementById('visTotalFichero').innerText).toBe('142');
        expect(document.getElementById('visTotalCruzados').innerText).toBe('45');
        expect(cuadrantes(st.PROCESSED_DATA)).toEqual({ AC: 1, BC: 4, CC: 37, CB: 2, CA: 1 });
    });
});

describe('Filtro por un mercado (DESLER MERCADO)', () => {
    beforeAll(() => {
        st.currentUserRole = 'admin';
        st._lastUniverseSignature = null;
        App.filters.fillGenericDropdown('Market', ['DESLER MERCADO']);
        App.matrix.aggregateAndCalculate();
    });
    it('recalcula médicos, recetas y cuadrantes del mercado', () => {
        expect(st.PROCESSED_DATA.length).toBe(7872);
        expect(suma(st.PROCESSED_DATA, 'totalRx')).toBe(51386);
        expect(suma(st.PROCESSED_DATA, 'rxPhq')).toBe(6288);
        expect(cuadrantes(st.PROCESSED_DATA)).toEqual({ AC: 155, AB: 17, BC: 819, BB: 113, BA: 55, CC: 5450, CB: 336, CA: 927 });
    });
    it('la clasificación por mercado coincide con la general del mercado', () => {
        const primero = st.PROCESSED_DATA[0];
        expect(primero.closeupLabel).toBe('A-');
        expect(App.matrix.getDoctorMarketClassification(primero.id, 'DESLER MERCADO')).toBe('A-');
    });
});

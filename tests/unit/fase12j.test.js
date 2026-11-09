/* Fase 12J: contador del VM, médico = matrícula, oportunidad por adopción, ficha (mercados y productos),
   lista de mercados al evaluar, tarjetas en el teléfono y menú "Más" */
import { describe, it, expect, beforeEach } from 'vitest';
import { cargarApp, baseSimulada } from './cargar-app.js';

let App;
const ingresar = async (correo, clave) => {
    document.getElementById('loginEmail').value = correo;
    document.getElementById('visitadorPwd').value = clave;
    await App.auth.attemptLogin();
};
beforeEach(() => { localStorage.clear(); sessionStorage.clear(); App = cargarApp(); });

describe('Fase 12J', () => {
    it('VM: no pasa del 100%; los evaluados que ya no están en su fichero se avisan aparte', async () => {
        await ingresar('vm@lasante.com', '123456');
        App.evaluation.armarMapaVisitador([
            { medico_id: '123', mercado: 'DESLER MERCADO', cuadrante: 'A' },
            { medico_id: '999', mercado: 'DESLER MERCADO', cuadrante: 'B' },
            { medico_id: '888', mercado: 'DESLER MERCADO', cuadrante: 'C' }]);
        App.evaluation.updateVisitadorDashboard(1, 1);
        expect(document.getElementById('visTotalEvaluados').innerText).toBe('1');
        expect(document.getElementById('visPctEvaluados').innerText).toBe('100%');
        expect(document.getElementById('visFueraFichero').textContent).toContain('Además, 2 médicos que evaluaste ya no están en tu fichero de hoy');
    });

    it('un médico = una matrícula, aunque CloseUp escriba su nombre distinto en dos mercados', async () => {
        await ingresar('admin@lasante.com', 'adminadmin');
        const filas = [
            { doc: 'SEIJAS G FRANCYS E', license: '0000107041', market: 'Mdo A', prod: 'X PHQ', rx: 5, region: 'R', spec: 'S', molecule: 'M', class: 'C', lab: 'L' },
            { doc: 'SEIJAS FRANCYS', license: '107041', market: 'Mdo B', prod: 'X PHQ', rx: 5, region: 'R', spec: 'S', molecule: 'M', class: 'C', lab: 'L' }];
        App.state.FILTER_STATE = { ...App.state.FILTER_STATE, Market: ['Mdo A', 'Mdo B'], Region: ['R'], Spec: ['S'], Molecule: ['M'], Class: ['C'], Lab: ['L'] };
        const r = App.matrix.calcularMedicos(filas, false);
        expect(r.doctors).toHaveLength(1);
        expect(r.doctors[0].name).toBe('SEIJAS G FRANCYS E');
        expect(r.doctors[0].totalRx).toBe(5);   // el mismo producto en dos mercados que se comparten cuenta una vez
    });

    it('la oportunidad sube la adopción, no el potencial: A- → "para pasar a A", A → "A+"', async () => {
        await ingresar('admin@lasante.com', 'adminadmin');
        const docs = App.state.PROCESSED_DATA.filter(d => !d.isZeroRx && d.gap > 0);
        expect(docs.length).toBeGreaterThan(0);
        docs.forEach(d => {
            expect(d.targetLabel).not.toMatch(/para ser/);
            expect(d.targetLabel).toBe(d.closeupLoyalty === 'C' ? `para pasar a ${d.closeupPotency} (33% La Santé)` : `para pasar a ${d.closeupPotency}+ (66% La Santé)`);
        });
    });

    it('ficha: el producto de dos mercados compartidos cuenta una vez; mercados con detalle; productos de 10 en 10', async () => {
        await ingresar('admin@lasante.com', 'adminadmin');
        const doc = App.state.PROCESSED_DATA.find(d => d.id.startsWith('123_'));
        doc.rows = doc.rows.concat(doc.rows.map(r => ({ ...r, market: 'Mdo Compartido' })),
            Array.from({ length: 12 }, (_, i) => ({ ...doc.rows[0], prod: `PRODUCTO ${i}`, rx: 1 })));
        App.ficha.abrir(doc.id);
        App.ficha.mostrar('productos');
        const t = document.getElementById('fichaContenido') ? document.getElementById('fichaContenido').textContent : document.body.textContent;
        expect(t).toMatch(/14 productos recetados/);
        expect(t).toContain('Página 1 de 2');
        App.ficha.mostrar('mercados');
        const html = document.body.innerHTML;
        expect(html).toContain('Mdo Compartido');
        expect(html).toMatch(/productos en este mercado/);
        expect(html).toMatch(/La Santé \d+ \(/);
    });

    it('evaluar: el mercado es una lista desplegable, con los del médico primero', async () => {
        await ingresar('vm@lasante.com', '123456');
        const doc = App.state.PROCESSED_DATA.find(d => !d.isZeroRx);
        window.openEvalModal(doc.id, doc.name);
        const sel = document.getElementById('evalMarketSelect');
        expect(sel.classList.contains('sr-only')).toBe(false);
        expect(sel.querySelector('optgroup').label).toBe('Donde receta este médico');
        expect(document.getElementById('evalMarketSelect_chips')).toBeNull();
    });

    it('menú "Más": tocarlo otra vez lo cierra y bloquea el desplazamiento de atrás mientras está abierto', async () => {
        await ingresar('vm@lasante.com', '123456');
        App.ux.abrirMas();
        expect(document.getElementById('menuMas').classList.contains('hidden')).toBe(false);
        expect(document.body.classList.contains('sin-desplazar')).toBe(true);
        App.ux.abrirMas();
        expect(document.getElementById('menuMas').classList.contains('hidden')).toBe(true);
        expect(document.body.classList.contains('sin-desplazar')).toBe(false);
    });
});

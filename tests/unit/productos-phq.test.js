/* Fase 12E: ventana "Productos (PHQ)": cuántos van marcados, buscar y marcar por sufijo */
import { describe, it, expect, beforeEach } from 'vitest';
import { cargarApp, baseSimulada } from './cargar-app.js';

let App;
const ingresar = async (correo, clave) => {
    document.getElementById('loginEmail').value = correo;
    document.getElementById('visitadorPwd').value = clave;
    await App.auth.attemptLogin();
};
beforeEach(() => { localStorage.clear(); sessionStorage.clear(); App = cargarApp(); });

describe('Productos (PHQ)', () => {
    it('muestra cuántos van seleccionados y marca de una vez los que terminan en los sufijos', async () => {
        await ingresar('admin@lasante.com', 'adminadmin');
        App.state.RAW_DATA.push({ prod: 'CANDETIQUE PHQ' }, { prod: 'TRALIX LST' }, { prod: 'OTRO X' }, { prod: 'PHQUITO Z' });
        App.admin.openProductModal();
        expect(document.getElementById('productCuenta').textContent).toBe('1 de 5 seleccionados');   // DESLER PHQ ya estaba
        expect(document.getElementById('productSufijos').textContent).toContain('Marcar los 2 que terminan en PHQ, LST');
        App.admin.marcarPorSufijo();
        const marcados = [...document.querySelectorAll('.phq-prod-cb:checked')].map(c => c.value).sort();
        expect(marcados).toEqual(['CANDETIQUE PHQ', 'DESLER PHQ', 'TRALIX LST']);   // "PHQUITO Z" no termina en PHQ
        expect(document.getElementById('productCuenta').textContent).toBe('3 de 5 seleccionados');
        // Buscar
        document.getElementById('productBuscar').value = 'tralix';
        App.admin.filtrarProductos();
        expect([...document.querySelectorAll('#productChecklist [data-producto]:not(.hidden)')].map(l => l.dataset.producto)).toEqual(['TRALIX LST']);
    });

    it('los sufijos se agregan y quitan aquí mismo (es la lista de "Mis laboratorios")', async () => {
        await ingresar('admin@lasante.com', 'adminadmin');
        App.state.RAW_DATA.push({ prod: 'NUEVO XYZ' });
        App.admin.openProductModal();
        document.getElementById('productSufijoNuevo').value = 'xyz';
        await App.admin.agregarSufijo();
        expect(baseSimulada(App).configuracion.find(c => c.clave === 'laboratorios_propios').valor).toEqual(['PHQ', 'LST', 'XYZ']);
        expect(document.getElementById('productSufijos').textContent).toContain('Marcar los 1 que terminan en PHQ, LST, XYZ');
        await App.admin.quitarSufijo('XYZ');
        expect(App.state.LABS_PROPIOS).toEqual(['PHQ', 'LST']);
    });
});

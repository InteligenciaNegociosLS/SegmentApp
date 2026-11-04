/* Mercados renombrados (migración 19): el admin y el Gerente Nacional leen el archivo guardado de la
   versión, que conserva el nombre viejo; la app lo traduce al de hoy para que coincida con las evaluaciones */
import { describe, it, expect, beforeEach } from 'vitest';
import { cargarApp, baseSimulada } from './cargar-app.js';

let App;
const ingresar = async (correo, clave) => {
    document.getElementById('loginEmail').value = correo;
    document.getElementById('visitadorPwd').value = clave;
    await App.auth.attemptLogin();
};
beforeEach(() => { localStorage.clear(); sessionStorage.clear(); App = cargarApp(); });

describe('Nombre de mercado de hoy en el archivo guardado', () => {
    it('el admin ve "Mdo Desler" aunque el archivo diga "DESLER MERCADO"', async () => {
        baseSimulada(App).configuracion.push({ clave: 'nombres_mercado', valor: { DESLER: 'Mdo Desler', 'DESLER MERCADO': 'Mdo Desler' } });
        await ingresar('admin@lasante.com', 'adminadmin');
        const mercados = [...new Set(App.state.RAW_DATA.map(r => r.market))];
        expect(mercados).toEqual(['Mdo Desler']);
    });

    it('sin renombres, todo queda igual', async () => {
        await ingresar('admin@lasante.com', 'adminadmin');
        expect([...new Set(App.state.RAW_DATA.map(r => r.market))]).toEqual(['DESLER MERCADO']);
        expect(App.data.mercadoDeHoy('  Otro  ')).toBe('Otro');
    });

    it('al volver a entrar (con la copia guardada en el equipo) también sale el nombre de hoy', async () => {
        await ingresar('admin@lasante.com', 'adminadmin');
        expect(App.state.RAW_DATA[0].market).toBe('DESLER MERCADO');
        baseSimulada(App).configuracion.push({ clave: 'nombres_mercado', valor: { 'DESLER MERCADO': 'Mdo Desler' } });
        await App.auth.logoutSession();
        await ingresar('admin@lasante.com', 'adminadmin');
        expect([...new Set(App.state.RAW_DATA.map(r => r.market))]).toEqual(['Mdo Desler']);
    });
});

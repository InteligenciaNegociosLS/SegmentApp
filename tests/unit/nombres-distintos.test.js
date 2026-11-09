/* Fase 12I: misma matrícula, otro nombre en CloseUp y en el fichero */
import { describe, it, expect, beforeEach } from 'vitest';
import { cargarApp } from './cargar-app.js';

let App;
const ingresar = async (correo, clave) => {
    document.getElementById('loginEmail').value = correo;
    document.getElementById('visitadorPwd').value = clave;
    await App.auth.attemptLogin();
};
beforeEach(() => { localStorage.clear(); sessionStorage.clear(); App = cargarApp(); });

describe('Nombre distinto entre CloseUp y el fichero', () => {
    it('no cuentan el orden, las iniciales, las tildes, la Ñ ni un error de tipeo chico', () => {
        const c = App.data.compararNombres;
        expect(c('Hernando Jose Sanoja', 'SANOJA HERNANDO JOSE')).toBe('igual');
        expect(c('HERNANDO J SANOJA', 'Hernando José Sanoja')).toBe('igual');
        expect(c('SANOJA HERNANDO', 'Hernando Jose Sanoja')).toBe('igual');
        expect(c('PE#A MARGARETH', 'PEÑA MARGARETH')).toBe('igual');
        expect(c('SUAREZ VILLALOBOS MAIRA', 'SUAREZ MAYRA')).toBe('igual');
        expect(c('AGUILAR MARLENE PASTORA', 'DURAN MARLENE')).toBe('parecido');
        expect(c('JESUS HERNANDEZ', 'MARIA GONZALEZ')).toBe('distinto');
    });

    it('Salud de los datos, la ficha y la campanita avisan; la lista se descarga', async () => {
        await ingresar('admin@lasante.com', 'adminadmin');
        const doc = App.state.PROCESSED_DATA.find(d => d.id.startsWith('456_'));
        doc.ficheroData[0].Nombre = 'MARIA GONZALEZ';
        App.state._nombresMemo = null;
        const lista = App.data.nombresDistintos();
        expect(lista).toEqual([expect.objectContaining({ matricula: '456', closeup: 'ROJAS LUIS', fichero: 'MARIA GONZALEZ', nivel: 'distinto', visitador: 'OTRO VISITADOR' })]);
        await App.ajustes.renderSalud();
        expect(document.getElementById('ajSaludLista').textContent).toContain('1 médicos con la misma matrícula y otro nombre');
        App.ajustes.verNombres();
        expect(document.getElementById('nombresCuerpo').textContent).toContain('MARIA GONZALEZ');
        // Ficha del médico
        App.ficha.abrir(doc.id);
        expect(document.getElementById('fichaEncabezado').textContent).toContain('Nombre distinto.');
        expect(document.getElementById('fichaEncabezado').textContent).toContain('Cruce errado');
        // Campanita
        App.avisos.generar();
        expect(App.avisos.lista.some(a => a.tipo === 'nombres' && /otro nombre/.test(a.texto))).toBe(true);
    });
});

describe('Salud: evaluaciones de mercados que ya no están', () => {
    it('las cuenta y explica que se conservan', async () => {
        await ingresar('admin@lasante.com', 'adminadmin');
        App.state.ALL_EVALUATIONS.push({ id: 'e-v', visitador: 'NEIVIS PARRA', medico_id: '123', mercado: 'Mdo Viejo', cuadrante: 'A' });
        await App.ajustes.renderSalud();
        const t = document.getElementById('ajSaludLista').textContent;
        expect(t).toContain('1 evaluaciones de mercados que no están en la versión de hoy');
        expect(t).toContain('Mdo Viejo');
        expect(t).toContain('Siguen guardadas');
    });
});

describe('Fase 12J: nombre y datos de los médicos sin recetas (solo en el fichero)', () => {
    it('toma el nombre aunque el CRM lo llame distinto, y nunca "Profesional" = "M"', () => {
        const n = App.data.nombreEnFichero;
        expect(n({ Profesional: 'M', 'Nombre del sector': 'NEIVIS PARRA', Nombre: 'ABAD HÉCTOR' })).toBe('ABAD HÉCTOR');
        expect(n({ Profesional: 'M', Apellidos: 'SANOJA', Nombres: 'HERNANDO JOSE' })).toBe('SANOJA HERNANDO JOSE');
        expect(n({ Medico: 'M', 'Nombre completo': 'PEREZ ANA' })).toBe('PEREZ ANA');
        expect(n({ Profesional: 'M', 'Nombre del sector': 'NEIVIS PARRA' })).toBe('');
        expect(App.data.especialidadEnFichero({ 'Especialidad 1 (matricula personal)': 'MDI', ESPEC1_FICHERO_DESC: 'MEDICINA INTERNA' })).toBe('MEDICINA INTERNA');
        expect(App.data.direccionEnFichero({ 'Nombre de Fantasía': 'CLINICA X', Dirección: 'AV BOLIVAR', Número: '12', MunicipioDescripcion: 'LIBERTADOR', EstadoDescripcion: 'DC' }))
            .toBe('CLINICA X · AV BOLIVAR 12 · LIBERTADOR, DC');
    });
});

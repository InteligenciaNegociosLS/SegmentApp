/* Fase 12B: catálogos de CloseUp (tablas de dimensiones) y filtros, desde la app */
import { describe, it, expect, beforeEach } from 'vitest';
import { cargarApp, baseSimulada } from './cargar-app.js';

let App;
const ingresar = async (correo, clave) => {
    document.getElementById('loginEmail').value = correo;
    document.getElementById('visitadorPwd').value = clave;
    await App.auth.attemptLogin();
};
beforeEach(() => { localStorage.clear(); sessionStorage.clear(); App = cargarApp(); });

// Como salen del portal (celdas combinadas = columnas vacías en medio, títulos arriba)
const LABORATORIOS = [
    [' \n '], ['EXPORTACIONES TABLAS'], ['Buscar: '], ['Laboratorios'],
    ['ABREVIATURA', '', 'NOMBRE', '', 'CODIGO', ''],
    ['ADM', '', 'A-DERMA', '', '298', ''],
    ['ABD', '', 'ABBOTT DIABETES C', '', '21198', ''],
    ['PHQ', '', 'PHARMETIQUE', '', '77', '']
];
const ESPECIALIDADES = [
    [' \n '], ['EXPORTACIONES TABLAS'], ['Buscar: '], ['Especialidades'],
    ['ALE', 'ALERGOLOGIA'], ['ANE', 'ANESTESIOLOGIA'], ['CAR', 'CARDIOLOGIA'], ['CIR', 'CIRUGIA']
];
const PRODUCTOS = [
    ['Buscador Productos'], ['Marca: ', '', '', '', 'Laboratorio: '], ['Presentaciones: '], ['Clase Terapeutica: '], ['Generico: '], [],
    ['Producto', 'Laboratorio', 'Concentracion', 'Formas Farmaceuticas', 'Molecula', 'Clase Terapeutica', 'Generico', 'Fecha de Lanzamiento'],
    ['3-A OFTENO ELR', 'ELR', '100MG/5ML', 'GOTAS OFTALMICAS', 'DICLOFENAC', 'S01R0', 'N', ''],
    // Mismo producto con varias presentaciones y clases: debe quedar UNA fila (la clase más frecuente)
    ['DESLER PHQ', 'PHQ', '5MG', 'TABLETAS', 'DESLORATADINA', 'R06A0', 'N', ''],
    ['DESLER PHQ', 'PHQ', '2.5MG/5ML', 'JARABE', 'DESLORATADINA', 'R06A0', 'N', ''],
    ['DESLER PHQ', 'PHQ', '0.5MG', 'GOTAS', 'DESLORATADINA', 'R05X0', 'N', ''],
    // Otra hoja del mismo archivo: títulos y encabezados repetidos
    ['Buscador Productos'],
    ['Producto', 'Laboratorio', 'Concentracion', 'Formas Farmaceuticas', 'Molecula', 'Clase Terapeutica', 'Generico', 'Fecha de Lanzamiento'],
    ['AZITROMICINA SAL SAL', 'SAL', '500MG', 'TABLETAS', 'AZITROMICINA', 'J01F0', 'S', '']
];

describe('Lectura de los archivos tal como salen del portal', () => {
    it('laboratorios: salta los títulos y toma ABREVIATURA, NOMBRE y CODIGO aunque haya columnas vacías', () => {
        const r = App.catalogos.leerLaboratorios(LABORATORIOS);
        expect(r.filas).toEqual([
            { abreviatura: 'ADM', nombre: 'A-DERMA', codigo: '298' },
            { abreviatura: 'ABD', nombre: 'ABBOTT DIABETES C', codigo: '21198' },
            { abreviatura: 'PHQ', nombre: 'PHARMETIQUE', codigo: '77' }
        ]);
    });
    it('especialidades: sin encabezados, código + nombre', () => {
        const r = App.catalogos.leerEspecialidades(ESPECIALIDADES);
        expect(r.filas.map(x => x.codigo)).toEqual(['ALE', 'ANE', 'CAR', 'CIR']);
        expect(r.filas[2]).toEqual({ codigo: 'CAR', nombre: 'CARDIOLOGIA' });
    });
    it('productos: UNA fila por producto (no duplica recetas), clase más frecuente, genérico SI/NO y varias hojas', () => {
        const r = App.catalogos.leerProductos(PRODUCTOS);
        expect(r.resumen).toEqual({ leidas: 5, registros: 3, conVariasClases: 1 });
        const desler = r.filas.find(x => x.producto === 'DESLER PHQ');
        expect(desler).toEqual({ producto: 'DESLER PHQ', laboratorio: 'PHQ', molecula: 'DESLORATADINA', generico: 'NO',
            clase_terapeutica: 'R06A0', variantes: 3, clases_distintas: ['R06A0', 'R05X0'] });
        expect(r.filas.find(x => x.producto === 'AZITROMICINA SAL SAL').generico).toBe('SI');
    });
    it('si el archivo no es del catálogo elegido, lo dice en vez de guardar basura', () => {
        expect(App.catalogos.leerLaboratorios(ESPECIALIDADES).error).toMatch(/ABREVIATURA/);
        expect(App.catalogos.leerProductos(LABORATORIOS).error).toMatch(/Producto/);
    });
});

describe('Ajustes → Catálogos', () => {
    it('el admin revisa, guarda y ve los catálogos; nada se borra', async () => {
        await ingresar('admin@lasante.com', 'adminadmin');
        await App.catalogos.cargar();
        expect(document.querySelectorAll('#ajCatalogosCuerpo [data-catalogo]')).toHaveLength(4);
        App.catalogos.revisar('productos', PRODUCTOS, 'Productos.xls');
        expect(document.getElementById('catalogoModalCuerpo').textContent).toContain('varias clases');
        await App.catalogos.guardarPendiente();
        expect(window.__calls).toContain('rpc:admin_guardar_catalogo:productos:3');
        expect(baseSimulada(App).catalogo_productos).toHaveLength(3);
        // Corregir a mano la clase de DESLER y volver a subir el archivo: se respeta la corrección
        App.catalogos.ver('productos');
        App.catalogos.editar('DESLER PHQ');
        document.querySelector('#catalogoModalCuerpo [data-campo="clase_terapeutica"]').value = 'R05X0';
        await App.catalogos.guardarEdicion();
        App.catalogos.revisar('productos', PRODUCTOS, 'Productos.xls');
        await App.catalogos.guardarPendiente();
        const desler = baseSimulada(App).catalogo_productos.find(x => x.producto === 'DESLER PHQ');
        expect(desler.clase_terapeutica).toBe('R05X0');
        expect(desler.editado_a_mano).toBe(true);
    });

    it('los filtros vienen con los de Power Query y se pueden cambiar', async () => {
        await ingresar('admin@lasante.com', 'adminadmin');
        await App.catalogos.cargar();
        expect(App.catalogos.filtros().especialidades_excluir).toEqual(['DCR', 'INS', 'OTR']);
        document.getElementById('filtroNuevo_especialidades_excluir').value = 'vet';
        await App.catalogos.agregarFiltro('especialidades_excluir');
        await App.catalogos.quitarFiltro('especialidades_excluir', 'OTR');
        const guardado = baseSimulada(App).configuracion.find(c => c.clave === 'filtros_closeup').valor;
        expect(guardado.especialidades_excluir).toEqual(['DCR', 'INS', 'VET']);
        await App.catalogos.cambiarMatriculaCero(false);
        expect(baseSimulada(App).configuracion.find(c => c.clave === 'filtros_closeup').valor.excluir_matricula_cero).toBe(false);
    });

    it('un visitador no puede guardar catálogos', async () => {
        await ingresar('vm@lasante.com', '123456');
        await expect(App.sb.guardarCatalogo('especialidades', [{ codigo: 'X', nombre: 'Y' }])).rejects.toThrow();
    });
});

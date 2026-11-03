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

describe('Fase 12C: clases con niveles, historial, cómo descargarlo y mis laboratorios', () => {
    // Como sale del portal: "CÓDIGO-NOMBRE" en una sola celda, con sangrías
    const CLASES = [
        [' \n '], ['EXPORTACIONES TABLAS'], ['Buscar: '], ['Clases Terapeuticas'],
        [' A-APARAT.DIGEST.Y METAB.'], ['      A01-ESTOMATOLOGICOS'], ['           A01A-ESTOMATOLOGICOS'],
        ['      A02-A-AC.A-FL.A-ULC.PEPT.'], ['               A02A1-ANTIACIDOS SIMPLES'],
        [' R-SISTEMA RESPIRATORIO'], ['      R06-ANTIHISTAMINICOS SISTEM'], ['           R06A-ANTIHISTAMINICOS SISTEM']
    ];

    it('lee las clases en una sola celda, con su nivel y su padre', () => {
        const r = App.catalogos.leerClases(CLASES);
        expect(r.filas.map(x => x.codigo)).toEqual(['A', 'A01', 'A01A', 'A02', 'A02A1', 'R', 'R06', 'R06A']);
        expect(r.filas.find(x => x.codigo === 'A02')).toEqual({ codigo: 'A02', nombre: 'A-AC.A-FL.A-ULC.PEPT.', nivel: 2, padre: 'A' });
        expect(r.filas.find(x => x.codigo === 'A02A1')).toMatchObject({ nivel: 4, padre: 'A02A' });
    });

    it('el código del producto ("R06A0") encuentra su clase y su grupo', async () => {
        await ingresar('admin@lasante.com', 'adminadmin');
        App.catalogos.revisar('clases', CLASES, 'Clases.xls');
        await App.catalogos.guardarPendiente();
        expect(window.__calls).toContain('rpc:admin_guardar_catalogo:clases:8');
        expect(App.catalogos.claseDe('R06A0').nombre).toBe('ANTIHISTAMINICOS SISTEM');
        expect(App.catalogos.claseDe('A02A1').codigo).toBe('A02A1');
        expect(App.catalogos.grupoDe('R06A0').nombre).toBe('SISTEMA RESPIRATORIO');
    });

    it('guarda el archivo original comprimido y lo muestra en el historial', async () => {
        await ingresar('admin@lasante.com', 'adminadmin');
        await App.catalogos.cargar();
        const archivo = new File(['ABREVIATURA;NOMBRE;CODIGO\nPHQ;PHARMETIQUE;77\n'], 'Laboratorios.csv', { type: 'text/csv' });
        await App.catalogos.alElegirArchivo('laboratorios', { files: [archivo], value: 'x' });
        await App.catalogos.guardarPendiente();
        const bd = baseSimulada(App);
        expect(bd.catalogo_versiones).toHaveLength(1);
        expect(bd.catalogo_versiones[0]).toMatchObject({ tipo: 'laboratorios', nombre_archivo: 'Laboratorios.csv', registros: 1, nuevas: 1 });
        expect(bd.catalogo_versiones[0].ruta).toMatch(/^catalogos\/laboratorios\/.+Laboratorios\.csv\.gz$/);
        expect(Object.keys(bd.archivos)).toContain(bd.catalogo_versiones[0].ruta);
        App.catalogos.historial('laboratorios');
        expect(document.getElementById('catalogoModalCuerpo').textContent).toContain('Laboratorios.csv');
    });

    it('"Cómo descargarlo": trae un borrador y el admin lo cambia', async () => {
        await ingresar('admin@lasante.com', 'adminadmin');
        await App.catalogos.cargar();
        expect(App.catalogos.instructivo('closeup')).toContain('Médicos Prescriptores por Mercado');
        App.catalogos.editarInstructivo('closeup');
        document.getElementById('instructivoTexto').value = '1. Portal\n2. Descargar';
        await App.catalogos.guardarInstructivo('closeup');
        expect(baseSimulada(App).configuracion.find(c => c.clave === 'instructivos_descarga').valor.closeup).toBe('1. Portal\n2. Descargar');
        expect(App.catalogos.instructivo('closeup')).toBe('1. Portal\n2. Descargar');
    });

    it('mis laboratorios: sus productos se marcan solos como La Santé; lo quitado a mano no vuelve', async () => {
        await ingresar('admin@lasante.com', 'adminadmin');
        await App.catalogos.cargar();
        App.catalogos.revisar('productos', PRODUCTOS, 'Productos.xls');
        await App.catalogos.guardarPendiente();   // marca solos los de PHQ y LST
        const bd = baseSimulada(App);
        const phq = () => bd.configuracion.find(c => c.clave === 'productos_phq').valor;
        expect(phq()).toContain('DESLER PHQ');
        expect(phq()).not.toContain('AZITROMICINA SAL SAL');
        // El admin lo quita a mano: queda en la lista de excluidos y no se vuelve a marcar
        await App.catalogos.registrarCambioPropios(phq(), phq().filter(p => p !== 'DESLER PHQ'));
        bd.configuracion.find(c => c.clave === 'productos_phq').valor = phq().filter(p => p !== 'DESLER PHQ');
        await App.catalogos.cargar();
        expect(App.catalogos.productosDeLabsPropios()).not.toContain('DESLER PHQ');
        expect(await App.catalogos.marcarPropios()).toBe(0);
    });
});

/* ============================================================
   SegmentApp - Acceso a Supabase (única puerta de la app)
   Archivo: js/supabase-api.js
   Todas las lecturas y escrituras pasan por aquí: sesión, perfil,
   versiones de datos, archivos, configuración y evaluaciones.
   La seguridad la ponen las reglas por fila (RLS) de la base:
   cada usuario solo recibe lo que su rol le permite.
============================================================ */

window.App = window.App || {};
window.App.sb = {};

const BUCKET_DATOS = 'datos';
const TAMANO_PAGINA = 1000;   // máximo de filas por consulta en Supabase

/* ---------- Utilidades ---------- */
window.App.sb.cliente = async function() {
    const c = await window.App.supabase.cliente();
    if (!c) throw new Error('Supabase no está configurado en este entorno.');
    return c;
};

// Convierte un error de Supabase en un Error con mensaje claro
function fallo(error, contexto) {
    const e = new Error(`${contexto}: ${error && error.message ? error.message : error}`);
    e.code = error && (error.code || error.status);
    e.original = error;
    return e;
}

// Lee TODAS las filas de una consulta, de 1000 en 1000
async function leerTodo(constructor, contexto) {
    const filas = [];
    for (let desde = 0; ; desde += TAMANO_PAGINA) {
        const { data, error } = await constructor().range(desde, desde + TAMANO_PAGINA - 1);
        if (error) throw fallo(error, contexto);
        filas.push(...data);
        if (data.length < TAMANO_PAGINA) break;
    }
    return filas;
}

/* ============================================================
   SESIÓN
============================================================ */
window.App.sb.iniciarSesion = async function(correo, clave) {
    const sb = await window.App.sb.cliente();
    const { data, error } = await sb.auth.signInWithPassword({ email: correo, password: clave });
    if (error) throw fallo(error, 'Inicio de sesión');
    return data.user;
};

window.App.sb.enviarRecuperacion = async function(correo) {
    const sb = await window.App.sb.cliente();
    const { error } = await sb.auth.resetPasswordForEmail(correo, { redirectTo: location.origin + location.pathname });
    if (error) throw fallo(error, 'Recuperación de clave');
};

window.App.sb.cambiarClave = async function(nueva) {
    const sb = await window.App.sb.cliente();
    const { error } = await sb.auth.updateUser({ password: nueva });
    if (error) throw fallo(error, 'Cambio de clave');
};

window.App.sb.cerrarSesion = async function() {
    const sb = await window.App.sb.cliente();
    await sb.auth.signOut();
};

window.App.sb.usuarioActual = async function() {
    const sb = await window.App.sb.cliente();
    const { data } = await sb.auth.getSession();
    return data && data.session ? data.session.user : null;
};

window.App.sb.alCambiarSesion = async function(fn) {
    const sb = await window.App.sb.cliente();
    sb.auth.onAuthStateChange((evento, sesion) => fn(evento, sesion ? sesion.user : null));
};

/* ============================================================
   PERFIL: rol, nombre y (si es VM) su visitador
============================================================ */
window.App.sb.perfil = async function(usuario) {
    const sb = await window.App.sb.cliente();
    const { data: p, error } = await sb.from('perfiles').select('id, correo, nombre, rol, activo').eq('id', usuario.id).maybeSingle();
    if (error) throw fallo(error, 'Perfil');
    if (!p || !p.activo) return null;
    const perfil = { uid: p.id, correo: p.correo, nombre: p.nombre, rol: p.rol, visitadorId: null, visitadorNombre: '' };
    if (p.rol === 'vm') {
        const { data: v, error: ev } = await sb.from('visitadores').select('id, nombre_sector').eq('perfil_id', p.id).maybeSingle();
        if (ev) throw fallo(ev, 'Visitador');
        if (!v) return null;
        perfil.visitadorId = v.id;
        perfil.visitadorNombre = v.nombre_sector;
    }
    return perfil;
};

/* ============================================================
   VERSIONES DE DATOS Y ARCHIVOS
============================================================ */
window.App.sb.versiones = async function() {
    const sb = await window.App.sb.cliente();
    const { data, error } = await sb.from('data_snapshots')
        .select('id, nombre, tipo, fecha, estado, es_vigente, filas, archivo, archivo_bytes, notas, creado_en, publicado_en')
        .order('fecha', { ascending: false }).order('creado_en', { ascending: false });
    if (error) throw fallo(error, 'Versiones de datos');
    return data;
};

window.App.sb.urlArchivo = async function(ruta) {
    const sb = await window.App.sb.cliente();
    const { data, error } = await sb.storage.from(BUCKET_DATOS).createSignedUrl(ruta, 3600);
    if (error) throw fallo(error, 'Archivo de datos');
    return data.signedUrl;
};

window.App.sb.subirArchivo = async function(ruta, blob) {
    const sb = await window.App.sb.cliente();
    const { error } = await sb.storage.from(BUCKET_DATOS).upload(ruta, blob, { upsert: true, contentType: 'application/gzip' });
    if (error) throw fallo(error, 'Subida del archivo');
};

window.App.sb.crearBorrador = async function({ nombre, tipo, fecha, columnas, notas }) {
    const sb = await window.App.sb.cliente();
    const { data, error } = await sb.from('data_snapshots')
        .insert({ nombre, tipo, fecha, columnas, notas: notas || null }).select('id').single();
    if (error) throw fallo(error, 'Crear borrador');
    return data.id;
};

window.App.sb.actualizarVersion = async function(id, cambios) {
    const sb = await window.App.sb.cliente();
    const { error } = await sb.from('data_snapshots').update(cambios).eq('id', id);
    if (error) throw fallo(error, 'Actualizar versión');
};

window.App.sb.cargarLote = async function(tipo, snapshotId, filas) {
    const sb = await window.App.sb.cliente();
    const fn = tipo === 'recetas' ? 'cargar_recetas_lote' : 'cargar_fichero_lote';
    const { data, error } = await sb.rpc(fn, { p_snapshot: snapshotId, p_filas: filas });
    if (error) throw fallo(error, 'Carga del lote');
    return data;
};

window.App.sb.contarFilas = async function(snapshotId) {
    const sb = await window.App.sb.cliente();
    const { data, error } = await sb.rpc('contar_filas_snapshot', { p_snapshot: snapshotId });
    if (error) throw fallo(error, 'Conteo de filas');
    return data;
};

window.App.sb.comparar = async function(nuevoId, baseId) {
    const sb = await window.App.sb.cliente();
    const { data, error } = await sb.rpc('comparar_snapshots', { p_nuevo: nuevoId, p_base: baseId });
    if (error) throw fallo(error, 'Comparación de versiones');
    return data;
};

window.App.sb.publicar = async function(snapshotId) {
    const sb = await window.App.sb.cliente();
    const { error } = await sb.rpc('publicar_snapshot', { p_snapshot_id: snapshotId });
    if (error) throw fallo(error, 'Publicar versión');
};

/* ============================================================
   CONFIGURACIÓN COMPARTIDA (ponderación, umbrales, productos)
============================================================ */
window.App.sb.configuracion = async function() {
    const sb = await window.App.sb.cliente();
    const { data, error } = await sb.from('configuracion').select('clave, valor');
    if (error) throw fallo(error, 'Configuración');
    return Object.fromEntries(data.map(r => [r.clave, r.valor]));
};

window.App.sb.guardarConfiguracion = async function(clave, valor) {
    const sb = await window.App.sb.cliente();
    const { error } = await sb.from('configuracion').update({ valor }).eq('clave', clave);
    if (error) throw fallo(error, 'Guardar configuración');
};

/* ============================================================
   EVALUACIONES
   La app trabaja con el formato de siempre (visitador, medico_id,
   mercado, survey{q1..q5}…); aquí se traduce al de la base.
============================================================ */
window.App.sb.aFormatoApp = function(r) {
    return {
        firebaseId: r.id,                     // la app identifica cada evaluación con este campo
        id: r.id,
        visitador_id: r.visitador_id,
        visitador: r.visitadores ? r.visitadores.nombre_sector : '',
        medico_id: window.App.data.normalizeKey(r.matricula),
        medico_name: r.medico_nombre,
        mercado: r.mercado,
        cuadrante: r.cuadrante,
        notas: r.notas,
        survey: {
            q1: r.q1_pacientes_semana, q2: r.q2_pacientes_patologia, q3: r.q3_pacientes_producto,
            q4: r.q4_otros_productos, q5: r.q5_costo_consulta
        },
        cruceErrado: r.cruce_errado === true,
        nombreFichero: r.nombre_fichero,
        timestamp: r.actualizado_en
    };
};

function aFormatoBase(e) {
    const s = e.survey || {};
    return {
        visitador_id: e.visitador_id,
        matricula: String(e.medico_id || ''),
        medico_nombre: e.medico_name || '',
        mercado: e.mercado,
        cuadrante: e.cuadrante || '',
        notas: e.notas || '',
        q1_pacientes_semana: s.q1 || '', q2_pacientes_patologia: s.q2 || '', q3_pacientes_producto: s.q3 || '',
        q4_otros_productos: s.q4 || '', q5_costo_consulta: s.q5 || '',
        cruce_errado: e.cruceErrado === true,
        nombre_fichero: e.nombreFichero || null,
        rol_autor: e._user_role || null
    };
}

const COLUMNAS_EVAL = 'id, visitador_id, matricula, medico_nombre, mercado, cuadrante, notas, q1_pacientes_semana, ' +
    'q2_pacientes_patologia, q3_pacientes_producto, q4_otros_productos, q5_costo_consulta, cruce_errado, ' +
    'nombre_fichero, actualizado_en, visitadores(nombre_sector)';

// Todas las evaluaciones ACTIVAS que el usuario puede ver (RLS filtra por rol)
window.App.sb.evaluaciones = async function() {
    const sb = await window.App.sb.cliente();
    const filas = await leerTodo(() => sb.from('evaluaciones').select(COLUMNAS_EVAL).is('eliminado_en', null).order('id'), 'Evaluaciones');
    return filas.map(window.App.sb.aFormatoApp);
};

// Guarda (crea o actualiza) una evaluación. Devuelve la evaluación en formato app.
window.App.sb.guardarEvaluacion = async function(evaluacion) {
    const sb = await window.App.sb.cliente();
    const fila = aFormatoBase(evaluacion);
    const buscarActiva = async () => {
        const { data, error } = await sb.from('evaluaciones').select('id')
            .eq('visitador_id', fila.visitador_id).eq('mercado', fila.mercado)
            .eq('matricula_norm', window.App.data.normalizeKey(fila.matricula)).is('eliminado_en', null).maybeSingle();
        if (error) throw fallo(error, 'Buscar evaluación');
        return data ? data.id : null;
    };
    let id = evaluacion.id || await buscarActiva();
    let resultado;
    if (id) {
        resultado = await sb.from('evaluaciones').update(fila).eq('id', id).select(COLUMNAS_EVAL).single();
    } else {
        resultado = await sb.from('evaluaciones').insert(fila).select(COLUMNAS_EVAL).single();
        // Si otro dispositivo la creó al mismo tiempo, se actualiza la existente
        if (resultado.error && resultado.error.code === '23505') {
            id = await buscarActiva();
            resultado = await sb.from('evaluaciones').update(fila).eq('id', id).select(COLUMNAS_EVAL).single();
        }
    }
    if (resultado.error) throw fallo(resultado.error, 'Guardar evaluación');
    return window.App.sb.aFormatoApp(resultado.data);
};

// "Eliminar" = marcar (nunca se borra; queda en el historial)
window.App.sb.eliminarEvaluacion = async function(id) {
    const sb = await window.App.sb.cliente();
    const { error } = await sb.from('evaluaciones').update({ eliminado_en: new Date().toISOString() }).eq('id', id);
    if (error) throw fallo(error, 'Eliminar evaluación');
};

/* ============================================================
   VISITADORES Y USUARIOS (panel de accesos del admin)
============================================================ */
// Nombres de los visitadores que el usuario puede ver (el GD: los de su distrito)
window.App.sb.nombresVisitadoresVisibles = async function() {
    const sb = await window.App.sb.cliente();
    const filas = await leerTodo(() => sb.from('visitadores').select('nombre_sector').order('nombre_sector'), 'Visitadores');
    return filas.map(f => f.nombre_sector);
};

window.App.sb.visitadoresConUsuario = async function() {
    const sb = await window.App.sb.cliente();
    const filas = await leerTodo(() => sb.from('visitadores')
        .select('id, nombre_sector, activo, perfiles(correo, activo)').order('nombre_sector'), 'Visitadores');
    return filas;
};

console.log('[SegmentApp] supabase-api.js cargado.');

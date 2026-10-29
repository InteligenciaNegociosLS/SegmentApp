/* ============================================================
   Supabase SIMULADO para pruebas (sin internet, datos ficticios).
   Imita lo que usa js/supabase-api.js de la librería supabase-js:
   auth, from(...).select/insert/update + filtros, rpc y storage.
   Sirve igual en Node (vitest) y en el navegador (Playwright).

   Datos iniciales: createClient(url, clave, { datos }) o, en el
   navegador, window.__SB_DATOS antes de cargar la app.
   Registro de llamadas: window.__calls (si existe).
============================================================ */

const CLAVE_SESION = 'sbFalsoSesion';

function registrar(texto) {
    if (typeof window !== 'undefined' && Array.isArray(window.__calls)) window.__calls.push(texto);
}

export function datosDePrueba() {
    return {
        usuarios: [
            { id: 'u-vm', email: 'vm@lasante.com', clave: '123456' },
            { id: 'u-admin', email: 'admin@lasante.com', clave: 'adminadmin' },
            { id: 'u-gd', email: 'gd@lasante.com', clave: '123456' },
            { id: 'u-sinrol', email: 'norole@lasante.com', clave: '123456' }
        ],
        perfiles: [
            { id: 'u-vm', correo: 'vm@lasante.com', nombre: 'Neivis Parra', rol: 'vm', activo: true },
            { id: 'u-admin', correo: 'admin@lasante.com', nombre: 'Administrador', rol: 'admin', activo: true },
            { id: 'u-gd', correo: 'gd@lasante.com', nombre: 'Gerente Uno', rol: 'gd', activo: true },
            { id: 'u-sinrol', correo: 'norole@lasante.com', nombre: '', rol: null, activo: false }
        ],
        visitadores: [
            { id: 'v-1', nombre_sector: 'NEIVIS PARRA', perfil_id: 'u-vm', activo: true, distrito: 'D1' },
            { id: 'v-2', nombre_sector: 'OTRO VISITADOR', perfil_id: null, activo: true, distrito: 'D2' }
        ],
        data_snapshots: [
            { id: 's-rec-1', nombre: 'Datos enero', tipo: 'recetas', fecha: '2026-01-31', estado: 'publicado', es_vigente: true, filas: 0, archivo: 'snapshots/s-rec-1/datos.csv.gz', archivo_bytes: 1, notas: null, creado_en: '2026-01-31T00:00:00Z', publicado_en: '2026-01-31T00:00:00Z' },
            { id: 's-fic-1', nombre: 'Datos enero', tipo: 'fichero', fecha: '2026-01-31', estado: 'publicado', es_vigente: true, filas: 0, archivo: 'snapshots/s-fic-1/datos.csv.gz', archivo_bytes: 1, notas: null, creado_en: '2026-01-31T00:00:00Z', publicado_en: '2026-01-31T00:00:00Z' }
        ],
        configuracion: [
            { clave: 'umbrales_matriz', valor: { TH_LOY_LOW: 33, TH_LOY_HIGH: 66, TH_POT_LOW: 33, TH_POT_HIGH: 66 } }
        ],
        evaluaciones: [],
        // filas cargadas por lote: { snapshotId: Set(fila) }
        lotes: {},
        archivos: {},
        // URL base de los archivos firmados (el navegador de prueba la intercepta)
        urlArchivos: 'https://archivos.prueba/'
    };
}

let contador = 0;
const nuevoId = (p) => `${p}-nuevo-${++contador}`;

class Consulta {
    constructor(bd, tabla) {
        this.bd = bd; this.tabla = tabla;
        this.filtros = []; this.op = 'select'; this.valores = null;
        this.unico = null; this.desde = null; this.hasta = null; this.orden = [];
        this.devolver = false;
    }
    select() { if (this.op !== 'select') this.devolver = true; return this; }
    insert(v) { this.op = 'insert'; this.valores = v; return this; }
    update(v) { this.op = 'update'; this.valores = v; return this; }
    eq(c, v) { this.filtros.push(f => f[c] === v); return this; }
    is(c, v) { this.filtros.push(f => (f[c] ?? null) === v); return this; }
    order(c, o = {}) { this.orden.push([c, o.ascending !== false]); return this; }
    range(a, b) { this.desde = a; this.hasta = b; return this; }
    maybeSingle() { this.unico = 'quizas'; return this; }
    single() { this.unico = 'uno'; return this; }

    filas() { return this.bd[this.tabla] || (this.bd[this.tabla] = []); }
    coincide(f) { return this.filtros.every(fn => fn(f)); }
    conRelaciones(f) {
        const r = { ...f };
        if (this.tabla === 'evaluaciones') {
            const v = this.bd.visitadores.find(x => x.id === f.visitador_id);
            r.visitadores = v ? { nombre_sector: v.nombre_sector } : null;
        }
        if (this.tabla === 'visitadores') {
            const p = this.bd.perfiles.find(x => x.id === f.perfil_id);
            r.perfiles = p ? { correo: p.correo, activo: p.activo } : null;
        }
        return r;
    }
    ejecutar() {
        const lista = this.filas();
        let res;
        if (this.op === 'insert') {
            const nuevos = (Array.isArray(this.valores) ? this.valores : [this.valores]).map(v => {
                const fila = { id: nuevoId(this.tabla), creado_en: new Date().toISOString(), ...v };
                if (this.tabla === 'data_snapshots') Object.assign(fila, { estado: 'borrador', es_vigente: false, filas: 0, archivo: null, ...v });
                if (this.tabla === 'evaluaciones') Object.assign(fila, { eliminado_en: null, matricula_norm: String(v.matricula || '').replace(/^0+/, ''), actualizado_en: fila.creado_en });
                return fila;
            });
            lista.push(...nuevos);
            registrar(`insert:${this.tabla}`);
            res = nuevos;
        } else if (this.op === 'update') {
            res = lista.filter(f => this.coincide(f));
            res.forEach(f => Object.assign(f, this.valores, this.tabla === 'evaluaciones' ? { actualizado_en: new Date().toISOString() } : {}));
            registrar(`update:${this.tabla}:${Object.keys(this.valores).join(',')}`);
        } else {
            res = lista.filter(f => this.coincide(f));
            for (const [c, asc] of [...this.orden].reverse()) {
                res = [...res].sort((a, b) => (a[c] > b[c] ? 1 : a[c] < b[c] ? -1 : 0) * (asc ? 1 : -1));
            }
            registrar(`select:${this.tabla}`);
        }
        if (this.op !== 'select' && !this.devolver && !this.unico) return { data: null, error: null };
        res = res.map(f => this.conRelaciones(f));
        if (this.desde != null) res = res.slice(this.desde, this.hasta + 1);
        if (this.unico) {
            if (res.length > 1) return { data: null, error: { message: 'varias filas', code: 'PGRST116' } };
            if (!res.length) return this.unico === 'uno' ? { data: null, error: { message: 'sin filas', code: 'PGRST116' } } : { data: null, error: null };
            return { data: res[0], error: null };
        }
        return { data: res, error: null };
    }
    then(ok, mal) { return Promise.resolve().then(() => this.ejecutar()).then(ok, mal); }
}

export function createClient(url, clave, opciones = {}) {
    const bd = opciones.datos || (typeof window !== 'undefined' && window.__SB_DATOS) || datosDePrueba();
    const oyentes = [];
    const leerSesion = () => {
        try { return JSON.parse(localStorage.getItem(CLAVE_SESION) || 'null'); } catch { return null; }
    };
    const usuario = (u) => ({ id: u.id, email: u.email });

    const auth = {
        async signInWithPassword({ email, password }) {
            const u = bd.usuarios.find(x => x.email === email);
            if (!u || u.clave !== password) return { data: {}, error: { message: 'Invalid login credentials', status: 400 } };
            localStorage.setItem(CLAVE_SESION, JSON.stringify(usuario(u)));
            registrar('signIn:' + email);
            oyentes.forEach(fn => fn('SIGNED_IN', { user: usuario(u) }));
            return { data: { user: usuario(u) }, error: null };
        },
        async signOut() { localStorage.removeItem(CLAVE_SESION); registrar('signOut'); return { error: null }; },
        async getSession() { const u = leerSesion(); return { data: { session: u ? { user: u } : null } }; },
        async resetPasswordForEmail(email) { registrar('reset:' + email); return { error: null }; },
        async updateUser({ password }) {
            const s = leerSesion(); if (!s) return { error: { message: 'sin sesión' } };
            bd.usuarios.find(x => x.id === s.id).clave = password;
            registrar('updateUser'); return { error: null };
        },
        onAuthStateChange(fn) { oyentes.push(fn); return { data: { subscription: { unsubscribe() {} } } }; }
    };

    const esAdmin = () => { const s = leerSesion(); const p = s && bd.perfiles.find(x => x.id === s.id); return !!p && p.rol === 'admin'; };

    const rpcs = {
        cargar_recetas_lote({ p_snapshot, p_filas }) { return cargarLote(p_snapshot, p_filas); },
        cargar_fichero_lote({ p_snapshot, p_filas }) { return cargarLote(p_snapshot, p_filas); },
        contar_filas_snapshot({ p_snapshot }) { return { data: (bd.lotes[p_snapshot] || new Set()).size, error: null }; },
        comparar_snapshots({ p_nuevo, p_base }) {
            const n = (bd.lotes[p_nuevo] || new Set()).size;
            return { data: { nuevas: n, eliminadas: 0, cambiadas: 0, iguales: 0, rx_nuevo: 0, rx_base: 0, medicos_nuevo: 0, medicos_base: 0, visitadores_nuevo: 0, visitadores_base: 0, ejemplos: [] }, error: null };
        },
        publicar_snapshot({ p_snapshot_id }) {
            if (!esAdmin()) return { data: null, error: { message: 'Solo el administrador puede publicar versiones' } };
            const v = bd.data_snapshots.find(x => x.id === p_snapshot_id && x.estado !== 'archivado');
            if (!v) return { data: null, error: { message: 'La versión no existe o está archivada' } };
            bd.data_snapshots.filter(x => x.tipo === v.tipo).forEach(x => { x.es_vigente = false; });
            Object.assign(v, { es_vigente: true, estado: 'publicado', publicado_en: v.publicado_en || new Date().toISOString() });
            return { data: null, error: null };
        }
    };
    function cargarLote(id, filas) {
        if (!esAdmin()) return { data: null, error: { message: 'Solo el administrador puede cargar datos' } };
        const v = bd.data_snapshots.find(x => x.id === id);
        if (!v || v.estado !== 'borrador') return { data: null, error: { message: 'Solo se puede cargar en un borrador' } };
        const s = bd.lotes[id] || (bd.lotes[id] = new Set());
        filas.forEach(f => s.add(f.fila));
        registrar(`rpc:lote:${filas.length}`);
        return { data: filas.length, error: null };
    }

    const storage = {
        from(bucket) {
            return {
                async createSignedUrl(ruta) {
                    registrar('firmar:' + ruta);
                    // Lo subido durante la prueba se descarga desde la memoria
                    const url = bd.archivos[ruta] ? URL.createObjectURL(bd.archivos[ruta]) : bd.urlArchivos + ruta;
                    return { data: { signedUrl: url }, error: null };
                },
                async upload(ruta, blob) {
                    if (!esAdmin()) return { error: { message: 'sin permiso' } };
                    bd.archivos[ruta] = blob; registrar('subir:' + ruta); return { data: { path: ruta }, error: null };
                }
            };
        }
    };

    return {
        auth, storage,
        from: (tabla) => new Consulta(bd, tabla),
        rpc: async (nombre, args) => { registrar('rpc:' + nombre); return rpcs[nombre] ? rpcs[nombre](args) : { data: null, error: { message: 'rpc desconocida ' + nombre } }; },
        _bd: bd
    };
}

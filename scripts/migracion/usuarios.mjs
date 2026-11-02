/* ============================================================
   SegmentApp · Migración · Usuarios (lógica)
   Crea los usuarios en Supabase Auth con su correo corporativo,
   su rol y su vínculo (visitador o distritos).

   Archivo usuarios.csv (Excel → Guardar como "CSV UTF-8"):
     correo,nombre,rol,visitador,distritos
     - rol: vm | gd | gte_nacional | admin
     - visitador: solo para vm (nombre EXACTO como en el fichero)
     - distritos: solo para gd, códigos GER_DIS separados por |  (ej. 100007|100005)
   Filas sin correo se omiten (ej. distrito vacante).

   Claves: el VM conserva su clave actual si tiene 6 caracteres o
   más; el admin, la de admin_settings. El resto recibe una CLAVE
   TEMPORAL (la app le pide crear la suya al entrar). No se envían
   correos: el script deja accesos.csv para que el dueño los envíe.
============================================================ */
import crypto from 'node:crypto';
import { normalizarVisitador } from './transformar.mjs';

export const ROLES = ['vm', 'gd', 'gte_nacional', 'admin'];
const CLAVE_MINIMA = 6;

/* ---------- Plantilla con los datos que ya están en Supabase ---------- */
// Si la exportación de Firebase trae correos (usuarios con rol), se llenan solos.
export async function plantillaCsv(db, { correosVisitador = new Map(), correoAdmin = '' } = {}) {
    const vis = (await db.query('select nombre_sector from public.visitadores where activo order by 1')).rows;
    const dis = (await db.query('select codigo, nombre from public.distritos where activo order by 1')).rows;
    const lineas = ['correo,nombre,rol,visitador,distritos', `${correoAdmin},ADMINISTRADOR,admin,,`, ',GERENTE NACIONAL,gte_nacional,,'];
    dis.forEach(d => lineas.push(`,${d.nombre},gd,,${d.codigo}`));
    vis.forEach(v => lineas.push(`${correosVisitador.get(v.nombre_sector) || ''},${v.nombre_sector},vm,${v.nombre_sector},`));
    const llenos = vis.filter(v => correosVisitador.has(v.nombre_sector)).length + (correoAdmin ? 1 : 0);
    return { texto: lineas.join('\n') + '\n', llenos };
}

/* ---------- Lectura y validación del CSV ---------- */
export function leerCsvUsuarios(texto) {
    if (texto.includes('�')) {
        return { filas: [], errores: ['El archivo no está en UTF-8 (las Ñ y tildes se dañaron). En Excel usa: Guardar como → "CSV UTF-8 (delimitado por comas)".'] };
    }
    const lineas = texto.replace(/^﻿/, '').split(/\r?\n/).filter(l => l.trim());
    const sep = lineas[0].includes(';') ? ';' : ',';
    const cab = lineas[0].split(sep).map(c => c.trim().toLowerCase());
    const i = (n) => cab.indexOf(n);
    const errores = [];
    if (['correo', 'nombre', 'rol', 'visitador', 'distritos'].some(c => i(c) < 0)) {
        return { filas: [], errores: ['La primera fila debe ser: correo,nombre,rol,visitador,distritos'] };
    }
    const filas = [];
    lineas.slice(1).forEach((linea, k) => {
        const c = linea.split(sep).map(x => x.trim());
        const f = {
            linea: k + 2,
            correo: (c[i('correo')] || '').toLowerCase(),
            nombre: c[i('nombre')] || '',
            rol: (c[i('rol')] || '').toLowerCase(),
            visitador: normalizarVisitador(c[i('visitador')]),
            distritos: (c[i('distritos')] || '').split('|').map(x => x.trim()).filter(Boolean)
        };
        if (!f.correo) return;   // sin correo: se omite
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.correo)) errores.push(`Fila ${f.linea}: correo inválido "${f.correo}"`);
        if (!ROLES.includes(f.rol)) errores.push(`Fila ${f.linea}: rol "${f.rol}" no válido (usa: ${ROLES.join(', ')})`);
        if (f.rol === 'vm' && !f.visitador) errores.push(`Fila ${f.linea}: falta "visitador" para el rol vm`);
        if (f.rol === 'gd' && f.distritos.length === 0) errores.push(`Fila ${f.linea}: falta "distritos" para el rol gd`);
        filas.push(f);
    });
    const repetidos = (lista) => lista.filter((v, k, a) => v && a.indexOf(v) !== k);
    repetidos(filas.map(f => f.correo)).forEach(v => errores.push(`Correo repetido: ${v}`));
    repetidos(filas.filter(f => f.rol === 'vm').map(f => f.visitador)).forEach(v => errores.push(`Visitador con dos usuarios: ${v}`));
    repetidos(filas.filter(f => f.rol === 'gd').flatMap(f => f.distritos)).forEach(v => errores.push(`Distrito ${v} asignado a dos GD (cada distrito tiene un solo GD)`));
    if (!filas.some(f => f.rol === 'admin')) errores.push('Debe haber al menos un usuario con rol admin.');
    return { filas, errores };
}

/* ---------- Claves temporales (sin correo automático) ---------- */
// Fácil de dictar o escribir en el teléfono: "maro-kebi-4821". Sin letras que se confundan.
const SILABAS = ['ba', 'be', 'bi', 'bo', 'bu', 'ca', 'co', 'cu', 'da', 'de', 'do', 'fa', 'fe', 'fi', 'fo', 'ga', 'go', 'gu',
    'ka', 'ke', 'ki', 'ko', 'ku', 'ma', 'me', 'mi', 'mo', 'mu', 'na', 'ne', 'ni', 'no', 'nu', 'pa', 'pe', 'pi', 'po', 'pu',
    'ra', 're', 'ri', 'ro', 'ru', 'sa', 'se', 'si', 'so', 'su', 'ta', 'te', 'ti', 'to', 'tu', 'va', 've', 'vi', 'za', 'zo'];
export function generarClaveTemporal(azar = (n) => crypto.randomInt(n)) {
    const palabra = () => SILABAS[azar(SILABAS.length)] + SILABAS[azar(SILABAS.length)];
    return `${palabra()}-${palabra()}-${String(1000 + azar(9000))}`;
}

// Mensaje listo para enviar por Gmail o WhatsApp
export function mensajeAcceso({ nombre, correo, clave, tipo }, appUrl = '') {
    const dir = appUrl || '(dirección de la app)';
    const saludo = `Hola ${String(nombre || '').trim()}. Ya puedes entrar a la nueva SegmentApp: ${dir}`;
    if (tipo === 'temporal') return `${saludo} · Correo: ${correo} · Clave temporal: ${clave} · Al entrar, la app te pedirá crear tu propia clave. En el teléfono usa el menú ⋮ → "Instalar la app".`;
    return `${saludo} · Correo: ${correo} · Usa la misma clave de siempre. En el teléfono usa el menú ⋮ → "Instalar la app".`;
}

export function accesosCsv(accesos, appUrl = '') {
    const celda = (v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
    const filas = accesos.map(a => [a.correo, a.nombre, a.rol, a.tipo === 'temporal' ? a.clave : '(la de siempre)', mensajeAcceso(a, appUrl)].map(celda).join(','));
    return '\ufeff' + ['correo,nombre,rol,clave,mensaje', ...filas].join('\n') + '\n';
}

/* ---------- Aplicar ---------- */
// authAdmin: { crear({email, password, app_metadata}) → id, buscarPorCorreo(email) → id|null, actualizar(id, {app_metadata}) }
export async function aplicarUsuarios({ db, authAdmin, filas, claves, claveAdmin, simulacro = false, log = console.log }) {
    const vis = new Map((await db.query('select id, nombre_sector from public.visitadores')).rows.map(r => [r.nombre_sector, r.id]));
    const dis = new Map((await db.query('select id, codigo from public.distritos')).rows.map(r => [r.codigo, r.id]));
    const errores = [];
    for (const f of filas) {
        if (f.rol === 'vm' && !vis.has(f.visitador)) errores.push(`Fila ${f.linea}: el visitador "${f.visitador}" no existe en Supabase`);
        if (f.rol === 'gd') f.distritos.filter(d => !dis.has(d)).forEach(d => errores.push(`Fila ${f.linea}: el distrito ${d} no existe`));
    }
    if (errores.length) return { errores, creados: 0, actualizados: 0, conClaveTemporal: [], accesos: [] };

    const resumen = { errores: [], creados: 0, actualizados: 0, conClaveTemporal: [], accesos: [] };
    for (const f of filas) {
        let clave = '';
        if (f.rol === 'vm') clave = claves.get(f.visitador) || '';
        if (f.rol === 'admin') clave = claveAdmin || '';
        const usaClave = clave.length >= CLAVE_MINIMA;
        const app_metadata = { rol: f.rol, nombre: f.nombre };
        const etiqueta = `${f.rol.padEnd(12)} ${f.correo.padEnd(36)} ${f.visitador || f.distritos.join('|') || ''}`;

        if (simulacro) {
            log(`  [simulacro] ${etiqueta} ${usaClave ? '(clave actual)' : '(clave temporal)'}`);
            if (!usaClave) resumen.conClaveTemporal.push(f.correo);
            continue;
        }
        let id = await authAdmin.buscarPorCorreo(f.correo);
        if (id) {
            await authAdmin.actualizar(id, { app_metadata });
            resumen.actualizados++;
            log(`  ↻ ya existía (rol actualizado, clave sin cambios) ${etiqueta}`);
        } else {
            const temporal = usaClave ? null : generarClaveTemporal();
            id = await authAdmin.crear({ email: f.correo, password: usaClave ? clave : temporal, app_metadata,
                user_metadata: temporal ? { clave_temporal: true } : {} });
            resumen.creados++;
            if (temporal) resumen.conClaveTemporal.push(f.correo);
            resumen.accesos.push({ correo: f.correo, nombre: f.nombre, rol: f.rol, clave: temporal, tipo: temporal ? 'temporal' : 'actual' });
            log(`  + creado ${usaClave ? '(clave actual)' : '(clave temporal)'} ${etiqueta}`);
        }
        // Perfil (el trigger lo crea al dar de alta; aquí se asegura y se activa)
        await db.query(
            `insert into public.perfiles (id, correo, nombre, rol, activo) values ($1, $2, $3, $4, true)
             on conflict (id) do update set correo = excluded.correo, nombre = excluded.nombre, rol = excluded.rol, activo = true`,
            [id, f.correo, f.nombre, f.rol]);
        if (f.rol === 'vm') {
            await db.query('update public.visitadores set perfil_id = null where perfil_id = $1 and nombre_sector <> $2', [id, f.visitador]);
            await db.query('update public.visitadores set perfil_id = $1 where nombre_sector = $2', [id, f.visitador]);
        }
        if (f.rol === 'gd') {
            for (const codigo of f.distritos) {
                await db.query(
                    `insert into public.perfil_distritos (perfil_id, distrito_id) values ($1, $2) on conflict do nothing`,
                    [id, dis.get(codigo)]);
                const asignado = (await db.query('select perfil_id from public.perfil_distritos where distrito_id = $1', [dis.get(codigo)])).rows[0];
                if (asignado && asignado.perfil_id !== id) {
                    resumen.errores.push(`El distrito ${codigo} ya tiene otro GD; no se cambió (${f.correo})`);
                }
            }
        }
    }
    return resumen;
}

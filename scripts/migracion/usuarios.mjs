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
   más; el admin, la de admin_settings. El resto entra la primera vez
   con "¿Olvidaste tu clave?".
============================================================ */
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
    if (errores.length) return { errores, creados: 0, actualizados: 0, conRecuperacion: [] };

    const resumen = { errores: [], creados: 0, actualizados: 0, conRecuperacion: [] };
    for (const f of filas) {
        let clave = '';
        if (f.rol === 'vm') clave = claves.get(f.visitador) || '';
        if (f.rol === 'admin') clave = claveAdmin || '';
        const usaClave = clave.length >= CLAVE_MINIMA;
        if (!usaClave) resumen.conRecuperacion.push(f.correo);
        const app_metadata = { rol: f.rol, nombre: f.nombre };
        const etiqueta = `${f.rol.padEnd(12)} ${f.correo.padEnd(36)} ${f.visitador || f.distritos.join('|') || ''}`;

        if (simulacro) {
            log(`  [simulacro] ${etiqueta} ${usaClave ? '(clave actual)' : '(entrará con "¿Olvidaste tu clave?")'}`);
            continue;
        }
        let id = await authAdmin.buscarPorCorreo(f.correo);
        if (id) {
            await authAdmin.actualizar(id, { app_metadata });
            resumen.actualizados++;
            log(`  ↻ ya existía (rol actualizado, clave sin cambios) ${etiqueta}`);
        } else {
            id = await authAdmin.crear({ email: f.correo, password: usaClave ? clave : undefined, app_metadata });
            resumen.creados++;
            log(`  + creado ${usaClave ? '(clave actual)' : '(usará "¿Olvidaste tu clave?")'} ${etiqueta}`);
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

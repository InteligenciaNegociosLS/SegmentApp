// @vitest-environment node
/* ============================================================
   Los datos REALES caben en el esquema sin perder nada:
   se cargan las 231.729 filas de recetas y las 7.308 del fichero
   como versión "Datos enero" y se reconstruye el archivo original
   fila por fila (0 diferencias). Mide también el espacio ocupado.
============================================================ */
import { it, expect } from 'vitest';
import fs from 'node:fs'; import zlib from 'node:zlib';
import { crearBase } from './supabase-simulado.js';
const leer = f => zlib.gunzipSync(fs.readFileSync(f)).toString('utf8').replace(/^﻿/,'').split(/\r?\n/).filter(l=>l).map(l=>l.split(';'));
it('Datos enero: se guardan y se reconstruyen idénticos', async () => {
  const db = await crearBase(); const t0=Date.now();
  const filas = leer('datacloseup.csv.gz'); const cab=filas.shift();
  const snap=(await db.query("insert into public.data_snapshots (nombre,tipo,fecha,columnas,filas) values ('Datos enero','recetas','2026-01-31',$1,$2) returning id",[cab,filas.length])).rows[0].id;
  const med=new Map(), prod=new Map(), mk=new Map();
  for (const r of filas){ const km=[r[1],r[0],r[5],r[6],r[7],r[8],r[9],r[10]].join('\u0001'); if(!med.has(km)) med.set(km,med.size+1);
    const kp=[r[3],r[11],r[12],r[13],r[14]].join('\u0001'); if(!prod.has(kp)) prod.set(kp,prod.size+1); if(!mk.has(r[2])) mk.set(r[2],mk.size+1); }
  const lote=async(tabla,cols,arr)=>{ for(let i=0;i<arr.length;i+=2000){ const part=arr.slice(i,i+2000); const ph=part.map((row,j)=>'('+row.map((_,k)=>'$'+(j*row.length+k+1)).join(',')+')').join(','); await db.query(`insert into public.${tabla} (${cols}) overriding system value values ${ph}`, part.flat()); } };
  await lote('cat_medicos','id,matricula,nombre,medico_unico,domicilio,cod_postal,localidad,region,especialidad',[...med].map(([k,id])=>[id,...k.split('\u0001')]));
  await lote('cat_productos','id,producto,molecula,clase_terapeutica,generico,laboratorio',[...prod].map(([k,id])=>[id,...k.split('\u0001')]));
  await lote('cat_mercados','id,nombre',[...mk].map(([k,id])=>[id,k]));
  await lote('recetas','snapshot_id,fila,medico_id,mercado_id,producto_id,rx',filas.map((r,i)=>[snap,i+1,med.get([r[1],r[0],r[5],r[6],r[7],r[8],r[9],r[10]].join('\u0001')),mk.get(r[2]),prod.get([r[3],r[11],r[12],r[13],r[14]].join('\u0001')),parseInt(r[4])]));
  console.log('Carga (s)', (Date.now()-t0)/1000);
  const sz=(await db.query("select relname, pg_total_relation_size(c.oid) b from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and relkind='r' order by b desc")).rows;
  console.log('Tamaños', JSON.stringify(sz.slice(0,5).map(x=>[x.relname,(Number(x.b)/1e6).toFixed(1)+'MB'])));
  // reconstrucción exacta
  const back=[]; for(let a=1;a<=filas.length;a+=20000){ back.push(...(await db.query("select medico,matricula,mercado,producto,rx,medico_unico,domicilio,cod_postal,localidad,region,especialidad,molecula,clase_terapeutica,generico,laboratorio from public.v_recetas where fila between $1 and $2 order by fila",[a,a+19999])).rows); }
  let dif=0; back.forEach((b,i)=>{ const o=filas[i]; const rec=[b.medico,b.matricula,b.mercado,b.producto,String(b.rx),b.medico_unico,b.domicilio,b.cod_postal,b.localidad,b.region,b.especialidad,b.molecula,b.clase_terapeutica,b.generico,b.laboratorio]; if(rec.join(';')!==o.join(';')) dif++; });
  console.log('Reconstrucción: filas', back.length, 'diferencias', dif);
  expect(back.length).toBe(231729);
  expect(dif).toBe(0);
  const total = sz.reduce((a, x) => a + Number(x.b), 0);
  expect(total / 1e6).toBeLessThan(80);   // recetas + catálogos: ~47 MB
  // fichero
  const fl=leer('fichero_medico.csv.gz'); const fc=fl.shift(); const vistos={}; const claves=fc.map(c=>{vistos[c]=(vistos[c]||0)+1; return vistos[c]>1?`${c} (${vistos[c]})`:c;});
  const sf=(await db.query("insert into public.data_snapshots (nombre,tipo,fecha,columnas,filas) values ('Datos enero','fichero','2026-01-31',$1,$2) returning id",[fc,fl.length])).rows[0].id;
  await lote('fichero','snapshot_id,fila,matricula,nombre,visitador_nombre,distrito_codigo,equipo,datos',fl.map((r,i)=>[sf,i+1,r[fc.indexOf('Matricula')],r[fc.indexOf('Nombre')],r[fc.indexOf('Nombre del sector')],r[fc.indexOf('GER_DIS')],r[fc.indexOf('Equipo')],JSON.stringify(Object.fromEntries(claves.map((c,k)=>[c,r[k]??''])))]).map(a=>a));
  const fz=(await db.query("select pg_total_relation_size('public.fichero') b")).rows[0].b;
  const nFich = (await db.query('select count(*)::int n from public.fichero')).rows[0].n;
  console.log('Fichero MB', (Number(fz)/1e6).toFixed(1), 'filas', nFich);
  expect(nFich).toBe(7308);
  // Todas las columnas originales, incluido el encabezado repetido
  const d = (await db.query('select datos from public.fichero where fila = 1')).rows[0].datos;
  expect(Object.keys(d)).toHaveLength(119);
  expect(d).toHaveProperty('Cumpleaños (2)');
  expect(d['Nombre del sector']).toBe('NEIVIS PARRA');
}, 600000);

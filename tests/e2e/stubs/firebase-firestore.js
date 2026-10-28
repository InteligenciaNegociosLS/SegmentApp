// Firestore SIMULADO para pruebas (datos ficticios en memoria).
const DB = { 'artifacts/segmentapp-local/public/data/evaluaciones_matriz/NEIVISPARRA_57378_X': {visitador:'NEIVIS PARRA', medico_id:'57378', mercado:'AIREX MCDO', cuadrante:'A+', survey:{}, timestamp:'2026-01-01T00:00:00Z'} };
export function getFirestore(){ return {}; }
export function collection(db,...p){ return {path:p.join('/')}; }
export function doc(db,...p){ return {path:p.join('/'), id:p[p.length-1]}; }
export function query(c,...w){ return {path:c.path, w}; }
export function where(f,op,v){ return {f,op,v}; }
function snapOf(path){ const docs=Object.entries(DB).filter(([k])=>k.startsWith(path+'/')).map(([k,v])=>({id:k.split('/').pop(), data:()=>v})); return {docs, size:docs.length, empty:!docs.length, forEach:f=>docs.forEach(f)}; }
export async function getDocs(q){ window.__calls.push('getDocs:'+q.path); return snapOf(q.path); }
export async function getDoc(d){ window.__calls.push('getDoc:'+d.path); const v=DB[d.path]; return {exists:()=>!!v, data:()=>v}; }
export async function setDoc(d,v){ window.__calls.push('setDoc:'+d.path); DB[d.path]=v; }
export async function deleteDoc(d){ window.__calls.push('deleteDoc:'+d.path); delete DB[d.path]; }

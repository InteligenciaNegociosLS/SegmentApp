// Firebase Auth SIMULADO para pruebas (usuarios y claves ficticios).
const USERS = { 'vm@lasante.com': {pwd:'123456', claims:{role:'visitador', visitadorName:'NEIVIS PARRA'}},
                'admin@lasante.com': {pwd:'adminadmin', claims:{role:'admin'}},
                'norole@lasante.com': {pwd:'123456', claims:{}} };
let current = JSON.parse(localStorage.getItem('stubUser')||'null');
const listeners=[];
function mk(email){ return { uid:'u_'+email, email, getIdTokenResult: async()=>({claims: USERS[email].claims}) }; }
export function getAuth(){ return { get currentUser(){ return current ? mk(current) : null; } }; }
export function onAuthStateChanged(a, cb){ setTimeout(()=>cb(current?mk(current):null),10); return ()=>{}; }
export async function signInWithEmailAndPassword(a,email,pwd){ const u=USERS[email]; if(!u||u.pwd!==pwd){ const e=new Error('x'); e.code='auth/invalid-credential'; throw e;} current=email; localStorage.setItem('stubUser',JSON.stringify(email)); window.__calls.push('signIn:'+email); return {user:mk(email)}; }
export async function sendPasswordResetEmail(a,email){ window.__calls.push('reset:'+email); }
export async function signOut(){ current=null; localStorage.removeItem('stubUser'); window.__calls.push('signOut'); }

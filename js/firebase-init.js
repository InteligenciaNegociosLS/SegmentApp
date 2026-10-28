/* ============================================================
   SegmentApp - Inicialización de Firebase
   Archivo: js/firebase-init.js
   Tipo: ES Module (cargar con <script type="module">)
   Expone: window.firebaseDb, window.firebaseAuth,
           window.firebaseSetDoc, window.firebaseGetDocs,
           window.firebaseGetDoc, window.firebaseCollection,
           window.firebaseDoc, window.firebaseDeleteDoc,
           window.firebaseAuthApi (login con correo y clave),
           window.firebaseAuthReady (promesa: estado de sesión inicial)
============================================================ */

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import {
    getAuth, onAuthStateChanged, signInWithEmailAndPassword,
    sendPasswordResetEmail, signOut
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import {
    getFirestore, collection, doc, setDoc, getDocs, getDoc, deleteDoc
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- Configuración del proyecto Firebase ---
// (Estos valores son públicos por diseño; la protección está en las reglas
//  de Firestore y en Firebase Auth.)
const miConfiguracionFirebase = {
    apiKey: "AIzaSyAIu61M-R9eCX9oEJG4X3vJgZ6JDrO0DNw",
    authDomain: "segmentapp-1b237.firebaseapp.com",
    projectId: "segmentapp-1b237",
    storageBucket: "segmentapp-1b237.firebasestorage.app",
    messagingSenderId: "1010458559769",
    appId: "1:1010458559769:web:f487cb9fdc547442953188"
};

// Permite override externo (entornos con __firebase_config inyectado)
let firebaseConfig;
if (typeof __firebase_config !== 'undefined') {
    firebaseConfig = JSON.parse(__firebase_config);
} else {
    firebaseConfig = miConfiguracionFirebase;
}

// --- Inicialización ---
if (firebaseConfig && firebaseConfig.apiKey) {
    try {
        const app = initializeApp(firebaseConfig);
        const auth = getAuth(app);
        auth.languageCode = 'es';   // correos de recuperación en español
        const db = getFirestore(app);

        // Exponer instancias y métodos en window (para que los archivos
        // no-module de la app puedan usarlos sin ES import).
        window.firebaseDb = db;
        window.firebaseAuth = auth;
        window.firebaseSetDoc = setDoc;
        window.firebaseGetDocs = getDocs;
        window.firebaseGetDoc = getDoc;
        window.firebaseCollection = collection;
        window.firebaseDoc = doc;
        window.firebaseDeleteDoc = deleteDoc;

        // Login real con correo y clave (reemplaza al login anónimo)
        window.firebaseAuthApi = {
            signIn:        (email, pwd) => signInWithEmailAndPassword(auth, email, pwd),
            sendReset:     (email)      => sendPasswordResetEmail(auth, email),
            signOut:       ()           => signOut(auth)
        };

        // Se resuelve con el primer estado de sesión conocido (usuario o null).
        // Firebase recuerda la sesión en el dispositivo, también sin conexión.
        window.firebaseAuthReady = new Promise(resolve => {
            const unsubscribe = onAuthStateChanged(auth, user => {
                unsubscribe();
                resolve(user);
            });
        });

        console.log('[SegmentApp] Firebase inicializado.');
        window.dispatchEvent(new CustomEvent('firebase-ready'));

    } catch (e) {
        console.error('[SegmentApp] Error inicializando Firebase:', e);
        window.dispatchEvent(new CustomEvent('firebase-error', { detail: e }));
    }
} else {
    console.error('[SegmentApp] No se encontró configuración válida de Firebase.');
}

console.log('[SegmentApp] firebase-init.js cargado.');

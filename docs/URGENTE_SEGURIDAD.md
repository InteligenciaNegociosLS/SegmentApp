# Paso urgente: cerrar los huecos de seguridad de la app actual

**Para quién:** el dueño del proyecto (no hace falta saber programar).
**Qué arregla:** C1, C2, C3, C5, C6 y C7 de `docs/AUDIT.md`.
**Dónde aplica:** en la app que usa hoy el equipo (rama `main`). Claude **no**
toca `main`: prepara un PR y **tú decides** si lo unes.

---

## Garantías: qué NO va a pasar

- ❌ **No se borra ninguna evaluación.** Ningún paso borra documentos de
  Firestore. Los scripts solo leen o agregan.
- ❌ **No se pierden evaluaciones hechas sin conexión.** Se quedan guardadas en
  el teléfono y se suben solas cuando el VM entra con la versión nueva.
- ❌ **No se cambian los IDs de las evaluaciones.** Cada VM sigue viendo las
  suyas, porque su nombre de usuario es el mismo de hoy.
- ✅ **Primero se hace un respaldo completo**, y cada paso tiene su forma de
  deshacerlo (ver la tabla "Si algo sale mal").

---

## El problema, en una frase

Hoy la app entra a Firebase como "anónimo", y las reglas tienen una excepción
**TEMPORAL** que deja leer y cambiar casi todo a cualquiera que abra la página:
claves de VM, clave de admin y evaluaciones.

## La solución, en una frase

Cada VM y el admin tendrán un **usuario real de Firebase** (Firebase Auth, que
es gratis y ya viene en tu proyecto). Firebase comprobará la clave, ya no el
navegador. Cuando todos estén usando la versión nueva, se quita la excepción
TEMPORAL de las reglas.

---

## PARTE 1. Hoy mismo, sin código (15 minutos)

### 1.1 Respaldo rápido en Excel
1. Abre la app → **Ingresar** → **Modo Admin** con tu clave.
2. En "Panel de Control del Equipo", pulsa **Descargar**.
3. Guarda el archivo `SegmentApp_Evaluaciones_Asesores.xlsx` en tu computadora
   y en Google Drive. Es tu copia de seguridad básica.

### 1.2 Cambiar la clave de administrador
La clave actual puede estar a la vista de cualquiera. Cámbiala:
1. Entra a https://console.firebase.google.com → proyecto **segmentapp-1b237**.
2. Menú izquierdo → **Firestore Database** → pestaña **Datos**.
3. Navega así: `artifacts` → `segmentapp-local` → `config` → `admin_settings`.
4. Pasa el ratón sobre el campo **clave** → lápiz ✏️ → escribe una clave
   **nueva y larga** (12 o más caracteres; mejor una frase) → **Actualizar**.
5. **No me la escribas en el chat.** Guárdala en tu gestor de contraseñas.

> Esto no cierra el hueco del todo (la clave sigue siendo legible hasta la
> Parte 3), pero inutiliza la clave vieja y la que está escrita en el código.

### 1.3 Avisar al equipo (mensaje sugerido para WhatsApp)
> "Equipo: hasta nuevo aviso, **no usen el botón Recargar** de SegmentApp,
> sobre todo si evaluaron sin internet. Ese botón borra las evaluaciones que
> aún no se subieron. Si la app se ve rara, ciérrenla y ábranla de nuevo."

---

## PARTE 2. La versión corregida (la preparo yo)

Cuando me des el OK, creo una rama `hotfix-seguridad` **a partir de `main`**
(no de `rediseno`) y un PR hacia `main`. Incluye:

| Cambio | Qué notará el equipo |
|---|---|
| Login con usuario real de Firebase (nombre + clave) | Nada: eligen su nombre y escriben su clave como hoy |
| La sesión la verifica Firebase, no el navegador | Nada |
| La lista de nombres sale de `visitador_directory` (sin claves) | Nada |
| Para ver datos hay que iniciar sesión (se acaba el modo invitado) | Sin login solo se ve la pantalla de ingreso |
| Se quita la clave de admin escrita en el código | Nada |
| "Recargar" ya **no** borra las evaluaciones pendientes | Recargar vuelve a ser seguro |
| Se ocultan "Limpiar Datos" y "Borrar TODAS las de este asesor" | El admin solo puede borrar una evaluación a la vez, con confirmación |
| La pantalla "Claves" deja de mostrar claves | Las claves se cambian con un script (ver abajo) |

Y dos **scripts** en `scripts/hotfix/` que **tú** ejecutas en Google Cloud
Shell, con tu propia cuenta de Google. Yo nunca veo claves ni llaves:

1. `respaldo.mjs`: **solo lee.** Descarga TODO Firestore a un archivo JSON con
   fecha y te muestra cuántos documentos hay por colección.
2. `crear-usuarios.mjs`: **solo agrega.** Por cada VM de `claves_visitadores`,
   crea su usuario de Firebase con su rol, llena `visitador_directory` y crea
   el usuario admin. Tiene modo **simulacro** (`--simulacro`), que muestra lo
   que haría sin hacer nada.

---

## PARTE 3. Activación, en este orden (yo te guío en cada paso)

| # | Paso | Cómo saber que salió bien | Si algo sale mal |
|---|---|---|---|
| 1 | Ejecutar `respaldo.mjs` en Cloud Shell y descargar el JSON | Ves el conteo de evaluaciones; coincide con el Excel de la Parte 1 | No cambia nada; se repite |
| 2 | Ejecutar `crear-usuarios.mjs --simulacro` | Ves la lista de 51 VM + admin | No cambia nada |
| 3 | Ejecutar `crear-usuarios.mjs` de verdad | En Firebase → Authentication aparecen los usuarios | La app actual sigue igual (aún usa anónimo). Los usuarios se pueden desactivar desde la consola |
| 4 | Probar el **enlace Preview** del PR con 1 VM y el admin: entrar, ver sus médicos, abrir una evaluación | Todo se ve como antes | No se une el PR; producción no se tocó |
| 5 | **Tú** unes el PR a `main` desde GitHub | Vercel publica la versión nueva | En GitHub: botón **Revert** del PR |
| 6 | Esperar **48 horas**: cada VM abre la app con internet e inicia sesión | Lo pendiente sin conexión se sube solo; el admin ve las evaluaciones | Igual que el paso 5 |
| 7 | En Firebase → Firestore → **Reglas**: primero **copias las reglas actuales a un archivo de texto** (respaldo) y luego pegas las reglas nuevas (abajo) → **Publicar** | Abres la app en una ventana de incógnito sin iniciar sesión y no aparece ningún dato | Pegas las reglas viejas → Publicar (efecto en 1 minuto) |

> ¿Por qué esperar 48 h en el paso 6? Si un VM tiene evaluaciones guardadas
> sin conexión en la versión vieja, esa versión ya no podrá subirlas con las
> reglas nuevas. Las evaluaciones **no se pierden** (quedan en el teléfono),
> pero es mejor que se suban antes. Al abrir la versión nueva e iniciar sesión,
> se suben solas.

### Reglas nuevas (paso 7)

Son tus mismas reglas, **sin las excepciones TEMPORAL**, con un candado extra:
un VM no puede modificar una evaluación de otro VM.

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    match /{document=**} {
      allow read, write: if false;
    }

    // Solo nombres para la lista del login (sin claves)
    match /visitador_directory/{name} {
      allow read: if true;
      allow write: if false;
    }

    match /artifacts/{appId}/public/data/evaluaciones_matriz/{evalId} {
      allow read: if request.auth != null && (
        request.auth.token.role == 'admin' ||
        (request.auth.token.role == 'visitador' && resource.data.visitador == request.auth.token.visitadorName)
      );

      allow create: if request.auth != null && (
        request.auth.token.role == 'admin' ||
        (request.auth.token.role == 'visitador' && request.resource.data.visitador == request.auth.token.visitadorName)
      );

      allow update: if request.auth != null && (
        request.auth.token.role == 'admin' ||
        (request.auth.token.role == 'visitador'
          && resource.data.visitador == request.auth.token.visitadorName
          && request.resource.data.visitador == request.auth.token.visitadorName)
      );

      allow delete: if request.auth != null && request.auth.token.role == 'admin';
    }

    // Claves viejas: se conservan (no se borran), pero solo el admin las ve
    match /artifacts/{appId}/public/data/claves_visitadores/{name} {
      allow read: if request.auth != null && request.auth.token.role == 'admin';
      allow write: if false;
    }

    match /artifacts/{appId}/config/{doc} {
      allow read, write: if request.auth != null && request.auth.token.role == 'admin';
    }
  }
}
```

Los roles **GD** y **Gerente Nacional** no se agregan en este arreglo. Llegan
con la app nueva (Supabase, Fases 3 y 9), donde se configuran desde una pantalla
y sin tocar código.

---

## PARTE 4. Datos personales del fichero

Mientras la app siga descargando el fichero completo al navegador (hasta la
Fase 7), ese archivo será público en internet. Hay tres medidas posibles:

| Opción | Riesgo de perder información | Recomendación |
|---|---|---|
| **A.** Quitar del sitio los archivos que la app **no usa**: `fichero_medico.csv` (sin comprimir) y `datacloseup.xlsx` | Ninguno: quedan en la rama `respaldo-2026-10-27` y en el historial de GitHub | ✅ Sí, en el mismo PR |
| **B.** Publicar una versión del fichero **sin** correo, cédula, teléfonos, celular, secretaria ni cumpleaños | Ninguno: el original queda intacto en la rama de respaldo | ✅ Sí, si los VM no usan esos datos en la app |
| **C.** Borrar los archivos del historial de GitHub | Reescribe el historial; es delicado | ⏸️ Ahora no. Lo vemos al final del proyecto |

La solución completa (los datos detrás del login, nunca descargables) llega con
la Fase 7.

---

## Lo que necesito que decidas

1. **Claves de los VM:**
   - (a) **Mantener las actuales** (recomendado ahora): cero molestias para el
     equipo. Se renuevan todas en la Fase 9.
   - (b) Generar **claves nuevas**: más seguro, pero tendrás que repartir 51
     claves.
2. **Opción B de la Parte 4:** ¿los VM usan el correo, la cédula, los teléfonos
   o el cumpleaños del médico dentro de la app? Si no, los quito del archivo
   público.
3. **Usuario admin:** ¿cómo quieres que se llame para iniciar sesión? (por
   ejemplo `ADMIN`). La clave la pones tú en Cloud Shell, nunca en el chat.

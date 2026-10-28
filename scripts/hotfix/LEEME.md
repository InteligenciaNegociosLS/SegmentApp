# Arreglo urgente de seguridad: guía paso a paso

Esta guía es para el dueño del proyecto y no hace falta saber programar.
Tiempo total: unos 60 minutos, repartidos en dos días por la espera de 48 h.

**Garantías:** ningún paso borra evaluaciones. Los scripts solo **leen** o
**agregan**. Cada paso indica cómo deshacerlo.

---

## A. Preparar Firebase (5 min, una sola vez)

1. Entra a https://console.firebase.google.com y abre el proyecto **segmentapp-1b237**.
2. **Activar el login con correo:** menú izquierdo → **Authentication** →
   (si aparece, **Comenzar**) → pestaña **Sign-in method** →
   **Correo electrónico/contraseña** → activar el **primer** interruptor →
   **Guardar**. Deja el anónimo como está por ahora.
3. **Correo de recuperación en español:** Authentication → pestaña
   **Plantillas** → **Restablecimiento de contraseña** → lápiz ✏️:
   - Idioma de la plantilla: **Español**.
   - Nombre del remitente: `SegmentApp - La Santé`.
   - **Guardar**.

*Deshacer:* desactivar el interruptor. No afecta a la app actual.

---

## B. Abrir Google Cloud Shell y bajar los scripts (10 min)

1. En GitHub, abre el repositorio → cambia a la rama **`hotfix-seguridad`** →
   botón verde **Code** → **Download ZIP**. Se descarga
   `SegmentApp-hotfix-seguridad.zip`.
2. Abre https://shell.cloud.google.com con la **misma cuenta de Google** que es
   dueña del proyecto de Firebase. Espera a que aparezca la terminal negra.
3. En la barra de la terminal: menú **⋮** → **Subir** (Upload) → elige el ZIP.
4. Copia y pega estos comandos **uno por uno** (Enter después de cada uno):

```bash
unzip -q SegmentApp-hotfix-seguridad.zip
```

```bash
cd SegmentApp-hotfix-seguridad/scripts/hotfix
```

```bash
npm install
```

```bash
gcloud config set project segmentapp-1b237
```

```bash
gcloud auth application-default login
```

   Este último comando muestra un enlace: ábrelo, elige tu cuenta, **Permitir**,
   copia el código que aparece y pégalo en la terminal.

```bash
gcloud auth application-default set-quota-project segmentapp-1b237
```

> Ninguna clave pasa por el chat ni queda en archivos del repositorio: los
> scripts usan el permiso de tu propia cuenta de Google.

---

## C. Paso 1: respaldo completo (solo lectura)

```bash
node respaldo.mjs
```

Al final verás algo así:

```
Documentos por colección:
     2  artifacts/segmentapp-local/config
    51  artifacts/segmentapp-local/public/data/claves_visitadores
  1234  artifacts/segmentapp-local/public/data/evaluaciones_matriz
```

- Compara el número de `evaluaciones_matriz` con las filas del Excel que
  descargaste. Deben coincidir; si no, avísame **antes de seguir**.
- Descarga el archivo a tu computadora: menú **⋮** → **Descargar** → escribe la
  ruta que mostró el script (termina en `.json`). Guárdalo en un lugar privado,
  porque contiene las claves viejas.

*Deshacer:* no hace falta; no cambió nada.

---

## D. Paso 2: lista de usuarios con su correo corporativo

1. Crea la plantilla con los nombres que hay hoy en la app:

```bash
node crear-usuarios.mjs --plantilla
```

2. Descarga `usuarios.csv` (⋮ → Descargar → `SegmentApp-hotfix-seguridad/scripts/hotfix/usuarios.csv`)
   y ábrelo en Excel.
3. Llena la columna **correo** de cada fila:
   - Fila `ADMIN`: **tu** correo corporativo (será el administrador).
   - Cada visitador: su correo corporativo.
   - **No cambies** la columna `nombre_visitador`: debe quedar igual para que
     cada VM conserve sus evaluaciones.
   - Si alguien ya no trabaja, borra su fila (su historial no se toca).
   - Para un VM nuevo, agrega una fila: `correo,NOMBRE COMO EN EL FICHERO,visitador`.
4. En Excel: **Guardar como → "CSV UTF-8 (delimitado por comas)"**.
5. Súbelo de nuevo a Cloud Shell (⋮ → Subir) y muévelo a la carpeta:

```bash
mv ~/usuarios.csv .
```

---

## E. Paso 3: simulacro (no cambia nada)

```bash
node crear-usuarios.mjs --simulacro
```

Revisa el resumen:
- **"Deben usar ¿Olvidaste tu clave?"**: personas cuya clave actual tiene menos
  de 6 caracteres (el mínimo de Firebase). La primera vez entrarán pidiendo el
  correo de recuperación.
- **"Tenían clave pero NO están en el CSV"**: no podrán entrar después. Si falta
  alguien, corrige el CSV y repite el simulacro.

Si algo no cuadra, cópiame el resumen (no muestra claves).

---

## F. Paso 4: crear los usuarios (solo agrega)

```bash
node crear-usuarios.mjs
```

- En Firebase Console → **Authentication → Users** verás los usuarios.
- La app actual **sigue funcionando igual**: todavía no usa estos usuarios.
- Se puede repetir sin problema: si un usuario ya existe, solo se actualiza su
  rol y **no** se cambia su clave.

*Deshacer:* en Authentication → Users, menú ⋮ de cada usuario →
**Inhabilitar cuenta**.

---

## G. Paso 5: probar el enlace de Preview (15 min)

En el PR de GitHub, Vercel publica un comentario con un enlace **Preview**.
Ábrelo en el teléfono y prueba:

1. Sin iniciar sesión **no se ve ningún dato**, solo "Inicia sesión".
2. Entra con **tu correo de admin** y la clave de admin que pusiste en
   `admin_settings`: ves el Panel de Control y **Descargar** genera el Excel
   rápido.
3. Pide a **un VM** que entre con su correo y su clave de siempre: ve solo sus
   médicos y sus evaluaciones.
4. Prueba **"¿Olvidaste tu clave?"** con tu correo: llega el mensaje (revisa
   spam).

> El Preview usa la misma base de datos real. Mirar y entrar no cambia nada.
> Guardar una evaluación sí la guarda de verdad.

---

## H. Paso 6: publicar (lo haces tú)

1. En el PR → **Merge pull request** → **Confirm merge**. Vercel publica en
   1 o 2 minutos.
2. Envía al equipo (mensaje sugerido):

> "Equipo: SegmentApp ahora se ingresa con su **correo corporativo** y su
> clave de siempre. Si no la recuerdan, o la app les dice que la clave no
> sirve, toquen **¿Olvidaste tu clave?** y les llega un correo para crear una
> nueva. Por favor **entren en las próximas 48 horas con internet**, así se
> suben las evaluaciones pendientes."

*Deshacer:* en GitHub, en el PR ya unido → botón **Revert** → crear y unir ese
PR. Los usuarios creados no estorban.

---

## I. Paso 7: cerrar la puerta (después de 48 horas)

1. Firebase Console → **Firestore Database** → pestaña **Reglas**.
2. **Respaldo de las reglas actuales:** selecciona todo el texto, cópialo y
   pégalo en un documento de texto con fecha.
3. Borra el texto del editor y pega el contenido del archivo `firestore.rules`
   (en la raíz del ZIP) → **Publicar**.
4. Authentication → Sign-in method → **Anónimo** → desactivar → **Guardar**.
5. Verificación: abre la app en una **ventana de incógnito** sin iniciar
   sesión. No debe aparecer ningún dato. Luego entra como admin y como un VM:
   todo debe funcionar.

*Deshacer:* pega las reglas que respaldaste en el punto 2 → **Publicar**
(tarda 1 minuto) y vuelve a activar el anónimo.

> Si un VM no entró en las 48 horas y tenía evaluaciones guardadas sin
> conexión, **no se pierden**: siguen en su teléfono y se suben solas cuando
> abra la app nueva e inicie sesión.

---

## Después: dar de alta o de baja a alguien

Hasta que llegue la app nueva (con su pantalla de usuarios):
- **Alta o cambio de rol:** agrega o corrige la fila en `usuarios.csv` y
  ejecuta `node crear-usuarios.mjs` (primero con `--simulacro`).
- **Baja:** Authentication → Users → ⋮ → **Inhabilitar cuenta**. Sus
  evaluaciones se conservan.
- **Clave olvidada:** cada persona usa "¿Olvidaste tu clave?". Tú no
  necesitas hacer nada.

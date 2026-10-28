# Migración Firebase → Supabase: guía paso a paso

**Para quién:** el dueño del proyecto (no hace falta saber programar).
**Dónde:** Google Cloud Shell (una terminal en el navegador; no instalas nada).
**Tiempo:** unos 45 minutos la primera vez.

## Garantías
- **Firebase no se toca.** El paso 1 solo **lee**. Firebase queda como respaldo.
- **Siempre primero en PRUEBAS.** Producción exige escribir a mano
  `MIGRAR PRODUCCION`. Si las claves de pruebas y de producción se mezclan, el
  script se detiene solo.
- **Simulacro:** valida todo y al final **lo deshace**, sin dejar nada guardado.
- **Se puede repetir** sin duplicar nada.
- **Nada se borra:** si hay dos evaluaciones del mismo médico y mercado, la más
  reciente queda activa y la otra se guarda como "eliminada" (historial).
- **Las claves nunca pasan por el chat ni por GitHub:** van en un archivo privado
  (`.env`) dentro de tu Cloud Shell.

---

## A. Preparar (una sola vez, 10 min)

### A1. Aplicar la migración 5 en el Supabase de PRUEBAS
Si no lo hiciste: Supabase → **SQL Editor** → pega el contenido de
`supabase/migrations/20261028130000_un_gd_por_distrito.sql` → **Run**.

### A2. Copiar 3 valores de Supabase (a un bloc de notas, NO al chat)
Entra a https://supabase.com/dashboard → proyecto **segmentapp-pruebas**.

1. **SUPABASE_DB_URL** (secreto): botón **Connect** (arriba) → pestaña
   **Connection String** → Type: **URI** → Method: **Session pooler** → copia
   el texto (empieza con `postgresql://postgres.`). Reemplaza `[YOUR-PASSWORD]`
   por la clave de la base de datos que guardaste al crear el proyecto. Si no la
   tienes: **Project Settings → Database → Reset database password**.
2. **SUPABASE_URL** (público): **Project Settings → Data API → Project URL**.
3. **SUPABASE_SERVICE_ROLE_KEY** (secreto): **Project Settings → API Keys** →
   sección **Secret keys** → **Reveal** → copiar (empieza con `sb_secret_`). Si
   solo ves "Legacy", copia la `service_role`.

> ⚠️ Los dos secretos dan acceso total a la base. Solo van en el archivo `.env`
> de Cloud Shell. Nunca en Vercel, nunca en el chat.

---

## B. Abrir Cloud Shell y bajar el proyecto (10 min)

1. En GitHub, en la rama **`rediseno`** → botón verde **Code** →
   **Download ZIP** (descarga `SegmentApp-rediseno.zip`).
2. Abre https://shell.cloud.google.com con la **cuenta de Google dueña de
   Firebase**.
3. Menú **⋮** (arriba de la terminal) → **Subir** (Upload) → elige el ZIP.
4. Pega estos comandos **uno por uno** (Enter después de cada uno):

```bash
unzip -q SegmentApp-rediseno.zip
```

```bash
cd SegmentApp-rediseno/scripts/migracion
```

```bash
npm install
```

```bash
cp .env.example .env
```

```bash
nano .env
```

5. Se abre un editor dentro de la terminal. Con las flechas, ve al final de cada
   línea y pega su valor (clic derecho → Pegar):
   - `DESTINO=pruebas` (déjalo así)
   - `SUPABASE_DB_URL=` y el valor A2.1
   - `SUPABASE_URL=` y el valor A2.2
   - `SUPABASE_SERVICE_ROLE_KEY=` y el valor A2.3

   Para guardar: **Ctrl+O**, **Enter**, y para salir **Ctrl+X**.

6. Permiso para leer Firebase con tu cuenta:

```bash
gcloud config set project segmentapp-1b237
```

```bash
gcloud auth application-default login
```

   Abre el enlace que aparece, elige tu cuenta, **Permitir**, copia el código y
   pégalo en la terminal.

```bash
gcloud auth application-default set-quota-project segmentapp-1b237
```

---

## C. Paso 1: exportar Firebase (solo lectura, 2 min)

```bash
node 1-exportar-firebase.mjs
```

Verás cuántos documentos hay por colección. **Anota el número de
`evaluaciones_matriz`.** Descarga la copia a tu computadora: ⋮ → **Descargar**
→ la ruta que muestra el script. Guárdala en un lugar privado: contiene las
claves viejas.

## D. Paso 2: importar a Supabase de PRUEBAS (5 a 10 min)

Primero el **simulacro** (no deja nada guardado):

```bash
node 2-importar.mjs --simulacro
```

Si termina con ✅, la importación de verdad:

```bash
node 2-importar.mjs
```

Verás distritos, visitadores, fichero (7.308 filas), recetas (231.729 filas) y
evaluaciones. Si aparecen avisos ⚠️ (por ejemplo, visitadores con evaluaciones
que ya no están en el fichero), cópiamelos: no son errores, son datos que
conviene que conozcas.

## E. Paso 4: validar (solo lectura, 2 min)

```bash
node 4-validar.mjs
```

Compara todo:
- Firebase contra Supabase: cantidad total, cantidad por visitador, campos
  vacíos y una **muestra aleatoria de 20 evaluaciones campo por campo**.
- Los archivos originales contra Supabase: el fichero completo y las recetas
  fila por fila.

Debe terminar en **✅ TODO COINCIDE**. Descarga `VALIDACION.md` (⋮ →
Descargar → `SegmentApp-rediseno/scripts/migracion/VALIDACION.md`) y súbelo a
GitHub como `docs/VALIDACION.md` (rama `rediseno` → **Add file → Upload
files**), o pégame su contenido: no tiene claves.

## F. Paso 3: usuarios (10 min)

> En PRUEBAS conviene crear **solo unos pocos**: tú como admin, un GD y uno o
> dos VM de confianza. Todos se crean en producción el día del pase.

1. Crea la plantilla con los nombres y distritos que ya están en Supabase:

```bash
node 3-usuarios.mjs --plantilla
```

2. Descarga `usuarios.csv` (⋮ → Descargar →
   `SegmentApp-rediseno/scripts/migracion/usuarios.csv`) y ábrelo en Excel:

   | correo | nombre | rol | visitador | distritos |
   |---|---|---|---|---|
   | tu.correo@empresa.com | ADMINISTRADOR | admin | | |
   | gerente.nacional@empresa.com | GERENTE NACIONAL | gte_nacional | | |
   | gd@empresa.com | EI-LING LOPEZ | gd | | 100007 |
   | vm@empresa.com | NEIVIS PARRA | vm | NEIVIS PARRA | |

   - Llena **solo la columna correo**. Una fila sin correo se omite.
   - **No cambies** las columnas `visitador` ni `distritos`.
   - Si un GD maneja **varios distritos**, pon los códigos en una sola fila,
     separados por `|` (ej. `100007|100005`), y borra las otras filas de ese GD.
   - Guarda con **Guardar como → "CSV UTF-8 (delimitado por comas)"**.
3. Súbelo (⋮ → Subir) y muévelo a la carpeta:

```bash
mv ~/usuarios.csv .
```

4. Simulacro (revisa el archivo sin crear nada):

```bash
node 3-usuarios.mjs --simulacro
```

5. Crear los usuarios:

```bash
node 3-usuarios.mjs
```

Claves:
- Los **VM conservan su clave actual** si tiene 6 caracteres o más.
- El **admin** usa la clave de admin que pusiste en Firebase.
- Los demás entran la primera vez con **"¿Olvidaste tu clave?"**.

> ⚠️ **Correos de recuperación:** el servicio de correo que trae Supabase de
> fábrica envía muy pocos correos por hora, y **solo a los miembros de tu
> equipo de Supabase**. Antes de dar acceso a todo el equipo hay que conectar
> un servicio de correo propio (SMTP). Lo configuramos en la Fase 9 (te daré
> los pasos).

---

## Producción (más adelante, el día del pase)
Se repiten los pasos C a F con un `.env` que diga `DESTINO=produccion` y los
valores del Supabase **real**. El script pedirá escribir `MIGRAR PRODUCCION`.

## Si algo falla
- Cada paso de la importación se hace **completo o nada**: puedes corregir y
  repetir sin miedo.
- Copia y pégame el mensaje de error. Los mensajes **no muestran claves**.

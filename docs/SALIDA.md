# Pase a producción: guía paso a paso

**Para quién:** el dueño del proyecto (con mi ayuda en el chat).
**Tiempo:** ~1 hora. **Cuándo:** 02/11/2026 (la app no se está usando).

## Decisiones (02/11/2026)
- **Supabase gratis.** El latido automático cada 2 días evita que se pause
  (`docs/ACTIVO.md`).
- **Sin correo automático.** El script crea los usuarios y deja un archivo
  `accesos.csv` con un **mensaje listo** para cada persona (correo + clave
  temporal). Tú los envías desde tu Gmail o WhatsApp. La primera vez que
  entran, la app les pide **crear su propia clave**. Quien tenía una clave de
  6 caracteres o más en la app vieja la conserva.
- **Repositorio:** sigue público. Los datos del repositorio son de prueba,
  así que no hace falta sacarlos.

## Garantías
- **Firebase no se toca:** los scripts solo lo **leen**. Queda como respaldo.
- **Se puede volver atrás en 1 minuto** (parte 9).
- **Nada se borra.** La rama `respaldo-2026-10-27` no se toca.
- Las claves solo van en el `.env` de Cloud Shell y en los paneles de
  Supabase y Vercel. **Nunca en el chat ni en GitHub.**

---

## Parte 1 · Crear el Supabase de producción (10 min)
1. https://supabase.com/dashboard → **New project**.
   - Name: `segmentapp` · Database Password: **Generate** (guárdala).
   - Region: **East US (North Virginia)** · Plan: **Free**.
2. Copia a tu bloc de notas (no al chat):
   - **Project Settings → Data API → Project URL**
   - **Project Settings → API Keys →** clave **anon / publishable** y la
     **secret / service_role**
   - **Connect → Session pooler → URI** (cambia `[YOUR-PASSWORD]` por la clave
     de la base)
3. **Authentication → URL Configuration → Site URL:** la dirección de
   producción de la app (Vercel → proyecto → **Settings → Domains**).

## Parte 2 · Vercel: variables de producción (5 min)
Vercel → proyecto → **Settings → Environment Variables**, marcando **solo
Production**:
- `SUPABASE_URL` = la Project URL de producción
- `SUPABASE_ANON_KEY` = la clave anon/publishable de producción
- `ERROR_LOG_REMOTE` = `true`

## Parte 3 · Cloud Shell (10 min)
1. GitHub → rama **rediseno** → **Code → Download ZIP**.
2. https://shell.cloud.google.com → menú ⋮ → **Subir** → el ZIP.
3. Comandos (uno por uno):

```bash
mkdir -p ~/produccion && mv ~/SegmentApp-rediseno*.zip ~/produccion/ && cd ~/produccion
```

```bash
unzip -qo SegmentApp-rediseno*.zip && cd SegmentApp-rediseno/scripts/migracion
```

```bash
npm install
```

```bash
cp .env.example .env && nano .env
```

4. En el `.env`: `DESTINO=produccion`, `SUPABASE_DB_URL`, `SUPABASE_URL`,
   `SUPABASE_SERVICE_ROLE_KEY` (de **producción**) y `APP_URL` (la dirección
   de la app). Guardar: **Ctrl+O**, **Enter**, **Ctrl+X**.
5. Permiso para leer Firebase:

```bash
gcloud config set project segmentapp-1b237
```

```bash
gcloud auth application-default login
```

```bash
gcloud auth application-default set-quota-project segmentapp-1b237
```

## Parte 4 · Crear la base y pasar los datos (20 min)
Cada script pide escribir **`MIGRAR PRODUCCION`**.

```bash
node 0-preparar-base.mjs
```

Debe decir: ✅ Base lista: se aplicaron 18 archivo(s).

```bash
node 1-exportar-firebase.mjs
```

```bash
node 2-importar.mjs --simulacro
```

```bash
node 2-importar.mjs
```

```bash
node 4-validar.mjs
```

Debe decir: ✅ TODO COINCIDE.

```bash
node 5-subir-archivos.mjs
```

(Al final prepara la versión para los visitadores.)

## Parte 5 · Usuarios (15 min)

```bash
node 3-usuarios.mjs --plantilla
```

```bash
cloudshell download usuarios.csv
```

Ábrelo en Excel, completa los correos que falten, **Guardar como → CSV UTF-8**
y súbelo (⋮ → Subir):

```bash
mv ~/usuarios.csv .
```

```bash
node 3-usuarios.mjs --simulacro
```

```bash
node 3-usuarios.mjs
```

Al terminar crea **`accesos.csv`**: correo, clave temporal y el mensaje para
cada persona. Descárgalo (no lo envíes todavía):

```bash
cloudshell download accesos.csv
```

### Si los usuarios quedaron con el correo interno (`nombre@segmentapp.internal`)
Pasa si la plantilla se usó sin cambiar los correos. No hace falta borrar
nada: el script **les cambia el correo y conservan su clave**.
1. En Cloud Shell sube el ZIP nuevo de `rediseno` y ábrelo encima del anterior
   (se conservan `.env`, `usuarios.csv` y la exportación):

```bash
cd ~/produccion && unzip -qo "$(ls -t SegmentApp-rediseno*.zip | head -1)" && cd SegmentApp-rediseno/scripts/migracion
```

2. Agrega a la base lo nuevo (migración 14, usuarios desde la app):

```bash
node 0-preparar-base.mjs
```

3. Descarga `usuarios.csv`, cambia en Excel la columna **correo** por los
   correos reales (también el tuyo en la fila admin, y pon tu nombre), llena
   GD y Gerente Nacional, guarda como **CSV UTF-8** y súbelo.
4. `node 3-usuarios.mjs --simulacro` debe decir **"✎ cambia correo …"** en
   cada persona. Luego `node 3-usuarios.mjs` y descarga `accesos.csv`.

## Parte 6 · Publicar la app nueva (10 min)
1. GitHub → **Pull requests → New pull request** → base **main**, compare
   **rediseno** → **Create** → acéptalo **tú** (yo nunca toco `main`).
2. En 2 minutos, abre la dirección de producción y entra con tu correo.
   Abajo **no** debe aparecer "PRUEBAS". Entra también como un VM de prueba.

## Parte 7 · Enviar los accesos (20 min)
Abre `accesos.csv` en Excel. La columna **mensaje** trae el texto listo:
cópialo y envíaselo a cada persona por Gmail o WhatsApp. Cuando termines,
**borra** el archivo de tu computadora y de Cloud Shell:

```bash
rm accesos.csv
```

## Parte 8 · Activar el latido (5 min)
GitHub → **Settings → Secrets and variables → Actions → New repository
secret**: `SUPABASE_URL_PRODUCCION` y `SUPABASE_ANON_KEY_PRODUCCION`. Luego
**Actions → Mantener Supabase activo → Run workflow** → debe quedar en verde.

## Parte 9 · Si algo sale mal: volver atrás (1 minuto)
Vercel → **Deployments** → la publicación de **Production** anterior al
pase → ⋯ → **Instant Rollback**. Vuelve la app vieja con Firebase, tal como
estaba. Cópiame el error y lo resolvemos.

---

## Después del pase
- **Alguien olvidó su clave:** en la app, **Ajustes → Usuarios** → busca a
  la persona → **🔑 Dar clave temporal** → copia el mensaje o envíalo por
  WhatsApp. (También se puede en Cloud Shell:
  `node 3-usuarios.mjs --nueva-clave su@correo`.)
- **Cambiar el nombre o el correo de alguien, o quitarle el acceso:** en la
  app, **Ajustes → Usuarios** (no se borra nada).
- **Claves temporales para todos (o para un grupo):** en la app, **Ajustes →
  Usuarios** → (opcional: busca o elige un rol) → **Claves temporales (N)** →
  **Descargar accesos** y envía a cada uno su mensaje (botón WhatsApp por
  persona). Las claves se ven una sola vez.
- **Lista de usuarios para Excel:** **Ajustes → Usuarios → Descargar lista**
  (no lleva claves).
- **Persona nueva:** agrégala a `usuarios.csv` y vuelve a ejecutar
  `node 3-usuarios.mjs` (los demás no cambian).
- **Cargar datos nuevos** (CloseUp o fichero): desde la app, **Ajustes →
  Cargar datos** (`docs/CARGA_DATOS.md`).
- **No borres Firebase** por al menos 3 meses: es el respaldo.
- Correo automático (opcional, más adelante): `docs/CORREO.md`.

# Entornos: Pruebas (Preview) y Producción (Production)

## La idea en una frase

Hay **dos copias** de todo:
- **Pruebas** (Preview): lo que se publica desde cualquier rama que no sea `main`
  (`rediseno`, `fase-…`). Usa un **Supabase de pruebas**: aquí se puede romper sin miedo.
- **Producción** (Production): lo que se publica desde `main`. Usa el
  **Supabase real**. Es lo que usa el equipo.

Vercel elige el entorno solo, según la rama. La app muestra una etiqueta
**"PRUEBAS · v… · Supabase: conectado"** abajo a la izquierda cuando **no**
estás en producción. En producción la etiqueta no aparece.

> ⚠️ **Hasta la migración (Fase 4)**, Pruebas y Producción siguen usando el
> **mismo Firebase real** para el login y las evaluaciones. Lo que guardes en
> un enlace de Preview queda guardado de verdad.

---

## Qué variable va en cada entorno

| Variable | Preview (Pruebas) | Production | ¿Es secreta? | Dónde se obtiene |
|---|---|---|---|---|
| `SUPABASE_URL` | URL del Supabase **de pruebas** | URL del Supabase **real** | No | Supabase → Project Settings → API → *Project URL* |
| `SUPABASE_ANON_KEY` | clave *anon/publishable* del de **pruebas** | clave *anon/publishable* del **real** | No (es pública por diseño; la seguridad la dan las reglas RLS) | Supabase → Project Settings → API |
| `ERROR_LOG_REMOTE` | `true` (desde la Fase 3) | `true` (desde la Fase 3) | No | — |
| `APP_ENV` | *no hace falta* | *no hace falta* | No | Vercel lo detecta solo |
| `SUPABASE_SERVICE_ROLE_KEY` | **❌ NUNCA en Vercel** | **❌ NUNCA en Vercel** | **Sí** | Solo en Cloud Shell, al ejecutar scripts (Fase 4) |

Si por error pones una clave secreta (`service_role` / `sb_secret_…`) en
`SUPABASE_ANON_KEY`, la publicación **se detiene con un error** y no llega al
navegador.

---

## Paso a paso (lo haces tú)

### 1. Crear el Supabase de PRUEBAS (10 min)
1. Entra a https://supabase.com/dashboard e inicia sesión (puedes usar tu
   cuenta de GitHub).
2. **New project**:
   - Name: `segmentapp-pruebas`.
   - Database Password: pulsa **Generate a password** y guárdala en tu gestor
     de contraseñas. **No me la envíes.**
   - Region: **East US (North Virginia)**, la más cercana a Venezuela.
   - Plan: **Free**.
3. Espera 1 o 2 minutos a que termine de crearse.

### 2. Copiar sus dos valores públicos
1. En el proyecto nuevo, entra a **Project Settings** (engranaje) → **API**
   (o **Data API** / **API Keys**, según la versión).
2. Copia **Project URL** (ej. `https://abcdxyz.supabase.co`).
3. Copia la clave **anon public** (o **publishable**). **No** copies la
   `service_role` / `secret`.

### 3. Ponerlos en Vercel, SOLO para Preview
1. Entra a https://vercel.com/dashboard → abre el proyecto de SegmentApp →
   **Settings** → **Environment Variables**.
2. **Add New**:
   - Key: `SUPABASE_URL` · Value: la Project URL.
   - Environments: marca **solo Preview** (desmarca Production y Development).
   - **Save**.
3. Repite con Key: `SUPABASE_ANON_KEY` · Value: la clave anon · **solo Preview**.
4. Para que se apliquen, Vercel necesita volver a publicar. Basta con que yo
   suba el siguiente cambio, o tú puedes ir a **Deployments** → el último de
   Preview → menú **⋯** → **Redeploy**.

### 4. Comprobar
Abre el enlace de Preview del PR. Abajo a la izquierda debe decir:
**PRUEBAS · v… · Supabase: conectado**.

| Si dice… | Significa |
|---|---|
| `Supabase: sin configurar (falta …)` | Falta esa variable en Preview, o falta el Redeploy |
| `Supabase: revisar SUPABASE_URL (…)` | La URL no es de un proyecto Supabase (debe ser `https://xxxx.supabase.co`) |
| `Supabase: la clave no corresponde a esa URL` | La clave es de otro proyecto, o se copió incompleta |
| `Supabase: URL no encontrada` | La URL está mal escrita |
| `Supabase: sin respuesta (…)` | El proyecto está en pausa (Supabase pausa los proyectos gratis tras 7 días sin uso) o la URL está mal |

Si la URL trae algo de más al final (por ejemplo `/rest/v1/`), la app ahora lo
corrige sola.

### 5. Producción (más adelante, NO ahora)
El Supabase **real** se crea igual (nombre `segmentapp`) cuando lleguemos al
pase a producción. Sus valores se ponen **solo en Production**.

---

## Cómo publica Vercel (ya configurado en `vercel.json`)

- Vercel ejecuta `node scripts/build.mjs`, que arma la carpeta `dist/` con
  **solo** lo que la app necesita (`index.html`, `css/`, `js/` y los `.csv.gz`)
  y genera `js/env.js` con la configuración pública del entorno.
- Los documentos (`docs/`), los scripts y los archivos que la app no usa
  (`fichero_medico.csv`, `datacloseup.xlsx`) **ya no se publican** en la web.
  Siguen en GitHub.
- No hace falta cambiar nada en la pantalla de Vercel: `vercel.json` manda.

## En tu computadora (opcional, para técnicos)
```bash
cp .env.example .env
```
```bash
npm install
```
```bash
npm run dev
```
Abre http://localhost:5173. Pruebas: `npm test` y, después de `npm run build`,
`npm run test:e2e`.

## Registro de fallas
- Cada dispositivo guarda sus **últimas 100 fallas**. El admin las descarga con
  el botón **"Registro de fallas"** (barra de Ajustes).
- Desde la Fase 3, con `ERROR_LOG_REMOTE=true`, las fallas también se guardan en
  Supabase (tabla `app_errores`), y el admin las ve todas en un solo lugar.

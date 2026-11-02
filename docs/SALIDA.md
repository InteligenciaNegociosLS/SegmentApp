# Pase a producción: guía paso a paso

**Para quién:** el dueño del proyecto (con mi ayuda en el chat).
**Idea:** primero se prepara y se **ensaya** todo, sin que el equipo note nada.
El día del pase solo se traen las evaluaciones más recientes, se crean los
accesos y se cambia la app: **alrededor de 1 hora**, fuera del horario de
trabajo.

## Garantías
- **Firebase no se toca:** los scripts solo lo **leen**. Queda como respaldo.
- **Se puede volver atrás en 1 minuto** (ver la parte 4).
- **Nada se borra.** La rama `respaldo-2026-10-27` no se toca.
- Las claves solo van en el `.env` de Cloud Shell y en los paneles de
  Supabase, Brevo y Vercel. **Nunca en el chat ni en GitHub.**

---

## 1. Decisiones antes de empezar (las tomas tú)

| # | Decisión | Recomendación | Por qué |
|---|---|---|---|
| 1 | **Plan del Supabase de producción** | **Pro** (25 US$/mes) | El plan gratis **se pausa** tras 7 días sin uso y se llena en unos 8 meses (cada mes de datos ocupa ~55 MB de 500 MB). Pro tiene respaldo diario. |
| 2 | **Repositorio de GitHub privado** | **Sí, ya** | Hoy es **público** y contiene el fichero médico (nombres, cédulas, teléfonos, correos, direcciones). Ver la nota abajo. |
| 3 | **Correo propio** | Brevo (gratis) | Para que lleguen los enlaces "Crea tu clave". Guía: `docs/CORREO.md`. |
| 4 | **Fecha y hora del pase** | Fin de semana o noche | Ese rato nadie debe evaluar en la app vieja. |

> **Nota sobre el repositorio privado:** Vercel, en su plan gratis, **no
> publica** desde un repositorio **privado de una organización** de GitHub.
> Hay que elegir:
> - **(a, recomendada)** Pasar Vercel a **Pro** (20 US$/mes; el plan gratis
>   de Vercel además es solo para uso no comercial) y luego hacer el
>   repositorio privado (**GitHub → Settings → General → Danger Zone →
>   Change visibility → Private**). No se pierde nada.
> - (b) Mover el repositorio a una cuenta personal de GitHub y hacerlo privado.
> - (c) Dejarlo público y sacar los archivos del fichero del repositorio y de
>   su historial (es delicado: reescribe el historial; lo haríamos juntos).
>
> Lo que ya se descargó mientras fue público no se puede recuperar; por eso
> conviene hacerlo cuanto antes.

---

## 2. Preparación (una semana antes; el equipo no nota nada)

### 2.1 Crear el Supabase de PRODUCCIÓN (10 min)
Igual que el de pruebas (`docs/ENTORNOS.md`, paso 1), con nombre
`segmentapp` (sin "pruebas"), región **East US (North Virginia)**. Guarda la
clave de la base en tu gestor de contraseñas.

### 2.2 Correo propio en producción (15 min)
Sigue `docs/CORREO.md` (pasos 2 a 4) **en el proyecto de producción**. En
**URL Configuration**, la *Site URL* es la dirección de producción de la app.

### 2.3 Cloud Shell con los valores de PRODUCCIÓN (10 min)
Como en `scripts/migracion/LEEME.md` (secciones A y B), pero en una carpeta
nueva para no mezclar con pruebas:

```bash
mkdir -p ~/produccion && cd ~/produccion
```

Sube el ZIP de la rama `rediseno`, descomprímelo y entra a
`SegmentApp-rediseno/scripts/migracion`. En el `.env` pon:
- `DESTINO=produccion`
- `SUPABASE_DB_URL`, `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` **del
  proyecto de producción**
- `APP_URL=` la dirección de producción de la app

Cada script te pedirá escribir `MIGRAR PRODUCCION` antes de cambiar algo.

### 2.4 Crear las tablas (2 min)

```bash
node 0-preparar-base.mjs --simulacro
```

```bash
node 0-preparar-base.mjs
```

Debe terminar en **✅ Base lista: se aplicaron 12 archivo(s).**

### 2.5 Ensayo general con datos reales (20 min)
Los mismos pasos del día del pase (parte 3, pasos 3 a 7), **sin** enviar los
correos de bienvenida. Así, si algo falla, se corrige con calma. Todos los
pasos se pueden repetir sin duplicar nada.

### 2.6 Vercel: variables de PRODUCCIÓN (5 min)
Vercel → proyecto → **Settings → Environment Variables**. Agrega
`SUPABASE_URL` y `SUPABASE_ANON_KEY` **del Supabase de producción**,
marcando **solo Production**, y `ERROR_LOG_REMOTE=true` (Production). La app
vieja no las usa: no cambia nada hasta el pase.

---

## 3. El día del pase (~1 hora)

1. **Aviso al equipo** (un día antes): "El sábado de 8 a 9 p.m. no evalúen
   en SegmentApp: estamos actualizando la app".
2. A la hora acordada, abre Cloud Shell en la carpeta de producción:

```bash
cd ~/produccion/SegmentApp-rediseno/scripts/migracion
```

3. Traer las evaluaciones más recientes de Firebase (solo lectura):

```bash
node 1-exportar-firebase.mjs
```

4. Importar (simulacro y luego de verdad):

```bash
node 2-importar.mjs --simulacro
```

```bash
node 2-importar.mjs
```

5. Validar. Debe decir **✅ TODO COINCIDE**:

```bash
node 4-validar.mjs
```

6. Subir los archivos de datos y preparar la versión para los visitadores:

```bash
node 5-subir-archivos.mjs
```

7. Usuarios (con el `usuarios.csv` que llenaste en el ensayo):

```bash
node 3-usuarios.mjs
```

8. Correos de bienvenida ("Crea tu clave"). Primero mira a quién le llegaría:

```bash
node 3-usuarios.mjs --enviar-enlaces --simulacro
```

```bash
node 3-usuarios.mjs --enviar-enlaces
```

9. **Cambiar la app:** en GitHub, crea un Pull Request de `rediseno` hacia
   `main` y **acéptalo tú** (yo nunca toco `main`). Vercel publica la app
   nueva en producción en 1 o 2 minutos.
10. **Probar** en la dirección de producción: entra como administrador, como
    un VM y como un GD. Abajo **no** debe aparecer la etiqueta "PRUEBAS".
11. **Avisar al equipo** (mensaje listo para WhatsApp):

> 📲 *¡SegmentApp se renovó!* Entra en <dirección de la app> con tu correo
> de la empresa. Te llegó un correo **"SegmentApp · Crea tu clave"**: toca el
> botón y elige tu clave (si no lo ves, revisa Spam). En el teléfono, usa el
> menú ⋮ → **"Instalar la app"** para tenerla en tu pantalla de inicio. Si tu
> clave anterior tenía 6 caracteres o más, sigue sirviendo.

---

## 4. Si algo sale mal: volver atrás (1 minuto)

1. Vercel → **Deployments** → busca la publicación de **Production**
   anterior al pase → menú **⋯** → **Instant Rollback**.
2. Vuelve la app vieja con Firebase, tal como estaba. Firebase no se tocó.
3. Lo que se haya evaluado en la app nueva queda guardado en Supabase.
4. Cópiame el error y lo resolvemos antes de intentarlo otra vez.

---

## 5. La primera semana
- Revisa **Ajustes → Salud de los datos** (visitadores sin usuario) y
  **Registro de fallas**.
- A quien no le llegó el correo: `node 3-usuarios.mjs --enviar-enlaces --solo correo@empresa.com`.
- **No borres Firebase** por al menos 3 meses: es el respaldo.
- Cuando todo esté bien, decidimos qué hacer con los archivos del fichero en
  el repositorio (punto 2 de la parte 1).

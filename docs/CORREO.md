# Correo propio para SegmentApp (recuperar clave y bienvenida)

**Para quién:** el dueño del proyecto. **Tiempo:** unos 30 minutos.
**Por qué:** el correo que trae Supabase de fábrica envía muy pocos correos
por hora y **solo** a los miembros de tu equipo de Supabase (por eso en la
Fase 5 no te llegaba el enlace). Con un correo propio, cada visitador recibe
su enlace "Crea tu clave" y puede recuperar su clave solo.

> La clave de aplicación de Gmail se pega **directamente en Supabase**.
> Nunca en el chat, nunca en GitHub.

---

## 1. Usar tu Gmail (decisión del 02/11/2026)

Brevo no permite cuentas de Venezuela, así que usamos **tu Gmail** (hasta
~500 correos al día: sobra para ~70 personas). Más adelante, si TI lo
permite, se puede cambiar a un remitente con el dominio de la empresa.

1. Entra a https://myaccount.google.com/security con tu cuenta de Gmail.
2. Activa la **Verificación en dos pasos** (si no la tienes).
3. Entra a https://myaccount.google.com/apppasswords → escribe el nombre
   `SegmentApp` → **Crear**. Google muestra una **clave de 16 letras**:
   cópiala a un bloc de notas (solo se ve una vez). **No la pegues en el chat.**

## 2. Conectarlo en Supabase (hazlo en PRUEBAS y luego en PRODUCCIÓN)

1. Supabase → tu proyecto → **Authentication → Emails → SMTP Settings**.
2. Activa **Enable custom SMTP** y llena:
   - **Sender email:** tu Gmail
   - **Sender name:** `SegmentApp La Santé`
   - **Host:** `smtp.gmail.com` · **Port:** `587`
   - **Username:** tu Gmail (completo)
   - **Password:** la clave de 16 letras del paso 1 (sin espacios)
3. **Save changes**.
4. **Authentication → Rate Limits → "Rate limit for sending emails"**: súbelo a
   **100** por hora (el día del pase se envían ~60 correos de bienvenida).

## 3. Correos en español

**Authentication → Emails → Templates**:

| Plantilla | Asunto | Contenido (copiar y pegar) |
|---|---|---|
| **Reset Password** | `SegmentApp · Crea tu clave` | `supabase/plantillas-correo/recuperar-clave.html` |
| **Invite user** | `Te invitaron a SegmentApp` | `supabase/plantillas-correo/invitacion.html` |

En GitHub abre cada archivo, botón **Copy raw file**, y pégalo en el cuadro
**Message body** (reemplaza lo que haya). **Save**.

## 4. Direcciones permitidas

**Authentication → URL Configuration**:
- **Site URL:** la dirección de la app (en producción, la de producción; ej.
  `https://segment-app.vercel.app`).
- **Redirect URLs:** deja la de las vistas previas
  (`https://*-inteligenciadenegocioslasante-9199s-projects.vercel.app/**`) y
  agrega la de producción con `/**` al final.

## 5. Probar
1. Abre la app → **Ingresar** → escribe tu correo → **¿Olvidaste tu clave?**
2. Debe llegarte en 1 o 2 minutos el correo **"SegmentApp · Crea tu clave"**,
   en español, con el logo.
3. Si no llega: revisa **Spam**; mira la carpeta **Enviados** de tu Gmail
   (si está ahí, salió bien); en Supabase, **Logs → Auth** dice si hubo un
   error con el correo.

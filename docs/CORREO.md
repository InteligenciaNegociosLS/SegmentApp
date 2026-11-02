# Correo propio para SegmentApp (recuperar clave y bienvenida)

**Para quién:** el dueño del proyecto. **Tiempo:** unos 30 minutos.
**Por qué:** el correo que trae Supabase de fábrica envía muy pocos correos
por hora y **solo** a los miembros de tu equipo de Supabase (por eso en la
Fase 5 no te llegaba el enlace). Con un correo propio, cada visitador recibe
su enlace "Crea tu clave" y puede recuperar su clave solo.

> Las claves del servicio de correo se pegan **directamente en Supabase**.
> Nunca en el chat, nunca en GitHub.

---

## 1. Elegir el servicio de correo (te recomiendo Brevo)

**Brevo** (https://www.brevo.com): plan gratis de 300 correos al día, en
español y fácil de configurar. Con ~70 personas sobra.

Hay dos formas. Pregúntale a la persona de **sistemas/TI** de La Santé si
puede agregar "registros DNS" al dominio de la empresa:

| | Opción A (recomendada) | Opción B (sin TI) |
|---|---|---|
| Remitente | `no-responder@` + dominio de la empresa | un correo que ya existe (ej. el tuyo) |
| Qué hace falta | TI agrega 3 registros DNS que da Brevo | Brevo te manda un código a ese correo |
| ¿Llega a la bandeja? | Sí, casi siempre | A veces cae en "Spam" |

### Pasos en Brevo
1. Crea la cuenta en https://www.brevo.com (gratis).
2. **Opción A:** menú **Remitentes, dominios e IP dedicadas → Dominios →
   Agregar un dominio**. Brevo muestra 3 registros (DKIM, SPF y DMARC):
   envíaselos a TI. Cuando estén, pulsa **Autenticar**.
   **Opción B:** **Remitentes → Agregar un remitente** con tu correo y
   confirma el código que te llega.
3. Menú **SMTP y API → pestaña SMTP**. Ahí ves:
   - **Servidor SMTP:** `smtp-relay.brevo.com`
   - **Puerto:** `587`
   - **Inicio de sesión** (algo como `xxxx@smtp-brevo.com`)
   - Pulsa **Generar una nueva clave SMTP** y **cópiala a un bloc de notas**
     (solo se ve una vez).

## 2. Conectarlo en Supabase (hazlo en PRUEBAS y luego en PRODUCCIÓN)

1. Supabase → tu proyecto → **Authentication → Emails → SMTP Settings**.
2. Activa **Enable custom SMTP** y llena:
   - **Sender email:** el remitente del paso 1 (ej. `no-responder@…`)
   - **Sender name:** `SegmentApp La Santé`
   - **Host:** `smtp-relay.brevo.com` · **Port:** `587`
   - **Username:** el "Inicio de sesión" de Brevo
   - **Password:** la clave SMTP de Brevo
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
3. Si no llega: revisa **Spam**; en Brevo mira **Estadísticas → Correos
   transaccionales** (dice si se envió o por qué no).

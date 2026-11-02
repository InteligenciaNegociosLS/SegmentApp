# Mantener Supabase (plan gratis) siempre activo

**Decisión del dueño (02/11/2026):** Supabase en plan **gratis**.

## El problema
El plan gratis **pausa** un proyecto que pasa **7 días sin uso**. Pausado,
nadie puede entrar a la app hasta que se reactive a mano.

## Lo que quedó hecho
1. **Latido automático cada 2 días** (gratis, con GitHub Actions):
   `.github/workflows/latido.yml` llama a la función `latido()`
   (migración 13), que anota la hora en una sola fila. Para Supabase eso es
   "uso", así que el proyecto no se pausa.
   - Usa solo la clave **pública** (anon/publishable): no puede leer datos.
   - Hace 3 intentos. Si falla, GitHub te manda un correo con el aviso.
   - GitHub apaga los horarios de un repositorio público tras 60 días sin
     cambios; el mismo trabajo se "vuelve a encender" cada vez para evitarlo.
2. **El uso diario del equipo** también la mantiene activa: el latido es el
   seguro para vacaciones o feriados largos.

## Configurarlo (5 min, una sola vez)
1. GitHub → el repositorio → **Settings → Secrets and variables → Actions →
   New repository secret**. Crea estos dos (valores del Supabase de
   **producción**, los mismos que pusiste en Vercel):
   - `SUPABASE_URL_PRODUCCION` → la Project URL (`https://xxxx.supabase.co`)
   - `SUPABASE_ANON_KEY_PRODUCCION` → la clave **anon / publishable**
     (**nunca** la service_role / secret)
2. Opcional, igual para el de pruebas: `SUPABASE_URL_PRUEBAS` y
   `SUPABASE_ANON_KEY_PRUEBAS`.
3. Pestaña **Actions** → **Mantener Supabase activo** → **Run workflow**.
   Al terminar debe verse en verde y decir `PRODUCCION: {"ok": true, …}`.

## Si alguna vez se pausa
1. Entra a https://supabase.com/dashboard → el proyecto dice **Paused** →
   botón **Restore project**. Tarda unos minutos y **no se pierde nada**
   (se puede restaurar hasta 90 días después).
2. Avísame para revisar por qué no funcionó el latido.

## Otros límites del plan gratis (para tenerlos presentes)
| Límite | Cuánto | Qué hacer |
|---|---|---|
| Espacio de la base | 500 MB | Cada mes de datos ocupa ~55 MB: alcanza para unos 8 meses. Antes de llegar, archivamos versiones viejas o pasamos a Pro. **Ajustes → Salud de los datos** te ayudará a vigilarlo. |
| Archivos | 1 GB | Cada versión guarda su archivo comprimido (~10 MB). Sobra. |
| Respaldos | **No hay** respaldos automáticos | Firebase queda como respaldo de las evaluaciones. Más adelante: un respaldo mensual desde Cloud Shell. |
| Proyectos | 2 gratis | Pruebas + producción: justo los dos. |

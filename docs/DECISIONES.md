# Decisiones del proyecto

Registro de lo que el dueño del proyecto decidió. Cualquier sesión nueva debe
leerlo junto con `CLAUDE.md` y `docs/AUDIT.md` antes de trabajar.

## 28/10/2026 (respuestas a la auditoría)

### Orden de las fases
Se hace **la Fase 7 (velocidad) antes que la Fase 6 (rediseño)**:

0 ✅ → 1 Auditoría → **Urgente seguridad** → 2 Base técnica → 3 Esquema →
4 Migración → 5 Carga de datos → **7 Velocidad** → **6 Rediseño** → 8 PWA →
9 Accesos y cierre.

### Usuarios y equipos
- Por ahora la fuente de verdad es el fichero médico: **51 visitadores y 7 GD**
  (`Nombre del sector` y `NOME_GER_DIS`). El dueño lo actualizará más adelante.
- Debe poder **agregar, quitar o mover VM y GD con el tiempo**, sin cambiar
  código. Los equipos se guardan en tablas, no escritos en el programa.

### Roles
| Rol | Ve | Edita / elimina |
|---|---|---|
| `vm` (Visitador Médico) | Solo sus médicos y sus evaluaciones | Crea y edita **sus** evaluaciones |
| `gd` (Gerente de Distrito) | Solo los VM de su distrito | No (solo consulta) |
| `gte_nacional` (Gerente Nacional) — **nuevo** | **Todo** | **Nada**: no edita ni elimina |
| `admin` | Todo | **Todo**: editar, eliminar, usuarios, cargas de datos |

Debe existir siempre al menos un usuario `admin` con acceso total.

### Seguridad urgente
Se aprueba preparar el paso urgente, **solo si es seguro y garantiza no perder
información**. Instrucciones en `docs/URGENTE_SEGURIDAD.md`.

## 28/10/2026 (paso urgente de seguridad)

- **Login con correo corporativo** (ya no se elige el nombre en una lista) y
  **recuperación de clave por correo**. Esto se aplica ya en el arreglo
  urgente (Firebase Auth) y se mantiene en la app nueva (Supabase Auth).
- **Se conservan las claves actuales** de los VM. Quien tenga una clave de menos
  de 6 caracteres la cambia con "¿Olvidaste tu clave?".
- **Los VM necesitan todos los datos del médico** del fichero: no se quitan
  columnas (se descarta la opción B). La protección real llega cuando los datos
  queden detrás del login (Fase 7).
- Usuario administrador: el correo del dueño, con rol `admin`.
- El Excel de "Descargar" era muy lento y a veces colgaba el navegador: se
  corrigió en el arreglo urgente (de 35,5 s a 0,36 s en prueba con 3.000
  evaluaciones).
- El arreglo urgente va en el PR `hotfix-seguridad` → `main` y lo une el dueño.
  Guía: `scripts/hotfix/LEEME.md` (en esa rama).

## 28/10/2026 (Fase 2)

- Se aprueba arrancar la Fase 2 en paralelo al arreglo urgente.
- El dueño unió los PR #1, #2 y #3 (este último `rediseno` → `main`). No se
  perdió nada. **Regla a partir de ahora:** `rediseno` **no** se une a `main`
  hasta el pase a producción final; cada fase va solo a `rediseno`.
- El equipo no está usando la app mientras dure el arreglo, así que no importa
  que nadie pueda entrar por un tiempo.

## 28/10/2026 (Fase 3 aprobada)

- **Roles aprobados:** vm, gd, gte_nacional (ve todo, no edita), admin (todo).
- **Un GD puede tener varios distritos y varios VM; un VM tiene un solo GD.**
  Se garantiza con la regla "un distrito = un GD" (migración 5).
- **Versiones de datos** aprobadas tal como se propusieron.
- **Nada se borra** (ni el admin): "eliminar" marca la evaluación; no genera
  duplicados porque solo cuentan las activas (ver `docs/ESQUEMA.md`, FAQ).
- **Ponderación y configuración: una sola, centralizada** para todos.
- **Plan gratuito de Supabase** por ahora; el espacio no es problema todavía.
- Migraciones 1–4 aplicadas por el dueño en el Supabase de pruebas.

## 28/10/2026 (Fase 4: migración en PRUEBAS validada)

- Migración ejecutada por el dueño en el Supabase de pruebas: **✅ TODO
  COINCIDE** (ver `docs/VALIDACION.md`): 8.625 evaluaciones, 7.308 filas de
  fichero y 231.729 de recetas, sin diferencias.
- 10 evaluaciones estaban **duplicadas en Firebase** (el mismo médico y mercado
  guardado por dos versiones de la app, con y sin espacio en el nombre del
  visitador). Se conservó activa la más reciente y la otra quedó como
  "eliminada" (historial).
- 10 evaluaciones ya venían **sin matrícula** desde Firebase; se migraron tal
  cual. Revisarlas con el admin en la app nueva.

# Esquema de la base de datos (Supabase) — PROPUESTA

> **Estado: propuesta para aprobar.** Nada se ha aplicado en Supabase.
> Los archivos SQL están en `supabase/migrations/` y se aplican solo cuando
> el dueño lo apruebe (pasos al final).

## Resumen en 6 puntos

1. **Cuatro roles:** `vm`, `gd`, `gte_nacional` y `admin`. Cada persona ve solo
   lo que le toca, y lo controla **la base de datos** (no el navegador).
2. **VM y GD se agregan, mueven o desactivan desde tablas** (sin tocar código).
   Un GD puede tener uno o varios distritos.
3. **Los datos tienen versiones.** Cada carga de fichero o de recetas es una
   versión nueva ("Datos enero", "Datos noviembre"…). Solo una por tipo es la
   **vigente** ("Hoy"); las demás se pueden consultar. Una versión nueva **no
   se ve hasta que el admin la publica**, y se puede volver a una anterior.
4. **Nada se borra.** Ni siquiera el admin puede borrar filas. "Eliminar" una
   evaluación la **marca** como eliminada y guarda una copia en el historial;
   se puede deshacer.
5. **La configuración es compartida:** ponderación de la encuesta, umbrales y
   productos PHQ quedan en la base y valen igual para todos (hoy cada navegador
   tiene la suya).
6. **"Datos enero" se guarda intacto.** Se probó con los datos reales: las
   231.729 filas de recetas se reconstruyen **con 0 diferencias**, y el fichero
   conserva sus 119 columnas.

---

## Diagrama

```mermaid
erDiagram
    perfiles ||--o| visitadores : "usuario de"
    perfiles ||--o{ perfil_distritos : "GD ve"
    distritos ||--o{ perfil_distritos : ""
    distritos ||--o{ visitadores : "agrupa"
    visitadores ||--o{ evaluaciones : "evalúa"
    evaluaciones ||--o{ evaluaciones_historial : "versiones previas"
    data_snapshots ||--o{ fichero : "versión de"
    data_snapshots ||--o{ recetas : "versión de"
    visitadores ||--o{ fichero : "tiene fichados"
    cat_medicos ||--o{ recetas : ""
    cat_productos ||--o{ recetas : ""
    cat_mercados ||--o{ recetas : ""

    perfiles {
        uuid id PK "= usuario de Supabase Auth"
        text correo "correo corporativo"
        text nombre
        rol_app rol "vm | gd | gte_nacional | admin"
        bool activo "false = sin acceso (no se borra)"
    }
    distritos {
        uuid id PK
        text codigo "GER_DIS (100001…100007)"
        text nombre "NOME_GER_DIS"
        bool activo
    }
    perfil_distritos {
        uuid perfil_id FK "un GD"
        uuid distrito_id FK "puede tener varios"
    }
    visitadores {
        uuid id PK
        text nombre_sector "como en el fichero y en las evaluaciones"
        text codigo_sector
        uuid distrito_id FK
        text linea "OTC | Pharmetique"
        uuid perfil_id FK "su usuario (opcional)"
        bool activo
    }
    data_snapshots {
        uuid id PK
        text nombre "Datos enero"
        text tipo "fichero | recetas"
        date fecha "fecha de corte"
        text estado "borrador | publicado | archivado"
        bool es_vigente "solo una por tipo"
        text_arr columnas "encabezados originales"
    }
    fichero {
        uuid snapshot_id PK, FK
        int fila PK
        text matricula
        text visitador_nombre
        uuid visitador_id FK
        text distrito_codigo
        jsonb datos "las 119 columnas originales"
    }
    recetas {
        uuid snapshot_id PK, FK
        int fila PK "orden original"
        bigint medico_id FK
        bigint mercado_id FK
        bigint producto_id FK
        int rx
    }
    cat_medicos {
        bigint id PK
        text matricula
        text nombre
        text region
        text especialidad
    }
    cat_productos {
        bigint id PK
        text producto
        text molecula
        text laboratorio
    }
    cat_mercados {
        bigint id PK
        text nombre
    }
    evaluaciones {
        uuid id PK
        uuid visitador_id FK
        text matricula
        text mercado
        text cuadrante "evaluación subjetiva"
        text notas
        text q1_q5 "respuestas de la encuesta"
        bool cruce_errado
        text firebase_id "trazabilidad de la migración"
        timestamptz eliminado_en "marca, no borra"
    }
    evaluaciones_historial {
        bigint id PK
        uuid evaluacion_id
        text accion "modificada | eliminada | restaurada"
        jsonb datos_previos
    }
```

Además hay dos tablas sueltas:
- `configuracion`: ponderación, umbrales, productos PHQ y equipos OTC.
- `app_errores`: el registro de fallas de la Fase 2.

---

## Quién ve qué (seguridad por fila, RLS)

| Tabla | `vm` | `gd` | `gte_nacional` | `admin` | Sin sesión |
|---|---|---|---|---|---|
| **Evaluaciones** | Ve y edita **solo las suyas** | Ve las de **su distrito** | Ve **todas** | Ve y edita **todas** | ❌ |
| Eliminar evaluación | ❌ | ❌ | ❌ | Solo **marcar** (con historial) | ❌ |
| **Fichero** (datos del médico) | Sus médicos | Médicos de su distrito | Todo | Todo | ❌ |
| **Recetas** | De sus médicos | De su distrito | Todas | Todas | ❌ |
| Versiones en **borrador** | ❌ | ❌ | ❌ | ✅ | ❌ |
| Publicar / volver a una versión | ❌ | ❌ | ❌ | ✅ | ❌ |
| Visitadores, distritos, usuarios | Solo el suyo | Los de su distrito | Ve todos | Ve y edita todos | ❌ |
| Configuración | Lee | Lee | Lee | Lee y edita | ❌ |
| Registro de fallas | Reporta | Reporta | Reporta y lee | Reporta y lee | Solo reporta |

Reglas adicionales:
- **Nadie puede borrar filas**, ni siquiera el admin: no existe ninguna regla
  que lo permita.
- **Usuario desactivado** (`activo = false`): no ve nada, pero sus datos se
  conservan.
- **Quien se registre por su cuenta** queda **inactivo** hasta que el admin le
  asigne un rol. Además, el registro abierto se apaga en Supabase.
- Las **cifras de mercado** (totales, Pareto y competidores, que necesitan las
  recetas de todos los médicos) se calcularán **en el servidor** (Fase 7). Cada
  usuario recibe solo el resultado que le corresponde, nunca las filas ajenas.

**Probado:** 25 pruebas automáticas en un Postgres 16 real demuestran cada fila
de esta tabla (`tests/db/seguridad-por-rol.test.js`). Entre ellas: que un GD
**no** ve los datos de otro GD, que el Gerente Nacional **no** puede editar
nada, y que ni el admin puede borrar.

---

## Versiones de datos ("Hoy" y anteriores)

```
Carga nueva ──► BORRADOR ──(admin revisa y compara)──► PUBLICADO + VIGENTE ("Hoy")
                                                          │
           la versión anterior queda PUBLICADA (consultable) ◄┘
           "Volver a una versión" = publicar de nuevo la anterior
```

- En la app habrá un **selector de versión**: "Hoy" (la vigente) por defecto, y
  la lista de las anteriores. Se construye en la Fase 7, cuando la app lea de
  Supabase.
- Los **datos actuales** se migrarán (Fase 4) como **"Datos enero"**, una
  versión de fichero y otra de recetas, intactas.
- Fichero y recetas tienen versiones **independientes**: se puede actualizar
  uno sin el otro.
- **Qué médicos ve cada VM o GD** se decide con el fichero **vigente**: si un
  médico cambia de visitador, el cambio aplica desde que se publica el fichero
  nuevo.

## Espacio y costo

Medido con los datos reales en Postgres:

| Contenido | Espacio |
|---|---|
| Recetas "Datos enero" (231.729 filas + índices) | ≈ 34 MB |
| Catálogos de médicos y productos (se comparten entre versiones) | ≈ 12 MB |
| Fichero "Datos enero" (7.308 filas con las 119 columnas) | ≈ 19 MB |
| **Primera versión completa** | **≈ 65 MB** |
| Cada mes adicional (recetas + fichero) | ≈ 55 MB |

- **Plan gratuito de Supabase (500 MB):** alcanza para unas **7 a 8 versiones
  mensuales completas**.
- Después hay dos caminos (lo decides tú más adelante):
  - (a) archivar versiones viejas en un archivo descargable;
  - (b) pasar al plan **Pro (25 USD/mes, 8 GB)**.
- Para ahorrar espacio, médicos, productos y mercados se guardan una sola vez
  en catálogos, y cada fila de recetas apunta a ellos. Cada combinación se
  guarda **tal cual vino** (no se "corrige" nada), por eso la reconstrucción
  da 0 diferencias.

---

## Archivos

| Archivo | Contenido |
|---|---|
| `supabase/migrations/20261028120000_roles_y_equipos.sql` | Roles, distritos, perfiles, visitadores, funciones de permisos |
| `supabase/migrations/20261028120100_datos_versionados.sql` | Versiones, catálogos, recetas, fichero, publicar versión |
| `supabase/migrations/20261028120200_evaluaciones_y_config.sql` | Evaluaciones, historial, configuración compartida (con los valores actuales), registro de fallas |
| `supabase/migrations/20261028120300_seguridad_rls.sql` | Todas las reglas de seguridad por fila |
| `supabase/rollback/20261028120000_deshacer_esquema.sql` | Deshace todo (**solo** en pruebas o antes de cargar datos) |
| `tests/db/` | Pruebas: permisos por rol y "Datos enero" sin pérdidas |

Todas las migraciones son **aditivas**: solo crean cosas nuevas y no tocan
Firebase ni la app actual.

---

## Cómo se aplica (DESPUÉS de tu aprobación, en el Supabase de PRUEBAS)

1. Abre https://supabase.com/dashboard → proyecto **segmentapp-pruebas**.
2. Menú izquierdo → **SQL Editor** → **New query**.
3. Abre en GitHub el primer archivo de `supabase/migrations/` (el que termina
   en `120000_roles_y_equipos.sql`) → ícono **copiar** → pégalo en el editor
   → **Run**. Debe decir *Success. No rows returned*.
4. Repite con los otros 3 archivos, **en orden** (120100, 120200, 120300).
5. **Table Editor**: deben aparecer las tablas `perfiles`, `evaluaciones`,
   `data_snapshots`, etc.
6. **Authentication → Sign In / Providers**: desactiva **"Allow new users to
   sign up"** (nadie puede registrarse por su cuenta).

Si un paso falla, cópiame el mensaje de error (no contiene secretos).

# Esquema de la base de datos (Supabase) — PROPUESTA

> **Estado: aprobado el 28/10/2026.** Migraciones 1 a 8 aplicadas en el
> Supabase de pruebas. La migración 9 (historial para el equipo) falta
> aplicarla.

## Resumen en 6 puntos

1. **Cuatro roles:** `vm`, `gd`, `gte_nacional` y `admin`. Cada persona ve solo
   lo que le toca, y lo controla **la base de datos** (no el navegador).
2. **VM y GD se agregan, mueven o desactivan desde tablas** (sin tocar código).
   Un GD puede tener uno o varios distritos (y por lo tanto varios VM), pero
   **cada distrito tiene un solo GD**, así que **cada VM tiene un solo GD**.
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
- Las **cifras nacionales de mercado** (la etiqueta A+/B/C- de cada médico en
  cada mercado, que necesita las recetas de todo el país) se calculan **en el
  servidor** (Fase 7, función `datos_equipo`). Cada VM o GD recibe solo sus
  médicos y esos totales, nunca las filas ajenas.

**Probado:** 25 pruebas automáticas en un Postgres 16 real demuestran cada fila
de esta tabla (`tests/db/seguridad-por-rol.test.js`). Entre ellas: que un GD
**no** ve los datos de otro GD, que el Gerente Nacional **no** puede editar
nada, y que ni el admin puede borrar.

---

## Preguntas frecuentes

**Si nada se borra, ¿no se generan duplicados?** No:
- Una evaluación "eliminada" queda **marcada** (`eliminado_en`). Los VM, los GD,
  los reportes y las exportaciones **no la ven ni la cuentan**. Solo el admin y
  el Gerente Nacional la pueden consultar, como historial.
- La regla "una evaluación por visitador + médico + mercado" aplica **solo a
  las activas**. Si se elimina una por error y se vuelve a hacer, la nueva es
  la que cuenta y la vieja queda en el historial. Nunca hay dos activas.
- Si alguna vez hiciera falta borrar de verdad (por ejemplo, por una solicitud
  legal), se haría con un procedimiento explícito del admin, no desde la app.

## Versiones de datos ("Hoy" y anteriores)

```
Carga nueva ──► BORRADOR ──(admin revisa y compara)──► PUBLICADO + VIGENTE ("Hoy")
                                                          │
           la versión anterior queda PUBLICADA (consultable) ◄┘
           "Volver a una versión" = publicar de nuevo la anterior
```

- En la app hay un **selector de versión** (botón "Datos: Hoy" arriba):
  "Hoy" (la vigente) por defecto, y la lista de las anteriores publicadas.
  Los borradores solo los ve el admin, en el panel de carga.
- Cada versión guarda además su **archivo comprimido** en un almacén
  **privado** de Supabase (`datos`). La app lo descarga solo con sesión
  iniciada, mediante un enlace que vence en 1 hora (Fase 5). Desde la Fase 7
  ese archivo completo solo lo descargan el admin y el Gerente Nacional; los VM
  y GD reciben únicamente sus médicos con `datos_equipo` (pocos KB).
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
| `supabase/migrations/20261028130000_un_gd_por_distrito.sql` | Regla: cada distrito tiene un solo GD |
| `supabase/migrations/20261029120000_carga_de_datos.sql` | Fase 5: archivo de cada versión, almacén privado `datos`, carga por lotes, comparar versiones |
| `supabase/migrations/20261030120000_datos_por_equipo.sql` | Fase 7: `datos_equipo` (cada VM/GD recibe solo lo suyo) y archivo completo solo para admin y Gte. Nacional |
| `supabase/migrations/20261030130000_orden_mercado.sql` | Arreglo Fase 7: orden nacional por mercado precalculado una vez por versión (`recetas_orden_mercado`) |
| `supabase/migrations/20261031120000_historial_equipo.sql` | Fase 6C: cada VM ve el historial de sus evaluaciones y cada GD el de su distrito |
| `supabase/migrations/20261031130000_historial_medico.sql` | Fase 6E: `historial_medico` (recetas y clasificación de un médico en cada versión publicada; solo si está en tu fichero) |
| `supabase/migrations/20261101120000_tableros_por_rol.sql` | Fase 9B: `evolucion_mercados` (participación por mercado en cada versión), `avance_distrito` (avance del VM y promedio de su distrito, sin nombres) y `bitacora` (quién cambió la configuración o publicó una versión; solo la lee el admin) |
| `supabase/migrations/20261102120000_avisos.sql` | Fase 9C: `avisos_vistos` (hasta cuándo cada persona vio sus avisos; cada una solo ve y cambia su fila) |
| `supabase/migrations/20261103120000_latido.sql` | Fase 10: `latido()` para que el plan gratis no pause el proyecto (lo llama `.github/workflows/latido.yml` cada 2 días) |
| `supabase/migrations/20261104120000_usuarios_admin.sql` | Fase 10C: el admin gestiona usuarios desde Ajustes → Usuarios: `admin_usuarios`, `admin_editar_usuario` (nombre y correo), `admin_clave_temporal` (clave cifrada con bcrypt, marcada como temporal), `admin_activar_usuario`. Cada una exige rol admin |
| `supabase/migrations/20261105120000_claves_temporales_masivas.sql` | Fase 10D: `admin_claves_temporales` da claves temporales a varios usuarios en una sola llamada (todo o nada; nunca al propio admin) |
| `supabase/migrations/20261106120000_desactivar_oculta_visitador.sql` | Fase 11: al desactivar a un VM, `admin_activar_usuario` también marca su visitador como inactivo; la app no muestra sus médicos ni sus números (nada se borra) |
| `supabase/migrations/20261107120000_catalogos_closeup.sql` | Fase 12B: catálogos de CloseUp (`catalogo_especialidades`, `catalogo_laboratorios`, `catalogo_productos` con una fila por producto y `editado_a_mano`, `catalogo_clases`), `admin_guardar_catalogo` (agrega o actualiza, nunca borra) y `configuracion.filtros_closeup`. Solo admin |
| `supabase/migrations/20261108120000_accesos_y_catalogos.sql` | Fase 12C: clases terapéuticas con `nivel` y `padre` (`admin_guardar_clases`), `catalogo_versiones` (historial con el archivo original en el almacén), `admin_crear_usuario` (crea el acceso desde la app: usuario, identidad, perfil y vínculo; clave temporal cifrada), `admin_pendientes_acceso`, y configuración `laboratorios_propios`, `productos_phq_excluidos`, `instructivos_descarga` |
| `supabase/migrations/20261109120000_renombrar_mercados.sql` | Fase 12D-2: renombrar mercados ya cargados en todas las versiones y evaluaciones (`admin_mercados_en_uso`, `admin_renombrar_mercados`, `admin_deshacer_renombre`). Cada cambio queda en `mercados_renombres` (con lo necesario para deshacerlo) y en la bitácora; nada se borra. Si el nombre nuevo ya existe, junta las versiones (nunca dos mercados de la misma versión). Solo admin |
| `supabase/migrations/20261110120000_espacio_usado.sql` | Fase 12E: `admin_espacio` (tamaño de la base, de los archivos del almacén y de las tablas más grandes; solo lee, solo admin). Lo muestra Ajustes → Salud de los datos y la campanita avisa al pasar del 80% del plan gratis |
| `supabase/migrations/20261111120000_visitadores_fuera_de_metricas.sql` | Fase 12E: `visitadores.en_metricas` (false = tiene acceso pero no cuenta en las métricas del GD ni nacionales) y `admin_metricas_visitador` (solo admin, queda en la bitácora). Nada se borra |
| `supabase/rollback/…` | Archivos para **deshacer**. **No se aplican** salvo que haya que revertir algo |
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

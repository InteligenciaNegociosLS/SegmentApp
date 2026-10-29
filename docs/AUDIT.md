# Auditoría de SegmentApp (v29)

> **Fase 1. Solo lectura.** No se modificó ningún archivo de código.
> Fecha: 28/10/2026 · Rama analizada: `rediseno` (commit `29c96f7`).
> Los números de tiempos se midieron en un servidor (Node 22). En un teléfono o
> iPad conviene multiplicarlos por 3 a 5.

---

## Resumen en 10 líneas

1. La app es **una sola página HTML** con 15 archivos JavaScript. No hay
   herramienta de construcción (ni `package.json`), ni pruebas, ni `.gitignore`.
2. Cada usuario **descarga y procesa los datos completos**: 8,8 MB comprimidos,
   que se convierten en **231.729 filas de recetas** y **7.308 filas de fichero**.
   En el servidor eso tomó unos **5,5 s** y unos **500 MB de memoria**. En un iPad
   puede tardar **15 a 30 s** o cerrar la pestaña.
3. **Seguridad crítica.** Las claves de los visitadores se guardan **sin cifrar**
   en Firestore, y cualquiera que abra la página puede leerlas. El "modo
   administrador" se puede activar sin clave (basta con editar
   `sessionStorage` en el navegador). Además hay una clave de administrador por
   defecto escrita en el código.
4. **Datos personales expuestos.** El fichero médico (correos, cédulas,
   teléfonos y cumpleaños de médicos) se publica como archivo descargable en
   Vercel, y está guardado en el historial de GitHub.
5. **No existe el rol GD.** Solo hay invitado, visitador y administrador. Los
   GD aparecen únicamente como un filtro dentro del panel de administración.
6. Un **invitado sin login ve toda la matriz** con los datos de recetas de todos
   los médicos.
7. La **ponderación de la encuesta y la lista de productos** se guardan solo en
   el navegador de quien las cambia. Lo que el admin ajusta no llega a los
   visitadores.
8. Hay **riesgo de perder evaluaciones**: el botón "Recargar" borra la cola de
   evaluaciones hechas sin conexión que aún no se subieron.
9. La sincronización "incremental" **no se entera de los borrados** y puede
   **no mostrar evaluaciones hechas sin conexión**.
10. Hay funciones que se llaman desde la pantalla pero **no existen**: la vista
    por institución y la carga manual de archivos no funcionan.

---

## 1. Estructura de carpetas y tecnologías

```
SegmentApp/
├── index.html              103 KB  Toda la interfaz (1.228 líneas, 13 ventanas emergentes)
├── css/styles.css           12 KB  Estilos propios (matriz, celdas, animaciones)
├── js/                     247 KB  Lógica, sin minificar (≈5.300 líneas)
│   ├── firebase-init.js     Conexión a Firebase + login anónimo
│   ├── config.js            Constantes: archivos, productos PHQ, pesos de encuesta
│   ├── state.js             Estado global compartido (window.App.state)
│   ├── ui.js                Toast, formato de números, pestañas
│   ├── data.js              Descarga .gz, lectura CSV/Excel, caché IndexedDB
│   ├── filters.js           Filtros desplegables y búsqueda
│   ├── matrix.js            Cálculo de la matriz 9 cuadros + tabla principal
│   ├── evaluation.js        Encuesta/evaluación del visitador y sincronización
│   ├── admin.js             Panel admin, claves, ponderación, productos, borrados
│   ├── auth.js              Login de visitador, sesión, cambio de pantalla por rol
│   ├── modals.js            Detalle del médico y composición del mercado
│   ├── exports.js           Exportar Excel / PDF / imagen PNG
│   ├── offline.js           Cola de evaluaciones sin conexión
│   ├── reports.js           Reportes avanzados (por GD, línea y visitador)
│   └── main.js              Arranque de la app
├── datacloseup.csv.gz      7,8 MB  Recetas (CloseUp) que usa la app
├── fichero_medico.csv.gz   1,1 MB  Fichero médico que usa la app
├── fichero_medico.csv      5,0 MB  Copia SIN comprimir (la app no la usa)
├── datacloseup.xlsx       19,1 MB  Copia en Excel (la app no la usa)
├── vercel.json                     Solo reglas de caché para .csv y .csv.gz
├── README.md                       Dice "SegmentApp-Beta" (desactualizado)
└── CLAUDE.md                       Reglas del proyecto (Paso 0)
```

La carpeta `.git` pesa **95 MB**, porque los datos se han subido muchas veces.

### Librerías (todas se cargan desde internet, CDN)

| Librería | Versión | Cómo se carga | Para qué |
|---|---|---|---|
| Tailwind CSS (Play CDN) | sin versión fija | Siempre, al abrir | Estilos. **Es la versión "de prueba"**: arma los estilos dentro del navegador en cada visita. Tailwind no la recomienda para producción. |
| Chart.js | **sin versión fija** (`/npm/chart.js`) | Siempre | Gráficos. Al no fijar versión, una actualización externa puede romper la app sin aviso. |
| chartjs-plugin-datalabels | 2.0.0 | Siempre | Etiquetas en gráficos |
| localForage | 1.10.0 | Siempre | Guardar en IndexedDB |
| Firebase (app, auth, firestore) | 11.6.1 | Siempre (módulo ES) | Base de datos y login anónimo |
| SheetJS (xlsx) | 0.18.5 | Bajo demanda | Exportar/leer Excel |
| jsPDF + autotable | 2.5.1 / 3.5.29 | Bajo demanda | Exportar PDF |
| html2canvas | 1.4.1 | Bajo demanda | Imagen PNG de la matriz |
| Google Fonts: Outfit, Inter, Material Symbols | — | Siempre | Tipografía e íconos (**no es Roboto Flex**) |

**Hosting:** Vercel, como sitio estático. No hay paso de construcción ni
funciones de servidor.

---

## 2. Cómo se cargan hoy los archivos .gz

### Dónde están y cuánto pesan (medido)

| Archivo | Comprimido | Descomprimido | Filas | Columnas | Separador |
|---|---|---|---|---|---|
| `datacloseup.csv.gz` (recetas) | **7,76 MB** | **46,5 MB** | 231.729 | 15 | `;` (UTF‑8 con BOM) |
| `fichero_medico.csv.gz` | **1,07 MB** | 5,0 MB | 7.308 | 119 | `;` (UTF‑8 con BOM) |

Los nombres de los archivos están fijos en `js/config.js` (`FILES.AUDIT` y
`FILES.FICHERO`).

### Columnas del archivo de recetas (CloseUp)

| # | Columna | Valores distintos | Campo interno |
|---|---|---|---|
| 0 | Medico | 28.655 | `doc` |
| 1 | Matricula | 28.278 | `license` |
| 2 | Mercado | 32 | `market` |
| 3 | Producto | 1.233 | `prod` |
| 4 | Px_Product (recetas) | 225 | `rx` (total: 801.007) |
| 5 | Medico Unico | 28.715 | *(se ignora)* |
| 6 | Domicilio | 11.324 | `address` |
| 7 | Cod.Postal | 252 | `zip` |
| 8 | Localidad | 665 | `city` |
| 9 | Region | 6 | `region` |
| 10 | Especialidad | 38 | `spec` |
| 11 | Molecula | 288 | `molecule` |
| 12 | Clase Terapeutica | 1 ("SIN DATOS") | `class` |
| 13 | Generico | 2 | `generic` |
| 14 | Laboratorio | 161 | `lab` |

> **Frágil:** la app lee las columnas **por su posición**, no por su nombre
> (`data.js:286`). Si alguien agrega o mueve una columna en el Excel, los datos
> se mezclan sin dar ningún error.

### Columnas del fichero médico (119 en total; las que usa la app)

- `Matricula`: la llave para cruzar con CloseUp (5.645 matrículas distintas).
- `Nombre del sector`: el nombre del **visitador** (51 distintos).
- `NOME_GER_DIS`: el **Gerente de Distrito** (7 valores; uno es
  "VACANTE CENTRO GD").
- `Equipo`: la línea (7 equipos). La regla "Equipo 7 = OTC, el resto =
  Pharmetique" está escrita dentro del código (`reports.js:39`).
- `Nombre`, especialidades, dirección y `LOCAL_GPS_LAT/LON` para el detalle del
  médico.
- El resto (correos, cédula, teléfonos, cumpleaños, %pacientes…) se muestra
  completo en el detalle del médico.

Problemas de los datos:
- La columna `Cumpleaños` está repetida, así que la segunda tapa a la primera.
- Las coordenadas GPS vienen con puntos de miles (`102.092.958` en lugar de
  `10.2092958`), así que el botón "Ver ubicación" abre un punto equivocado del mapa.
- Solo **2.705 de las 5.645 matrículas del fichero (48 %)** aparecen en CloseUp.
- La columna del visitador se adivina buscando palabras como "asesor",
  "visitador" o "representante" en el nombre de la columna (`data.js:56`).

### Cómo los procesa la app (paso a paso)

1. Al abrir, `initStorage()` busca una copia guardada en IndexedDB.
2. Si no la encuentra, `loadRepoData()` descarga **los dos archivos completos**
   con una barra de progreso (`fetch` con `force-cache`).
3. Descomprime en el navegador (`DecompressionStream('gzip')`).
4. `parseCSVFast()` convierte el texto en objetos usando una expresión regular.
5. `parseAuditData()` arma 231.729 objetos en memoria, y `parseFicheroData()`
   arma un mapa por matrícula.
6. `aggregateAndCalculate()` agrupa por médico y calcula participación (share),
   Pareto, brecha (gap) y cuadrante, **en el navegador y cada vez que cambia
   un filtro**.

Tiempos medidos en el servidor:

| Paso | Tiempo |
|---|---|
| Descomprimir recetas | 0,37 s |
| Convertir CSV en objetos | 1,26 s |
| Normalizar recetas | 0,57 s |
| Normalizar fichero | 0,35 s |
| Guardar copia en IndexedDB (JSON de **76 MB**) | 2,2 s |
| Leer esa copia | 0,8 s |
| Memoria usada | **≈ 514 MB** |

> **Error importante:** cuando los datos vienen del repositorio,
> `processData(true)` **no los guarda** en IndexedDB (`main.js:43`). Por eso la
> caché casi nunca se usa, y cada visita repite la descarga y el procesamiento.
> Solo se guarda cuando el admin cambia la ponderación o los productos. A partir
> de ahí **ese navegador queda con datos viejos para siempre**, hasta pulsar
> "Recargar".

---

## 3. Firebase

**Servicios usados:** solo **Firestore** y **Auth (anónimo)**. No se usan
Storage ni Functions. El proyecto es `segmentapp-1b237`.

La configuración (incluida la `apiKey`) está escrita en `js/firebase-init.js`.
En Firebase, esa llave **no es secreta** por sí misma: toda la protección depende
de las reglas de seguridad.

### Colecciones (todas cuelgan de `artifacts/segmentapp-local/...`)

| Ruta | ID del documento | Campos | Uso |
|---|---|---|---|
| `artifacts/{app}/public/data/claves_visitadores` | Nombre del visitador (ej. `JUAN PEREZ`) | `clave` (**texto plano**), `asignado_en` | Login de visitadores |
| `artifacts/{app}/public/data/evaluaciones_matriz` | `{VISITADOR sin espacios}_{matrícula}_{MERCADO sin espacios}` | `visitador`, `medico_id`, `medico_name`, `mercado`, `cuadrante`, `notas`, `survey{q1..q5}`, `timestamp` (texto ISO), `_user_role`, `cruceErrado`, `nombreFichero` | Evaluaciones y encuestas |
| `artifacts/{app}/config/admin_settings` | documento único | `clave`, `creado_en` | Clave de administrador |

`{app}` vale `segmentapp-local`. Es un resto del entorno donde nació la app
(variable `__app_id`).

**Relaciones** (no hay llaves reales; todo se une por texto):
- evaluación → médico, por `medico_id` (matrícula, sin ceros a la izquierda).
- evaluación → visitador, por `visitador` (nombre en texto).
- visitador → GD: **no se guarda en Firebase**. Se deduce del fichero
  (`NOME_GER_DIS`).

### Reglas de seguridad

No están en el repositorio. El dueño del proyecto las copió desde Firebase
Console el 28/10/2026. Están bien pensadas (todo cerrado por defecto, permisos
por rol con `role`, `visitadorName` y `managerName`), pero tienen una
**excepción "TEMPORAL"** que lo abre casi todo:

```
!('role' in request.auth.token)   // TEMPORAL: producción aún usa login anónimo
```

Como la app inicia sesión en modo anónimo, **nadie tiene `role`**, y esa
excepción deja pasar a cualquiera que abra la página:

| Ruta | Lectura | Escritura | Borrado |
|---|---|---|---|
| `evaluaciones_matriz` | 🔴 Cualquiera, todas | 🔴 Cualquiera puede crear o modificar cualquiera | ✅ Solo `role == 'admin'`, **que hoy nadie tiene** |
| `claves_visitadores` | 🔴 Cualquiera (incluye las claves) | 🔴 Cualquiera puede **cambiar la clave de otro** | 🔴 Cualquiera |
| `config/admin_settings` | 🔴 Cualquiera (incluye la clave admin) | 🔴 Cualquiera puede cambiarla | 🔴 Cualquiera |
| `visitador_directory` | Todos | Nadie | Nadie |

Consecuencias:
- Se confirman C1, C2 y C3 (§5). Además, **cualquiera puede sobrescribir
  claves y evaluaciones ajenas**.
- **Buena noticia:** como ningún usuario tiene el permiso `admin` real, los
  botones "Eliminar evaluación", "Borrar las de este asesor" y "Limpiar Datos"
  **fallan hoy con error de permisos**. No se ha podido borrar nada desde la app.
- La colección `visitador_directory` (solo nombres, sin claves) ya está prevista
  en las reglas, pero la app no la usa: sigue leyendo `claves_visitadores`.
- La regla de `gerente` exige un campo `gerente` en cada evaluación, y las
  evaluaciones no lo tienen.

Las instrucciones para cerrar esta excepción sin perder datos están en
`docs/URGENTE_SEGURIDAD.md`.

---

## 4. Login y roles hoy

| Rol | Cómo entra | Qué ve |
|---|---|---|
| **Invitado** (sin login) | Abre la página | **La matriz completa, la tabla de todos los médicos con recetas, el ranking de productos y el detalle de cada médico** (incluidos sus datos de fichero) |
| **Visitador (VM)** | Elige su nombre de una lista + clave | Solo los médicos de su fichero; puede evaluar |
| **Administrador** | Una sola clave compartida | Todo; puede editar y borrar evaluaciones, asignar claves y ver reportes |
| **GD** | **No existe** | Solo es un filtro "Todos los Gerentes" en el panel admin |

Cómo funciona por dentro:
1. `firebase-init.js` inicia una sesión **anónima** en Firebase. Todos los
   usuarios son "anónimos" para la base de datos.
2. El login del VM baja el documento con su clave y **compara la clave en el
   navegador** (`auth.js:69`).
3. Si coincide, guarda `userRole` y `userName` en `sessionStorage`.
4. Al recargar, `checkAuthentication()` **cree lo que diga `sessionStorage`**,
   sin verificar nada más.

Fallas graves:
- 🔴 **Cualquiera puede leer todas las claves** (DevTools → Network, o la
  consola).
- 🔴 **Cualquiera puede hacerse admin** escribiendo
  `sessionStorage.userRole='admin'` y recargando.
- 🔴 **Clave de admin por defecto en el código** (`admin.js:54`). Si el
  documento `admin_settings` no existe, la app lo crea con esa clave.
- 🔴 El admin ve las claves de los VM en texto plano en la pantalla "Claves".
- 🟠 Un VM puede ver los datos de otro VM: basta cambiar `userName` en
  `sessionStorage`.

---

## 5. Errores, funciones frágiles y código duplicado (por prioridad)

### 🔴 Crítico (seguridad o pérdida de datos)

| # | Problema | Dónde |
|---|---|---|
| C1 | Claves de VM en texto plano y legibles por cualquiera | `auth.js:26-45`, `admin.js:630-666` |
| C2 | Rol de admin falsificable desde el navegador | `auth.js:88-110` |
| C3 | Clave de admin por defecto escrita en el código | `admin.js:54-59` |
| C4 | Datos personales de médicos publicados en Vercel y guardados en el historial de Git | `fichero_medico.csv(.gz)` |
| C5 | Un invitado sin login ve todos los datos | `auth.js:94-109` |
| C6 | ✅ *(Corregido; ver Fase 8)* **"Recargar" borra la cola sin conexión** (`localforage.clear()`): las evaluaciones hechas sin internet y no subidas se pierden | `ui.js:143-148` |
| C7 | "Limpiar Datos" intentaría borrar **todas** las evaluaciones con un solo clic de confirmación. Hoy lo frenan las reglas (ver §3), pero en cuanto exista un admin real el botón funcionaría | `admin.js:400-427` |

### 🟠 Alto (resultados incorrectos)

| # | Problema | Dónde |
|---|---|---|
| A1 | La ponderación de la encuesta, los umbrales y la lista de productos PHQ se guardan **solo en el navegador** de quien los cambia. Cada VM calcula con valores distintos. | `admin.js:514-599`, `data.js:312` |
| A2 | ✅ *(Resuelto con Supabase y la cola de la Fase 8)* La sincronización incremental **no detecta borrados**: lo que el admin elimina sigue apareciendo en las cachés (incluso en la del propio admin) | `evaluation.js:97-136`, `:224-253` |
| A3 | ✅ *(Resuelto con Supabase y la cola de la Fase 8)* Las evaluaciones hechas **sin conexión** llevan la hora en que se hicieron. Al subirse después, quedan "antes" de la última sincronización del admin, que **nunca las ve** (salvo borrando su caché) | `evaluation.js:463`, `:227` |
| A4 | ✅ *(Resuelto con Supabase y la cola de la Fase 8)* La sincronización compara horas de distintos equipos. Si el reloj de un teléfono está mal, se pierden evaluaciones | `evaluation.js:88`, `:215` |
| A5 | Los datos del repositorio no se guardan en caché, pero la copia del admin sí, y queda congelada (ver §2) | `main.js:43-83` |
| A6 | Se leen las columnas de CloseUp por posición | `data.js:282-307` |
| A7 | La matriz "Encuesta" usa la **primera** evaluación que encuentra, sin importar el mercado | `matrix.js:407-409` |
| A8 | Las evaluaciones se identifican solo por matrícula: dos médicos con la misma matrícula y distinto nombre se mezclan | `data.js:24`, `matrix.js:292` |
| A9 | Nadie puede cargar archivos a mano: el botón "Cargar Datos" está siempre oculto, y la ventana usa `XLSX` sin cargar la librería | `admin.js:93-98`, `data.js:131` |
| A10 | El botón "Productos" se oculta al admin y se muestra a invitados y VM (parece estar al revés). Un VM puede cambiar su lista de productos y alterar sus cifras | `admin.js:91-99` |

### 🟡 Medio

| # | Problema | Dónde |
|---|---|---|
| M1 | `openInstitutionModal` y `filterInstitutionModal` **no existen**: en la vista por institución, tocar una fila no hace nada | `matrix.js:586`, `index.html` |
| M2 | Los nombres, mercados y notas se insertan como HTML sin escaparlos. Un nombre con `<` o comillas puede romper la pantalla o permitir inyectar código (XSS) | `admin.js`, `matrix.js`, `modals.js` |
| M3 | La consulta `visitador == X y timestamp > Y` necesita un índice compuesto en Firestore. Si falta, falla y se queda con la caché sin avisar con claridad | `evaluation.js:98` |
| M4 | Al guardar, Q1 y Q5 se copian a los demás mercados del médico sin esperar respuesta ni manejar errores | `evaluation.js:499-515` |
| M5 | Los borrados masivos se hacen de uno en uno (lento; si falla a la mitad, queda a medias) | `admin.js:411-416` |
| M6 | El botón CloseUp/Encuesta cambia clases con `classList.replace` en cadena; tras varios cambios el estilo queda mal | `matrix.js:218-244` |
| M7 | Las coordenadas GPS están mal formateadas, así que el mapa se abre en un lugar incorrecto | datos del fichero |
| M8 | Hay reglas de negocio escritas en el código: "Equipo 7 = OTC", 70 productos PHQ, pesos de la encuesta | `reports.js:39`, `config.js` |
| M9 | Se usan `alert()` y `confirm()` nativos, que rompen el estilo y en iOS son incómodos | varios |

### 🟢 Bajo / deuda técnica (código duplicado)

- La ruta `artifacts/{appId}/public/data/...` y la línea
  `const appId = typeof __app_id ...` se repiten **12 veces** (y la ruta `'artifacts', appId, ...` 13 veces). Un solo
  helper lo resolvería.
- El cálculo "visitadores de un médico" (`getFicheroRepKey` + `toUpperCase`) se
  repite en `admin.js`, `filters.js`, `matrix.js` y `reports.js` (×2).
- La lógica de "clasificar share en A/B/C" está repetida 5 veces
  (`matrix.js` ×3, `modals.js`, `matrix.js` institución).
- Las estadísticas por visitador se calculan dos veces, casi igual
  (`admin.renderAdminDashboard` y `reports.calculateStats`).
- Cada módulo crea ~10 alias `window.xxx = window.App.xxx.xxx` para que funcionen
  los `onclick` del HTML: ~120 funciones globales.
- `fetchEvaluacionesYCalcular` y `fetchAllEvaluacionesAdmin` son casi el mismo
  código.
- `fichero_medico.csv` y `datacloseup.xlsx` están duplicados y la app no los usa.
- Quedan comentarios de trabajo ("Pedido 2", "Bloque 2", "Entrega 2") y bloques
  mal indentados.

---

## 6. Por qué la app es lenta

| Causa | Números | Efecto |
|---|---|---|
| **Descarga completa de los datos** | 8,8 MB por usuario y visita (la caché casi no se usa, ver §2) | En datos móviles en Venezuela: de 10 s a más de 1 min |
| **Todo se procesa en el teléfono** | ≈ 3,5 s de CPU en servidor → **10 a 20 s en iPad** | La pantalla se congela mientras dice "Procesando base de datos…" |
| **Memoria** | ≈ 500 MB para 231 mil filas | iPad y teléfonos de gama media pueden **cerrar la pestaña** |
| **Recalcular todo con cada filtro** | `aggregateAndCalculate()` recorre las 231 mil filas cada vez que se marca una casilla | Cada clic en un filtro tarda segundos |
| **Búsquedas lentas** | `getEvaluationsForDoc` (admin) filtra **todas** las evaluaciones por cada médico; `doctors.find()` dentro de un bucle; `isPhq` compara contra 70 productos en cada fila | Crece muy rápido con más evaluaciones |
| **Tailwind Play CDN** | Script de ≈ 100 KB+ que genera los estilos en el navegador | Página sin estilo al principio y más CPU |
| **Todo el HTML de una vez** | `index.html` de 103 KB con 13 ventanas emergentes siempre cargadas | Más tiempo hasta la primera pantalla |
| **Sin versiones fijas, sin minificar** | 247 KB de JS propio sin comprimir; Chart.js sin versión | Peso extra y riesgo de que se rompa |
| **Fuentes** | 3 familias de Google Fonts, Material Symbols completo con todos sus ejes | Cientos de KB extra |

No pude medir con Lighthouse desde aquí: la red de este entorno bloquea los CDN.
Lo haremos en la Fase 7 sobre el enlace de Preview, para tener el "antes" y el
"después".

---

## 7. Pantallas y flujos, con sus problemas de UX

Todo ocurre en **una sola página**. Lo que cambia son bloques que se muestran u
ocultan, y ventanas emergentes.

| Pantalla / ventana | Quién | Problemas de UX |
|---|---|---|
| **Carga inicial** ("Iniciando sistema…") | Todos | Espera larga con barra de MB. El usuario no sabe qué está pasando ni cuánto falta. |
| **Estado vacío** | Todos | Ofrece "Activar Modo Admin" a cualquiera. |
| **Barra superior** | Todos | Muchos botones pequeños (menos de 48 px). "Recargar" borra todo sin explicar el riesgo. La versión y el nombre del desarrollador ocupan espacio. |
| **Login VM** (ventana) | VM | Lista desplegable con ~51 nombres, sin buscador. La clave la asigna el admin y el VM no la puede cambiar. |
| **Login Admin** (ventana) | Admin | Una sola clave compartida, sin usuario. |
| **Tablero del visitador** ("Tu progreso") | VM | Muestra tres barras confusas: "Fichero CRM", "Cruzados", "Evaluados". |
| **Fila de inteligencia** (competidor + composición) | Invitado/Admin | Las etiquetas se cortan ("XAROX..: 3%"). |
| **Tarjetas KPI** (médicos, recetas, share) | Todos | Están bien; falta explicar qué es el "share". |
| **Panel de filtros** (9 filtros + buscador) | Todos | 9 desplegables en móvil ocupan toda la pantalla. Todos empiezan en "Todos". El filtro "Clase Terapéutica" solo tiene un valor. Cada clic recalcula todo y se congela. |
| **Matriz 9 cuadros** | Todos | Ancho mínimo de **850 px**: en el teléfono hay que desplazarse de lado. Los datos de cada celda están en letra de 10 px. El tooltip con el mejor médico solo aparece al pasar el ratón (no existe en pantallas táctiles). |
| **Tabla de médicos** (50 por página) | Todos | En móvil es una tabla horizontal de 7 u 8 columnas. Solo trae botones Anterior/Siguiente. La búsqueda se lanza con cada tecla. |
| **Detalle del médico** (pestañas Fichaje / Mercado) | Todos | Vuelca las **~119 columnas del fichero** en tarjetas, incluidos datos personales. El mapa se abre en un sitio equivocado. |
| **Composición del mercado** | Todos | Reutiliza la ventana del médico. Funciona. |
| **Vista por institución** | Todos | **Tocar una fila no hace nada** (función inexistente). |
| **Evaluación / encuesta** | VM, Admin | Es el flujo central: elegir mercado → 4 preguntas → cuadrante → justificación obligatoria → guardar → pasa al siguiente mercado. El formulario es largo dentro de una ventana. Los errores se marcan con un borde rojo que dura 3 s. Si hay mercados pendientes, el modal "salta" solo al siguiente. El "Cruce errado" se entiende poco. |
| **Panel de control del equipo** | Admin | Progreso por visitador + alertas de discrepancia. "Limpiar Datos" está al lado de "Descargar" (peligroso). |
| **Reportes avanzados** | Admin | Gráfico de 500 px de alto. Selector de visitadores con casillas. Es útil, pero es una ventana a pantalla completa, no una pantalla propia. |
| **Ajustes** (sliders + simulador) | Admin | Los cambios en los sliders no se guardan. |
| **Claves** | Admin | Muestra todas las claves en texto plano. |
| **Ponderación** | Admin | Los cambios no llegan a los VM (§5 A1). |
| **Productos PHQ** | Invitado/VM (¡no al admin!) | Está al revés (§5 A10). |
| **Exportar** (columnas → Excel/PDF/PNG) | Todos | Funciona. Descarga la tabla completa filtrada, también para invitados. |
| **Cargar datos** | Nadie | Botón siempre oculto y ventana rota (§5 A9). |

Problemas generales de diseño:
- **No hay un sistema de diseño.** Mezcla colores de Tailwind (`indigo`,
  `blue`, `purple`, `rose`, `emerald`…) con colores M3 escritos a mano en
  `styles.css`. Los botones tienen bordes de distintos radios
  (`rounded-xl`, `rounded-full`, `rounded-[2rem]`).
- Hay **4 o 5 estilos de hover distintos** (escala, brillo, color de fondo,
  rotación, sombra) y tiempos de animación de 0,1 s a 0,5 s.
- Tipografía: Outfit + Inter, cuando lo pedido es Roboto Flex.
- `user-scalable=no` impide hacer zoom (problema de accesibilidad en iOS).
- Hay textos de 8 a 10 px por todas partes (`text-[9px]`, `text-[10px]`).
- No hay modo oscuro ni estados de error o vacío uniformes.

---

## 8. Variables de entorno y configuración de Vercel

### Hoy

- **No hay variables de entorno.** La configuración de Firebase está escrita en
  el código.
- `vercel.json` solo define caché de 1 día (+30 días "stale") para `.csv` y
  `.csv.gz`. Por eso un archivo nuevo puede tardar hasta un día en llegar a los
  usuarios, y además la app pide `force-cache`.
- No hay build: Vercel publica los archivos tal cual. Cualquier archivo del repo
  queda público en la URL, incluidos los `.csv`, `.xlsx` y `CLAUDE.md`.

### Lo que hará falta (se documentará en Fase 2, en `docs/ENTORNOS.md`)

| Variable | Dónde | Comentario |
|---|---|---|
| `VITE_SUPABASE_URL` (o similar) | Preview (pruebas) y Production (real) | Pública |
| `VITE_SUPABASE_ANON_KEY` | Preview y Production | Pública; la protección va en las reglas por fila (RLS) |
| `SUPABASE_SERVICE_ROLE_KEY` | **Solo** en scripts de migración que ejecutas tú; **nunca** en Vercel ni en el navegador | Secreta |
| `FIREBASE_*` (lectura) | Solo para los scripts de migración (Fase 4) | Secreta (cuenta de servicio) |
| `APP_ENV` = `preview` / `production` | Preview y Production | Para mostrar "PRUEBAS" en la app de Preview |

Además, en Vercel habrá que configurar un comando de build y la carpeta de
salida cuando pasemos a un proyecto con herramienta de construcción (Fase 2).

---

## Propuesta de orden de trabajo

Mantengo tus fases, con estos ajustes:

1. **Urgente, antes de seguir (propuesta, no lo hago sin tu OK):** mitigar
   C1–C3 en la versión actual de producción (`main`), porque hoy cualquiera
   puede leer las claves y hacerse admin. Lo mínimo es que **tú cambies la clave
   de admin** desde Firebase Console y endurezcas las reglas de Firestore.
   También sacar los datos personales del fichero de la carpeta pública. Esto
   toca `main`, así que **lo decides tú**; yo solo puedo preparar las
   instrucciones.
2. **Fase 2 – Base técnica.** Pasar a un proyecto con build (Vite), versiones
   fijas, Tailwind compilado, `.gitignore`, `.env.example`, registro de errores
   y pruebas del cálculo de la matriz (share, Pareto, cuadrantes, puntaje de
   encuesta) para asegurar que el rediseño no cambie los resultados.
3. **Fase 3 – Esquema Supabase.** Tablas `medicos`, `recetas`, `fichero`,
   `visitadores`, `gerentes_distrito`, `evaluaciones`, `configuracion`
   (ponderación y productos **compartidos**) y `data_snapshots`. RLS por rol.
4. **Fase 4 – Migración.** Las evaluaciones de Firestore y las claves **no se
   migran como claves**: Firebase no guarda hashes, guarda texto plano. Lo
   recomendable es crear usuarios nuevos en Supabase Auth y que cada uno defina
   su clave con un enlace. Lo vemos en esa fase.
5. **Fase 5 – Carga de datos por pantalla.** Corrige A6 (columnas por nombre) y
   A9.
6. **Fase 7 antes que la 6 (sugerencia).** Con los cálculos en el servidor, la
   app pasa de 8,8 MB a unos pocos KB por pantalla. Rediseñar sobre la versión
   rápida evita hacer el trabajo dos veces. Si prefieres el orden original,
   también funciona.
7. **Fase 6 – Rediseño MD3** · **Fase 8 – PWA/offline** (corrige C6, A2–A4 con
   una cola real) · **Fase 9 – Accesos y cierre**.

## Riesgos principales

| Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|
| Alguien lee las claves o entra como admin **hoy** | Alta | Alto | Paso urgente 1 |
| Datos personales de médicos expuestos (Vercel + historial de GitHub) | Alta | Alto (legal y de reputación) | Quitar los archivos de la carpeta pública. Limpiar el historial de Git es una decisión aparte, porque reescribe el historial |
| Los números de la matriz cambian sin querer durante el rediseño | Media | Alto | Pruebas automáticas del cálculo en la Fase 2, comparando contra los resultados actuales |
| Pérdida de evaluaciones durante la migración | Baja | Muy alto | Firebase queda intacto en solo lectura + script de validación (Fase 4) |
| Los VM pierden evaluaciones offline al pulsar "Recargar" en la versión actual | Media | Medio | Avisar al equipo que no use "Recargar" con evaluaciones pendientes |
| Archivos de CloseUp con columnas en otro orden | Media | Alto | Validación por nombre de columna (Fase 5) |
| Discrepancia entre "~60 VM / 6 GD" (lo que me dijiste) y el fichero (**51 visitadores, 7 GD** contando "VACANTE CENTRO GD") | — | Medio | **Confirmar contigo** cuál es la fuente de verdad de los usuarios |
| Conexión lenta en campo | Alta | Medio | Consultas paginadas + PWA offline |

---

### Preguntas para ti antes de la Fase 2

1. ¿Me pasas las **reglas actuales de Firestore** (Firebase Console → Firestore → Reglas)?
2. ¿Los ~60 VM y 6 GD salen del fichero, o hay otra lista oficial? (El fichero tiene 51 y 7.)
3. ¿Quieres que prepare las instrucciones del **paso urgente 1** (claves y datos personales en producción)?
4. ¿Prefieres hacer la Fase 7 (velocidad) antes que la 6 (rediseño)?

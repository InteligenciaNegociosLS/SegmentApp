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
- Usuarios de prueba creados en PRUEBAS (admin, gte nacional, 2 GD, 2 VM).
  Solo pueden entrar los que conservaron su clave hasta configurar el correo
  propio (SMTP) en la Fase 9.

## 28/10/2026 (Fase 5 aprobada)

- La app de `rediseno` pasa a usar **Supabase** para todo: iniciar sesión,
  datos, evaluaciones y configuración. La app de `main` (Firebase) no cambia.
- **Datos privados:** los `.gz` ya no se publican en la web. Cada versión
  guarda su archivo en el almacén privado de Supabase y se descarga solo
  después de iniciar sesión. Los `.gz` **siguen en el repositorio** como
  respaldo (no se borran). Es una solución intermedia: en la Fase 7 la app
  consultará la base directamente.
- **Carga de datos solo para el admin:** Excel o CSV → revisión fila por fila
  (sin cambiar nada) → borrador → comparación con "Hoy" → Publicar. Se puede
  volver a cualquier versión anterior. Nada se borra; un borrador se puede
  "archivar".
- **GD y Gerente Nacional entran en modo consulta:** ven el panel del equipo
  (el GD, solo sus visitadores) pero sin botones de editar ni eliminar.
- **Selector "Datos: Hoy"** para todos: ver una versión anterior solo afecta
  a quien la elige, en esa pestaña.
- Fase 5 aprobada por el dueño el 29/10/2026 (probó el Preview con su usuario
  admin). La clave se cambió desde Supabase porque el correo gratuito de
  Supabase envía muy pocos mensajes por hora (se resolverá con SMTP propio).
- En Supabase (Authentication → URL Configuration) se puso como Site URL la
  dirección de Vercel y se permitieron todas las direcciones de prueba de
  Vercel, para que el enlace de recuperación no lleve a `localhost`.

## 29/10/2026 (Fase 7: velocidad)

- **VM y GD reciben solo sus médicos** (función `datos_equipo` en Supabase):
  ya no descargan ni procesan las 231 mil filas del país. El admin y el
  Gerente Nacional siguen usando el archivo completo, porque ven todo.
- **Mismos resultados:** comprobado con los datos reales (VM NEIVIS PARRA y
  su GD con 10 visitadores): matriz, recetas, brecha y etiqueta por mercado
  idénticas. Detalle en `docs/RENDIMIENTO.md`.
- **Cambios visibles para VM y GD (pequeños):**
  - "Principal competidor" y el gráfico de competencia se calculan con
    **sus** médicos (antes, con los de todo el país).
  - Las listas de los filtros (mercados, regiones, especialidades…) muestran
    solo lo que existe en **sus** médicos.
  - Un médico **sin recetas** cuya matrícula también aparece en el fichero de
    otro visitador ahora muestra el nombre de **su propia** fila del fichero
    (antes podía mostrar el de la fila del otro visitador). Con los datos
    actuales: 1 caso para NEIVIS PARRA y 3 en su distrito.
- El archivo completo ya **no** lo pueden descargar los VM ni los GD
  (seguridad: antes, con sesión, cualquiera podía bajarlo).
- Se deja para la Fase 6 (rediseño) quitar el Tailwind en línea y cambiar las
  fuentes, porque esa fase rehace los estilos.
- **Arreglo (29/10/2026):** en el Supabase real, la entrada de un VM daba
  "statement timeout": `datos_equipo` calculaba en cada consulta el orden
  nacional de las 231 mil recetas, y Supabase corta a los 8 s. Ahora ese
  orden se calcula **una vez por versión** (migración 8) y se guarda en
  `recetas_orden_mercado`. Al subir o publicar recetas, la app lo prepara
  sola ("Preparando la versión para los visitadores: mercado X de 32").
- Arreglo aplicado por el dueño en PRUEBAS: el VM ya entra bien. Fase 7
  aprobada.

## 29/10/2026 (Fase 6: rediseño Material 3 Expressive)

- Los estilos se **generan antes de publicar** (`css/app.css`) en vez de
  armarse en el navegador con el Tailwind en línea: la página ya no aparece
  sin estilo al abrir y pesa menos (≈ 55 KB de estilos).
- **Un solo color principal (azul)**: antes la app mezclaba azul e índigo.
  Todos los colores salen de roles de Material 3 (ver `docs/DISENO.md`).
- **Roboto Flex** reemplaza a Outfit e Inter.
- **Mismo efecto** al pasar el mouse / tocar / presionar en todos los
  botones, filas y casillas; mismos tiempos de animación en todas las
  ventanas; todos los botones en forma de píldora.
- Se corrigió el botón "Datos (CloseUp) / Encuestas (Asesor)", que podía
  quedar con el estilo mal después de varios cambios (hallazgo M6 de la
  auditoría).
- Solo modo claro por ahora (el modo oscuro no se pidió).
- Fase 6 aprobada por el dueño (29/10/2026), con el pedido de un cambio más
  profundo de experiencia de uso.

## 29/10/2026 (Fase 6B: experiencia de uso)

Aprobados por el dueño los puntos 1 a 10:
1. Filtros compactos (buscador, filtros rápidos y hoja "Filtros").
2. Matriz más vistosa (intensidad, números animados, médicos del cuadrante al
   tocarlo, cabe en el teléfono).
3. Un solo botón "Exportar" (Excel, PDF, imagen).
4. Progreso discreto (anillo y barra fina).
5. Evaluación rápida (botones de un toque, "Guardar y siguiente").
6. Filtro "Pendientes por evaluar" con contador.
7. Tarjetas de médicos en teléfono e iPad.
8. Barra de navegación inferior en el teléfono.
9. Silueta de carga, "Deshacer", mensajes cuando no hay resultados.
10. Modo oscuro automático.

Además: logo rediseñado (el mismo en la pestaña y en la app), animación de
inicio nueva, menú "Más" con lo que antes estaba suelto ("Recargar",
"Productos", "Registro de fallas"), aviso de versión nueva y nombres de
médicos protegidos contra caracteres especiales (hallazgo M2 de la auditoría).
Ningún cálculo cambia; la evaluación guarda exactamente las mismas respuestas.

## 29/10/2026 (Fase 6C: ajustes pedidos por el dueño)

Fase 6B aprobada. Ajustes:
- Guía rápida la primera vez (también en "Más → Guía rápida") y ayuda "?"
  que explica la matriz.
- Evaluación anterior visible al reevaluar un mercado, con **historial de
  clasificaciones** (la base ya guardaba cada cambio; la migración 9 permite
  que cada VM vea el de sus evaluaciones y cada GD el de su distrito).
- Las respuestas del mercado ya evaluado se ven resumidas con "Cambiar"
  (igual que las preguntas del médico).
- Tocar un cuadrante filtra la lista de abajo y baja hasta ella (se quitó la
  lista repetida bajo la matriz).
- Matriz en **pantalla completa**.
- "Evaluar pendientes" sin pendientes muestra un aviso en vez de una lista vacía.
- La imagen de la matriz ahora se **dibuja** (antes era una captura de
  pantalla que mostraba "letras raras").
- Tabla más fácil de leer; **20 médicos por página**; nuevo botón de estado
  "Evaluar / Evaluado".
- Casillas de los filtros de tamaño fijo; toda la fila marca la casilla.
- Los nombres muestran "Ñ" donde el archivo de CloseUp trae "#" (solo al
  mostrar; el dato no cambia).

## 29/10/2026 (Fase 6D: ajustes pequeños)

Fase 6C aprobada. Ajustes:
- Guía rápida: el resaltado lleva la parte explicada justo debajo de la barra
  superior y la tarjeta ya no tapa lo resaltado; el paso "Evaluar" señala el
  botón del primer médico.
- Pantalla completa de la matriz: sin parpadeo (se quitó la pantalla completa
  del navegador y una animación que quedaba "pegada"); con subtotales todo cabe.
- Se quitó la barra de la columna Participación (siempre se veía casi vacía).
- Volvieron los íconos de Recetas, La Santé, Part. y médicos en cada cuadrante.
- Botón "Evaluado": muestra la última clasificación y cuántos mercados; al
  pasar el mouse se ve la clasificación de cada mercado.

## 29/10/2026 (Fase 6E: ficha del médico y comparativos)

Pedido del dueño: rediseño completo de la ventana del médico y las ideas 1 a 6.
- **Ficha del médico** (reemplaza la ventana anterior): pantalla completa en
  el teléfono y ventana grande en computadora. Encabezado con nombre,
  cuadrante (y el de antes si cambió), matrícula, cédula, especialidad y
  visitador; 4 indicadores; pestañas Resumen, Mercados, Productos, Historial
  y Datos. El gráfico grande se cambió por un anillo pequeño.
  - Resumen: producto más recetado, mercado favorito, producto La Santé más
    recetado, principal competidor y todos los lugares donde atiende.
  - Historial: recetas y clasificación por mercado en cada versión publicada
    (migración 10, `historial_medico`) y las evaluaciones con sus cambios.
  - Datos: todos los campos del fichero, por cada institución.
  - Botón **PDF** para descargar la ficha.
- **Movimientos**: cuántos médicos mejoraron o bajaron de cuadrante desde la
  versión anterior (mismos filtros); se pueden filtrar. VM y GD lo ven solos;
  el admin pulsa "Comparar" (descarga la versión anterior completa).
- **Tendencias ▲▼** en los indicadores y en la participación de cada médico.
- **CloseUp vs. encuesta**: cuántos coinciden y filtro "no coinciden".
- **Selector de mercado** encima de la matriz (usa los mismos filtros).
- **Competencia por cuadrante**: al tocar un cuadrante se ven los productos
  de la competencia más recetados por esos médicos.
- La regla de la matriz no cambió (las pruebas de resultados siguen iguales).

## 29/10/2026 (Fase 8: app instalable y sin internet)

Fase 6E aprobada. Fase 8:
- **Se instala** en el teléfono, iPad o computadora (ícono en la pantalla de
  inicio). Android/computadora: menú "Más" → "Instalar la app". iPhone/iPad:
  el mismo botón muestra los 3 pasos de Safari ("Compartir" → "Agregar a
  inicio").
- **Abre sin internet**: la app (archivos, librerías y letras) queda guardada en
  el dispositivo con un "trabajador de fondo" (`sw.js`). Los datos de cada
  persona ya se guardaban (copia local); ahora también la configuración, el
  perfil y la lista de visitadores del GD. Si la sesión vence sin internet
  (dura 1 hora), la app abre con lo guardado y la renueva sola al volver la
  conexión. El servidor sigue exigiendo sesión para todo.
- **Evaluar sin internet**: la evaluación se guarda en el dispositivo, cuenta
  como evaluada y aparece "N por subir" arriba. Se sube sola al volver
  internet, al volver a la app y cada minuto. Nunca se borra antes de que el
  servidor la confirme; si se evalúa dos veces el mismo médico y mercado, se
  sube la última. Cerrar sesión no la borra: se sube cuando esa persona vuelva.
- **Versión nueva de la app**: aviso "Hay una versión nueva" con botón
  "Actualizar" (también en el menú "Más").
- Supabase (datos, sesión, evaluaciones) nunca se guarda en el trabajador de
  fondo.
- Auditoría: C6 ya estaba corregido ("Volver a descargar" conserva la cola).
  A2–A4 dejaron de existir con Supabase (se lee la lista completa, sin comparar
  horas de distintos equipos); ahora la cola es la única vía sin conexión.

## 29/10/2026 (Fase 8 aprobada · rediseño por roles)

Fase 8 aprobada. Antes de los accesos, el dueño aprueba un **rediseño profundo
por rol** (todas las ideas propuestas). Nuevo orden:
- **9A** Velocidad del administrador, navegación por secciones (una pantalla a
  la vez, distinta para cada rol) y pantalla de **Ajustes** nueva (umbrales con
  vista previa y "Aplicar", ponderación de la encuesta, productos, usuarios,
  versiones, carga de datos y registro de fallas).
- **9B** Vistas nuevas del GD ("Mi equipo": ranking, ritmo, calidad de la
  evaluación, mini matriz por VM, prioridades, participación por VM) y del
  Gerente Nacional ("País" y "Distritos": comparativo de distritos, mapa por
  estado, evolución mensual, embudo de cobertura, mercados con más
  oportunidad, resumen ejecutivo en PDF); Progreso y Alertas en su propia
  sección, rediseñadas; administrador: salud de los datos, "Ver como…",
  bitácora de cambios; VM: sus 10 médicos con más oportunidad y su avance
  frente al promedio del distrito.
- **9C** Notificaciones dentro de la app (campanita): evaluación nueva, VM que
  terminó a todos sus médicos, VM sin evaluar en 7 días, alerta de
  discrepancia nueva. Las notificaciones al teléfono quedan para después.
- **10** Accesos y cierre (la antigua Fase 9).

### Fase 9A (hecha)
- **Pantallas**: la app ya no es una sola página larga. Cada sección es su
  propia pantalla: Inicio, Matriz, Médicos y, según el rol, Pendientes (VM),
  Equipo (GD, Gerente Nacional y administrador) y Ajustes (solo
  administrador). Barra inferior en el teléfono y riel a la izquierda en
  tablet y computadora. El botón "atrás" vuelve a la pantalla anterior.
  Tocar un cuadrante abre "Médicos" con ese cuadrante y un botón "← Matriz".
- **Ajustes** (administrador): umbrales con vista previa (cuántos médicos
  suben o bajan y cómo quedan los 9 cuadrantes) que solo se aplican al tocar
  "Aplicar para todo el equipo"; ponderación de la encuesta en la misma
  pantalla con un ejemplo de puntaje; accesos a cargar datos, versiones,
  productos, usuarios, registro de fallas y reportes. Se quitaron los
  ajustes plegables de encima de la matriz y la ventana de ponderación.
- **Velocidad del administrador** (mediana de 5 mediciones, 28.712 médicos):
  mover un umbral 160 ms por paso → 10 ms; recalcular 150 → 76 ms; volver a
  "Todos los mercados" 310 → 114 ms; filtros rápidos 60–87 → 12 ms; quitar
  cuadrante 50 → 10 ms. Cómo: los conteos de filtros rápidos se reutilizan,
  la lista se dibuja una vez (no dos) y solo en la forma que se ve (tabla o
  tarjetas), se recuerdan los últimos 4 grupos de mercados, el panel del
  equipo se dibuja solo al abrir su pantalla y las alertas van de 20 en 20.
  La regla de cálculo de la matriz no cambió.

### Fase 9B (hecha)
- Fase 9A aprobada. Arreglo: la vista previa de umbrales usa el mismo orden
  que la matriz (adopción alta "+" a la derecha).
- **Equipo** (GD, Gerente Nacional y admin), con cuatro vistas:
  - *Distritos* (Gerente Nacional y admin): avance, participación,
    oportunidad, calidad, ritmo y visitadores sin actividad de cada distrito.
  - *Visitadores*: ranking ordenable (avance, ritmo, calidad, La Santé,
    oportunidad). Al abrir uno: su mini matriz, sus últimas evaluaciones
    (el admin puede editarlas o eliminarlas) y "Ver sus médicos".
  - *Prioridades*: médicos con más recetas que nadie ha evaluado.
  - *Alertas*: evaluaciones cuyo potencial (A, B o C) no coincide con
    CloseUp; "Muy distintas" = A contra C. De 20 en 20.
  - "Calidad" = en cuántas evaluaciones del VM el potencial coincide con
    CloseUp. Un médico que atienden dos VM cuenta una vez en los totales.
- **Inicio** de GD, Gerente Nacional y admin: cobertura (fichero → con
  recetas → evaluados → potencial A), mercados con más oportunidad, mapa
  esquemático por estado, participación mes a mes, distritos y "Resumen en
  PDF". **Inicio del VM**: sus 10 médicos con más oportunidad y su avance
  frente al promedio de su distrito.
- **Ajustes** del admin: salud de los datos, "Ver la app como…" un VM o un GD
  (solo consulta, con aviso para salir) y bitácora de cambios.
- Migración 11 (aditiva). La evolución mensual se probó con los datos
  reales: 0,18 s para todo el país en la base de pruebas.

## 30/10/2026 (Fase 9B aprobada · ajustes antes de la 9C)

- **VM, GD y Gerente Nacional**: Inicio, Matriz y Médicos vuelven a estar en
  **una sola página** (la matriz siempre a la vista); los botones de abajo
  solo llevan a cada parte. Solo el **administrador** mantiene pantallas
  separadas. GD y Gerente Nacional conservan la pantalla Equipo.
- Se quitó el botón **"Pendientes"** de la barra (era el mismo filtro rápido
  "Pendientes", que se mantiene).
- Se quitaron el **mapa por estado** y la **participación mes a mes**: el
  dueño prefiere gráficos fáciles de leer (cobertura, mercados con
  oportunidad, distritos). La función de la migración 11 queda en la base
  sin uso (no molesta).
- Los "10 médicos con más oportunidad" del VM van al final de su página.

### Fase 9C (hecha): avisos con campanita
- Para **GD, Gerente Nacional y administrador** (el VM no). Avisa cuando un
  visitador evalúa (un aviso por visitador y día), cuando evaluó a **todos**
  sus médicos 🎉, cuando hay visitadores con **7 días o más sin evaluar**, y
  cuando una evaluación **no coincide con CloseUp**. Últimos 14 días.
- Número rojo con los no leídos; tocar un aviso lleva a Equipo (al
  visitador o a Alertas); "Marcar todo como leído".
- Cada **2 minutos** (con la app abierta e internet) se traen **solo** las
  evaluaciones nuevas o cambiadas y se avisa "Hay N evaluaciones nuevas".
- "Visto hasta" se guarda en el servidor (migración 12): la campanita marca
  lo mismo en el teléfono y en la computadora.
- Avisos al teléfono con la app cerrada: quedan para después (requieren un
  servicio de avisos aparte).

## 02/11/2026 (Fase 9C aprobada · Fase 10: accesos y cierre)

Preparado para el pase a producción (lo ejecuta el dueño, guía en
`docs/SALIDA.md`):
- `scripts/migracion/0-preparar-base.mjs`: crea todas las tablas en el
  Supabase NUEVO (aplica las 12 migraciones en orden, cada una completa o
  nada, y registra cuáles se aplicaron). En una base con tablas aplicadas a
  mano (como pruebas) se detiene sin tocar nada.
- `5-subir-archivos.mjs` ahora también **prepara la versión de recetas para
  los visitadores** (orden por mercado). Sin esto, en producción el VM vería
  "la versión aún no está preparada". `6-preparar-versiones.mjs` lo repite si
  hace falta.
- `3-usuarios.mjs --enviar-enlaces`: correo "Crea tu clave" a quien no
  conserva su clave anterior (`--todos`, `--solo correo`).
- Correo propio (Brevo) con plantillas en español: `docs/CORREO.md` y
  `supabase/plantillas-correo/`.
- Título de la pestaña: "SegmentApp · La Santé".
- Prueba nueva: todas las tablas tienen reglas de seguridad por fila (RLS).

Pendiente de decisión del dueño (`docs/SALIDA.md`, parte 1):
- **El repositorio de GitHub es público y contiene el fichero médico**
  (datos personales). Recomendado: Vercel Pro y repositorio privado (Vercel
  gratis no publica desde un repositorio privado de una organización).
- Plan del Supabase de producción: recomendado **Pro** (el gratis se pausa
  tras 7 días sin uso y se llena en ~8 meses).
- Fecha y hora del pase.

## 02/11/2026 (Fase 10 aprobada · decisiones del pase)

1. **Repositorio público con el fichero médico:** el dueño eligió la opción
   (c) (sacarlo del historial) y que el proyecto sea gratis. La opción (c)
   exige reescribir el historial de **todas** las ramas, incluidas `main` y
   `respaldo-2026-10-27`, que las reglas del proyecto prohíben tocar, y no
   borra las copias ya descargadas. **Pendiente** de confirmación. Alternativa
   gratis propuesta, **(d)**: repositorio **privado** y publicar en Vercel con
   GitHub Actions (CLI de Vercel con un token guardado en los secretos de
   GitHub), que no depende del plan Pro y no borra ni reescribe nada.
2. **Supabase de producción gratis.** Para que no se pause tras 7 días sin
   uso: latido automático cada 2 días con GitHub Actions
   (`.github/workflows/latido.yml`, migración 13 `latido()`). Guía:
   `docs/ACTIVO.md`.
3. **Correo con el Gmail del dueño** (clave de aplicación de Google; Brevo no
   permite cuentas de Venezuela). Guía actualizada: `docs/CORREO.md`.
4. **Pase a producción hoy** (la app no se está usando).

### Ajuste del mismo día (antes de fusionar el PR 25)
- **Sin correo automático** (el dueño lo prefiere más simple): se quita la
  opción de correo del pase. El script de usuarios da **claves temporales**
  (fáciles de escribir: `maro-kebi-4821`) y deja `accesos.csv` con un mensaje
  listo por persona; el dueño los envía por Gmail o WhatsApp. Al entrar con
  la clave temporal, la app pide **crear la propia**. Nuevo en el menú "Más":
  **Cambiar mi clave**. Para quien la olvide:
  `node 3-usuarios.mjs --nueva-clave correo`. `docs/CORREO.md` queda como
  opción para más adelante.
- **Repositorio:** ni (c) ni (d). Los datos públicos del repositorio son de
  prueba (aclaración del dueño), así que no hace falta.
- El latido para que Supabase gratis no se pause **se mantiene**.

### Ajuste durante el pase (02/11/2026, tarde) · Fase 10C
- En producción los usuarios quedaron con el **correo interno de la app
  vieja** (`nombre@segmentapp.internal`), porque la plantilla los trae así.
  El dueño eligió la opción **B: correos reales de La Santé**, incluido el
  suyo.
- `3-usuarios.mjs` ahora **cambia el correo** de quien ya tiene usuario (VM
  por su visitador, GD por su distrito, admin y Gte. Nacional por su rol) y
  **conserva su clave**. `accesos.csv` trae el mensaje con el correo nuevo.
- Pedido del dueño: **gestionar usuarios desde la propia app**. Nueva sección
  **Ajustes → Usuarios** (migración 14): buscar, cambiar nombre y correo, dar
  una **clave temporal** (se ve una sola vez, con el mensaje listo para
  WhatsApp o correo) y activar o desactivar el acceso. No se borra nada.
  Crear personas nuevas sigue siendo con `3-usuarios.mjs`.

### Fase 10D (02/11/2026, noche)
- Los correos reales ya quedaron en producción, pero el `accesos.csv` de ese
  paso no traía claves y las anteriores se perdieron. Pedido del dueño:
  **clave temporal para todos** y poder **descargar o compartir** los
  usuarios de forma masiva.
- En **Ajustes → Usuarios**: botón **Claves temporales (N)** (para la lista
  que se ve: todos, o los filtrados por búsqueda o rol; nunca el propio
  admin ni los desactivados). Al terminar muestra cada clave una sola vez,
  con **Descargar accesos** (CSV), **Compartir archivo** (en el teléfono),
  **Copiar todos** y, por persona, copiar o **WhatsApp**. Botón **Descargar
  lista** (sin claves). Migración 15 `admin_claves_temporales`, todo o nada.
- GD y Gerente Nacional todavía no tenían usuario: se crean con
  `3-usuarios.mjs` (filas gd y gte_nacional de `usuarios.csv`).

## Fase 11 (02/11/2026) · Ajustes tras las primeras pruebas en producción
1. **Clave visible:** botón ojo en el ingreso y en "crear clave".
2. **Primero la clave, después la guía:** la guía rápida espera a que la
   persona cree su clave.
3. **Mensajes dentro de la ventana:** los errores del ingreso y de "crear
   clave" se ven dentro de la ventana; los avisos inferiores quedan por
   encima de todo. "¿Olvidaste tu clave?" indica pedir una clave temporal al
   administrador (la app no envía correos).
4. **Guía:** el paso "Más opciones" resalta el botón ⋮.
5. **Números coherentes:** "Cobertura" usa los mismos médicos que los
   filtros rápidos (Todos, Evaluados) y separa "Evaluados" (todo el fichero)
   de "Evaluados con recetas". Los **filtros rápidos** pasan junto a la lista
   de médicos, porque solo cambian esa lista. Buscar y "Filtros" siguen arriba
   porque cambian todo.
6. **Equipo:** se ordena por **Cobertura** (médicos evaluados ÷ fichero) o
   por **Nombre**; los demás órdenes se quitaron. Totales absolutos: médicos en
   fichero, médicos evaluados y evaluaciones. Filtro por **línea** (OTC o
   Pharmetique, según la columna "Equipo" del fichero y la configuración
   `equipos_otc`). Botón **Resumen** (Excel por visitador).
7. **Detalle del visitador:** la mini matriz muestra **su evaluación** (cuenta
   todas sus evaluaciones, igual que la lista de al lado) o **CloseUp** (sus
   médicos con recetas). Los datos que llenaban la tarjeta pasan al detalle.
8. **"Reportes avanzados"** sale de Ajustes: lo cubren Equipo y su Resumen
   (el código queda por si se quiere volver).
9. **Desactivar a un VM** (migración 16) oculta sus médicos y números para
   GD, Gte. Nacional y admin. No se borra nada; al reactivarlo vuelve todo.

## Fase 11b (02/11/2026, noche)
- **Médicos en el fichero = médicos únicos del CRM** (una matrícula, un
  médico), con y sin recetas, igual que Equipo. Antes, en la vista nacional,
  contaba solo los que tenían recetas.
- **Arreglo de cálculo:** "Principal competidor" y "Composición del mercado"
  usaban las recetas de todo el país aunque la persona viera solo su distrito
  (salía 354 % y −258 %). Ahora usan solo los médicos de su alcance.
- **"PHQ" pasa a "La Santé" / "LS"** en verde (color corporativo).
- **Guía rápida:** muestra el paso 1 (antes lo saltaba) y la tarjeta no
  tapa ni se corta cuando lo resaltado es más alto que la pantalla.
- Se quita **"Resumen en PDF"** del inicio.
- **Teléfono:** la barra superior deja solo avisos y ⋮. "Cargar datos" (admin)
  y "Versión de datos" quedan en el menú ⋮.
- **Permisos revisados:** VM, GD y Gerente Nacional no cargan, publican ni
  borran (la base lo impide); el VM solo crea o edita sus evaluaciones.
- **Salud de los datos** muestra médicos únicos, visitadores y distritos del
  fichero para compararlos con el CRM.

## Plan de carga simplificada (03/11/2026) · Fase 12
- **Opción A:** la app hace todo el trabajo de Power Query. Sin Excel.
- **12A · Fichero nuevo del CRM:** la matrícula viene en IDENT02 (cédula en
  IDENT01); "ATIVO" pasó a "Activo". La app los reconoce sola.
- **12B · Catálogos y filtros:** Especialidades, Productos y Laboratorios se
  suben tal como salen del portal (.xls) en Ajustes → Catálogos; una fila por
  producto (evita la duplicación que obligaba a poner la clase terapéutica en
  "SIN DATOS"); clase terapéutica con código, lista para un futuro catálogo de
  nombres. Filtros editables (DCR, INS, OTR, UCI, matrícula 0).
- **12C · CloseUp en un paso:** los ~32 archivos de mercado (o un .zip) se
  procesan en el navegador; informe previo con alertas (mercados con menos
  filas o faltantes, productos de La Santé ausentes, productos sin catálogo);
  descarga del consolidado; una sola versión a Supabase; comparación única
  contra el archivo de Power Query. Se guardan los archivos originales
  comprimidos en el almacén privado.
- **12D · Recordatorio trimestral** de la carga de CloseUp y control del
  espacio del plan gratis.

### Ajustes del dueño al plan (03/11/2026)
- **Nombre del mercado = nombre del archivo** (no el "ARAII Mercado C09C0"
  que viene adentro): así cada mercado se llama como el dueño lo guarde
  (Fase 12C).
- Clase terapéutica con código, **escalable**: catálogo de clases opcional
  (vacío hasta que exista la tabla).
- **Guardar los archivos originales** de CloseUp: sí (Fase 12C).
- Fase 12B hecha: catálogos y filtros editables; lo corregido a mano en un
  producto no se pisa al volver a subir el catálogo.

## Fase 12C (03/11/2026)
- **Historial de catálogos:** cada archivo subido se guarda (comprimido) con
  su resumen; subir uno nuevo agrega o actualiza, nunca borra.
- **"Cómo descargarlo"** de cada fuente, editable (texto, también para el
  fichero del CRM).
- **Clases terapéuticas** con niveles y corrección a mano.
- **Mis laboratorios:** PHQ y LST (configurable); sus productos se marcan
  solos como La Santé.
- **Crear acceso desde la app** para visitadores o GD nuevos (y Gerente
  Nacional o admin): ya no hace falta Cloud Shell para usuarios.
- **Descargar datos crudos por rol** (recetas, fichero, evaluaciones).
- Pregunta del dueño: Cloud Shell solo queda para aplicar migraciones de la
  base. Propuesta para la Fase 12E: que GitHub las aplique sola al fusionar a
  `main` (con la clave de la base como secreto de GitHub).

## Fase 12D (03/11/2026) · CloseUp en un solo paso
- La carga de recetas acepta **varios archivos de mercado del portal o un
  .zip** y hace el trabajo de Power Query en el navegador (filtros, catálogos,
  matrícula a 10 dígitos, sin repetidas). **Mercado = nombre del archivo.**
- La clase terapéutica vuelve a ser real (código + nombre del catálogo de
  clases); ya no "SIN DATOS".
- Informe previo con alertas y comparación con la versión de hoy; descarga
  del consolidado; comparación única con el archivo de Power Query.
- A Supabase llega **una sola versión** (igual que antes): no se sobrecarga.
- Los archivos originales se guardan comprimidos (`closeup/<versión>/…`,
  registrados en `catalogo_versiones` con tipo `closeup`). Sin migración nueva.

## Fase 12D-2 (04/11/2026)
- **Descarga en tandas:** el mercado sale de la columna "Mercado"; tabla de
  **nombres de mercado** (`configuracion.nombres_mercado`, se crea sola) con
  sugerencias y confirmación obligatoria de los nuevos.
- **Matriz en el teléfono:** sin barra de porcentaje; número arriba de "méd."
  para que quepan 5 cifras.
- **Barra de navegación:** el botón se marca al instante al tocarlo; la
  pantalla cambia en el siguiente cuadro. Sin la espera del doble toque.
- **iPad (ERR_SSL_PROTOCOL_ERROR):** no es de la app (funciona en otros
  equipos); pasos para revisar la red del iPad en la respuesta al dueño.
- **Nomenclatura de mercados (decisión del dueño):** todos se llaman
  **"Mdo " + producto** ("ESOZ MERCADO A02B2" → "Mdo Esoz", "FLUDIL SOLO" →
  "Mdo Fludil", "Bumetin Retard Mercado 2" → "Mdo Bumetin"). La app lo
  sugiere (quita MERCADO, MDO, SOLO, números y códigos ATC) y el dueño revisa;
  los casos puntuales los ajusta a mano. El nombre se guarda **tal como se
  escribe** (ya no se pasa a mayúsculas); "MDO ESOZ" y "Mdo Esoz" se tratan
  como el mismo.
- **Renombrar los ya cargados** (migración 19): Ajustes → Catálogos →
  Renombrar mercados. Cambia el nombre en todas las versiones y en las
  evaluaciones (su versión anterior queda en el historial), actualiza la tabla
  de nombres y deja el nombre viejo como alias. Cada cambio se puede deshacer.

## Fase 12E (04/11/2026)
- **Migraciones automáticas:** `.github/workflows/migraciones.yml` aplica en
  producción las migraciones que falten al llevar `rediseno` → `main` (o a
  mano con "Run workflow"). Usa el mismo `0-preparar-base.mjs`, que ahora
  acepta `CONFIRMACION=MIGRAR PRODUCCION` en lugar de escribirlo. Requiere el
  secreto `SUPABASE_DB_URL_PRODUCCION`; sin él no hace nada (Cloud Shell sigue
  sirviendo).
- **Recordatorio de carga** en la campanita (solo admin): cuando la versión de
  hoy de CloseUp o del fichero tiene más días que los configurados (90 por
  defecto = cada trimestre; 0 = nunca). Se cambia en Ajustes → Catálogos →
  "Cómo descargar los datos de origen" (`configuracion.recordatorio_cargas`,
  se crea sola). Tocarlo abre Cargar datos.
- **Espacio en Supabase** (migración 20, `admin_espacio`): en Ajustes →
  Salud de los datos, base y archivos frente al plan gratis (500 MB / 1 GB).
  Al pasar del 80% la campanita avisa. Archivar versiones viejas queda
  pendiente: se hará solo si hace falta y con aprobación del dueño.
- **Nomenclatura:** el informe de CloseUp avisa si algún mercado no sigue la
  regla "Mdo + producto".
- **Arreglo (PR aparte):** el admin y el Gerente Nacional leen el archivo
  guardado de cada versión, que conserva el nombre de mercado viejo; la app lo
  traduce al de hoy con la tabla de nombres (`App.data.mercadoDeHoy`).
- **Listas de 10 en 10** con Anterior / Siguiente: Equipo (visitadores,
  prioridades, alertas), Ajustes → Usuarios y "Sin acceso".
- **Correo automático:** `nombre.apellido@lasante.com.ve` (sin tildes ni ñ;
  con 4 palabras, 1.er nombre y 1.er apellido). "Crear varios a la vez" revisa
  los correos sugeridos y crea los marcados con su clave temporal.
- **Fuera de métricas** (migración 21): un VM con acceso puede no contar en
  las métricas del GD ni nacionales (Ajustes → Usuarios → botón de métricas).
  Sigue entrando y viendo lo suyo; en Equipo aparece al final, marcado.
- **Corregir un solo mercado:** se sube solo el archivo corregido y "Completar
  con los mercados de hoy" toma los demás, tal cual, de la versión vigente;
  se publica como una versión nueva completa (la anterior queda guardada).
  CloseUp limita a 10 mercados por descarga: se suben todas las tandas juntas.
- **Productos (PHQ):** contador de seleccionados, buscador y "Marcar los que
  terminan en…" con los sufijos de Mis laboratorios (editables ahí mismo).
- **Umbrales de Potencial:** se muestran como Adopción (Bajo a la izquierda,
  Alto a la derecha). Los controles van de derecha a izquierda porque A se
  cuenta desde los que más recetan (Pareto).

## Fase 12F (04/11/2026)
- **Salud de los datos:** "visitadores sin usuario" cuenta solo los del
  fichero de hoy (igual que "Sin acceso"); los de ficheros anteriores se
  informan aparte. Se actualiza al crear accesos.
- **Usuarios:** filtros por acceso (activo / desactivado), métricas (cuentan /
  no cuentan) y línea. La línea sale del campo "Equipo" del fichero: 1
  LINEA_HIBRIDA_1, 2 LINEA_HIBRIDA_2, 3 COMERCIAL, 4 LINEA_3, 5 LINEA_HIBRIDA_3,
  6 LA SANTE, 7 OTC, 8 LINEA_1, 9 LINEA_2 (`App.config.LINEAS_EQUIPO`). El GD
  tiene las líneas de los visitadores de sus distritos.

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

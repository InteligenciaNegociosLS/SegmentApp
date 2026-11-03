# Cómo cargar datos nuevos (solo el administrador)

Desde la Fase 5, los datos de recetas (CloseUp) y el fichero médico se cargan
**desde la propia app**, sin tocar GitHub ni archivos .gz.

## Lo más importante
- **Nada se borra.** Cada carga crea una **versión nueva**. Las anteriores
  quedan guardadas y puedes volver a cualquiera.
- **El equipo no ve nada hasta que publiques.** Lo que subes queda como
  **borrador**.
- Recetas y fichero son **independientes**: puedes actualizar uno sin el otro.

## Paso a paso
1. Entra a la app con tu usuario de administrador.
2. Pulsa **Cargar datos**: en la computadora, arriba a la derecha; en el
   teléfono, en el menú **⋮**. También está en **Ajustes → Datos y equipo**.
3. En **Cargar nueva**:
   1. Elige si es **Recetas (CloseUp)** o **Fichero médico**.
   2. Elige el archivo: Excel (`.xlsx`) o CSV (separado por `;`).
   3. Escribe un **nombre** (ej. "Recetas febrero 2026") y la **fecha de corte**.
   4. Pulsa **Revisar archivo**. La app lo revisa **sin guardar nada** y
      muestra:
      - un resumen (filas, médicos, recetas…);
      - ❌ **errores** con el número de fila (como lo ves en Excel) y el motivo.
        Si hay errores, corrige el archivo y vuelve a revisarlo;
      - ⚠️ **avisos** (no impiden subir): columnas en otro orden, filas
        repetidas, visitadores nuevos o que ya no aparecen.
4. Pulsa **Subir como borrador**. Verás el avance. Si se corta internet,
   pulsa **Reintentar**: continúa donde quedó, sin duplicar. En recetas, al
   final verás "Preparando la versión para los visitadores: mercado X de 32"
   (unos segundos): deja listo lo que necesitan los VM y GD.
5. Al terminar, la app muestra la **comparación con "Hoy"**: filas nuevas,
   eliminadas, cambiadas e iguales, con ejemplos.
6. Si todo se ve bien, pulsa **Publicar**. Desde ese momento es la versión de
   **"Hoy"** para todo el equipo. Si prefieres esperar, pulsa **Dejar como
   borrador**.

## Columnas que debe traer cada archivo
Los nombres de las columnas deben ser **los de siempre**; el orden no importa.

- **Recetas:** Medico, Matricula, Mercado, Producto, Px_Product (número entero
  de recetas) y las 10 columnas siguientes del archivo de CloseUp de siempre.
- **Fichero:** como mínimo Matricula, Nombre, Nombre del sector, Sector,
  GER_DIS, NOME_GER_DIS y Equipo. Las demás columnas se guardan tal cual.
  - **Formato nuevo del CRM (noviembre 2026):** ya no trae "Matricula"; la
    matrícula viene en **IDENT02** y la cédula en **IDENT01**. La app toma la
    matrícula de IDENT02 sola (lo avisa al revisar el archivo). "ATIVO" pasó a
    "Activo": también se reconoce.

## Pestaña "Versiones"
Lista todas las versiones de recetas y de fichero:
- **HOY (vigente)**, **Anterior** (publicada antes), **Borrador** o
  **Archivado**.
- **Comparar** con la de hoy · **Publicar** un borrador · **Volver a esta
  versión** (vuelve a publicar una anterior) · **Renombrar** · **Archivar** un
  borrador que no vas a usar (no se borra).

## Para todo el equipo: botón "Datos: Hoy"
Cualquier usuario puede ver una versión **anterior** (ej. para comparar meses).
Solo cambia lo que ve esa persona en esa pestaña; al cerrarla vuelve a "Hoy".
Si alguien está viendo una versión anterior, el botón lo indica en color ámbar.

## Seguridad
- Los archivos están en un almacén **privado**: sin iniciar sesión no se
  pueden descargar (antes estaban públicos en la web).
- Solo el administrador puede subir, publicar o archivar versiones.

## Después de publicar: validar los números (Fase 11b)
1. **Ajustes → Salud de los datos → Fichero** muestra los **médicos únicos**,
   visitadores y distritos del fichero publicado: compáralos con el CRM.
2. **Inicio → Cobertura** ("Médicos en el fichero") y **Equipo → Médicos en
   fichero** deben dar ese mismo número de médicos únicos.
3. **Composición del mercado**: La Santé + principal competidor + resto
   suman 100 %.

## Catálogos de CloseUp (Fase 12B) · Ajustes → Catálogos
Reemplazan las "tablas de dimensiones" de Power Query. Se actualizan cada
semestre o año.
1. Descarga del portal **Especialidades**, **Laboratorios** y **Productos**
   (.xls, tal como salen; no hace falta limpiarlos).
2. En **Ajustes → Catálogos**, en cada tarjeta: **Subir archivo**. La app salta
   los títulos ("EXPORTACIONES TABLAS", "Buscar:"…), lee todas las hojas y te
   muestra qué va a guardar. **Guardar**.
3. **Productos:** el portal trae varias filas por producto (concentraciones,
   formas). La app deja **una sola** (así las recetas no se duplican) con la
   clase terapéutica más frecuente. Si un producto trae varias clases, lo
   marca; en **Ver y editar** eliges la correcta y esa corrección se respeta en
   las próximas cargas del catálogo.
4. **Clases terapéuticas:** opcional. Si algún día consigues la tabla código →
   nombre, súbela ahí y la app mostrará el nombre en vez del código.
5. Nada se borra: lo que ya estaba y no viene en el archivo nuevo se queda.

**Filtros de la carga de CloseUp** (en la misma sección): códigos de
especialidad que se quitan (DCR, INS, OTR), especialidades por nombre (UNIDAD
DE CUIDADOS INTENS) y matrícula en cero. Puedes agregar o quitar.

## Fase 12C
- **Clases terapéuticas:** el archivo del portal trae "CÓDIGO-NOMBRE" en una
  celda y por niveles (A → A01 → A01A → A02A1). La app guarda todos los
  niveles. El código de un producto ("R06A0") encuentra su clase ("R06A";
  el 0 final = sin subnivel) y su grupo ("R").
- **Historial:** cada archivo de catálogo que subes queda guardado tal cual
  (comprimido) en el almacén privado. En cada tarjeta: **Historial** →
  descargar el original.
- **Cómo descargarlo:** cada fuente (fichero del CRM, mercados de CloseUp y
  los catálogos) tiene sus pasos escritos por ti, en Ajustes → Catálogos. Se
  muestran junto a lo que vas a subir.
- **Mis laboratorios (PHQ, LST):** sus productos del catálogo se marcan solos
  como La Santé (al subir el catálogo de productos o con "Marcar como La
  Santé"). Puedes agregar otro laboratorio. Si quitas un producto a mano en
  "Productos del laboratorio", no se vuelve a marcar solo.

## Visitadores o GD nuevos (sin Cloud Shell)
1. Carga el fichero nuevo y publícalo. Al revisarlo, la app avisa los
   visitadores nuevos.
2. **Ajustes → Usuarios → "Sin acceso"**: lista de visitadores del fichero
   sin usuario y de distritos sin GD.
3. **Crear acceso** → escribe su correo → la app crea el usuario con clave
   temporal y te da el mensaje listo (WhatsApp o copiar).
4. Para un Gerente Nacional o un administrador: **Nuevo usuario**.

## Descargar datos crudos (todos los roles)
Menú **⋮ → Descargar datos (crudos)**: recetas (CloseUp), fichero y
evaluaciones en CSV para Excel. Cada quien descarga solo lo que ve: el VM lo
suyo, el GD su equipo, el Gerente Nacional y el admin todo.

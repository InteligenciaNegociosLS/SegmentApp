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
2. Pulsa **Cargar Datos** (arriba a la derecha).
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

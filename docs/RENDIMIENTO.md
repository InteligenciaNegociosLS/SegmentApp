# Velocidad: antes y después (Fase 7)

## Resumen
| | Antes (Fase 5) | Después (Fase 7) |
|---|---|---|
| **Lo que descarga un VM al entrar** | 8,8 MB comprimidos (las 231.729 filas del país) | **≈ 150 KB** (solo sus médicos: 488 filas de recetas y 142 del fichero en el caso de NEIVIS PARRA) |
| **Lo que descarga un GD** (10 visitadores) | 8,8 MB comprimidos | **≈ 1,4 MB** sin comprimir (1.094 médicos) |
| **De "Entrar" al tablero, VM** (prueba en navegador, sin contar la red) | ≈ 6 s | **≈ 0,1 s** |
| **Recalcular al mover un umbral o cambiar productos** (admin, 231 mil filas) | ≈ 1,0 s | **≈ 0,25 s** (4 veces más rápido) |
| **Recalcular al cambiar mercados/regiones** (admin) | ≈ 1,2 s | **≈ 0,6 s** (2 veces más rápido) |

Los tiempos se midieron en el servidor de pruebas. En un iPad o un teléfono
son de 3 a 5 veces mayores, pero la proporción se mantiene. En datos móviles,
bajar 150 KB en vez de 8,8 MB es la mayor diferencia: de cerca de un minuto a
uno o dos segundos.

## Qué se hizo
1. **Cada VM y GD recibe solo sus médicos** (función `datos_equipo` en
   Supabase). La etiqueta nacional de cada médico por mercado (A+, B, C-…)
   necesita las recetas de todo el país: el servidor guarda ese orden
   nacional **una vez por versión** (tabla `recetas_orden_mercado`, se
   prepara al subir o publicar) y a cada VM le envía solo el de sus médicos.
   La primera versión de la Fase 7 lo recalculaba en cada entrada y Supabase
   la cortaba a los 8 s ("statement timeout"); la migración 8 lo corrigió.
2. **El admin y el Gerente Nacional** siguen recibiendo el archivo completo
   (ven todo), pero los cálculos son más rápidos:
   - la agrupación por médico se reutiliza si solo cambian productos,
     visitadores, umbrales o el modo de la matriz;
   - cada producto se revisa una sola vez para saber si es del laboratorio
     (antes: 70 comparaciones por cada una de las 231 mil filas, en cada clic);
   - los filtros usan búsquedas instantáneas en vez de recorrer listas.
3. **Copia en el dispositivo por usuario:** si en el mismo equipo entra otra
   persona, no se usa la copia de la anterior.
4. **Chart.js con versión fija** (4.4.1): antes se descargaba "la última", lo
   que impedía guardarla en caché y podía romper la app sin aviso.

## Cómo se garantiza que los números no cambian
- `tests/db/datos-equipo.test.js` carga **los datos reales** en un Postgres de
  prueba, pide `datos_equipo` como el VM NEIVIS PARRA y como su GD, y compara
  con lo que calcula la app con el archivo completo. Coinciden todos los
  médicos con recetas, sus recetas, la brecha y la etiqueta en los 32
  mercados.
- `tests/unit/matriz-datos-reales.test.js` (la "foto" de la Fase 2) sigue
  dando exactamente los mismos totales: 28.712 médicos, 584.795 Rx y los
  mismos cuadrantes.

## Diferencias a propósito (VM y GD)
- **Principal competidor** y el gráfico de competencia: ahora con **sus**
  médicos (antes, con todo el país).
- **Listas de los filtros:** solo lo que existe en sus médicos.
- **Médicos sin recetas con matrícula compartida:** ahora muestran el nombre
  de su propia fila del fichero (1 caso para NEIVIS PARRA, 3 en su distrito).

## Pendiente para la Fase 6 (rediseño)
- Quitar el Tailwind que se genera en el navegador (≈ 100 KB y página sin
  estilo al principio): esa fase rehace todos los estilos.
- Cambiar las 3 fuentes actuales por Roboto Flex y reducir los íconos.

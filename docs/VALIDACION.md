# Validación de la migración Firebase → Supabase

> **Pendiente.** Este archivo lo genera el script
> `scripts/migracion/4-validar.mjs` cuando el dueño ejecuta la migración en
> Cloud Shell (ver `scripts/migracion/LEEME.md`, paso E). El resultado
> reemplaza este texto.

Qué revisa:

| Grupo | Revisión |
|---|---|
| Evaluaciones | Cantidad total y activas (Firebase vs Supabase) |
| Evaluaciones | Cantidad por cada visitador |
| Evaluaciones | Campos vacíos (matrícula, mercado, cuadrante, fecha) |
| Evaluaciones | Muestra aleatoria de 20, comparada campo por campo |
| Fichero | Versión "Datos enero" vigente y cantidad de filas |
| Fichero | Las 119 columnas de cada fila, idénticas al archivo |
| Fichero | Todas las filas vinculadas a su visitador |
| Recetas | Versión "Datos enero" vigente, cantidad de filas y suma de recetas |
| Recetas | Reconstrucción fila por fila, idéntica al archivo |

El resultado final debe ser **✅ TODO COINCIDE** antes de pasar a producción.

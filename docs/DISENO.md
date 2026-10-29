# Sistema de diseño (Material 3 Expressive)

Todo el aspecto de la app sale de **dos archivos**:

| Archivo | Qué define |
|---|---|
| `tailwind.config.js` | Colores (paletas tonales), formas, sombras, tipografía y tiempos |
| `css/entrada.css` | Variables de diseño, efecto al pasar el mouse/tocar, componentes de la app y animaciones |

El navegador carga `css/app.css`, que se **genera** con `npm run css` (no se
edita a mano). Las pruebas automáticas avisan si alguien olvida regenerarlo.

## Colores (roles de Material 3)
| Rol | Uso | Tono principal |
|---|---|---|
| **primary** (azul) | Acción principal, enlaces, selección | `#0b57d0` |
| **neutral** | Fondos, textos, bordes | texto `#191c20`, secundario `#44474e` |
| **tertiary** (violeta) | Acentos (encuestas, etiquetas especiales) | `#6e4da0` |
| **success** (verde) | Positivo, guardado, "alta adopción" | `#146c3c` |
| **warning** (ámbar) | Avisos | `#8b5000` |
| **error** (rojo) | Errores, eliminar, brechas | `#ba1a1a` |

Los nombres de Tailwind de siempre siguen funcionando, pero apuntan a estos
roles: `blue`/`indigo` → primary, `slate`/`gray` → neutral, `purple` →
tertiary, `emerald`/`green` → success, `amber`/`yellow` → warning,
`rose`/`red` → error. **Para cambiar el color de la marca, se cambia solo la
paleta `primary` en `tailwind.config.js`.**

## Formas
4 px (indicadores) · 8 px (chips, etiquetas) · 12 px (campos) · 16 px
(tarjetas pequeñas) · 20 px · **28 px** (tarjetas grandes y ventanas) ·
**píldora** (todos los botones).

## Modo oscuro
Se activa solo si el teléfono o la computadora usan modo oscuro. Cada color
tiene su versión oscura (fondos oscuros, textos claros), calculada en
`tailwind.config.js`; no hay que hacer nada en cada pantalla.

## Logo
`img/logo.svg`: la matriz de 9 cuadrantes. El azul se intensifica hacia
"alto potencial" y la esquina de la meta (A+) es verde y redonda. Es el mismo
archivo para la pestaña del navegador y para la app. Al abrir, la pantalla de
inicio arma el logo cuadro por cuadro.

## Piezas de la experiencia (`js/ux.js`)
- Menú **Más** (arriba a la derecha; en el teléfono sube desde abajo).
- **Filtros**: buscador + filtros rápidos (Pendientes, Evaluados, Mayor
  oportunidad, Sin recetas) + hoja con todos los filtros. Los filtros activos
  se ven como pastillas con ✕. Los filtros rápidos solo cambian la lista,
  nunca los cálculos de la matriz.
- **Matriz**: color más intenso donde hay más médicos, números animados y,
  al tocar un cuadrante, sus médicos de mayor oportunidad ahí mismo.
- **Lista**: tabla en computadora; tarjetas en teléfono e iPad vertical.
- **Evaluación**: respuestas con botones de un toque; las preguntas del
  médico se responden una vez; "Guardar y siguiente" abre el próximo
  pendiente.
- **Barra inferior** en el teléfono: Inicio · Matriz · Médicos · Pendientes · Más.
- **Deshacer** al eliminar una evaluación; aviso cuando hay una versión nueva.

## Tipografía
**Roboto Flex** en toda la app (incluidos los gráficos). Íconos: Material
Symbols con un único estilo.

## Interacción (igual en todo)
- **Pasar el mouse:** una capa del 8 % del color del texto sobre el fondo.
- **Presionar:** capa del 12 % y el elemento se encoge levemente (97 %).
- **Teclado:** contorno de 2 px en color primary, separado 2 px.
- **Táctil:** botones de al menos 44 px y campos de 48 px de alto.

## Tiempos de animación (iguales en todas las pantallas)
| Qué | Duración | Curva |
|---|---|---|
| Estados (mouse, presionar, casillas) | 150 ms | estándar |
| Tarjetas y paneles | 300 ms | enfatizada |
| Ventanas y pantallas que entran | 450 ms | enfatizada (desaceleración) |

Si el dispositivo pide "reducir movimiento", las animaciones se desactivan.

## Revisar el diseño
`node tests/e2e/capturas.mjs <carpeta>` toma capturas en teléfono (390 px),
iPad (820 px) y computadora (1440 px) de las pantallas principales.

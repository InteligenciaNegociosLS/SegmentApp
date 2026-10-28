# Reglas del proyecto SegmentApp

## Ramas
- Trabajar SIEMPRE sobre la rama `rediseno`.
- Nunca hacer push ni merge a `main`.
- Nunca tocar la rama `respaldo-2026-10-27`.

## Reglas permanentes
- Contexto: app web de La Santé (laboratorio farmacéutico, Venezuela) usada por
  ~60 Visitadores Médicos y 6 GD (Gerentes de Distrito; pueden aumentar).
  Stack actual: GitHub + Vercel + Firebase. Datos de fichero y recetas
  (~20 MB) cargados como archivos .gz en el repo.
- Usuario no técnico: explica en español simple, sin jerga innecesaria.
- Entrega archivos COMPLETOS listos para reemplazar, no fragmentos sueltos.
- Avísame siempre de cada cambio que hagas; que no me tope con sorpresas.
- Trabaja por fases. Al terminar cada fase: resumen corto, enlace de Preview
  de Vercel, y ESPERA mi confirmación antes de la siguiente.
- Nunca pidas ni escribas claves o secretos en el chat ni en el código.
  Todo va en variables de entorno (.env.example documentado, .env ignorado).
- Nunca borres datos. Las migraciones son aditivas y reversibles.
- Commits pequeños, un PR por fase hacia `rediseno`, con descripción clara.
- Diseño: Material Design 3 Expressive, tipografía Roboto Flex, colores,
  formas y animaciones consistentes; efectos hover idénticos en todos los
  elementos; mismos tiempos de animación y de carga entre pantallas.
- Mobile-first: debe funcionar bien en móvil, tablet e iPad.
- Idioma de la interfaz: español.

## Contexto entre sesiones
- Antes de trabajar, lee `docs/DECISIONES.md` (decisiones del dueño) y `docs/AUDIT.md`.

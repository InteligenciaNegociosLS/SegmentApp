/* ============================================================
   SegmentApp · Sistema de diseño Material 3 Expressive
   Un solo lugar para colores, formas, sombras, tipografía y
   movimiento. La app sigue usando los nombres de Tailwind de
   siempre (blue, slate, rose…), pero cada uno ahora apunta a un
   ROL de Material 3, así todo queda consistente:
     blue / indigo / sky  → primary   (color principal)
     slate / gray         → neutral   (superficies, textos, bordes)
     purple / violet      → tertiary  (acento expresivo)
     emerald / green / teal → success (positivo)
     rose / red / pink    → error
     amber / yellow / orange → warning
   Para cambiar el color de marca basta con cambiar "primary".
   Genera css/app.css con:  npm run css
============================================================ */

// Paletas tonales (de claro a oscuro). 600 es el tono principal del rol.
const primary = {
    50: '#eef3fd', 100: '#d3e3fd', 200: '#a8c7fa', 300: '#7cacf8', 400: '#4c8df6',
    500: '#1b6ef3', 600: '#0b57d0', 700: '#0842a0', 800: '#062e6f', 900: '#041e49', 950: '#02112b'
};
const neutral = {
    50: '#f7f9fc', 100: '#eef1f6', 200: '#e1e5ec', 300: '#c9ced8', 400: '#73777f',
    500: '#5d6068', 600: '#44474e', 700: '#33363c', 800: '#1f2227', 900: '#191c20', 950: '#0f1114'
};
const tertiary = {
    50: '#f7efff', 100: '#eedcff', 200: '#dbb9ff', 300: '#c69bf8', 400: '#a880db',
    500: '#8b66bd', 600: '#6e4da0', 700: '#563686', 800: '#3e1f6c', 900: '#280056', 950: '#1a0039'
};
const success = {
    50: '#ebf7ee', 100: '#c4eed0', 200: '#9fd9b0', 300: '#77c18f', 400: '#4ea86f',
    500: '#2a8e52', 600: '#146c3c', 700: '#0f5530', 800: '#0a3d22', 900: '#003915', 950: '#002109'
};
const error = {
    50: '#fff0ee', 100: '#ffdad6', 200: '#ffb4ab', 300: '#ff897d', 400: '#ff5449',
    500: '#de3730', 600: '#ba1a1a', 700: '#93000a', 800: '#690005', 900: '#410002', 950: '#2d0001'
};
const warning = {
    50: '#fff5e8', 100: '#ffddb3', 200: '#ffc27a', 300: '#f5a73b', 400: '#d98c00',
    500: '#b06f00', 600: '#8b5000', 700: '#6a3c00', 800: '#4a2800', 900: '#2e1500', 950: '#1f0d00'
};

export default {
    content: ['./index.html', './js/**/*.js'],
    // Clases que el panel de carga arma con variables (bg-${color}-50…)
    // y celdas de la matriz (cell-A_A…), que se arman con variables en matrix.js
    safelist: [
        { pattern: /^(bg|border|text)-(emerald|rose|amber|slate)-(50|200|700|800|900)$/ },
        { pattern: /^cell-[ABC]_[ABC]$/ }
    ],
    theme: {
        colors: {
            transparent: 'transparent',
            current: 'currentColor',
            white: '#ffffff',
            black: '#000000',
            primary, neutral, tertiary, success, error, warning,
            blue: primary, indigo: primary, sky: primary, cyan: primary,
            slate: neutral, gray: neutral, zinc: neutral, stone: neutral,
            purple: tertiary, violet: tertiary, fuchsia: tertiary,
            emerald: success, green: success, teal: success, lime: success,
            rose: error, red: error, pink: error,
            amber: warning, yellow: warning, orange: warning
        },
        // Tipografía: Roboto Flex en toda la app
        fontFamily: {
            sans: ['"Roboto Flex"', 'Roboto', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
            display: ['"Roboto Flex"', 'Roboto', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
            // Cifras: la misma Roboto Flex, con números del mismo ancho (ver entrada.css)
            mono: ['"Roboto Flex"', 'Roboto', 'system-ui', 'sans-serif']
        },
        extend: {
            // Formas M3: 4 · 8 · 12 · 16 · 20 · 28 · píldora
            borderRadius: {
                sm: '4px', DEFAULT: '8px', md: '8px', lg: '12px', xl: '16px', '2xl': '20px', '3xl': '28px'
            },
            // Elevación M3 (sombras suaves y tenues)
            boxShadow: {
                sm: '0 1px 2px 0 rgba(0,0,0,.10), 0 1px 3px 1px rgba(0,0,0,.06)',
                DEFAULT: '0 1px 2px 0 rgba(0,0,0,.12), 0 1px 3px 1px rgba(0,0,0,.08)',
                md: '0 1px 2px 0 rgba(0,0,0,.15), 0 2px 6px 2px rgba(0,0,0,.08)',
                lg: '0 1px 3px 0 rgba(0,0,0,.15), 0 4px 8px 3px rgba(0,0,0,.10)',
                xl: '0 1px 3px 0 rgba(0,0,0,.15), 0 4px 8px 3px rgba(0,0,0,.10)',
                '2xl': '0 2px 3px 0 rgba(0,0,0,.15), 0 6px 10px 4px rgba(0,0,0,.10)',
                inner: 'inset 0 1px 2px 0 rgba(0,0,0,.08)'
            },
            // Movimiento: mismos tiempos en toda la app
            transitionDuration: { DEFAULT: '200ms' },
            transitionTimingFunction: {
                DEFAULT: 'cubic-bezier(0.2, 0, 0, 1)',
                emphasized: 'cubic-bezier(0.05, 0.7, 0.1, 1)',
                'emphasized-accelerate': 'cubic-bezier(0.3, 0, 0.8, 0.15)'
            }
        }
    },
    plugins: []
};

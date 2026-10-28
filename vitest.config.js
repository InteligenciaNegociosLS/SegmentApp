import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        environment: 'jsdom',
        include: ['tests/unit/**/*.test.js', 'tests/db/**/*.test.js'],
        testTimeout: 120000,
        hookTimeout: 120000,
        // Ocultar los mensajes normales de carga de la app
        onConsoleLog: (log) => !log.includes('[SegmentApp]')
    }
});

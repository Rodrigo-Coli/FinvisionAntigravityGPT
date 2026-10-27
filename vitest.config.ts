/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
    plugins: [react()],
    resolve: {
        // Módulo virtual do vite-plugin-pwa (só existe no build do app).
        alias: { 'virtual:pwa-register/react': fileURLToPath(new URL('./tests/stubs/pwa-register-react.ts', import.meta.url)) }
    },
    test: {
        globals: true,
        environment: 'jsdom',
        include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    },
});

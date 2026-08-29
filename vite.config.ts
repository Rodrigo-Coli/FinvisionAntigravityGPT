import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { readFileSync } from 'node:fs';

// Versão do build, lida de public/version.json (a mesma que o app publica).
// Fica embutida no bundle para o app conseguir comparar 'o que estou rodando'
// com 'o que o servidor tem' SEM depender do service worker — no iOS o SW
// costuma não sinalizar atualização em PWA instalado na tela de início.
const APP_VERSION = JSON.parse(readFileSync('./public/version.json', 'utf-8')).version;

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(APP_VERSION)
  },
  plugins: [
    react(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.js',
      registerType: 'prompt',
      injectRegister: 'script',
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      },
      includeAssets: ['favicon.ico', 'logo.png', 'logo.svg', 'badge.png'],
      manifest: {
        name: 'Zyvion',
        short_name: 'Zyvion',
        description: 'Gestão financeira pessoal premium — controle total das suas finanças',
        theme_color: '#0A1F44',
        background_color: '#f8fafc',
        display: 'standalone',
        orientation: 'portrait-primary',
        start_url: '/',
        scope: '/',
        lang: 'pt-BR',
        id: '/',
        categories: ['finance', 'productivity'],
        prefer_related_applications: false,
        icons: [
          {
            src: 'logo.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: 'logo.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: 'logo.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          }
        ]
      },
      devOptions: {
        enabled: false,
        type: 'module'
      }
    })
  ],
  server: {
    port: 5050,
    strictPort: false,
    host: true,
    proxy: {
      '/api': {
        target: 'https://finvision-antigravity-gpt.vercel.app',
        changeOrigin: true,
        secure: false,
      }
    }
  }
});

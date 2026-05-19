import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // ─── Estratégia: usar o sw.js que está em public/ diretamente ───
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.js',
      // autoUpdate — registra e atualiza o SW automaticamente sem pedir
      registerType: 'autoUpdate',
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      },
      includeAssets: ['favicon.ico', 'logo.png', 'logo.svg'],
      manifest: {
        name: 'FinVision Pro',
        short_name: 'FinVision',
        description: 'Gestão financeira pessoal premium — controle total das suas finanças',
        theme_color: '#4f46e5',
        background_color: '#f8fafc',
        display: 'standalone',
        display_override: ['standalone', 'minimal-ui'],
        orientation: 'portrait-primary',
        start_url: '/?source=pwa',
        scope: '/',
        lang: 'pt-BR',
        id: 'com.finvision.pro',
        categories: ['finance', 'productivity'],
        prefer_related_applications: false,
        // ── ÍCONES SEM QUERY STRING (obrigatório para Chrome instalar como app) ──
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
            sizes: '192x192',
            type: 'image/png',
            purpose: 'maskable'
          },
          {
            src: 'logo.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          }
        ],
        shortcuts: [
          {
            name: 'Nova Transação',
            short_name: 'Lançar',
            url: '/?source=pwa#/history?add=true',
            icons: [{ src: 'logo.png', sizes: '192x192', type: 'image/png' }]
          },
          {
            name: 'Histórico',
            short_name: 'Histórico',
            url: '/?source=pwa#/history',
            icons: [{ src: 'logo.png', sizes: '192x192', type: 'image/png' }]
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

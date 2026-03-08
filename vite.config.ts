
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico'],
      manifest: {
        name: 'FinVision Pro',
        short_name: 'FinVision',
        description: 'Gestão financeira pessoal premium — offline-ready',
        theme_color: '#4f46e5',
        background_color: '#f8fafc',
        display: 'standalone',
        orientation: 'portrait-primary',
        start_url: '/',
        lang: 'pt-BR',
        icons: [
          {
            src: 'favicon.ico',
            sizes: '64x64 32x32 24x24 16x16',
            type: 'image/x-icon'
          },
          {
            src: 'logo.svg',
            sizes: '192x192',
            type: 'image/svg+xml',
            purpose: 'any maskable'
          },
          {
            src: 'logo.svg',
            sizes: '512x512',
            type: 'image/svg+xml',
            purpose: 'any maskable'
          }
        ]
      },
      workbox: {
        // Cache all app assets offline
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        // Network-first for Supabase API calls
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/.*\.supabase\.co\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'supabase-cache',
              expiration: {
                maxEntries: 200,
                maxAgeSeconds: 86400 // 24h
              },
              networkTimeoutSeconds: 10
            }
          }
        ]
      },
      // Dev options — enables SW in dev mode so we can test locally
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

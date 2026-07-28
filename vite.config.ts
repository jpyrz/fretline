import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['fretline.svg'],
      manifest: {
        name: 'Fretline Timing Lab',
        short_name: 'Fretline',
        description:
          'A local-first five-fret rhythm game timing and calibration prototype.',
        theme_color: '#070913',
        background_color: '#070913',
        display: 'standalone',
        start_url: '/',
        icons: [
          {
            src: '/fretline.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        navigateFallback: '/index.html',
        globPatterns: ['**/*.{js,css,html,svg,woff2,ogg,chart,ini,txt}'],
      },
    }),
  ],
})

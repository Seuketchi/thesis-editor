import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    server: {
      port: 3000,
      host: '0.0.0.0',
    },
    optimizeDeps: {
      exclude: ['texlyre-busytex'],
    },
    plugins: [
      react(),
      VitePWA({
        registerType: 'autoUpdate',
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
          maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
          runtimeCaching: [
            {
              urlPattern: /\.wasm$/,
              handler: 'CacheFirst' as const,
              options: {
                cacheName: 'wasm-cache',
                expiration: { maxAgeSeconds: 60 * 60 * 24 * 30 },
              },
            },
          ],
        },
        manifest: {
          name: 'Researchere',
          short_name: 'Researchere',
          description: 'Write your research without touching LaTeX',
          theme_color: '#7c3aed',
          background_color: '#ffffff',
          display: 'standalone',
          icons: [
            { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          ],
        },
      }),
    ],
    define: {
      'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('src/data/constants.ts')) {
              return 'data-constants';
            }
            if (id.includes('node_modules')) {
              if (id.includes('@tiptap') || id.includes('prosemirror')) {
                return 'vendor-tiptap';
              }
              if (id.includes('monaco-editor')) {
                return 'vendor-monaco';
              }
              if (id.includes('@supabase')) {
                return 'vendor-supabase';
              }
              if (id.includes('lucide-react') || id.includes('@radix-ui')) {
                return 'vendor-ui';
              }
              return 'vendor';
            }
          },
        },
      },
      chunkSizeWarningLimit: 1500,
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
  };
});

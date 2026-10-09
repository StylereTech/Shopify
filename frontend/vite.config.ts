import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  server: {
    port: 3001,
    proxy: {
      '/shopify/begin-install': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/shopify/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/shopify\/api/, '/api'),
      },
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      }
    }
  },
  base: '/shopify/',
  build: {
    outDir: 'dist',
    sourcemap: true,
  }
})

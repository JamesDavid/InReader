import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Proxy API requests to backend during development
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true
      }
    }
  },
  optimizeDeps: {
    include: ['gun'],
    exclude: []
  },
  resolve: {
    alias: {
      'gun': 'gun'
    }
  },
  build: {
    commonjsOptions: {
      include: [/gun/, /node_modules/],
      transformMixedEsModules: true
    }
  }
})

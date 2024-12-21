import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  base: process.env.NODE_ENV === 'production' ? '/InReader/' : '/',
  plugins: [react()],
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

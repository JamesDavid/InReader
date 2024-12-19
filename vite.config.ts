import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
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

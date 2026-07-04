import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
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
  esbuild: {
    // In production builds, tree-shake debug logging out of the bundle while
    // keeping console.error / console.warn for real problems.
    pure: mode === 'production' ? ['console.log', 'console.debug', 'console.info'] : [],
  },
}))

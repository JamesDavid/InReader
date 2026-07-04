import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Node by default (services / SSRF utils). DOM-dependent tests opt in with a
    // `// @vitest-environment jsdom` docblock at the top of the file.
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}', 'api/**/*.test.js'],
    globals: false,
  },
})

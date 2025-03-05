/// <reference types="vitest" />
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    setupFiles: ['tests/setup.ts'],
    environment: 'node',
    include: ['tests/**.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
    },
    clearMocks: true,
  },
})

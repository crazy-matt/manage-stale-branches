/// <reference types="vitest" />
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    setupFiles: ['tests/setup.ts'],
    environment: 'node',
    include: ['tests/**.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      reporter: ['text', 'json', 'html'],
    },
    mockReset: true,
    unstubEnvs: true,
  },
})

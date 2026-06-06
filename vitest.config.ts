// vitest.config.ts (§H4)
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      thresholds: {
        lines:      80,
        functions:  80,
        branches:   70,
        statements: 80,
      },
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.d.ts', 'src/scripts/**', 'src/workers/**', 'src/emails/**'],
    },
    testTimeout: 30_000,  // AI-related tests can be slow
    // Run unit tests in parallel, integration tests serially
    pool: 'forks',
  },
})

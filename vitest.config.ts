import { readFileSync } from 'node:fs'
import { defineConfig } from 'vitest/config'
import { cloudflareTest } from '@cloudflare/vitest-plugin'

export default defineConfig({
  plugins: [
    cloudflareTest({
      miniflare: {
        compatibilityDate: '2024-12-01',
        d1Databases: ['DB'],
        bindings: { SCHEMA_SQL: readFileSync('db/schema.sql', 'utf8') },
      },
    }),
  ],
  test: {
    include: ['test/**/*.test.ts'],
    setupFiles: ['./test/setup.ts'],
  },
})

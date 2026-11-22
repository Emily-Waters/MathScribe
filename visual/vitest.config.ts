// The visual check's own config, so `npm test` never runs it: `npm run visual` (see render.check.ts).
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['visual/*.check.ts'],
    environment: 'node',
    // (The modules registered first, as the app's entry does.)
    setupFiles: ['src/test/setup.ts'],
  },
})

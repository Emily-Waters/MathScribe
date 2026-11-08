import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  plugins: [react()],
  // GitHub Pages serves the site from https://emily-waters.github.io/MathScribe/,
  // so built asset URLs need that prefix. `npm run dev` keeps serving from /.
  base: command === 'build' ? '/MathScribe/' : '/',
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
}))

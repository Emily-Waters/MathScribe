import { describe, expect, it } from 'vitest'

/** Each core file's source, by path. */
const CORE_SOURCES = import.meta.glob<string>('./core/*.ts', { query: '?raw', import: 'default', eager: true })

/** The path each import (or re-export) of a file is from. */
const IMPORT_PATH = /^(?:import|export)\b[^'"]*?from\s+['"]([^'"]+)['"]/gm

describe('engine boundaries', () => {
  it('finds the core files', () => {
    expect(Object.keys(CORE_SOURCES)).toContain('./core/calculator.ts')
  })

  // The core calls modules through EngineModule's hooks; it never imports one, so a
  // module can be left out (or another added) without the core changing.
  it.each(Object.entries(CORE_SOURCES))('%s imports no module', (_path, source) => {
    const paths = [...source.matchAll(IMPORT_PATH)].map((m) => m[1])
    expect(paths.filter((p) => p.includes('/modules/'))).toEqual([])
  })
})

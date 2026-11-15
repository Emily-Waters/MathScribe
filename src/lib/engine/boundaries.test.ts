import { describe, expect, it } from 'vitest'

/** Every source file under src/lib, by its path from here (`./core/math.ts`, `../builtins.ts`). */
const SOURCES = import.meta.glob<string>(['../**/*.ts', '!../**/*.test.ts'], { query: '?raw', import: 'default', eager: true })

/** The path each import (or re-export) of a file is from. */
const IMPORT_PATH = /^(?:import|export)\b[^'"]*?from\s+['"]([^'"]+)['"]/gm

/** A relative import from a file, as a path from here (so it's a key of SOURCES); undefined for a package. */
function resolve(from: string, imported: string): string | undefined {
  if (!imported.startsWith('.')) return undefined
  const parts = from.split('/').slice(0, -1).filter((p) => p !== '.')
  for (const step of imported.split('/')) {
    if (step === '..') {
      // Above here, a `..` is one more level up.
      if (parts.length && parts.at(-1) !== '..') parts.pop()
      else parts.push('..')
    } else if (step !== '.') parts.push(step)
  }
  return parts[0] === '..' ? parts.join('/') : `./${parts.join('/')}`
}

/** What a file imports, as paths from here. */
const importsOf = (path: string) =>
  [...(SOURCES[path] ?? '').matchAll(IMPORT_PATH)].map((m) => resolve(path, m[1])).filter((p) => p !== undefined)

/** Every file a file needs, at any depth, with the chain of imports that reaches each. */
function reachable(start: string): Map<string, string[]> {
  const chains = new Map<string, string[]>([[start, [start]]])
  const queue = [start]
  for (let path = queue.shift(); path; path = queue.shift()) {
    for (const next of importsOf(path)) {
      if (chains.has(next)) continue
      chains.set(next, [...chains.get(path)!, next])
      queue.push(next)
    }
  }
  return chains
}

const CORE_FILES = Object.keys(SOURCES).filter((p) => p.startsWith('./core/'))

describe('engine boundaries', () => {
  it('finds the core files and what they import', () => {
    expect(CORE_FILES).toContain('./core/calculator.ts')
    expect(importsOf('./core/calculator.ts')).toContain('./core/math.ts')
    expect(importsOf('./core/tex.ts')).toContain('../builtins.ts')
    // (And through other files: the public entry reaches the chemistry module's formulas through its module.)
    expect(reachable('./index.ts').get('./modules/chemistry/chemistry.ts')).toBeDefined()
  })

  // The core calls modules through EngineModule's hooks; it never needs one, directly or
  // through another file, so a module can be left out (or another added) without the core changing.
  it.each(CORE_FILES)('%s needs no module, at any depth', (path) => {
    const intoModules = [...reachable(path).values()].filter((chain) => chain.at(-1)!.startsWith('./modules/'))
    expect(intoModules.map((chain) => chain.join(' → '))).toEqual([])
  })
})

import { describe, expect, it } from 'vitest'
import { EngineModule, inDependencyOrder, type ModuleClass } from './core/module.ts'
import { sheetModules } from './index.ts'

/** Every source file under src/lib, by its path from here (`./core/math.ts`, `../builtins.ts`). */
const SOURCES = import.meta.glob<string>(['../**/*.ts', '!../**/*.test.ts'], { query: '?raw', import: 'default', eager: true })

/** The path each import (or re-export) of a file is from. */
const IMPORT_PATH = /^(?:import|export)\b[^'"]*?(?:from\s+)?['"]([^'"]+)['"]/gm

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

/** Every source file of the app outside the engine (the editor, the components, the rest of lib), by its path from here. */
const OUTSIDE = import.meta.glob<string>(['../../**/*.{ts,tsx}', '!./**', '!../../**/*.test.ts'], { query: '?raw', import: 'default', eager: true })

/** What the rest of the app may import of the engine: its public entry, and each module's public face. */
const PUBLIC_FACE = /^\.\/(?:index\.ts|modules\/[^/]+\/index\.ts)$/

/**
 * The one file outside that reaches inside, and why: the tree's lexer reads
 * units as mathjs knows them (the engine's mathjs instance, which the engine's
 * entry would load all of the engine to give it).
 */
const REACHES_INSIDE: ReadonlyMap<string, string> = new Map([['../tree/lexer.ts', './core/literals.ts']])

/** Where this folder is, from src/: a path from here starts there. */
const HERE = ['lib', 'engine']

/** A path from here, as one inside the engine (`./core/math.ts`) if it is, so it compares with PUBLIC_FACE; else as it is. */
function fromEngine(path: string): string {
  const parts = [...HERE]
  for (const step of path.split('/')) {
    if (step === '..') parts.pop()
    else if (step !== '.') parts.push(step)
  }
  return parts[0] === HERE[0] && parts[1] === HERE[1] ? `./${parts.slice(2).join('/')}` : path
}

/** What a file outside imports of the engine, as paths inside it. */
const engineImportsOf = (file: string) =>
  [...(OUTSIDE[file] ?? '').matchAll(IMPORT_PATH)].map((m) => resolve(file, m[1])).filter((p) => p !== undefined)
    .map(fromEngine).filter((p) => p.startsWith('./'))

describe('the engine, from outside', () => {
  it('finds the files outside it, and what they import of it', () => {
    expect(Object.keys(OUTSIDE)).toContain('../../editor/language.ts')
    expect(Object.keys(OUTSIDE)).toContain('../../components/PreviewPane.tsx')
    expect(Object.keys(OUTSIDE)).not.toContain('./index.ts')
    expect(engineImportsOf('../../editor/language.ts')).toContain('./index.ts')
    expect(engineImportsOf('../../editor/tableMenu.ts')).toContain('./modules/series/index.ts')
  })

  // The rest of the app uses the engine through its entry, and a module through its
  // public face, never a module's or the core's own files: so those can change freely.
  it('is used only through its entry and its modules’ public faces', () => {
    const inside = Object.keys(OUTSIDE).flatMap((file) => engineImportsOf(file)
      .filter((p) => !PUBLIC_FACE.test(p) && REACHES_INSIDE.get(file) !== p)
      .map((p) => `${file} → ${p}`))
    expect(inside).toEqual([])
  })
})

/** A module's folder, from the path of a file in it: `./modules/chemistry/…` → chemistry. */
const folderOf = (path: string) => /^\.\/modules\/([^/]+)\//.exec(path)?.[1]

/** Each module class's folder, by the class's name (from the file declaring it). */
const MODULE_FOLDERS = new Map(Object.entries(SOURCES).flatMap(([path, source]) => {
  const declared = /export class (\w+) extends EngineModule/.exec(source)
  const folder = folderOf(path)
  return declared && folder ? [[declared[1], folder] as const] : []
}))

describe('module dependencies', () => {
  const modules = sheetModules()

  it('finds every module a sheet has, each in a folder of its own', () => {
    expect(modules.map((m) => MODULE_FOLDERS.get(m.constructor.name))).not.toContain(undefined)
    expect(new Set(MODULE_FOLDERS.values()).size).toBe(MODULE_FOLDERS.size)
  })

  // A module imports from another only if it says it requires it, so the
  // modules' dependencies are what their `requires` say, and nothing more.
  it.each(modules.map((m) => [m.constructor.name, m] as const))('%s imports only the modules it requires', (name, module) => {
    const own = MODULE_FOLDERS.get(name)
    const allowed = new Set([own, ...module.requires.map((r) => MODULE_FOLDERS.get(r.name))])
    const files = Object.keys(SOURCES).filter((p) => folderOf(p) === own)
    const outside = files.flatMap((file) => importsOf(file).filter((p) => folderOf(p) && !allowed.has(folderOf(p))).map((p) => `${file} → ${p}`))
    expect(outside).toEqual([])
  })

  it('orders modules after those they require', () => {
    class Base extends EngineModule {}
    class Built extends EngineModule {
      override readonly requires = [Base]
    }
    const base = new Base()
    const built = new Built()
    expect(inDependencyOrder([built, base])).toEqual([base, built])
  })

  it('says when a module is missing one it requires, or modules require each other round in a circle', () => {
    class Base extends EngineModule {}
    class Built extends EngineModule {
      override readonly requires = [Base]
    }
    expect(() => inDependencyOrder([new Built()])).toThrow('Built requires Base, which isn\'t among the modules given.')
    class A extends EngineModule {
      override readonly requires: readonly ModuleClass[] = [B]
    }
    class B extends EngineModule {
      override readonly requires: readonly ModuleClass[] = [A]
    }
    expect(() => inDependencyOrder([new A(), new B()])).toThrow('requires itself')
  })
})

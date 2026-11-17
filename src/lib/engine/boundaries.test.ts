/**
 * The boundaries between the engine's core, the modules (src/modules/), and the
 * rest of the app, checked from the files' imports:
 *
 *   - the core needs no module, at any depth (it calls them through hooks);
 *   - a module imports only the module API (src/lib/plugin.ts), its own folder,
 *     and the public face of a module it `requires`;
 *   - the rest of the app uses the engine only through its entry
 *     (engine/index.ts), and a module only through its `public.ts` (and
 *     loads them all through src/modules/index.ts, which registers them).
 */
import { describe, expect, it } from 'vitest'
import { EngineModule, inDependencyOrder, type ModuleClass } from './core/module.ts'
import { sheetModules } from './index.ts'

/** Every source file of the app (tests aside), by its path from here. */
const FILES = import.meta.glob<string>(['../../**/*.{ts,tsx}', '!../../**/*.test.ts'], { query: '?raw', import: 'default', eager: true })

/** Where this folder is, from src/. */
const HERE = ['lib', 'engine']

/** A path from here as a path from src/: `./core/math.ts` → lib/engine/core/math.ts. */
function fromSrc(path: string): string {
  const parts = [...HERE]
  for (const step of path.split('/')) {
    if (step === '..') parts.pop()
    else if (step !== '.') parts.push(step)
  }
  return parts.join('/')
}

/** Every source file's text, by its path from src/. */
const SOURCES: ReadonlyMap<string, string> = new Map(Object.entries(FILES).map(([path, text]) => [fromSrc(path), text]))

/**
 * The path each import (or re-export) of a file is from: the ones that load
 * the file, not `import type`, which TypeScript leaves out of what runs.
 */
const IMPORT_PATH = /^(?:import|export)(?!\s+type\b)\b[^'"]*?(?:from\s+)?['"]([^'"]+)['"]/gm

/** A relative import from a file (both from src/), as a path from src/; undefined for a package. */
function resolve(from: string, imported: string): string | undefined {
  if (!imported.startsWith('.')) return undefined
  const parts = from.split('/').slice(0, -1)
  for (const step of imported.split('/')) {
    if (step === '..') parts.pop()
    else if (step !== '.') parts.push(step)
  }
  return parts.join('/')
}

/** What a file imports, as paths from src/. */
const importsOf = (path: string) =>
  [...(SOURCES.get(path) ?? '').matchAll(IMPORT_PATH)].map((m) => resolve(path, m[1])).filter((p) => p !== undefined)

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

/** The places that matter, as paths from src/. */
const ENGINE = 'lib/engine/'
const CORE = 'lib/engine/core/'
const ENGINE_ENTRY = 'lib/engine/index.ts'
const MODULE_API = 'lib/plugin.ts'
const MODULES = 'modules/'
const MODULE_LIST = 'modules/index.ts'

/** A module's folder, from the path of a file in it: modules/chemistry/… → chemistry. */
const folderOf = (path: string) => (path.startsWith(MODULES) ? /^modules\/([^/]+)\//.exec(path)?.[1] : undefined)

/** A module's public face, what the rest of the app may use of it: modules/series/public.ts. */
const isPublicFace = (path: string) => /^modules\/[^/]+\/public\.ts$/.test(path)

const CORE_FILES = [...SOURCES.keys()].filter((p) => p.startsWith(CORE))

describe('the core', () => {
  it('finds the core files and what they import', () => {
    expect(CORE_FILES).toContain(`${CORE}calculator.ts`)
    expect(importsOf(`${CORE}calculator.ts`)).toContain(`${CORE}math.ts`)
    expect(importsOf(`${CORE}tex.ts`)).toContain('lib/builtins.ts')
    // (And through other files: a module's entry reaches its formulas through its class.)
    expect(reachable(`${MODULES}chemistry/index.ts`).get(`${MODULES}chemistry/chemistry.ts`)).toBeDefined()
  })

  // The core calls modules through EngineModule's hooks; it never needs one, directly or
  // through another file, so a module can be left out (or another added) without the core changing.
  it.each(CORE_FILES)('%s needs no module, at any depth', (path) => {
    const intoModules = [...reachable(path).values()].filter((chain) => chain.at(-1)!.startsWith(MODULES))
    expect(intoModules.map((chain) => chain.join(' → '))).toEqual([])
  })
})

/**
 * The files outside that reach inside the engine, and why: the module API
 * (it's what modules may use of the engine, so it gathers it), and the tree's
 * lexer, which reads units as mathjs knows them (the engine's mathjs instance:
 * the entry would load all of the engine to give it).
 */
const REACHES_INSIDE: ReadonlyMap<string, (path: string) => boolean> = new Map<string, (path: string) => boolean>([
  [MODULE_API, () => true],
  ['lib/tree/lexer.ts', (p) => p === `${CORE}literals.ts`],
])

describe('the engine and the modules, from the rest of the app', () => {
  const rest = [...SOURCES.keys()].filter((p) => !p.startsWith(ENGINE) && !p.startsWith(MODULES))

  it('finds the files and what they import', () => {
    expect(rest).toContain('editor/language.ts')
    expect(rest).toContain('components/PreviewPane.tsx')
    expect(importsOf('editor/vocabulary.ts')).toContain(ENGINE_ENTRY)
    expect(importsOf('lib/output/plot.ts')).toContain(`${MODULES}series/public.ts`)
  })

  // The rest of the app uses the engine through its entry, and a module through its
  // public face, never the core's or a module's own files: so those can change freely.
  it('uses the engine only through its entry, and a module only through its public face', () => {
    const inside = rest.flatMap((file) => importsOf(file)
      .filter((p) => (p.startsWith(ENGINE) && p !== ENGINE_ENTRY) || (p.startsWith(MODULES) && p !== MODULE_LIST && !isPublicFace(p)))
      .filter((p) => !REACHES_INSIDE.get(file)?.(p))
      .map((p) => `${file} → ${p}`))
    expect(inside).toEqual([])
  })
})

/** Each module class's folder, by the class's name (from the file declaring it). */
const MODULE_FOLDERS = new Map([...SOURCES].flatMap(([path, source]) => {
  const declared = /export class (\w+) extends EngineModule/.exec(source)
  const folder = folderOf(path)
  return declared && folder ? [[declared[1], folder] as const] : []
}))

describe('modules', () => {
  const modules = sheetModules()

  it('finds every module in src/modules/, each in a folder of its own', () => {
    expect(modules.map((m) => MODULE_FOLDERS.get(m.constructor.name))).not.toContain(undefined)
    expect(new Set(MODULE_FOLDERS.values()).size).toBe(MODULE_FOLDERS.size)
    expect(modules.length).toBe(MODULE_FOLDERS.size)
  })

  // A module uses MathScribe through the module API, and another module only if it
  // says it requires it (through that module's public face): so what a module may
  // use is one documented file, and the modules' dependencies are what they say.
  it.each(modules.map((m) => [m.constructor.name, m] as const))('%s imports only the module API, its own folder, and the modules it requires', (name, module) => {
    const own = MODULE_FOLDERS.get(name)
    const required = new Set(module.requires.map((r) => MODULE_FOLDERS.get(r.name)))
    const files = [...SOURCES.keys()].filter((p) => folderOf(p) === own)
    const outside = files.flatMap((file) => importsOf(file)
      .filter((p) => p !== MODULE_API && folderOf(p) !== own && !(isPublicFace(p) && required.has(folderOf(p))))
      .map((p) => `${file} → ${p}`))
    expect(outside).toEqual([])
  })

  // (The engine's entry doesn't load them: a module loads the module API, which mustn't load every module back.)
  it('are registered from src/modules/, through its list, which the app and the tests load first', () => {
    expect(importsOf('main.tsx')[0]).toBe(MODULE_LIST)
    expect(importsOf('test/setup.ts')).toContain(MODULE_LIST)
    expect(importsOf(ENGINE_ENTRY)).not.toContain(MODULE_LIST)
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

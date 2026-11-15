/**
 * Engine modules: what extends the engine (chemistry, for one) without the core
 * knowing about it. A module is a subclass of EngineModule that overrides the
 * hooks it needs; each hook's default leaves the engine as it is. The core
 * calls the hooks; it never imports a module.
 *
 * Two kinds of hook:
 *  - A Calculator's own (the "Per calculator" ones): called by the Calculator
 *    it was given to, with its own state (a sheet's species names).
 *  - Shared ones (the "Shared" ones): every Calculator uses one mathjs instance
 *    and one `@` tree, so units, the text that's read into them and `@` members
 *    work the same everywhere (the editor's suggestions too). These are
 *    installed once per class, by installModule (engine/index.ts installs
 *    MathScribe's when it's loaded), and must not depend on the instance's own state.
 */
import type { FunctionNode, MathNode } from 'mathjs'
import { BUILTINS, type Namespace } from '../../builtins.ts'
import type { BuiltinConstant, NamespaceConstant } from '../../constants.ts'
import type { VariableFields } from '../../values.ts'
import type { LineResult } from './results.ts'

/** What a module can do to the Calculator that called it. */
export interface ModuleHost {
  /** Store a variable, as a line assigning it would. */
  store(name: string, v: VariableFields): void
}

/** A unit literal read so far: the unit as mathjs reads it, and where the text after it starts. */
export interface ReadUnit {
  text: string
  end: number
}

export abstract class EngineModule {
  /** What it's known by, for messages and tests. */
  abstract readonly name: string

  // -------------------------------------------------------------------------
  // Shared
  // -------------------------------------------------------------------------

  /** Add its functions to mathjs: called once, when the first module of its class is installed. */
  install(): void {}

  /** Its own namespace in the `@` tree (`@chem`), made fresh: put in @ when it's installed. */
  namespace(): Namespace | undefined {
    return undefined
  }

  /**
   * Whether a unit labels a quantity rather than measuring it, as a species
   * does (mol EDTA). A label unit is worth exactly 1 and has no prefix: it's kept
   * through a conversion (mol EDTA to mmol is mmol EDTA), and set aside while a
   * unit is tidied.
   */
  isLabelUnit(_unitName: string): boolean {
    return false
  }

  /** A label unit as LaTeX (undefined if it isn't this module's); `alone`: the unit has nothing else, so it's a ratio of them. */
  labelUnitTex(_unitName: string, _alone: boolean): string | undefined {
    return undefined
  }

  /** What follows a unit literal that's part of it (`2.0 mol {EDTA}`): the unit with it, and where the text after it starts. */
  readAfterUnit(_src: string, _unit: ReadUnit): ReadUnit | undefined {
    return undefined
  }

  /** An expression's text, rewritten before mathjs reads it (unit literals are already read). */
  rewriteExpression(src: string): string {
    return src
  }

  /** Functions that aren't written in the working, only what's inside them. */
  readonly unwrittenFunctions: readonly string[] = []

  /** A subscript in words as LaTeX, if it's in this module's notation (`m_{H2O}`, chemistry). */
  subscriptTex(_subscript: string): string | undefined {
    return undefined
  }

  /** Text in a display name with this module's notation as inline maths, `$…$` (`{Na^+}` as chemistry). */
  markupText(text: string): string {
    return text
  }

  /** A message with the engine's inside names written as the sheet wrote them. */
  readableMessage(message: string): string {
    return message
  }

  /** A sentence added to the explanation of units that don't match. */
  readonly unitMismatchNote: string | undefined = undefined

  /** Settings after an assigned name that are this module's (`m:formula = …`). */
  readonly lineSettings: readonly string[] = []

  // -------------------------------------------------------------------------
  // Per calculator
  // -------------------------------------------------------------------------

  /** A line's text before anything reads it (a species' name as its formula). */
  rewriteLine(text: string): string {
    return text
  }

  /** Before a line is worked out. */
  beginLine(): void {}

  /** The line's settings that are this module's (see lineSettings), once its declaration is read. */
  useLineSettings(_settings: readonly string[]): void {}

  /** After a line is worked out, whatever happened. */
  endLine(): void {}

  /** A line this module works out itself (a reaction), or undefined if it isn't one. */
  evaluateLine(_input: string, _host: ModuleHost): LineResult | undefined {
    return undefined
  }

  /** A call as LaTeX, if it's one of this module's functions; `tex` writes a node. */
  functionTex(_node: FunctionNode, _tex: (n: MathNode) => string): string | undefined {
    return undefined
  }

  /** Whether a number times a unit, as typed, is an exact count (no sig-fig limit). */
  isExactCount(_number: MathNode, _unit: MathNode, _literals: Map<number, string>): boolean {
    return false
  }

  /** A built-in constant's value as this module gives it (a molar mass given its species). */
  constantValue(value: unknown, _constant: BuiltinConstant | NamespaceConstant | undefined): unknown {
    return value
  }

  /** What's wrong with a line's value, by this module's rules, if anything. */
  valueProblem(_value: unknown): string | undefined {
    return undefined
  }
}

// ---------------------------------------------------------------------------
// The shared hooks of every module installed
// ---------------------------------------------------------------------------

/** One module of each class, by class, for the shared hooks. */
const installed = new Map<abstract new () => EngineModule, EngineModule>()

/** Install a module's shared hooks, if one of its class isn't installed already. */
export function installModule(module: EngineModule): void {
  const kind = module.constructor as abstract new () => EngineModule
  if (installed.has(kind)) return
  installed.set(kind, module)
  module.install()
  const namespace = module.namespace()
  if (namespace) BUILTINS.add(namespace)
}

const shared = (): EngineModule[] => [...installed.values()]

export const isLabelUnit = (unitName: string) => shared().some((m) => m.isLabelUnit(unitName))

export const labelUnitTex = (unitName: string, alone: boolean) =>
  shared().map((m) => m.labelUnitTex(unitName, alone)).find((tex) => tex !== undefined)

export function readAfterUnit(src: string, unit: ReadUnit): ReadUnit {
  for (const m of shared()) {
    const more = m.readAfterUnit(src, unit)
    if (more) return more
  }
  return unit
}

export const rewriteExpression = (src: string) => shared().reduce((text, m) => m.rewriteExpression(text), src)

export const isUnwrittenFunction = (name: string) => shared().some((m) => m.unwrittenFunctions.includes(name))

export const moduleSubscriptTex = (subscript: string) =>
  shared().map((m) => m.subscriptTex(subscript)).find((tex) => tex !== undefined)

export const markupText = (text: string) => shared().reduce((t, m) => m.markupText(t), text)

export const moduleReadableMessage = (message: string) => shared().reduce((s, m) => m.readableMessage(s), message)

export const unitMismatchNotes = () => shared().map((m) => m.unitMismatchNote).filter((n) => n !== undefined)

export const isModuleLineSetting = (setting: string) => shared().some((m) => m.lineSettings.includes(setting))

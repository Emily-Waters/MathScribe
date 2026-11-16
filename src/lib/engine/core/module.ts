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
import type { Values } from './scope.ts'
import { BUILTINS, type Member } from '../../builtins.ts'
import type { BuiltinConstant, NamespaceConstant } from '../../constants.ts'
import type { Contributions, Variable, VariableFields } from '../../values.ts'
import type { DisplayMode, Notation, Precision } from '../../syntax.ts'
import type { formatWithUncertainty } from '../../sigfigs.ts'
import type { LineResult, ParsedLine } from './results.ts'

/** A value as shown: its number (in its display unit), formatted, and its unit. */
export interface ValueParts {
  x: number
  num: string
  unit?: string
}

/** A value and its uncertainty as shown, rounded by the uncertainty convention, with its unit. */
export type UncertainParts = ReturnType<typeof formatWithUncertainty> & { unit?: string }

/**
 * What the core offers its modules: the Calculator's variables, and how it
 * works out, rounds and writes values. A module builds on these rather than
 * doing any of it its own way, so what it adds behaves as the rest of the sheet does.
 */
export interface ModuleHost {
  // Variables
  /** A variable's value (undefined if there's none). */
  value(name: string): unknown
  /** Everything kept about a variable: sig figs, uncertainty, how it's shown. */
  variable(name: string): Variable | undefined
  /** Whether a name is a variable here. */
  has(name: string): boolean
  /** Every variable's name, here. */
  names(): Iterable<string>
  /** Store a variable, as a line assigning it would. */
  store(name: string, v: VariableFields): void
  /** Remove a variable, and everything kept about it. */
  forget(name: string): void
  /** A series' values by number: t_1, t_2, … as 1 → "t_1", 2 → "t_2". */
  seriesRows(base: string): Map<number, string>
  /** Make `base` a series that looks up these variables (a selection; see Views), or forget those under a namespace. */
  setView(base: string, names: (string | undefined)[]): void
  clearViews(namespace: string): void
  /** A new source of uncertainty, uncorrelated with every other. */
  newSource(): number

  // Working out
  /** Work out a line, as the sheet would (in the scope here). */
  evaluateLine(text: string, mode: DisplayMode): LineResult
  /** Work out a parsed line (an assignment or expression) the core's way: sig figs, uncertainty, working, how it's shown. */
  evaluateParsed(node: MathNode, line: ParsedLine): LineResult
  /** Text as a line's expression reads it (unit literals and all), parsed. */
  parse(text: string): MathNode
  /** A parsed expression's value here. */
  evaluateNode(node: MathNode): unknown
  /** Text with each `@constant` as the value it stands for (or what's wrong with one). */
  expandConstants(text: string): { text: string; error?: string }
  /** Whether the sheet defines a function of this name (which then wins over a built-in one). */
  isUserFunction(name: string): boolean
  /** Each uncertainty source's contribution to an expression's value. */
  propagate(node: MathNode): Contributions
  /** The sig figs an expression's value has, from the numbers in it as typed. */
  sigFigs(node: MathNode, literals: Map<number, string>): number
  /** Run `fn` in a scope of its own inside this one: what it stores is gone after. */
  inScratchScope<T>(fn: () => T): T
  /** Values to evaluate with, in a scope of their own inside this one (so setting one changes nothing here). */
  scratchValues(): Values
  /** An expression's value here, as a line would read it (`200 ms`, a variable). */
  evaluateExpression(text: string): unknown
  /** The total uncertainty from these sources, in the units of `like`. */
  total(contributions: Contributions | undefined, like: unknown): unknown

  // Showing values
  /** A value as LaTeX, to `sf` sig figs, with its uncertainty; `forced`: its sig figs were declared. */
  valueTex(value: unknown, sf?: number, unc?: unknown, uncSf?: number, forced?: boolean): string
  /** A value's number and unit, to `sf` sig figs (null if it isn't a number or quantity); `forced`: its sig figs were declared. */
  split(value: unknown, sf: number, forced?: boolean): ValueParts | null
  /** A value and its uncertainty, rounded together (null if there's no uncertainty to show). */
  uncertainParts(value: unknown, unc: unknown, uncSf?: number): UncertainParts | null
  /** Run `fn` with numbers formatted in `notation`. */
  inNotation<T>(notation: Notation | undefined, fn: () => T): T
  /** An expression as typed, as LaTeX. */
  expressionTex(expr: string): string
  /** A parsed expression as LaTeX, its numbers as typed. */
  tex(node: MathNode, literals: Map<number, string>): string
}

/**
 * When in reading a line a form is offered it: as written (`raw`), or once a
 * namespace's members are inside names (`a.x_1` → a__x_1, `members`).
 */
export const LINE_STAGE = { raw: 'raw', members: 'members', expression: 'expression' } as const
export type LineStage = (typeof LINE_STAGE)[keyof typeof LINE_STAGE]

/**
 * What the core has read of a line by the `expression` stage: its settings
 * taken off the name (`x:3:cm = …`), its constants and `delta F`s written out,
 * and its numbers as typed.
 */
export interface PreparedLine {
  literals: Map<number, string>
  declaredSf?: Precision
  displayUnit?: string
  notation?: Notation
}

/** A line being worked out, as a form sees it. */
export interface FormLine {
  /** Its text, at the form's stage, without spaces at either end. */
  text: string
  mode: DisplayMode
  /** Whether the mode was asked for (on the line, or by its block). */
  explicit: boolean
  /** At the `expression` stage: what the core has read of it. */
  prepared?: PreparedLine
}

/**
 * A kind of line the engine works out as a whole, rather than as an
 * assignment or expression: `@table(t, x)`, `r = @chem.reaction({…})`. A module
 * adds its own (EngineModule.lineForms); a line goes to the first whose
 * `evaluate` takes it.
 */
export abstract class LineForm {
  /** When it's offered the line. */
  readonly stage: LineStage = LINE_STAGE.members

  /** The line worked out, if it's this form's; undefined if it isn't. */
  abstract evaluate(line: FormLine, host: ModuleHost): LineResult | undefined
}

/** A unit literal read so far: the unit as mathjs reads it, and where the text after it starts. */
export interface ReadUnit {
  text: string
  end: number
}

/**
 * How a tuple is shown, if not as a plain one, (3.0, 4.0) m: a look a module
 * gives it (a vector, ⟨3.0, 4.0⟩ m). The core keeps a tuple's look with it, through
 * variables and functions, and asks the module to draw it.
 */
export type TupleLook = string

/** A look a line's settings give what it assigns, and the warning when what it assigns isn't a tuple. */
export interface LookSetting {
  look: TupleLook
  notATuple: string
}

/** A variable made from the one a line assigns (F_x from F): its name, value, and which of the tuple's values it is, if one. */
export interface DerivedVariable {
  name: string
  value: unknown
  component?: number
}

/** Where a setting on a name is written, besides a line assigning it: on a function's result, or a name being unpacked. */
export const SETTING_PLACE = { functionResult: 'functionResult', unpacked: 'unpacked' } as const
export type SettingPlace = (typeof SETTING_PLACE)[keyof typeof SETTING_PLACE]

/** A kind of module: its class, by which another module says it needs it. */
// (Whatever its constructor takes: a module makes its own state.)
export type ModuleClass = abstract new (...args: never[]) => EngineModule

export abstract class EngineModule {
  /**
   * The modules it builds on (a module that adds to vectors needs VectorModule):
   * they're installed before it, and a sheet given it without them is an error.
   * It may import from those modules, and only those (boundaries.test.ts checks).
   */
  readonly requires: readonly ModuleClass[] = []

  // -------------------------------------------------------------------------
  // Shared
  // -------------------------------------------------------------------------

  /** Add its functions to mathjs: called once, when the first module of its class is installed. */
  install(): void {}

  /** Its own members of the `@` tree (`@chem`, `@vector(…)`), made fresh: put in @ when it's installed. */
  builtinMembers(): Member[] {
    return []
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

  /** An expression's text, rewritten before its unit literals are read (`<3.0, 4.0> N` → @vector(3.0, 4.0) * N). */
  expandSyntax(src: string): string {
    return src
  }

  /** An expression's text, rewritten before mathjs reads it (unit literals are already read). */
  rewriteExpression(src: string): string {
    return src
  }

  /** How to write a bracketed list with commas, `(a, b)` (which isn't a value), as this module's: `for a vector, write <a, b>`. */
  bareTupleHint(_bare: string): string | undefined {
    return undefined
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

  /** The kinds of line this module works out itself (a reaction, a table), offered before the core's. */
  readonly lineForms: readonly LineForm[] = []

  /**
   * A call as LaTeX, if it's one of this module's functions (and not the sheet's own of that name); `tex` writes a node.
   * (Used as written, as mathjs's own would be: a leading space keeps it apart from what's before it, as in a sum.)
   */
  functionTex(_node: FunctionNode, _tex: (n: MathNode) => string, _host: ModuleHost): string | undefined {
    return undefined
  }

  // Tuples: a module can give a tuple a look of its own (a vector, ⟨3.0, 4.0⟩ N).

  /** Functions that make a tuple of what they're given, which typed as numbers keeps each one's sig figs: `@vector(0.50, -9.81)`. */
  readonly typedTupleFunctions: readonly string[] = []

  /** The look a call to one of this module's functions gives the tuple it makes. */
  lookOfFunction(_name: string): TupleLook | undefined {
    return undefined
  }

  /** The look a function's body gives what it returns, from how it's written (a vector typed in it). */
  lookOfWritten(_text: string): TupleLook | undefined {
    return undefined
  }

  /** The look a tuple made from tuples with these looks has, if this module decides it. */
  chooseLook(_looks: readonly (TupleLook | undefined)[]): TupleLook | undefined {
    return undefined
  }

  /** A tuple as LaTeX in a look of this module's: its values (each as LaTeX), and the unit they share ('' if none). */
  tupleTex(_values: readonly string[], _sharedUnit: string, _look: TupleLook): string | undefined {
    return undefined
  }

  /** The look a line's settings (this module's) give what it assigns: `F:ijk`. */
  lookSetting(_settings: readonly string[]): LookSetting | undefined {
    return undefined
  }

  /**
   * Variables a line's settings (this module's) make from the value it assigns:
   * `F:xyz` makes F_x, F_y. Throws an ExplainedError if the value can't have them.
   */
  derivedVariables(_name: string, _value: unknown, _settings: readonly string[]): DerivedVariable[] {
    return []
  }

  /**
   * What's wrong with one of this module's settings where it's written (on a function's result, an unpacked name).
   * (Shared, like lineSettings: settings are read before a Calculator is.)
   */
  settingProblem(_name: string, _setting: string, _place: SettingPlace): string | undefined {
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
const installed = new Map<ModuleClass, EngineModule>()

/** A module's class. */
const classOf = (module: EngineModule) => module.constructor as ModuleClass

/**
 * Modules in the order they're installed and their hooks called: each after the
 * modules it requires. Throws if one it requires isn't among them, or if they
 * require each other round in a circle.
 */
export function inDependencyOrder(modules: readonly EngineModule[]): EngineModule[] {
  const byClass = new Map(modules.map((m) => [classOf(m), m]))
  const ordered: EngineModule[] = []
  const visiting = new Set<EngineModule>()
  const visit = (m: EngineModule) => {
    if (ordered.includes(m)) return
    if (visiting.has(m)) throw new Error(`${classOf(m).name} requires itself, through the modules it requires.`)
    visiting.add(m)
    for (const needed of m.requires) {
      const dependency = byClass.get(needed)
      if (!dependency) throw new Error(`${classOf(m).name} requires ${needed.name}, which isn't among the modules given.`)
      visit(dependency)
    }
    visiting.delete(m)
    ordered.push(m)
  }
  modules.forEach(visit)
  return ordered
}

/** Install a module's shared hooks, if one of its class isn't installed already (the modules it requires must be). */
export function installModule(module: EngineModule): void {
  const kind = classOf(module)
  if (installed.has(kind)) return
  const missing = module.requires.find((needed) => !installed.has(needed))
  if (missing) throw new Error(`${kind.name} requires ${missing.name}: install it first.`)
  installed.set(kind, module)
  module.install()
  for (const member of module.builtinMembers()) BUILTINS.add(member)
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

export const expandModuleSyntax = (src: string) => shared().reduce((text, m) => m.expandSyntax(text), src)

export const bareTupleHints = (bare: string) => shared().map((m) => m.bareTupleHint(bare)).filter((h) => h !== undefined)

export const moduleSettingProblem = (name: string, setting: string, place: SettingPlace) =>
  shared().map((m) => m.settingProblem(name, setting, place)).find((p) => p !== undefined)

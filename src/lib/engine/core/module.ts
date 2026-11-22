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
import { declareNodeKinds, declareTokenKinds, declareTokenRoles, type TokenRole } from '../../tree/registry.ts'
import { declareContexts, declareLineSyntaxes, type ContextInfo, type LineSyntax } from '../../tree/grammar.ts'
import { declareLexRules, declareUnitRules, type LexRule } from '../../tree/lexer.ts'
import { declareTextRules, type TextRule } from '../../tree/lines.ts'
import type { PartWriter } from './writer.ts'
import type { BuiltinConstant, NamespaceConstant } from '../../constants.ts'
import type { Contributions, Variable, VariableFields } from '../../sheet/values.ts'
import type { PlacedTopic } from '../../language/tree.ts'
import type { DisplayMode, Notation, Precision } from '../../syntax.ts'
import type { formatWithUncertainty } from '../../maths/sigfigs.ts'
import type { LineResult, ParsedLine } from './results.ts'
import type { ReactNode } from 'react'
import type { Extension } from '@codemirror/state'
import type { Construct } from '../../output/constructs/construct.ts'
import type { CaptionKind, CustomBlock } from '../../sheet/blocks.ts'

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
  /** A series' values by number: t[1], t[2], … as 1 → "t__1", 2 → "t__2". */
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
 * The stages a line goes through, in order: each is a step of the line's
 * pipeline, the core's steps and the modules' (LineStep). At a stage the core's
 * steps run first, then the modules', in the order the modules were given; the
 * first step to give a result (a line it works out as a whole) ends the line.
 *
 *   raw         as written: a module's line it reads itself (a reaction)
 *   names       a namespace's members as inside names: `a.x_1` → a__x_1
 *   members     once they are: `@table(t, x)`, `@plot(t, x)`, a solve system
 *   shape       what's assigned: names to unpack into, a function, a display-name template
 *   settings    the assigned name's settings, `m:3:g`, taken off it, and its display name
 *   expand      what stands for something else written out: constants (`@c:4`),
 *               a series' statistics (`t.avg`), `delta F`, `(a pm b)`, `to percent`;
 *               and the numbers as typed
 *   expression  a line a module works out once it's read this far: `x = @solve(…)`
 *   check       a call that has to be a line of its own, inside an expression
 *   work        worked out: written for mathjs, evaluated, sig figs, uncertainty, shown
 */
export const LINE_STAGE = {
  raw: 'raw', names: 'names', members: 'members', shape: 'shape', settings: 'settings',
  expand: 'expand', expression: 'expression', check: 'check', work: 'work',
} as const
export type LineStage = (typeof LINE_STAGE)[keyof typeof LINE_STAGE]

/** The stages in the order a line goes through them. */
export const LINE_STAGES: readonly LineStage[] = Object.values(LINE_STAGE)

/**
 * A line on its way through its pipeline: its text as the steps so far have
 * left it (each step can change it, as `names` writes a.x_1 as a__x_1), what
 * it was asked to show, and what the steps have read of it.
 */
export interface LineInProgress {
  /** Its text as it stands, at this step. */
  text: string
  mode: DisplayMode
  /** Whether the mode was asked for (on the line, or by its block). */
  explicit: boolean
  /** By the `expression` stage: what the core has read of it. */
  prepared?: PreparedLine
}

/**
 * One step of a line's pipeline, at a stage (LINE_STAGE): it changes the line
 * on its way (writing something out, reading something off it), or works the
 * line out as a whole and gives its result, which ends the line. A module adds
 * its own (EngineModule.lineSteps); a LineForm is a step that only does the second.
 */
export abstract class LineStep {
  /** When it runs. */
  abstract readonly stage: LineStage

  /** Run on the line: its result, if this step works it out, else undefined (the line, changed or not, goes on). */
  abstract run(line: LineInProgress, host: ModuleHost): LineResult | undefined
}

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
export abstract class LineForm extends LineStep {
  /** When it's offered the line. */
  readonly stage: LineStage = LINE_STAGE.members

  /**
   * Whether the name it assigns is a namespace for what it makes (`p.slope`
   * of `p = @plot(…)`, `a.x_1` of a selection), rather than a variable: its
   * line then defines only what it says it does (LineResult.defines), even nothing.
   */
  readonly assignsNamespace: boolean = false

  /** The line worked out, if it's this form's; undefined if it isn't. */
  abstract evaluate(line: FormLine, host: ModuleHost): LineResult | undefined

  /** As a step: offered the line as it stands; a form whose name is a namespace defines what it says, nothing if it says nothing. */
  run(line: LineInProgress, host: ModuleHost): LineResult | undefined {
    const result = this.evaluate({ text: line.text.trim(), mode: line.mode, explicit: line.explicit, prepared: line.prepared }, host)
    return result && this.assignsNamespace ? { ...result, defines: result.defines ?? [] } : result
  }
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

/** A module's part of a sheet's tree (see tree/): kinds it declares (each with what it is), its contexts, and its kinds of line. */
export interface ModuleGrammar {
  readonly nodeKinds?: Record<string, string>
  readonly tokenKinds?: Record<string, string>
  readonly contexts?: readonly ContextInfo[]
  readonly syntaxes?: readonly LineSyntax[]
  /** Its rules for reading expressions (lexer.ts): `<3.0, 4.0>` as a vector, `{H2O}` as a species. */
  readonly lexRules?: readonly LexRule[]
  /** Its rules for what can follow a unit as part of it (lexer.ts): `mol {EDTA}`, a species. */
  readonly unitRules?: readonly LexRule[]
  /** Its rules for markup in text (lines.ts): `{Na^+}` in prose, a formula. */
  readonly textRules?: readonly TextRule[]
  /** What its kinds of token are (registry.ts TOKEN_ROLE): a species is a formula. */
  readonly tokenRoles?: Readonly<Record<string, TokenRole>>
}

/** A kind of module: its class, by which another module says it needs it. */
// (Whatever its constructor takes: a module makes its own state.)
export type ModuleClass = abstract new (...args: never[]) => EngineModule

/** A module's own kind of block: how it's written to LaTeX and Word, and drawn in the Rendered tab. */
export interface ModuleBlockKind {
  readonly construct: Construct<CustomBlock>
  readonly view: (props: { block: CustomBlock }) => ReactNode
  /**
   * The kind of numbered caption a block of it has, if it has one (a table with
   * a title: `Table 2: Runs`), so the Rendered tab numbers it among the sheet's
   * as the exports do (its view reads its number: useCaptionNumber).
   */
  readonly caption?: (block: CustomBlock) => CaptionKind | undefined
}

/** A module class that can be installed: made with no arguments (each sheet makes its own, keeping its own state). */
export type InstallableModule = new () => EngineModule

/**
 * A module: what extends MathScribe's core (chemistry, series, vectors, or one
 * of your own), as a subclass overriding the hooks it needs; each has a default
 * that does nothing. Its hooks come in two kinds:
 *   - shared, called on one module of each class, whichever sheet: what it adds
 *     to the language, units, notation and the editor, which hold for every sheet;
 *   - per sheet, called on the sheet's own module (each sheet makes its own,
 *     with no arguments), which keeps that sheet's state: a line's pipeline,
 *     values, and tuples.
 */
export abstract class EngineModule {
  /**
   * The modules it builds on (a module that adds to vectors needs VectorModule):
   * they're installed before it, and a sheet given it without them is an error.
   * It may import from those modules, and only those (boundaries.test.ts checks).
   */
  readonly requires: readonly ModuleClass[] = []

  // =========================================================================
  // Shared: called on one module of each class, for every sheet
  // =========================================================================

  // -------------------------------------------------------------------------
  // What it adds when it's installed
  // -------------------------------------------------------------------------

  /** Add its functions to mathjs: called once, when the first module of its class is installed. */
  install(): void {}

  /** Its part of a sheet's tree: its kinds of node and token, its contexts and its kinds of line (declared when it's installed). */
  grammar(): ModuleGrammar | undefined {
    return undefined
  }

  /** Its own members of the `@` tree (`@chem`, `@vector(…)`), made fresh: put in @ when it's installed. */
  builtinMembers(): Member[] {
    return []
  }

  // -------------------------------------------------------------------------
  // The sheet's language: settings after a name, and expressions as mathjs reads them
  // -------------------------------------------------------------------------

  /** Settings after an assigned name that are this module's (`m:formula = …`), each with what it does (for the editor's suggestions). */
  readonly lineSettings: Readonly<Record<string, string>> = {}

  /**
   * What's wrong with one of this module's settings where it's written (on a function's result, an unpacked name).
   * (Shared, like lineSettings: settings are read before a Calculator is.)
   */
  settingProblem(_name: string, _setting: string, _place: SettingPlace): string | undefined {
    return undefined
  }

  /**
   * How it writes parts of an expression as mathjs reads them (writer.ts), by
   * kind of part: its own kinds (a vector, `<3.0, 4.0>` → VECTOR_FUNCTION(3.0, 4.0)),
   * and the core's where it has an exception (a quantity of a species). Tried
   * before the core's; a writer that returns undefined leaves the part to the next.
   */
  writers(): Readonly<Record<string, PartWriter>> {
    return {}
  }

  /** How to write a bracketed list with commas, `(a, b)` (which isn't a value), as this module's: `for a vector, write <a, b>`. */
  bareTupleHint(_bare: string): string | undefined {
    return undefined
  }

  // -------------------------------------------------------------------------
  // Units
  // -------------------------------------------------------------------------

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

  /** A sentence added to the explanation of units that don't match. */
  readonly unitMismatchNote: string | undefined = undefined

  // -------------------------------------------------------------------------
  // How its notation is written: LaTeX, and messages
  // -------------------------------------------------------------------------

  /** Functions that aren't written in the working, only what's inside them. */
  readonly unwrittenFunctions: readonly string[] = []

  /** A subscript in words as LaTeX, if it's in this module's notation (`m_{H2O}`, chemistry). */
  subscriptTex(_subscript: string): string | undefined {
    return undefined
  }

  /**
   * A subscript of a variable's name as LaTeX, if it's in this module's notation
   * (`n_H2O`, chemistry); `inPath`: it's a namespace or member in a member's
   * path (`H2SO4.H.n`), where a name stands for a thing rather than a label.
   */
  nameSubscriptTex(_subscript: string, _inPath: boolean): string | undefined {
    return undefined
  }

  /** Text in a display name with this module's notation as inline maths, `$…$` (`{Na^+}` as chemistry). */
  markupText(text: string): string {
    return text
  }

  /**
   * What a LaTeX document needs in its preamble for this module's notation, if
   * its LaTeX (`tex`, the document's body) uses any: lines of the preamble,
   * a comment then a package (chemistry's formulas, `\ce{…}`, need mhchem).
   */
  latexPreamble(_tex: string): string[] {
    return []
  }

  /** A message with the engine's inside names written as the sheet wrote them. */
  readableMessage(message: string): string {
    return message
  }

  // -------------------------------------------------------------------------
  // Blocks of its own, and the editor
  // -------------------------------------------------------------------------

  /**
   * Its own kinds of block, by their `type` (`CustomBlock`, which its readers
   * make): how each is written to LaTeX and Word (its construct) and drawn in
   * the Rendered tab (its view). Return the same object each time (a constant).
   */
  blockKinds(): Readonly<Record<string, ModuleBlockKind>> {
    return {}
  }

  /**
   * What it adds to the editor, for its own syntax: CodeMirror extensions
   * (series' ⚙ menu after a table or plot, which edits its settings).
   */
  editorExtensions(): readonly Extension[] {
    return []
  }

  /**
   * Its topics of the language tree (lib/language/tree.ts): each of its
   * features, what's said about it, the rules for writing it, and whole sheets
   * showing it, each placed after the core's topic it follows. The Reference tab,
   * the AI primer and the docs are made from the tree, and the tests check
   * every example in it.
   */
  languageTopics(): readonly PlacedTopic[] {
    return []
  }

  // =========================================================================
  // Per sheet: called on the sheet's own module, which keeps the sheet's state
  // =========================================================================

  // -------------------------------------------------------------------------
  // A line's pipeline
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

  /** The kinds of line this module works out itself (a reaction, a table): steps of a line's pipeline that take the whole line. */
  readonly lineForms: readonly LineForm[] = []

  /**
   * Its other steps of a line's pipeline (LineStep): what it changes on a line
   * on its way, at a stage (LINE_STAGE), after the core's steps there.
   */
  readonly lineSteps: readonly LineStep[] = []

  // -------------------------------------------------------------------------
  // Values: counted, given, checked and written
  // -------------------------------------------------------------------------

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

  /**
   * A call as LaTeX, if it's one of this module's functions (and not the sheet's own of that name); `tex` writes a node.
   * (Used as written, as mathjs's own would be: a leading space keeps it apart from what's before it, as in a sum.)
   */
  functionTex(_node: FunctionNode, _tex: (n: MathNode) => string, _host: ModuleHost): string | undefined {
    return undefined
  }

  // -------------------------------------------------------------------------
  // Tuples: a module can give a tuple a look of its own (a vector, ⟨3.0, 4.0⟩ N)
  // -------------------------------------------------------------------------

  /** Functions that make a tuple of what they're given, which typed as numbers keeps each one's sig figs: `@vector(0.50, -9.81)`. */
  readonly typedTupleFunctions: readonly string[] = []

  /** The look a call to one of this module's functions gives the tuple it makes. */
  lookOfFunction(_name: string): TupleLook | undefined {
    return undefined
  }

  /** The look a function's expression gives what it returns, from how it's written (a vector typed in it). */
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

/** The module classes MathScribe works sheets out with: those registered (src/modules/index.ts registers every one there). */
const registered: InstallableModule[] = []

/**
 * Register module classes: a sheet is worked out with them from now on, and
 * their shared parts (their kinds of line and token, their `@` members, their
 * units) are installed now, so the editor knows them before any sheet is.
 */
export function registerModules(classes: readonly InstallableModule[]): void {
  registered.push(...classes.filter((c) => !registered.includes(c)))
  for (const m of inDependencyOrder(sheetModules())) installModule(m)
}

/**
 * The modules a sheet is worked out with, made fresh for each sheet: each
 * keeps the sheet's own state, such as its species' names.
 */
export const sheetModules = (): EngineModule[] => registered.map((Module) => new Module())

/** Install a module's shared hooks, if one of its class isn't installed already (the modules it requires must be). */
export function installModule(module: EngineModule): void {
  const kind = classOf(module)
  if (installed.has(kind)) return
  const missing = module.requires.find((needed) => !installed.has(needed))
  if (missing) throw new Error(`${kind.name} requires ${missing.name}: install it first.`)
  installed.set(kind, module)
  module.install()
  for (const member of module.builtinMembers()) BUILTINS.add(member)
  const grammar = module.grammar()
  if (grammar) {
    declareNodeKinds(kind.name, grammar.nodeKinds ?? {})
    declareTokenKinds(kind.name, grammar.tokenKinds ?? {})
    declareContexts(grammar.contexts ?? [])
    declareLineSyntaxes(kind.name, grammar.syntaxes ?? [])
    declareLexRules(kind.name, grammar.lexRules ?? [])
    declareUnitRules(kind.name, grammar.unitRules ?? [])
    declareTextRules(kind.name, grammar.textRules ?? [])
    declareTokenRoles(grammar.tokenRoles ?? {})
  }
  writersByKind = undefined
}

const shared = (): EngineModule[] => [...installed.values()]

export const isLabelUnit = (unitName: string) => shared().some((m) => m.isLabelUnit(unitName))

export const labelUnitTex = (unitName: string, alone: boolean) =>
  shared().map((m) => m.labelUnitTex(unitName, alone)).find((tex) => tex !== undefined)

/** The modules' writers, by kind of part (made when first asked for, and again after a module's installed). */
let writersByKind: Map<string, PartWriter[]> | undefined

/** The installed modules' writers for a kind of part, in the order they're tried. */
export function moduleWriters(kind: string): readonly PartWriter[] {
  if (!writersByKind) {
    writersByKind = new Map()
    for (const m of shared()) {
      for (const [k, writer] of Object.entries(m.writers())) writersByKind.set(k, [...(writersByKind.get(k) ?? []), writer])
    }
  }
  return writersByKind.get(kind) ?? []
}

export const isUnwrittenFunction = (name: string) => shared().some((m) => m.unwrittenFunctions.includes(name))

export const moduleSubscriptTex = (subscript: string) =>
  shared().map((m) => m.subscriptTex(subscript)).find((tex) => tex !== undefined)

export const moduleNameSubscriptTex = (subscript: string, inPath = false) =>
  shared().map((m) => m.nameSubscriptTex(subscript, inPath)).find((tex) => tex !== undefined)

export const markupText = (text: string) => shared().reduce((t, m) => m.markupText(t), text)

/** What a LaTeX document's body needs in its preamble for the modules' notation. */
export const modulePreamble = (tex: string) => shared().flatMap((m) => m.latexPreamble(tex))

/** A module's own kind of block, by its type: its construct and view (undefined if no module installed has it). */
export const moduleBlockKind = (type: string): ModuleBlockKind | undefined =>
  shared().map((m) => m.blockKinds()[type]).find((kind) => kind !== undefined)

/** What the modules add to the editor. */
export const moduleEditorExtensions = (): Extension[] => shared().flatMap((m) => [...m.editorExtensions()])

/** Every installed module's topics of the language tree, in the order the modules are installed (EngineModule.languageTopics). */
export const moduleLanguageTopics = (): PlacedTopic[] => shared().flatMap((m) => [...m.languageTopics()])


export const moduleReadableMessage = (message: string) => shared().reduce((s, m) => m.readableMessage(s), message)

export const unitMismatchNotes = () => shared().map((m) => m.unitMismatchNote).filter((n) => n !== undefined)

export const isModuleLineSetting = (setting: string) => shared().some((m) => Object.hasOwn(m.lineSettings, setting))

/** The settings the modules add after a name, each with what it does: `ijk`, `formula`. */
export const moduleSettingWords = (): { name: string; description: string }[] =>
  shared().flatMap((m) => Object.entries(m.lineSettings).map(([name, description]) => ({ name, description })))

export const bareTupleHints = (bare: string) => shared().map((m) => m.bareTupleHint(bare)).filter((h) => h !== undefined)

export const moduleSettingProblem = (name: string, setting: string, place: SettingPlace) =>
  shared().map((m) => m.settingProblem(name, setting, place)).find((p) => p !== undefined)

/**
 * Calculation engine: evaluates plain-text math lines with mathjs, keeping a
 * shared scope so variables defined on one line are usable on later lines,
 * and produces LaTeX for each line (symbolic = substituted = result).
 */
import { isAssignmentNode, isConditionalNode, isConstantNode, isFunctionAssignmentNode, isFunctionNode, isOperatorNode, isSymbolNode, type FunctionNode, type MathNode, type MathType, type SymbolNode, type Unit } from 'mathjs'
import { EXACT, MAX_DIGITS, countSigFigs, formatExact, formatSigFigs, formatWithUncertainty } from '../../maths/sigfigs.ts'
import { AGGREGATE_KIND, Variable, type Contributions, type VariableFields, type VariableSummary } from '../../sheet/values.ts'
import { BUILTINS, isReservedConstantName } from '../../builtins.ts'
import { stringTex } from './text.ts'
import { EXACT_SETTING, IS_NAME, MEMBER_DOT, PERCENT, DISPLAY_MODE, CONSTANTS_BLOCK, LABEL_WORDS, SIGIL, UNCERTAINTY_WORDS, type DisplayMode, type Notation, type Precision } from '../../syntax.ts'
import { INLINE_VALUE_NAME, INV_FUNCTION, JOIN, TUPLE_FUNCTION, RESERVED_NAMESPACES, isHiddenName, memberName, parseUncertaintyName, readableMembers, unpackedName, uncertaintyName } from '../../sheet/names.ts'
import { expandDots, hasBracketList } from './memberAccess.ts'
import { SheetConstants } from './sheetConstants.ts'
import { DisplayNames } from './displayNames.ts'
import { SigFigs } from './sigFigs.ts'
import { Propagation } from './propagation.ts'
import { SeriesAggregates, seriesInMaths } from './aggregates.ts'
import { SheetFunctions } from './sheetFunctions.ts'
import { FN, OP, OP_SYMBOL, UNIT, isOp } from '../../maths/mathjsNames.ts'

import { nestBrackets } from '../../maths/brackets.ts'
import type { CsvColumn } from '../../data/csv.ts'

import { isTuple, math } from './math.ts'
import {
  EngineModule, LINE_STAGE, LINE_STAGES, LineStep, inDependencyOrder, installModule, moduleReadableMessage,
  type DerivedVariable, type LineInProgress, type LineStage, type LookSetting, type ModuleHost, type TupleLook,
} from './module.ts'
import { strayLineFormCall } from './builtinCalls.ts'
import { BUILTIN_CONSTANT_NAMES } from './literals.ts'
import { preprocess, typedNumbers } from './writer.ts'
import { AUTO_PRECISION, UNCERTAINTY_WORKING, ExplainedError, builtinCallHint, FIXED_UNCERTAINTY_SIG_FIGS, type CalcOptions, type EquationParts, layoutEquation, type TraceLine, type CalcResult, unexpectedError, fitHint, type DataColumn, type LineNotation, type LineResult, type ParsedLine, TO_PERCENT, RAW, rawNode, readableUnitError, UNDEFINED_SYMBOL } from './results.ts'
import { NAME_THEN_SETTINGS, expandParenPm, splitPm } from './uncertainty.ts'
import { symbolTex, numberTex, unitTex, attachUnit, isUnitCall, unitCallText, isLitCall, CASE_WORDS, caseTex, splitUnit } from './tex.ts'
import { unwrap, isLiteral, isTupleLiteral, isConversion } from './nodes.ts'
import { NODE_KIND, TOKEN_KIND, isToken, type Part } from '../../tree/nodes.ts'
import { lexExpression } from '../../tree/lexer.ts'
import { ASSIGN, SETTING_MARK, assignedOf, lineShape, type LineShape } from '../../tree/shapes.ts'
import { normalise, displayUnit, magnitudeOf } from './normalise.ts'
import { Scope, Views, type Variables, Values, innerValues } from './scope.ts'
import { MAX_TRACE_DEPTH } from './functions.ts'
import { isAngleUnit, toDisplayUnit, type Declaration, type TupleName, parseTupleName, declarationOf } from './declarations.ts'
import { withRows } from './rows.ts'
import { bracketed } from './tuples.ts'
import { EXACT_DISPLAY_DIGITS, FIXED_FORMAT, FLOAT_NOISE, TINY, PERCENT_SCALE, isValidUnit, castArgument } from './numbers.ts'
import { isNumberWithUnit, SIDE, type Side, inScientificNotation, needsBrackets, productSeparator, PRODUCT_SIGN, EVERY_PRODUCT_SIGN } from './products.ts'
import { uncertaintyUnitError, columnValues } from './data.ts'

/** Evaluates a sheet line by line, keeping its variables, their sig figs and uncertainties, and the functions it defines. */
/** A line on its way through the core's steps: what they read of it, for the steps after. */
interface CoreLine extends LineInProgress {
  /** What it assigns to (`shape`). */
  shape?: LineShape
  /** The assigned name's settings (`settings`). */
  declaration?: Declaration
  /** Its display name, as LaTeX (`settings`). */
  label?: string
  /** `to percent`, or a `:percent` setting: the result shown as a percentage (`expand`). */
  asPercent?: boolean
}

/** One of the core's steps of a line's pipeline: what it does, at its stage. */
class CoreStep extends LineStep {
  readonly stage: LineStage
  private readonly does: (line: CoreLine) => LineResult | undefined

  constructor(stage: LineStage, does: (line: CoreLine) => LineResult | undefined) {
    super()
    this.stage = stage
    this.does = does
  }

  run(line: LineInProgress): LineResult | undefined {
    return this.does(line as CoreLine)
  }
}

export class Calculator {
  /** Selections', named plots' and slices' series, as lookups (before the scopes, which share them; a slice is of a series' rows). */
  private readonly views = new Views((base) => this.aggregates.rows(base))
  /** The sheet's variables, each with everything kept about it (a Variable: see values.ts). */
  private readonly rootVars: Variables = new Scope(undefined, this.views)
  /** The variables in scope here: the sheet's, or a `{ }` block's or function call's inside them. */
  private vars = this.rootVars
  /** Their values, as mathjs evaluates with them. */
  private scope = new Values(this.rootVars)
  /** Notation numbers are being formatted in right now (see inNotation). */
  private notation: Notation | undefined
  /** The look tuples are being shown in right now (undefined: as a plain tuple, (…)); see inLook. */
  private tupleLook: TupleLook | undefined
  /**
   * The sig figs of each value of a typed tuple, as typed (a vector, `<0.50, -9.81>` → 2, 3),
   * keyed by the value itself: a copy (`b = a`) shows the same, while anything
   * worked out from it is a new value, at the fewest sig figs of its inputs.
   */
  private readonly typedSfs = new WeakMap<object, number[]>()
  /** Sig figs of each call to a sheet's function's result, from its expression. */
  private readonly callSigFigs = new WeakMap<MathNode, number>()
  /** The sheet's own functions: defining them, and what's kept about each (sheetFunctions.ts). */
  private readonly functions = new SheetFunctions({
    variables: () => this.vars,
    value: (name) => this.scope.get(name),
    store: (name, fields) => this.store(name, fields),
    expandConstants: (text) => this.constants.expand(text),
    parse: (text) => math.parse(preprocess(text, this.isVariable).text),
    tex: (node, source) => this.toTex(node, typedNumbers(source)),
    lookSetting: (settings) => this.lookSettingOf(settings)?.look,
    lookOfWritten: (expression) => this.modules.map((m) => m.lookOfWritten(expression)).find((l) => l !== undefined),
    valueOf: (node) => node.compile().evaluate(this.scope),
    uncertaintyOf: (node, value) => this.uncertainty.uncertaintyOf(node, value),
  })
  /** Nesting depth while replaying function bodies to show their working. */
  private traceDepth = 0
  private nextSource = 0
  /** The sheet's constants: its own, the precision and unit it gives any, and writing `@name`s out (sheetConstants.ts). */
  private readonly constants = new SheetConstants({
    store: (name, fields) => this.store(name, fields),
    constantValue: (value, builtin) => this.modules.reduce((v, m) => m.constantValue(v, builtin), value),
  })
  /** Counting a result's significant figures (sigFigs.ts). */
  private readonly sigFigs = new SigFigs({
    valueOf: (node) => node.compile().evaluate(this.scope),
    variableSigFigs: (name) => this.vars.get(name)?.sf,
    declaredSigFigs: (name) => this.functions.named(name)?.returnSf,
    tracedSigFigs: (call) => this.callSigFigs.get(call),
    isExactCount: (number, unit, literals) => this.modules.some((m) => m.isExactCount(number, unit, literals)),
  })
  /** Display names: a name's own words in place of its symbol, and the templates that make them (displayNames.ts). */
  private readonly displayNames = new DisplayNames({
    inlineValue: (source) => this.inlineValue(source),
    markupText: (text) => this.modules.reduce((t, m) => m.markupText(t), text),
  })
  /** Uncertainties: combining, propagating, `delta F`, and its working (propagation.ts). */
  private readonly uncertainty = new Propagation({
    variable: (name) => this.vars.get(name),
    value: (name) => this.scope.get(name),
    has: (name) => this.scope.has(name),
    isValueSymbol: (node, path): node is SymbolNode => this.isValueSymbol(node, path),
    scratchValues: () => innerValues(this.vars),
    store: (name, fields) => this.store(name, fields),
    displayNumber: (value) => this.split(value, EXACT)?.x,
    tex: (node, literals) => this.toTex(node, literals),
    variableNode: (name) => this.variableNode(name),
    uncertaintyTex: (unc, like, uncSf) => this.uncertaintyTex(unc, like, uncSf),
    showsSubstitution: () => this.options.showSubstitution,
    uncertaintyWorking: () => this.options.uncertaintyWorking ?? UNCERTAINTY_WORKING.derivatives,
  })
  /** Series aggregates: a series' members, and the sum, mean and spread a line names (aggregates.ts). */
  private readonly aggregates = new SeriesAggregates({
    variables: () => this.vars,
    value: (name) => this.scope.get(name),
    has: (name) => this.scope.has(name),
    selection: (base) => this.views.get(base),
    store: (name, fields) => this.store(name, fields),
    newSource: () => this.nextSource++,
    totalUncertainty: (contributions, like) => this.uncertainty.total(contributions, like),
    uncertainSigFigs: (value, unc) => this.uncertainParts(value, unc)?.sf,
    displayNumber: (value) => this.split(value, EXACT)?.x,
    tex: (node) => this.toTex(node, new Map()),
    variableNode: (name) => this.variableNode(name),
    uncertaintyTex: (unc, like, uncSf) => this.uncertaintyTex(unc, like, uncSf),
    showsSubstitution: () => this.options.showSubstitution,
  })
  /** Set while evaluating a line whose sum/difference has no significant figures. */
  private options: CalcOptions
  /** What extends the engine (chemistry), each with its own hooks: see EngineModule. */
  private readonly modules: readonly EngineModule[]
  /** What the modules can do to this Calculator (see ModuleHost). */
  private readonly host: ModuleHost = {
    value: (name) => this.scope.get(name),
    variable: (name) => this.vars.get(name),
    has: (name) => this.scope.has(name),
    names: () => this.scope.keys(),
    store: (name, v) => this.store(name, v),
    forget: (name) => this.forget(name),
    seriesRows: (base) => this.aggregates.rows(base),
    setView: (base, names) => this.views.set(base, names),
    clearViews: (namespace) => this.views.clear(namespace),
    newSource: () => this.nextSource++,
    evaluateLine: (text, mode) => this.evaluateLine(text, mode, false),
    evaluateParsed: (node, line) => this.evaluateParsed(node, line),
    parse: (text) => math.parse(preprocess(text, this.isVariable).text),
    evaluateNode: (node) => node.compile().evaluate(this.scope) as unknown,
    expandConstants: (text) => this.constants.expand(text),
    isUserFunction: (name) => this.functions.has(name),
    propagate: (node) => this.uncertainty.propagate(node),
    sigFigs: (node, literals) => this.sigFigs.of(node, literals, false),
    inScratchScope: (fn) => {
      const caller = this.vars
      this.enter(new Scope(caller))
      try {
        return fn()
      } finally {
        this.enter(caller)
      }
    },
    scratchValues: () => innerValues(this.vars),
    tex: (node, literals) => this.toTex(node, literals),
    evaluateExpression: (text) => math.evaluate(preprocess(text, this.isVariable).text, this.scope) as unknown,
    total: (contributions, like) => this.uncertainty.total(contributions, like),
    valueTex: (value, sf, unc, uncSf, forced) => this.valueTex(value, sf, unc, uncSf, forced),
    split: (value, sf, forced) => this.split(value, sf, forced),
    uncertainParts: (value, unc, uncSf) => this.uncertainParts(value, unc, uncSf),
    inNotation: (notation, fn) => this.inNotation(notation, fn),
    expressionTex: (expr) => this.expressionTex(expr),
  }

  constructor(options: CalcOptions, modules: readonly EngineModule[] = []) {
    this.options = options
    // (Each module after those it requires, so their hooks are called first.)
    this.modules = inDependencyOrder(modules)
    for (const m of this.modules) installModule(m)
  }

  private get autoSigFigs() {
    return this.options.precision === AUTO_PRECISION
  }

  /** mathjs format options for values without a sig-fig count (exact values, matrices). */
  private get format() {
    const p = this.options.precision
    return { ...FIXED_FORMAT, precision: p === AUTO_PRECISION ? EXACT_DISPLAY_DIGITS : p }
  }

  /** Evaluate `node`; a value typed with a unit (`1.00e-10 m`) keeps that unit for display. */
  private typedValue(node: MathNode): unknown {
    const v = node.compile().evaluate(this.scope) as unknown
    if (isLiteral(node) && math.isUnit(v)) {
      const u = (v as Unit).clone()
      u.fixPrefix = true
      return u
    }
    return v
  }

  /** Whether showing `value` at `sf` sig figs drops digits (ignoring floating-point noise). */
  private isRounded(value: unknown, sf: number, forced = false): boolean {
    const p = this.split(value, sf, forced)
    if (!p) return false
    const shown = Number(p.num)
    return Number.isFinite(shown) && Math.abs(shown - p.x) > FLOAT_NOISE * Math.max(Math.abs(p.x), TINY)
  }

  /**
   * `x` to `sf` sig figs, in the current notation. `forced`: the sig figs were
   * declared (`m:3 = …`), so they apply even with a fixed sig-fig setting.
   */
  private formatNumber(x: number, sf: number, forced = false): string {
    if ((this.autoSigFigs || forced) && Number.isFinite(sf)) return formatSigFigs(x, sf, this.notation)
    if (this.notation) return formatExact(x, this.format.precision, this.notation)
    return math.format(x, this.format)
  }

  /** Run `fn` with numbers formatted in `notation` (undefined: the default). */
  private inNotation<T>(notation: Notation | undefined, fn: () => T): T {
    const saved = this.notation
    this.notation = notation
    try {
      return fn()
    } finally {
      this.notation = saved
    }
  }

  /** Set a variable, with everything kept about it (in the current scope). */
  private store(name: string, v: VariableFields): void {
    // One record: it replaces whatever was kept about the name before, all of it.
    this.vars.set(name, v instanceof Variable ? v : new Variable(v))
  }

  /** Make `vars` the variables in scope (entering or leaving a block or function call). */
  private enter(vars: Variables): void {
    this.vars = vars
    this.scope = new Values(vars)
  }

  /**
   * The look a tuple an expression makes has (see TupleLook): from the looks of
   * what it's made from (variables, a module's functions, the sheet's functions),
   * as the module they're from decides; undefined if none has one (a plain tuple).
   */
  private lookOf(node: MathNode): TupleLook | undefined {
    const looks = node.filter((n) => isSymbolNode(n) || isFunctionNode(n)).map((n) => {
      if (isSymbolNode(n)) return this.vars.get(n.name)?.look
      const name = (n as FunctionNode).fn.name
      const own = this.modules.map((m) => m.lookOfFunction(name)).find((l) => l !== undefined)
      if (own !== undefined) return own
      return this.functions.named(name)?.returnLook
    })
    return this.modules.map((m) => m.chooseLook(looks)).find((l) => l !== undefined)
  }

  /** Run `fn` with tuples shown in `look` (undefined: as plain tuples). */
  private inLook<T>(look: TupleLook | undefined, fn: () => T): T {
    const saved = this.tupleLook
    this.tupleLook = look
    try {
      return fn()
    } finally {
      this.tupleLook = saved
    }
  }

  /** Whether an expression is a tuple typed value by value, as a module's function makes one (a vector, `<0.50, -9.81>`). */
  private isTypedTuple(node: MathNode): boolean {
    return isTupleLiteral(node, (name) => this.modules.some((m) => m.typedTupleFunctions.includes(name)))
  }

  /** The look a line's settings (a module's) give a tuple it assigns: `F:ijk`. */
  private lookSettingOf(settings: readonly string[] | undefined): LookSetting | undefined {
    if (!settings?.length) return undefined
    return this.modules.map((m) => m.lookSetting(settings)).find((l) => l !== undefined)
  }

  /** The variables a line's settings (a module's) make from the value it assigns (`F:xyz`: F_x, F_y). */
  private derivedVariables(name: string, value: unknown, settings: readonly string[] | undefined): DerivedVariable[] {
    if (!settings?.length) return []
    return this.modules.flatMap((m) => m.derivedVariables(name, value, settings))
  }

  /**
   * While showing a call's working: parameter → TeX of the argument it was given,
   * so psi_prob(r, psi_200) shows 4πr²ψ₂₀₀², not 4πr²ψ².
   */
  private paramAliases = new Map<string, MathNode>()

  /**
   * Put each aliased parameter's argument in place of the parameter, bracketed;
   * toTex's automatic parentheses then keep the brackets only where needed
   * ((3.00 m/s)², but 2.00 kg·g).
   */
  private withAliases(node: MathNode): MathNode {
    if (!this.paramAliases.size) return node
    return node.transform((n, path) => {
      const alias = isSymbolNode(n) && path !== 'fn' ? this.paramAliases.get(n.name) : undefined
      if (!alias) return n
      // Automatic brackets drop around a negative (2.0 m · −2.0); keep them, as the
      // substituted step does.
      if (isOp(alias, OP.unaryMinus)) {
        const saved = this.paramAliases
        this.paramAliases = new Map()
        try {
          return rawNode(`\\left(${this.toTex(alias, new Map())}\\right)`)
        } finally {
          this.paramAliases = saved
        }
      }
      return new math.ParenthesisNode(alias.cloneDeep())
    })
  }

  private isVariable = (id: string) => this.scope.has(id)

  private isValueSymbol(n: MathNode, path: string): n is SymbolNode {
    return isSymbolNode(n) && path !== 'fn' && this.scope.has(n.name)
      && typeof this.scope.get(n.name) !== 'function'
  }

  /** Split a value into its number (in display units), formatted number, and unit. */
  private split(value: unknown, sf: number, forced = false): { x: number; num: string; unit?: string } | null {
    if (typeof value === 'number') return { x: value, num: this.formatNumber(value, sf, forced) }
    if (math.isUnit(value)) {
      // Full precision first (mathjs picks the unit prefix), then round ourselves.
      const s = math.format(displayUnit(value as Unit), { precision: MAX_DIGITS })
      const m = /^(\S+)\s+(.+)$/.exec(s)
      if (!m) return null
      const x = Number(m[1])
      return { x, num: this.formatNumber(x, sf, forced), unit: m[2] }
    }
    return null
  }

  /** An uncertainty expressed in the same display unit as its value. */
  private inDisplayUnits(value: unknown, unc: unknown, x: number, unit?: string): number {
    if (!math.isUnit(value)) return Math.abs(Number(unc))
    const si = magnitudeOf(value)
    if (si) return Math.abs((magnitudeOf(unc) * x) / si)
    try {
      return Math.abs((unc as Unit).toNumber(unit ?? ''))
    } catch {
      return Math.abs(magnitudeOf(unc))
    }
  }

  /** Sig figs to quote an uncertainty with: as declared, else the convention (auto) or 2 (fixed). */
  private uncSigFigs(declared?: number): number | undefined {
    return declared ?? (this.autoSigFigs ? undefined : FIXED_UNCERTAINTY_SIG_FIGS)
  }

  /** Formatted pieces of `value ± unc`, rounded by the uncertainty convention. */
  private uncertainParts(value: unknown, unc: unknown, uncSf?: number) {
    const p = this.split(value, EXACT)
    if (!p) return null
    const dx = this.inDisplayUnits(value, unc, p.x, p.unit)
    if (!(dx > 0)) return null
    // The value is rounded to the uncertainty's last decimal place.
    return { ...formatWithUncertainty(p.x, dx, this.uncSigFigs(uncSf), this.notation), unit: p.unit }
  }

  /**
   * TeX for an uncertainty on its own, e.g. the result of `delta F`, shown in
   * the same unit as `like` (the value it belongs to) when given.
   */
  private uncertaintyTex(unc: unknown, like?: unknown, uncSf?: number): string {
    const p = this.split(like ?? unc, EXACT)
    if (!p) return this.valueTex(unc)
    const dx = like === undefined ? p.x : this.inDisplayUnits(like, unc, p.x, p.unit)
    let num = numberTex(this.formatNumber(dx, EXACT))
    if (dx > 0) {
      const f = formatWithUncertainty(dx, dx, this.uncSigFigs(uncSf), this.notation)
      num = f.unc + (f.exp !== undefined ? ` \\times 10^{${f.exp}}` : '')
    }
    return attachUnit(num, p.unit ? unitTex(p.unit) : '')
  }

  private valueTex(value: unknown, sf: number = EXACT, unc?: unknown, uncSf?: number, forced = false): string {
    const u = unc !== undefined ? this.uncertainParts(value, unc, uncSf) : null
    if (u) {
      const core = `${numberTex(u.num)} \\pm ${numberTex(u.unc)}`
      const exp = u.exp !== undefined ? ` \\times 10^{${u.exp}}` : ''
      const unit = u.unit ? unitTex(u.unit) : ''
      if (!exp && !unit) return core
      return attachUnit(`\\left(${core}\\right)${exp}`, unit)
    }
    const parts = this.split(value, sf, forced)
    if (parts) return attachUnit(numberTex(parts.num), parts.unit ? unitTex(parts.unit) : '')
    if (typeof value === 'boolean') return `\\text{${value}}`
    if (typeof value === 'string') return stringTex(value, (text) => this.modules.reduce((t, m) => m.markupText(t), text))
    if (isTuple(value)) return this.tupleTex(value, sf, forced)
    if (math.isMatrix(value) || Array.isArray(value)) {
      try {
        return math.parse(math.format(value, this.format)).toTex()
      } catch {
        /* fall through */
      }
    }
    return `\\text{${math.format(value, this.format)}}`
  }

  /**
   * A tuple as (1.0, 2.0, 3.0) m: each value at `sf` sig figs, with a unit
   * they all share written once after the bracket, or each with its own.
   */
  private tupleTex(tuple: math.Matrix, sf: number, forced: boolean): string {
    const values = tuple.toArray() as unknown[]
    // A typed tuple shows each value as typed (unless sig figs were declared).
    const typed = forced ? undefined : this.typedSfs.get(tuple)
    return this.valuesTex(values, values.map((_, i) => ({ sf: typed?.[i] ?? sf, forced, notation: this.notation })), this.tupleLook)
  }

  /**
   * Values in a tuple's brackets, each at its own sig figs and notation (as
   * unpacked names can declare). In a module's `look`, as it draws it: a vector,
   * ⟨3.0, 4.0⟩ N, or with unit vectors, (3.0 î + 4.0 ĵ) N.
   */
  private valuesTex(values: unknown[], shown: { sf: number; forced: boolean; notation?: Notation }[], look?: TupleLook): string {
    const parts = values.map((v, i) => this.inNotation(shown[i].notation, () => this.split(v, shown[i].sf, shown[i].forced)))
    const unit = parts[0]?.unit
    const shared = values.length > 0 && parts.every((p) => p && p.unit === unit)
    // Each value on its own; with a shared unit, the unit is written once instead.
    const each = values.map((v, i) => (shared
      ? numberTex(parts[i]!.num)
      : this.inNotation(shown[i].notation, () => this.valueTex(v, shown[i].sf, undefined, undefined, shown[i].forced))))
    const sharedUnit = shared && unit ? unitTex(unit) : ''
    // A tuple with a look is drawn by the module that gave it (a vector, ⟨3.0, 4.0⟩ N).
    if (look !== undefined) {
      for (const m of this.modules) {
        const tex = m.tupleTex(each, sharedUnit, look)
        if (tex !== undefined) return tex
      }
    }
    return attachUnit(`\\left(${each.join(', ')}\\right)`, sharedUnit)
  }

  /** A variable's value for the substitution step, at its own sig figs. */
  private variableNode(name: string): MathNode {
    const shown = this.vars.get(name)?.shown
    if (shown) return rawNode(shown)
    return this.inNotation(this.vars.get(name)?.notation, () => this.inLook(this.vars.get(name)?.look,
      () => this.valueNode(this.scope.get(name), this.vars.get(name)?.sf ?? EXACT, this.vars.get(name)?.declared === true)))
  }

  /**
   * TeX for an expression made only of numbers and built-in constants (pi, e,
   * tau, …), using at least one constant: `pi/4` → π/4 as a fraction. Bracketed
   * unless it's a single symbol, a fraction or a function call, so it can be
   * dropped into a substitution safely. Anything else (variables, units) → undefined.
   */
  private constantForm(node: MathNode, literals: Map<number, string>): string | undefined {
    const n = unwrap(node)
    const symbols = n.filter((c, path) => isSymbolNode(c) && path !== 'fn') as SymbolNode[]
    if (!symbols.length) return undefined
    if (symbols.some((c) => !BUILTIN_CONSTANT_NAMES.has(c.name) || this.scope.has(c.name))) return undefined
    if (n.filter((c) => isUnitCall(c)).length) return undefined
    const tex = this.toTex(n, literals)
    const bare = isSymbolNode(n) || isFunctionNode(n) || (isOp(n, OP.divide))
    return bare ? tex : `\\left(${tex}\\right)`
  }

  /** Node standing in for a variable's value in the substitution step. */
  private valueNode(value: unknown, sf: number, forced = false): MathNode {
    // A tuple is already bracketed, (1.0, 2.0) m; a sum of unit vectors needs brackets, unless it has a unit.
    if (isTuple(value)) {
      return rawNode(bracketed(this.valueTex(value, sf, undefined, undefined, forced)))
    }
    const parts = this.split(value, sf, forced)
    if (!parts) return rawNode(`\\left(${this.valueTex(value, sf)}\\right)`)
    const numTex = numberTex(parts.num)
    // A negative value is bracketed, so its sign doesn't read as an operator:
    // ½ · (−9.81 m/s²) · t², not ½ · −9.81 m/s² · t².
    if (parts.num.startsWith('-')) {
      return rawNode(`\\left(${parts.unit ? attachUnit(numTex, unitTex(parts.unit)) : numTex}\\right)`)
    }
    if (!parts.unit) return rawNode(numTex)
    const unit = new math.FunctionNode(new math.SymbolNode(FN.unit), [new math.ConstantNode(parts.unit)])
    return new math.ParenthesisNode(new math.OperatorNode(OP_SYMBOL.multiply, OP.multiply, [rawNode(numTex), unit]))
  }

  private toTex(node: MathNode, literals: Map<number, string>): string {
    // Leading spaces keep mathjs output such as `\cdot` from running into a name.
    const handler = (n: MathNode, options: object): string | undefined => {
      if (isConstantNode(n) && typeof n.value === 'number') {
        return ` ${numberTex(literals.get(n.value) ?? math.format(n.value, this.format))}`
      }
      if (isUnitCall(n)) return ` ${unitTex(unitCallText(n))}`
      if (isLitCall(n)) return ` ${numberTex(unitCallText(n))}`
      if (isOp(n, OP.multiply) && isUnitCall(n.args[1])) {
        return attachUnit(n.args[0].toTex(options), unitTex(unitCallText(n.args[1])))
      }
      // -2.0 m, not -(2.0 m)
      if (isOp(n, OP.unaryMinus) && (isNumberWithUnit(unwrap(n.args[0])) || isLiteral(n.args[0]))) {
        return ` -${unwrap(n.args[0]).toTex(options).trim()}`
      }
      // Products as in a textbook, ma, ½mv², 2.00 kg × 9.81 m/s² (or with every dot, if the option is on).
      if (isOp(n, OP.multiply)) {
        const factor = (a: MathNode, side: Side) => {
          const tex = a.toTex(options).trim()
          return needsBrackets(a, side) ? `\\left(${tex}\\right)` : tex
        }
        // A display name is words, so it's set apart from its neighbour with ×:
        // Molarity of EDTA × Average volume of EDTA.
        const labelled = (node: MathNode, side: Side): boolean => {
          const e = unwrap(node)
          if (isOp(e, OP.multiply)) return labelled(side === SIDE.right ? e.args[e.args.length - 1] : e.args[0], side)
          return isSymbolNode(e) && this.vars.get(e.name)?.label !== undefined
        }
        const separator = (l: MathNode, r: MathNode) => (labelled(l, SIDE.right) || labelled(r, SIDE.left)
          ? PRODUCT_SIGN
          : this.options.productDots ? EVERY_PRODUCT_SIGN : productSeparator(l, r))
        return ` ${n.args.slice(1).reduce((out, a, i) => `${out}${separator(n.args[i], a)}${factor(a, SIDE.right)}`,
          factor(n.args[0], SIDE.left))}`
      }
      // A condition inside a condition's last case (`c1 ? a : (c2 ? b : c)`) is one more case of the same brace.
      if (isConditionalNode(n)) {
        const cases: string[] = []
        let at: MathNode = n
        for (; isConditionalNode(at); at = unwrap(at.falseExpr)) {
          cases.push(caseTex(at.trueExpr.toTex(options), `\\text{${CASE_WORDS.if}}\\; ${at.condition.toTex(options)}`))
        }
        cases.push(caseTex(at.toTex(options), `\\text{${CASE_WORDS.otherwise}}`))
        return `\\begin{cases} ${cases.join('\\\\')}\\end{cases}`
      }
      // A value in scientific notation raised to a power is bracketed: (7.07 × 10⁻²)², not 7.07 × 10⁻²².
      if (isOp(n, OP.pow)) {
        const base = unwrap(n.args[0])
        if (isSymbolNode(base) && inScientificNotation(base)) {
          return `\\left(${base.name.slice(1)}\\right)^{${n.args[1].toTex(options).trim()}}`
        }
      }
      if (isSymbolNode(n)) {
        if (n.name.startsWith(RAW)) return ` ${n.name.slice(1)}`
        return ` ${this.nameTex(n.name)}`
      }
      // `@inv(x)`: a fraction turned over, m/V as V/m; a value whose unit is one,
      // 18.015 g/mol as 1 mol / 18.015 g (a conversion factor turned over); anything else, 1/x.
      if (isFunctionNode(n) && n.fn.name === INV_FUNCTION) {
        const arg = unwrap(n.args[0])
        const tex = (a: MathNode) => a.toTex(options).trim()
        if (isOp(arg, OP.divide)) return `\\frac{${tex(arg.args[1])}}{${tex(arg.args[0])}}`
        if (isNumberWithUnit(arg)) {
          const unit = splitUnit(unitCallText(arg.args[1] as FunctionNode))
          if (unit) return `\\frac{${attachUnit('1', unitTex(unit.below))}}{${attachUnit(tex(arg.args[0]), unitTex(unit.above))}}`
        }
        return `\\frac{1}{${tex(n.args[0])}}`
      }
      if (isFunctionNode(n) && n.fn.name === TUPLE_FUNCTION) {
        return `\\left(${n.args.map((a) => a.toTex(options).trim()).join(', ')}\\right)`
      }
      // A module's own functions (giving a value its species, `{H2O}`; a vector, ⟨…⟩) are written as it says.
      if (isFunctionNode(n)) {
        for (const m of this.modules) {
          const tex = m.functionTex(n, (a) => a.toTex(options).trim(), this.host)
          if (tex !== undefined) return tex
        }
      }
      if (isFunctionNode(n) && (!(n.fn.name in math) || typeof this.scope.get(n.fn.name) === 'function')) {
        // User-defined function (even one named like a built-in, e.g. sum): f(x), not \mathrm{f}(x)
        return ` ${symbolTex(n.fn.name)}\\left(${n.args.map((a) => a.toTex(options).trim()).join(', ')}\\right)`
      }
      return undefined
    }
    return this.withAliases(node)
      .toTex({ parenthesis: 'auto', implicit: 'hide', handler } as object)
      .replace(/([{(])\s+/g, '$1')
      .trim()
  }

  // -------------------------------------------------------------------------
  // Constants
  // -------------------------------------------------------------------------

  /**
   * Define a constant from a line of an `@constants { }` block (`rho = 998 kg/m^3`).
   * It's evaluated in a scratch scope, so it doesn't become an ordinary
   * variable, and is then available as `@rho` anywhere in the sheet.
   */
  /** Use `digits` sig figs for every `@name` in the sheet that doesn't give its own. */
  declareConstantPrecision(name: string, digits: Precision): void {
    this.constants.declarePrecision(name, digits)
  }

  /** Show every `@name` in the sheet in `unit` (from a line like `@a_0:3 to angstrom`). */
  declareConstantUnit(name: string, unit: string): void {
    this.constants.declareUnit(name, unit)
  }

  /**
   * Imported data (`@import("run1.csv")`): each column becomes a series named
   * for it, its values t[1], t[2], …, with the column's unit and their sig
   * figs as typed (a whole number without a unit is exact, as when typed).
   * A named import (`run1 = @import(…)`) puts them under its name: run1.t[1].
   * Returns what each column made, for the import's summary.
   */
  defineData(columns: CsvColumn[], namespace?: string): { columns: DataColumn[]; error?: string } {
    if (namespace && RESERVED_NAMESPACES.has(namespace)) return { columns: [], error: `${namespace} is a reserved word: choose another name for the data.` }
    // The name a column's variables go under: x, or run1.x.
    const named = (name: string) => (namespace ? memberName(namespace, name) : name)
    const bad = columns.find((c) => c.unit && !isValidUnit(c.unit))
    if (bad) return { columns: [], error: `In column ${bad.name}, "${bad.unit}" isn't a unit MathScribe knows.` }
    const badUnc = columns.map(uncertaintyUnitError).find(Boolean)
    if (badUnc) return { columns: [], error: badUnc }
    const out: DataColumn[] = []
    for (const c of columns) {
      const uncertainty = c.unc && (c.unc.percent ? `${c.unc.column} (%)` : c.unc.column)
      if (!c.values.length) {
        out.push({ name: named(c.name), unit: c.unit, count: 0, uncertainty })
        continue
      }
      const values = columnValues(c)
      for (const v of values) {
        // Each value's uncertainty is a source of its own, as each `pm` is.
        if (v.unc !== undefined) this.store(named(v.name), { ...v, contributions: new Map([[this.nextSource++, v.unc]]) })
        else this.store(named(v.name), v)
      }
      const { lowest, highest } = values.range
      out.push({
        name: named(c.name), unit: c.unit, count: values.length, uncertainty,
        first: c.values[0].row, last: c.values.at(-1)!.row,
        min: this.valueTex(lowest.value, lowest.sf), max: this.valueTex(highest.value, highest.sf),
      })
    }
    return { columns: out }
  }

  /**
   * A value for text, `{{c_Na}}`, as LaTeX: its value now, with its sig figs,
   * unit and uncertainty. Settings go on the name as on any line (`V:4`,
   * `x:sci`), and `to` converts (`V to mL`); any expression works.
   */
  inlineValue(source: string): { tex?: string; error?: string } {
    const text = expandDots(this.rewriteLine(source.trim()))
    const settings = NAME_THEN_SETTINGS.exec(text)
    // A name on its own is read as a line of its own, so it shows as the variable
    // does (in the unit it was typed in); anything else is worked out as a value.
    const line = IS_NAME.test(text)
      ? text
      : settings
        ? `${INLINE_VALUE_NAME}${settings[2]} = ${settings[1]}${settings[3]}`
        : `${INLINE_VALUE_NAME} = ${text}`
    try {
      const result = this.evaluateLine(line, DISPLAY_MODE.val, true)
      if (result.error) return { error: readableMembers(result.error) }
      return { tex: nestBrackets(result.parts?.result ?? result.tex) }
    } finally {
      this.forget(INLINE_VALUE_NAME)
    }
  }

  /** How a variable's name is shown: its display name, if it has one. */
  private nameTex(name: string): string {
    const v = this.vars.get(name)
    return v?.label ?? v?.symbol ?? symbolTex(name)
  }

  defineConstant(input: string): CalcResult {
    const internal = internalTyped(input)
    if (internal) return { tex: '', error: internal }
    const { target } = lineShape(input)
    const name = target?.kind === NODE_KIND.assigned ? target.name : undefined
    if (!name) return { tex: '', error: `Inside ${SIGIL}${CONSTANTS_BLOCK}, each line is "name = value".` }
    if (isReservedConstantName(name)) {
      return { tex: '', error: `${SIGIL}${name} is built in (a namespace, or the constants block), so a constant can't be called ${name}.` }
    }
    this.pushScope()
    try {
      const result = this.evaluate(input)
      if (!result.error && this.scope.has(name)) {
        this.constants.define(name, {
          value: this.scope.get(name),
          sf: this.vars.get(name)?.sf ?? EXACT,
          contributions: this.vars.get(name)?.contributions ?? new Map(),
          uncSf: this.vars.get(name)?.uncSf,
          declared: this.vars.get(name)?.declared === true,
        })
      }
      return result
    } finally {
      this.popScope()
    }
  }

  // -------------------------------------------------------------------------
  // A call's working (the sheet's functions themselves: sheetFunctions.ts)
  // -------------------------------------------------------------------------

  /**
   * Show what happens inside a call: work out the function's expression through
   * the normal line evaluator, in a scope like the function's own, with each
   * parameter bound to its argument's value, sig figs and uncertainty. Returns
   * the working of the calls inside it, and the pieces of its expression.
   */
  private traceCall(call: FunctionNode, literals: Map<number, string>, mode: DisplayMode, explicit: boolean) {
    const def = this.functions.named(call.fn.name)
    if (!def || def.params.length !== call.args.length || this.traceDepth >= MAX_TRACE_DEPTH) return null

    // Arguments are worked out in the calling scope.
    let args: { value: unknown; sf: number; contributions: Contributions; shown?: string }[]
    try {
      args = call.args.map((a, i) => ({
        // A cast parameter shows its argument converted (0.100 nm → 1.00e-10 m).
        value: castArgument(def.params[i], def.casts[i], this.typedValue(a)),
        sf: this.sigFigs.of(a, literals, false),
        contributions: this.uncertainty.propagate(a),
        // f(pi) shows π inside the function's working, not 3.14159, and a variable
        // that stays symbolic (defined in @layout.sym) stays symbolic as an argument.
        shown: isSymbolNode(unwrap(a))
          ? this.vars.get((unwrap(a) as SymbolNode).name)?.shown ?? this.constantForm(a, literals)
          : this.constantForm(a, literals),
      }))
    } catch {
      return null
    }

    // Parameters show as the argument they were given, in the caller's terms
    // (psi_200, 2r, 1.00 Å), not as the parameter's own name.
    const callerAliases = this.paramAliases
    // An argument that uses the enclosing call's parameters is put in terms of
    // what those were given, so nested calls chain.
    const aliases = new Map<string, MathNode>()
    call.args.forEach((a, i) => aliases.set(def.params[i], this.withAliases(unwrap(a))))
    // So is a parameter's uncertainty, given a variable: δA, given k1, shows as δk1.
    def.params.forEach((p) => {
      const given = aliases.get(p)
      if (!given || !isSymbolNode(given)) return
      for (const letter of UNCERTAINTY_WORDS) aliases.set(uncertaintyName(letter, p), new math.SymbolNode(uncertaintyName(letter, given.name)))
    })

    // A tuple passed in (a vector) is shown inside the function as it is outside.
    const argLooks = call.args.map((a) => this.lookOf(a))
    // The body runs in a scope of its own, inside the one the function was defined in.
    const caller = this.vars
    this.enter(new Scope(def.definedIn))
    this.traceDepth++
    this.paramAliases = aliases
    try {
      def.params.forEach((p, i) => {
        this.store(p, {
          value: args[i].value, sf: args[i].sf, contributions: args[i].contributions, shown: args[i].shown,
          look: isTuple(args[i].value) ? argLooks[i] : undefined,
        })
      })
      // The function's own .multiline lays out its working too.
      const outerMultiline = this.multiline
      this.multiline = outerMultiline || def.multiline
      let r: LineResult
      try {
        r = this.evaluateLine(def.expression, mode, explicit)
      } finally {
        this.multiline = outerMultiline
      }
      return { lines: r.trace ?? [], ret: r.parts, retSf: def.returnSf ?? r.sf }
    } finally {
      this.paramAliases = callerAliases
      this.traceDepth--
      this.enter(caller)
    }
  }
  // -------------------------------------------------------------------------
  // Evaluation
  // -------------------------------------------------------------------------

  /**
   * Evaluate one line. `explicit` says the mode was asked for by an `@layout`
   * block around it, so it isn't overridden by a called function's return
   * line's. `notation`: `.sci` or `.dec` on a block around it.
   */
  /** mathjs's message for a name that's a series, not a value (`2 * t`), explained: what to write instead (seriesInMaths). */
  private seriesHint(message: string): string {
    const typed = UNDEFINED_SYMBOL.exec(message)?.[1]
    if (!typed) return message
    const count = this.aggregates.members(expandDots(typed)).length
    return count ? seriesInMaths(expandDots(typed), count) : message
  }

  evaluate(input: string, mode: DisplayMode = DISPLAY_MODE.full, explicit = false, multiline = false, notation: LineNotation = {}): CalcResult {
    this.multiline = multiline
    this.lineNotation = notation
    for (const m of this.modules) m.beginLine()
    try {
      // (A module's own member, typed: what to write instead. What a module writes for the engine can use it.)
      const internal = internalTyped(input)
      if (internal) return { tex: '', error: internal }
      const { tex, error, warning, info, trace, plot, block, defines, parts } = this.evaluateLine(this.rewriteLine(input), mode, explicit)
      // Messages name a namespace's members as typed, a.x_1 (not a__x_1), and a module's inside names as the sheet does.
      // (And one of MathScribe's functions written without its @ is explained, and a series where a value was wanted.)
      const readable = (s: string | undefined) => (s === undefined ? s
        : builtinCallHint(moduleReadableMessage(this.seriesHint(s.includes(JOIN) ? fitHint(readableMembers(s)) : s))))
      // Brackets by nesting, ( ) inside [ ] inside { }, once each equation is finished.
      return {
        tex: nestBrackets(tex), error: readable(error), warning: readable(warning), info: readable(info), plot, block, defines,
        assigned: error ? undefined : this.assignedBy(input),
        // (Its result alone, if it works one out: a value typed as it is has none.)
        result: !error && parts?.result ? { tex: nestBrackets(parts.result), approx: parts.approx === true } : undefined,
        trace: trace?.length ? trace.map((t) => ({ ...t, tex: nestBrackets(t.tex) })) : undefined,
      }
    } catch (e) {
      // Anything a line's own handling didn't catch stays that line's error, not the whole sheet's.
      // (A problem that's explained already, such as a species', is shown as it is.)
      return { tex: '', error: moduleReadableMessage(readableMembers(e instanceof ExplainedError ? e.message : unexpectedError(e))) }
    } finally {
      this.multiline = false
      this.lineNotation = {}
      for (const m of this.modules) m.endLine()
    }
  }

  /** A line's text as the modules read it before anything else does (a species' name as its formula). */
  private rewriteLine(text: string): string {
    return this.modules.reduce((t, m) => m.rewriteLine(t), text)
  }

  /** `.multiline` on a block around the line being evaluated: each `=` (and in a call's working too) on its own row. */
  private multiline = false

  /** `.sci` / `.dec` on a block around the line being evaluated. */
  private lineNotation: LineNotation = {}

  /** The left-hand side to show instead of the assigned name (set while unpacking). */
  private lhsOverride: string | undefined
  /** While unpacking: which names declare their sig figs (`@tuple(a, b:2) = …`). */
  private unpackDeclaredSf: boolean[] | undefined
  private nextUnpack = 0

  /**
   * `@tuple(a, b, c) = expr`: work out the tuple on the right (shown as
   * (a, b, c) = …), then store each of its values as a variable of its own.
   */
  private evaluateUnpack(entries: readonly string[], rhs: string, mode: DisplayMode, explicit: boolean): LineResult {
    const parsed = entries.map(parseTupleName)
    const lhs = `\\left(${entries.map((n, i) => {
      const p = parsed[i]
      return 'error' in p ? n : symbolTex(p.name)
    }).join(', ')}\\right)`
    const bad = parsed.find((p) => 'error' in p)
    if (bad && 'error' in bad) return { tex: lhs, error: bad.error }
    const targets = parsed as TupleName[]
    const names = targets.map((t) => t.name)
    const twice = names.find((n, i) => names.indexOf(n) !== i)
    if (twice) return { tex: lhs, error: `${twice} is listed twice.` }

    const hidden = unpackedName(this.nextUnpack++)
    this.lhsOverride = lhs
    this.unpackDeclaredSf = targets.map((t) => t.sf !== undefined)
    let result: LineResult
    try {
      result = this.evaluateLine(`${hidden} = ${rhs}`, mode, explicit)
    } finally {
      this.lhsOverride = undefined
      this.unpackDeclaredSf = undefined
    }
    const value = this.scope.get(hidden)
    const sf = this.vars.get(hidden)?.sf ?? EXACT
    this.forget(hidden)
    if (result.error) return result
    if (!isTuple(value)) {
      return { ...result, error: `The right-hand side isn't a tuple, so it can't be unpacked into ${names.join(', ')}.` }
    }
    const values = value.toArray() as unknown[]
    if (values.length !== names.length) {
      return {
        ...result,
        error: `The tuple has ${values.length} value${values.length === 1 ? '' : 's'}, but ${names.length} names are given.`,
      }
    }
    // Each name's own settings: `@tuple(r:3, theta:deg) = …`.
    let converted: unknown[]
    try {
      converted = values.map((v, i) => (targets[i].unit ? toDisplayUnit(v, targets[i].unit!) : v))
    } catch (e) {
      return { ...result, error: (e as Error).message }
    }
    const shown = targets.map((t) => (t.sf === undefined
      ? { sf, forced: false, notation: t.notation }
      : { sf: t.sf === EXACT_SETTING ? EXACT : t.sf, forced: true, notation: t.notation }))
    targets.forEach(({ name }, i) => this.store(name, {
      value: converted[i], sf: shown[i].sf, declared: shown[i].forced, notation: shown[i].notation,
    }))
    // With settings on the names, the result shows each value that way.
    if (!targets.some((t) => t.sf !== undefined || t.unit || t.notation) || !result.parts) return result
    const parts = { ...result.parts, result: this.valuesTex(converted, shown), approx: false }
    return { ...result, parts, tex: layoutEquation(mode, parts, this.multiline) }
  }

  /** An expression as typed, as TeX (an unnamed table column's header). */
  private expressionTex(expr: string): string {
    const literals = typedNumbers(expr)
    try {
      return this.toTex(math.parse(preprocess(expr, this.isVariable).text), literals)
    } catch {
      return `\\text{${expr}}`
    }
  }

  /** Remove a variable, and everything kept about it. */
  private forget(name: string): void {
    this.vars.delete(name)
  }

  /**
   * A line's pipeline: the core's steps and the modules' (their line forms and
   * other steps), in the order of their stages (LINE_STAGE), the core's first at
   * each stage. Made once, from the modules this Calculator was given.
   */
  private get steps(): readonly LineStep[] {
    if (!this.pipeline) {
      const steps: LineStep[] = [...this.coreSteps(), ...this.modules.flatMap((m) => [...m.lineForms, ...m.lineSteps])]
      // (Sorting keeps the order within a stage: the core's, then each module's as given.)
      this.pipeline = steps.sort((a, b) => LINE_STAGES.indexOf(a.stage) - LINE_STAGES.indexOf(b.stage))
    }
    return this.pipeline
  }

  private pipeline: readonly LineStep[] | undefined

  /** Work a line out: through its pipeline, until a step gives its result (`work`, the last, always does). */
  private evaluateLine(input: string, requestedMode: DisplayMode, explicit = false): LineResult {
    const line: CoreLine = { text: input, mode: requestedMode, explicit }
    for (const step of this.steps) {
      const result = step.run(line, this.host)
      if (result) return result
    }
    throw new Error('A line went through every step of its pipeline without being worked out.')
  }

  /** The core's steps of a line's pipeline, each at its stage. */
  private coreSteps(): LineStep[] {
    const step = (stage: LineStage, run: (line: CoreLine) => LineResult | undefined) => new CoreStep(stage, run)
    return [
      // `a.x_1`, a namespace's member, is the variable a__x_1 inside.
      step(LINE_STAGE.names, (line) => {
        line.text = expandDots(line.text)
        return undefined
      }),
      step(LINE_STAGE.shape, (line) => this.byShape(line)),
      step(LINE_STAGE.settings, (line) => this.readSettings(line)),
      step(LINE_STAGE.expand, (line) => this.expand(line)),
      // A call that's a line of its own, inside an expression: `x = 2 * @table(t)`.
      step(LINE_STAGE.check, (line) => {
        const stray = strayLineFormCall(line.text)
        return stray ? { tex: '', error: stray } : undefined
      }),
      // Square brackets that aren't a series' or a member's: `x = 2 * [1, 2]` (a series is a line of its own).
      step(LINE_STAGE.check, (line) => (hasBracketList(line.text)
        ? { tex: '', error: `Square brackets make a series, on a line that names it: t = [1.0 s, 2.0 s]. In a formula, use one of its values, t[2], or a statistic of them, t.avg.` }
        : undefined)),
      // A series where a value is wanted: `w = 2 * t`.
      step(LINE_STAGE.check, (line) => {
        const shape = line.shape
        const assigned = shape?.target?.kind === NODE_KIND.assigned ? shape.target.name : undefined
        const series = this.aggregates.seriesAsValue(line.text, assigned)
        return series ? { tex: '', error: series } : undefined
      }),
      step(LINE_STAGE.work, (line) => this.work(line)),
    ]
  }

  /**
   * What the line assigns to, read from its tokens (tree/shapes.ts): names to
   * unpack into, a function's head, or a display-name template, each worked out
   * as a whole; or a name, which goes on.
   */
  private byShape(line: CoreLine): LineResult | undefined {
    const shape = lineShape(line.text.trim())
    line.shape = shape
    const { target } = shape
    // `@tuple(a, b, c) = …` unpacks a tuple.
    if (target?.kind === NODE_KIND.unpack && shape.value) return this.evaluateUnpack(target.entries!, shape.value, line.mode, line.explicit)
    if (target?.kind === NODE_KIND.functionHead && shape.value) {
      // (Bad parameters, like `g(x y)`, get defineFunction's error rather than mathjs's.)
      const params = target.entries!.filter(Boolean)
      // `massName(x) = "m_{{x}}"`: a display-name template, words in quotes.
      const words = target.settings.length ? undefined : LABEL_WORDS.exec(shape.value)?.groups?.words
      if (words !== undefined) return this.displayNames.defineTemplate(target.name, params, words)
      // `f(x, y) = …`: a function;
      // `f(x):3:deg = …`: settings for what the function gives back.
      return this.functions.define(target.name, params, shape.value, this.multiline, target.settings)
    }
    return undefined
  }

  /** `m:3 = …`, `phi:3:deg = …`: settings on the name being assigned, taken off it; and its display name. */
  private readSettings(line: CoreLine): LineResult | undefined {
    const { target, value } = line.shape!
    const declaration = target?.kind === NODE_KIND.assigned && target.settings.length ? declarationOf(target.name, target.settings) : null
    if (declaration && 'error' in declaration) return { tex: '', error: declaration.error }
    // Settings that are a module's: `m:formula = …`, how the named species on this line are shown.
    for (const m of this.modules) m.useLineSettings(declaration?.moduleSettings ?? [])
    // A display name is worked out now, so values in it are the ones it was computed with.
    // (One made with a template, `m_w:massName(H2O)`, is its words with the arguments put in.)
    const labelWords = declaration?.template ? this.displayNames.fillTemplate(declaration.template.name, declaration.template.args) : undefined
    if (labelWords && 'error' in labelWords) return { tex: '', error: labelWords.error }
    const labelSource = declaration?.label ?? labelWords?.words
    const label = labelSource !== undefined ? this.displayNames.tex(labelSource) : undefined
    if (label?.error) return { tex: '', error: label.error }
    line.declaration = declaration ?? undefined
    line.label = label?.tex
    if (declaration) line.text = `${declaration.name} ${ASSIGN} ${value}`
    return undefined
  }

  /**
   * What stands for something else, written out: constants (`@c:4`), a
   * series' statistics (`t.avg`), `to percent`, `delta F`, `(a pm b)`; and the
   * line's numbers as typed, so `2.0 kg` keeps its trailing zero.
   */
  private expand(line: CoreLine): LineResult | undefined {
    const { declaration } = line
    // `delta F =` asks for F's uncertainty; a trailing = is just a prompt.
    const constants = this.constants.expand(line.text.replace(/=\s*$/, '').trim())
    if (constants.error) return { tex: '', error: constants.error }
    const cleaned = constants.text
    const cleanedShape = lineShape(cleaned)
    const assignedName = cleanedShape.target?.kind === NODE_KIND.assigned ? cleanedShape.target.name : undefined
    const aggregateError = this.aggregates.defineNamedIn(cleaned, assignedName)
    if (aggregateError) return { tex: '', error: aggregateError }
    // `… to percent` isn't a mathjs unit: take it off and show the result as a percentage.
    line.asPercent = TO_PERCENT.test(cleaned) || declaration?.unit === PERCENT
    line.text = expandParenPm(this.uncertainty.expandDeltaRefs(cleaned.replace(TO_PERCENT, '')))
    line.prepared = {
      literals: typedNumbers(line.text),
      declaredSf: declaration?.sf,
      displayUnit: declaration?.unit === PERCENT ? undefined : declaration?.unit,
      notation: declaration?.notation,
    }
    return undefined
  }

  /** A line worked out as an assignment or an expression: written for mathjs, evaluated, and shown. */
  private work(line: CoreLine): LineResult {
    const { declaration } = line
    const { literals, declaredSf, displayUnit } = line.prepared!
    // Separate `value pm uncertainty` on the right-hand side.
    const lineHead = lineShape(line.text)
    const lhs = lineHead.target?.kind === NODE_KIND.assigned ? lineHead.head : ''
    const pm = splitPm(line.text.slice(lhs.length))
    const percent = !!pm?.[1].endsWith('%')

    let node: MathNode
    let uncNode: MathNode | undefined
    const warnings: string[] = []
    try {
      const { text, shadowed } = preprocess(pm ? lhs + pm[0] : line.text, this.isVariable)
      if (shadowed.length) {
        warnings.push(`"${shadowed.join('", "')}" after a number is read as a unit, not your variable. `
          + `Write 2 * ${shadowed[0]} to use the variable.`)
      }
      node = math.parse(text)
      if (pm) uncNode = math.parse(preprocess(percent ? pm[1].slice(0, -1) : pm[1], this.isVariable).text)
    } catch (e) {
      return { tex: '', error: (e as Error).message }
    }

    if (isFunctionAssignmentNode(node)) {
      const lhs = `${symbolTex(node.name)}\\left(${node.params.map(symbolTex).join(', ')}\\right)`
      const tex = `${lhs} = ${this.toTex(node.expr, literals)}`
      const warning = warnings.join(' ') || undefined
      try {
        node.compile().evaluate(this.scope)
      } catch (e) {
        return { tex, error: (e as Error).message, warning }
      }
      return { tex, warning }
    }

    const result = this.evaluateParsed(node, {
      uncNode, percent, literals, warnings, mode: line.mode, explicit: line.explicit, declaredSf, asPercent: line.asPercent, displayUnit,
      notation: declaration?.notation, look: this.lookSettingOf(declaration?.moduleSettings), label: line.label,
    })
    return declaration?.moduleSettings && !result.error ? this.withDerived(declaration.name, result, line.mode, declaration.moduleSettings) : result
  }

  /**
   * Variables a line's settings (a module's) make from the one it assigns, as
   * `F:xyz = …` makes each component of the vector F (F_x, F_y, F_z): stored at
   * its sig figs and notation, and shown under its line (except in @layout.sym,
   * which shows only the equation).
   */
  private withDerived(name: string, result: LineResult, mode: DisplayMode, settings: readonly string[]): LineResult {
    let derived: DerivedVariable[]
    try {
      derived = this.derivedVariables(name, this.scope.get(name), settings)
    } catch (e) {
      return { ...result, error: (e as Error).message }
    }
    if (!derived.length) return result
    const sf = this.vars.get(name)?.sf ?? EXACT
    const declared = this.vars.get(name)?.declared === true
    // Kept as its notation; shown as its line is (with a block's .sci or .dec too).
    const notation = this.vars.get(name)?.notation
    // Each at its sig figs, or one of a typed tuple's values, as typed.
    const typed = declared ? undefined : this.typedSfs.get(this.scope.get(name) as object)
    const sfs = derived.map((d) => (d.component === undefined ? undefined : typed?.[d.component]) ?? sf)
    derived.forEach((c, i) => this.store(c.name, { value: c.value, sf: sfs[i], declared, notation }))
    if (mode === DISPLAY_MODE.sym) return result
    const rows = derived.map((c, i) =>
      `${symbolTex(c.name)} &= ${this.inNotation(result.notation, () => this.valueTex(c.value, sfs[i], undefined, undefined, declared))}`)
    return { ...result, tex: withRows(result.tex, symbolTex(name), rows) }
  }

  /**
   * Evaluate a parsed line (an assignment or expression): display, substitution,
   * sig figs, uncertainty, and storing the result.
   */
  private evaluateParsed(node: MathNode, ctx: ParsedLine): LineResult {
    const { uncNode, percent, literals, warnings, explicit, mode } = ctx
    const assigned = isAssignmentNode(node) ? node.object.name : undefined
    const expr = isAssignmentNode(node) ? node.value : node
    // .multiline on a block around the line, or a call to a function defined in one.
    const multiline = this.multiline || this.functions.callsIn(expr).some((c) => this.functions.named(c.fn.name)?.multiline === true)
    // For `x to kN`, show `x`; the conversion shows up in the result.
    const shown = isOperatorNode(expr) && isConversion(expr) ? expr.args[0] : expr

    // A given left-hand side, such as unpacking's (a, b, c), wins over the name assigned.
    // It's for this line only, not the working of functions it calls, so take it now.
    const override = this.lhsOverride
    this.lhsOverride = undefined
    const unpackDeclaredSf = this.unpackDeclaredSf
    this.unpackDeclaredSf = undefined
    const lhsTex = override ?? (assigned ? (ctx.label ?? symbolTex(assigned)) : ctx.lhs)
    let exprTex = uncNode ? this.uncertainty.pmTex(shown, uncNode, percent, literals) : this.toTex(shown, literals)
    const bare = unwrap(shown)
    /** Intermediate steps between the expression and the result. */
    const steps: string[] = []
    const parts = (result?: string): EquationParts =>
      ({ lhs: lhsTex, expr: exprTex, steps, result, bareSymbol: isSymbolNode(bare) })

    // Calls to the sheet's functions: show the working inside each one first.
    // When the whole right-hand side is one call, the line itself then reads
    // `r = <return expression> = … = result` instead of `r = f(y, z) = …`.
    // Lines shown before this one (e.g. the equation being solved), except in @layout.val.
    const trace: TraceLine[] = mode === DISPLAY_MODE.val ? [] : [...(ctx.prelude ?? [])]
    let wholeLineTraced = false
    /** For a line that's just a function call: the sig figs of what it returns. */
    let returnSf: number | undefined
    // (Worked out in @layout.val too: each call's result has the sig figs of its return
    // line, which sigFigsOf needs when the call is part of a bigger expression.)
    for (const call of this.functions.callsIn(shown)) {
      const t = this.traceCall(call, literals, mode, explicit)
      if (!t) continue
      if (t.retSf !== undefined) this.callSigFigs.set(call, t.retSf)
      if (mode !== DISPLAY_MODE.val) {
        trace.push(...t.lines)
        if (call === bare && t.ret) {
          exprTex = t.ret.expr
          steps.push(...t.ret.steps)
          wholeLineTraced = true
          returnSf = t.retSf
        }
      }
    }

    // `delta F`: show how F's uncertainty is worked out.
    const uncRef = isSymbolNode(bare) ? parseUncertaintyName(bare.name) : null
    const deltaOf = uncRef?.of
    if (uncRef) {
      // The uncertainty of a series mean is its standard error.
      const meanOf = this.vars.get(uncRef.of)?.agg
      steps.push(...(meanOf?.kind === AGGREGATE_KIND.mean
        ? this.aggregates.standardErrorWorking(meanOf)
        : this.uncertainty.deltaWorking(uncRef.of, uncRef.letter)))
    }
    // `a.sum`, `a.avg`, …: show how the series is combined.
    const agg = isSymbolNode(bare) ? this.vars.get(bare.name)?.agg : undefined
    if (agg) steps.push(...this.aggregates.working(agg))

    // Substitution and sig figs use the values from before this line runs.
    const usesVariables = shown.filter((n, path) => this.isValueSymbol(n, path)).length > 0
    if (usesVariables && !isSymbolNode(bare) && !wholeLineTraced && this.options.showSubstitution) {
      const substituted = shown.transform((n, path) =>
        this.isValueSymbol(n, path)
          ? this.variableNode(n.name)
          : n)
      // Typed numbers keep their trailing zeros here too (0.250 m, not 0.25 m).
      steps.push(this.toTex(substituted, literals))
    }
    this.sigFigs.lost = false
    // A function call's precision comes from its expression (the measured numbers in it),
    // or its declared settings.
    const sf = returnSf ?? this.sigFigs.of(expr, literals, false)
    if (this.autoSigFigs && this.sigFigs.lost) {
      warnings.push('This sum or difference is smaller than the precision of the values in it, '
        + 'so it has no significant figures; one is shown.')
    }
    // With a stated uncertainty or declared sig figs, those set the precision, not trailing zeros.
    if (this.autoSigFigs && !uncNode && ctx.declaredSf === undefined) {
      // Unpacking `@tuple(a, b:2) = @tuple(300 m, 90 deg)`: a value whose name declares
      // its sig figs is settled, like a single `b:2 = 90 deg`.
      const rhs = unwrap(expr)
      const checked = !unpackDeclaredSf
        ? [expr]
        : isFunctionNode(rhs) && rhs.fn.name === TUPLE_FUNCTION
          ? rhs.args.filter((_, i) => !unpackDeclaredSf[i])
          : unpackDeclaredSf.every(Boolean) ? [] : [expr]
      const ambiguous = checked.flatMap((n) => this.sigFigs.ambiguousLiterals(n, literals))
      if (ambiguous.length) {
        warnings.push(`Trailing zeros in ${ambiguous.join(', ')} aren't significant. `
          + `Add a decimal point (${ambiguous[0]}.) or use scientific notation if they are.`)
      }
    }
    let warning = warnings.join(' ') || undefined

    let value: unknown
    let contributions: Contributions
    try {
      // Evaluate the right-hand side and assign ourselves, so the stored value is normalised.
      // A call to a function that declares its result's unit (`conc(n, V):mol/L`) keeps that unit, as a conversion does.
      const called = isFunctionNode(bare) ? this.scope.get(bare.fn.name) : undefined
      const declaresUnit = !!this.functions.of(called)?.returnUnit
      // A name on its own (`c`, `y = c`) is shown as the variable is: in its unit.
      const justAName = isSymbolNode(bare)
      // (Calls to functions using their parameters' uncertainties, `delta A`, are given them: withArgumentUncertainties.)
      const worked = this.functions.withArgumentUncertainties(expr)
      value = normalise(worked.compile().evaluate(this.scope), isConversion(expr) || isLiteral(expr) || declaresUnit || justAName)
      // A value follows the modules' rules (a value with species, theirs), whatever it was worked out from.
      for (const m of this.modules) {
        const problem = m.valueProblem(value)
        if (problem) throw new ExplainedError(problem)
      }
      // A value typed with a unit keeps that unit wherever it's shown (L = 1.00e-10 m
      // stays in m, not 100 pm), as a conversion's result does.
      if (isLiteral(expr) && math.isUnit(value)) (value as Unit).fixPrefix = true
      // So does each value of a typed tuple (a vector): <3000., 4000.> N stays in N, not kN.
      if (this.isTypedTuple(expr) && isTuple(value)) {
        value = math.map(value, (v: MathType) => {
          if (!math.isUnit(v)) return v
          const u = (v as Unit).clone()
          u.fixPrefix = true
          return u
        })
      }
      contributions = this.uncertainty.propagate(worked)
      if (uncNode) contributions.set(this.nextSource++, this.declaredUncertainty(uncNode, value, percent))
    } catch (e) {
      const message = e instanceof RangeError
        ? 'A function here calls itself without end, so it never finishes.'
        : readableUnitError((e as Error).message)
      return { tex: layoutEquation(DISPLAY_MODE.full, parts(), multiline), error: message, warning, trace, info: ctx.info }
    }
    if (ctx.asPercent && math.isUnit(value)) {
      const u = value as Unit
      if (!u.equalBase(math.unit('m/m'))) {
        return {
          tex: layoutEquation(DISPLAY_MODE.full, parts(), multiline), warning, trace, info: ctx.info,
          error: `This has units of ${u.formatUnits()}, so it can't be a percent: only a unitless `
            + 'fraction can. (A density like 4πr²ψ² needs multiplying by a Δr first.)',
        }
      }
      value = u.toNumber('')
    }
    // `phi:deg = …`: the result in that unit (a unitless angle counts as radians).
    if (ctx.displayUnit && value !== undefined) {
      try {
        const angle = !math.isUnit(value) && !math.isMatrix(value) && isAngleUnit(ctx.displayUnit)
        value = toDisplayUnit(value, ctx.displayUnit)
        if (angle) {
          contributions = new Map([...contributions].map(([k, c]) => [k, math.unit(c as number, UNIT.radian)]))
        }
      } catch (e) {
        return { tex: layoutEquation(DISPLAY_MODE.full, parts(), multiline), warning, trace, info: ctx.info, error: (e as Error).message }
      }
    }
    const unc = this.uncertainty.total(contributions, value)
    // A declared `2.0 kg pm 0.1 kg` keeps the uncertainty's sig figs as typed.
    const declaredUncSf = uncNode && !percent && isLiteral(expr) ? this.literalSigFigs(uncNode, literals) : undefined
    let shownSf = unc !== undefined ? (this.uncertainParts(value, unc, declaredUncSf)?.sf ?? sf) : sf

    // Declared sig figs (`m:3 = …`) replace the counted ones, and beat the global
    // setting, unless the value has an uncertainty, which sets its precision instead.
    /** A notation asked for on this line or its block (not just inherited from a variable). */
    const explicitNotation = ctx.notation ?? this.lineNotation.block
    let declaredSf: number | undefined
    if (ctx.declaredSf !== undefined && assigned) {
      if (unc !== undefined) {
        const ignored = `:${ctx.declaredSf} is ignored because ${assigned} has an uncertainty, which sets its precision.`
        warning = warning ? `${warning} ${ignored}` : ignored
      } else {
        declaredSf = ctx.declaredSf === EXACT_SETTING ? EXACT : ctx.declaredSf
        shownSf = declaredSf
        // A typed value shows at the declared precision: m:4 = 2 kg → 2.000 kg.
        if (isLiteral(expr) && Number.isFinite(declaredSf) && !explicitNotation) {
          exprTex = this.valueTex(value, declaredSf, undefined, undefined, true)
        }
      }
    }

    // `x:sci = …`, `x:dec = …`: the notation the result is shown in, and the
    // variable keeps. Otherwise a variable shown on its own (`x`, `x to km`,
    // `delta x`) keeps its own, and a call keeps its function's (`f(x):sci = …`).
    const callee = isFunctionNode(bare) ? this.scope.get(bare.fn.name) : undefined
    const kept = ctx.notation
      ?? (deltaOf ? this.vars.get(deltaOf)?.notation : undefined)
      ?? (isSymbolNode(bare) ? this.vars.get(bare.name)?.notation : undefined)
      ?? this.functions.of(callee)?.returnNotation
    // A block's `.sci` / `.dec` only change how its lines are shown, and a
    // variable's own notation beats it (see LineNotation).
    const notation = kept ?? this.lineNotation.block
    // A look the line's settings give it (`F:ijk = …`: with unit vectors). Otherwise a
    // tuple keeps the look of what it's made from (see lookOf); a plain tuple has none.
    const look = isTuple(value) ? ctx.look?.look ?? this.lookOf(expr) : undefined
    if (ctx.look && !isTuple(value) && value !== undefined) {
      warning = warning ? `${warning} ${ctx.look.notATuple}` : ctx.look.notATuple
    }
    // A typed tuple keeps each value's sig figs as typed: <0.50, -9.81>
    // shows as typed, not rounded to the fewest.
    const typedTuple = this.isTypedTuple(expr)
    if (typedTuple && isTuple(value) && unc === undefined) {
      this.typedSfs.set(value, this.componentSigFigs(expr, literals))
    }
    // A typed tuple is shown in the look it's given straight away: F:ijk = <3.0, 4.0> N → F = (3.0 î + 4.0 ĵ) N.
    if (ctx.look && look && typedTuple) {
      exprTex = this.inNotation(notation, () => this.inLook(look,
        () => this.valueTex(value, declaredSf ?? shownSf, undefined, undefined, declaredSf !== undefined)))
    }
    // A typed value is shown in the declared notation: x:sci = 12000. m → 1.2000 × 10⁴ m.
    if (explicitNotation && isLiteral(expr) && value !== undefined) {
      exprTex = this.inNotation(notation, () => (declaredSf !== undefined
        ? this.valueTex(value, declaredSf, undefined, undefined, true)
        : this.valueTex(value, shownSf, unc, declaredUncSf)))
    }

    if (assigned) {
      // Defined in @layout.sym: later substitutions keep the
      // symbol instead of the value. Otherwise, constant-only values stay symbolic.
      const keepSymbol = ctx.mode === DISPLAY_MODE.sym && explicit
      this.store(assigned, {
        value, sf: shownSf, contributions, uncSf: declaredUncSf, declared: declaredSf !== undefined, notation: kept, look, label: ctx.label,
        shown: keepSymbol ? (ctx.label ?? symbolTex(assigned)) : this.constantForm(expr, literals),
        def: isLiteral(expr) ? undefined : expr,
      })
    }

    const { result, approx } = this.inNotation(notation, () => this.inLook(look, () => {
    let result: string | undefined
    if (ctx.asPercent && value !== undefined) {
      // Stored as the fraction (so later lines calculate with it); shown ×100 with a %.
      const pct = math.multiply(value as MathType, PERCENT_SCALE)
      const pctUnc = unc === undefined ? undefined : math.multiply(unc as MathType, PERCENT_SCALE)
      const tex = this.valueTex(pct, declaredSf ?? sf, pctUnc, undefined, declaredSf !== undefined)
      result = pctUnc === undefined ? `${tex}\\,\\%` : `\\left(${tex}\\right)\\,\\%`
    } else if (!isLiteral(expr) && value !== undefined) {
      result = deltaOf
        ? this.uncertaintyTex(value, this.scope.get(deltaOf), this.vars.get(deltaOf)?.uncSf)
        // A bare variable keeps its declared uncertainty precision: `m` → (2.0 ± 0.1) kg.
        : declaredSf !== undefined
          ? this.valueTex(value, declaredSf, undefined, undefined, true)
          : this.valueTex(value, sf, unc, isSymbolNode(bare) ? this.vars.get(bare.name)?.uncSf : undefined,
            isSymbolNode(bare) && this.vars.get(bare.name)?.declared === true)
    }
    // ≈ before a rounded result: always with the setting on, otherwise only when
    // every input is exact (1/3 ≈ 0.333). A value with ± already states its precision.
    let approx = false
    if (result !== undefined && unc === undefined && !deltaOf && (this.options.approxRounded || !Number.isFinite(sf))) {
      const shownValue = ctx.asPercent ? math.multiply(value as MathType, PERCENT_SCALE) : value
      approx = this.isRounded(shownValue, declaredSf ?? sf, declaredSf !== undefined)
    }
    return { result, approx }
    }))
    const finalParts = { ...parts(result), approx }
    return {
      tex: layoutEquation(mode, finalParts, multiline), parts: finalParts, warning, trace,
      info: ctx.info, sf: shownSf, notation,
    }
  }

  /** Sig figs of each value of a typed tuple (`<0.50, -9.81> m/s^2` → 2, 3). */
  private componentSigFigs(node: MathNode, literals: Map<number, string>): number[] {
    let n = unwrap(node)
    if (isOp(n, OP.multiply)) n = unwrap(n.args[0])
    return (n as FunctionNode).args.map((a) => {
      const c = unwrap(a)
      return this.literalSigFigs(isOp(c, OP.unaryMinus) ? c.args[0] : c, literals) ?? EXACT
    })
  }

  /** Sig figs of a number typed directly, with or without a unit (`0.1 kg` → 1). */
  private literalSigFigs(node: MathNode, literals: Map<number, string>): number | undefined {
    let n = unwrap(node)
    if (isNumberWithUnit(n)) n = unwrap(n.args[0])
    if (isLitCall(n)) return countSigFigs(unitCallText(n))
    if (!isConstantNode(n) || typeof n.value !== 'number') return undefined
    return countSigFigs(literals.get(n.value) ?? String(n.value))
  }

  /** The uncertainty written after `pm`, as a quantity matching `value`. */
  private declaredUncertainty(uncNode: MathNode, value: unknown, percent: boolean): unknown {
    let u = uncNode.compile().evaluate(this.scope) as unknown
    if (percent) {
      if (typeof u !== 'number') throw new Error('A percentage uncertainty must be a plain number, like pm 5%.')
      return math.multiply(math.abs(value as MathType) as MathType, u / PERCENT_SCALE)
    }
    // `2.0 kg pm 0.1`: the uncertainty takes the value's unit.
    if (math.isUnit(value) && typeof u === 'number') u = math.multiply(u, math.unit((value as Unit).formatUnits()))
    if (math.isUnit(value) !== math.isUnit(u) || (math.isUnit(u) && !(u as Unit).equalBase(value as Unit))) {
      throw new Error('The uncertainty must have the same units as the value.')
    }
    return math.abs(u as MathType)
  }

  /** Enter a nested block. */
  pushScope(): void {
    this.views.push()
    this.enter(new Scope(this.vars))
  }

  /** Leave the current block, returning the variables it defined. */
  popScope(): VariableSummary[] {
    const locals = this.describe(this.vars)
    this.views.pop()
    this.enter(this.vars.parent ?? this.rootVars)
    return locals
  }

  /** Top-level variables (call after every block has been closed). */
  variables(): VariableSummary[] {
    return this.describe(this.rootVars)
  }

  /**
   * A variable as it stands, summed up: its name, sig figs, and its TeX (`m =
   * 2.00 kg`), worked out when it's first asked for (a hover, say): a sheet with
   * thousands of imported values would otherwise typeset them all on every edit.
   * (A variable assigned again is a new one, so this one keeps its value.)
   */
  private summary(name: string, v: Variable): VariableSummary {
    let tex: string | undefined
    const typeset = () =>
      `${v.label ?? symbolTex(name)} = ${this.valueTex(v.value, v.sf, this.uncertainty.total(v.contributions, v.value), v.uncSf, v.declared === true)}`
    // (Not enumerable, so code that walks a list's properties doesn't typeset them all.)
    return Object.defineProperty({ name, sf: v.sf }, 'tex', { get: () => (tex ??= typeset()), enumerable: false }) as VariableSummary
  }

  /**
   * What a line assigned, each as it stands after the line: its value at that
   * line, for the editor's hover (a variable assigned again later has its later
   * value there). [] for a line that assigns no variable (a function's, a value's).
   */
  private assignedBy(input: string): VariableSummary[] {
    const { target } = lineShape(input)
    if (!target || target.kind === NODE_KIND.functionHead) return []
    const names = target.kind === NODE_KIND.unpack
      ? (target.entries ?? []).flatMap((e) => assignedOf(e)?.name ?? [])
      : [target.name]
    return names.flatMap((name) => {
      const v = this.vars.get(name)
      return v && typeof v.value !== 'function' ? [this.summary(name, v)] : []
    })
  }

  /**
   * Variables defined directly in `vars`, not inherited ones, and the members
   * of the selections and named plots made there (a.x_1: each the variable it
   * looks up, under its own name).
   */
  private describe(vars: Variables): VariableSummary[] {
    // Map.prototype.entries only sees this scope's own entries. Uncertainty
    // references and series aggregates are derived on demand, so not listed.
    const listed = (name: string, v: Variable) => this.summary(name, v)
    const own = [...vars.entries()]
      .filter(([name, v]) => typeof v.value !== 'function' && !isHiddenName(name) && !v.agg)
      .map(([name, v]) => listed(name, v))
    const looked = [...this.views.membersHere()].flatMap(([member, name]) => {
      const v = vars.get(name)
      return v ? [listed(member, v)] : []
    })
    return [...own, ...looked]
  }
}


/** The first `@` member in a line that's a module's own (Member.internal), as what to write instead; undefined if none is. */
function internalTyped(input: string): string | undefined {
  const visit = (parts: readonly Part[]): string | undefined => {
    for (const p of parts) {
      if (!isToken(p)) {
        const found = visit(p.parts)
        if (found) return found
        continue
      }
      if (p.t !== TOKEN_KIND.builtin) continue
      // (`@chem.mm.Na:3`: the member, without its precision.)
      const member = BUILTINS.resolve(p.text.slice(SIGIL.length).split(SETTING_MARK)[0].split(MEMBER_DOT))
      if (member?.internal) return `${member.typed} isn't written in a sheet: ${member.internal}`
    }
    return undefined
  }
  return visit(lexExpression(input))
}

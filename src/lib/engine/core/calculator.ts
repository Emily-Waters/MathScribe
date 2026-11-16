/**
 * Calculation engine: evaluates plain-text math lines with mathjs, keeping a
 * shared scope so variables defined on one line are usable on later lines,
 * and produces LaTeX for each line (symbolic = substituted = result).
 */
import { isAssignmentNode, isConstantNode, isFunctionAssignmentNode, isFunctionNode, isOperatorNode, isParenthesisNode, isSymbolNode, type FunctionNode, type MathNode, type MathType, type SymbolNode, type Unit } from 'mathjs'
import { EXACT, MAX_DIGITS, countSigFigs, formatExact, formatSigFigs, formatWithUncertainty, uncertaintySigFigs, hasAmbiguousZeros, isMeasuredLiteral, lastPlace, sigFigsFromPlace } from '../../sigfigs.ts'
import { AGGREGATE_KIND, Variable, type Aggregate, type Contributions, type VariableFields, type VariableSummary } from '../../values.ts'
import { DEFAULT_CONSTANT_SIG_FIGS, isNamespaceConstant, suggestConstant } from '../../constants.ts'
import { builtinConstant, builtinConstantKeys, isReservedConstantName } from '../../builtins.ts'
import { ASSIGNMENT, ASSIGNMENT_WITH_VALUE, CONSTANT_REF, EXACT_SETTING, IS_NAME, LEADING_NAME, ONE_LINE_FUNCTION, PERCENT, ELSE_IF_LINE, ELSE_LINE, IF_LINE, KEYWORD, RETURN_LINE, UNPACK, DISPLAY_MODE, LINE_COMMAND, VALUE_IN_TEXT, CONSTANTS_BLOCK, LABEL_TEMPLATE, SIGIL, type DisplayMode, type Notation, type Precision, type UncertaintyWord } from '../../syntax.ts'
import { INLINE_VALUE_NAME, JOIN, TUPLE_FUNCTION, RESERVED_NAMESPACES, constantKey, constantRefName, expandDots, typedConstant, isHiddenName, isUncertaintyName, memberName, parseNumberedName, parseUncertaintyName, readableMembers, seriesMemberName, uncertaintyName, unpackedName } from '../../names.ts'
import { COMPARISONS, FN, OP, OP_SYMBOL, UNIT, isOp } from '../../mathjsNames.ts'

import { nestBrackets } from '../../brackets.ts'
import type { CsvColumn } from '../../csv.ts'

import { isTuple, math } from './math.ts'
import { EngineModule, LINE_STAGE, inDependencyOrder, installModule, moduleReadableMessage, type DerivedVariable, type LineForm, type LineStage, type LookSetting, type ModuleHost, type PreparedLine, type TupleLook, SETTING_PLACE, moduleSettingProblem } from './module.ts'
import { outsideMaths, wordsTex } from './text.ts'
import { expandNamespaceCalls, strayLineFormCall } from './builtinCalls.ts'
import { BUILTIN_CONSTANT_NAMES, NUMBER_LITERAL, NAME_IN_LINE, preprocess } from './literals.ts'
import { AUTO_PRECISION, ExplainedError, builtinCallHint, FIXED_UNCERTAINTY_SIG_FIGS, type CalcOptions, type EquationParts, layoutEquation, type FunctionResult, type FunctionLine, type TraceLine, type CalcResult, unexpectedError, fitHint, type DataColumn, type LineNotation, type LineResult, type ParsedLine, TO_PERCENT, RAW, rawNode, STEP, readableUnitError } from './results.ts'
import { NAME_THEN_SETTINGS, DELTA_REF, expandParenPm, splitPm } from './uncertainty.ts'
import { parseAggregateName, escapeRegExp } from './series.ts'
import { symbolTex, numberTex, unitTex, attachUnit, isUnitCall, unitCallText, isLitCall } from './tex.ts'
import { unwrap, isLiteral, isTupleLiteral, isPureNumber, isConversion } from './nodes.ts'
import { normalise, displayUnit, magnitudeOf } from './normalise.ts'
import { Scope, Views, type Variables, Values, innerValues } from './scope.ts'
import { STATEMENT_KIND, type Guarded, BranchRun, holds, type UserFunction, type CustomConstant, MAX_TRACE_DEPTH } from './functions.ts'
import { isAngleUnit, toDisplayUnit, type TupleName, parseTupleName, parseDeclaration } from './declarations.ts'
import { withRows } from './rows.ts'
import { bracketed } from './tuples.ts'
import { EXACT_DISPLAY_DIGITS, FIXED_FORMAT, FLOAT_NOISE, TINY, PERCENT_SCALE, addLiteral, parseParam, isValidUnit, castArgument } from './numbers.ts'
import { isNumberWithUnit, SIDE, type Side, inScientificNotation, needsBrackets, productSeparator } from './products.ts'
import { uncertaintyUnitError, columnValues } from './data.ts'

/** Evaluates a sheet line by line, keeping its variables, their sig figs and uncertainties, and the functions it defines. */
export class Calculator {
  /** Selections' and named plots' series, as lookups (before the scopes, which share them). */
  private readonly views = new Views()
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
  /** Sig figs of each call to a user function's result, from its return line. */
  private readonly callSigFigs = new WeakMap<MathNode, number>()
  /** Uncertainty source for each series mean, so repeated uses stay correlated. */
  private readonly aggregateSources = new Map<string, number>()
  /** Multi-line functions, keyed by the callable stored in the scope. */
  private readonly userFunctions = new WeakMap<object, UserFunction>()
  /** Nesting depth while replaying function bodies to show their working. */
  private traceDepth = 0
  private nextSource = 0
  /** Constants from `@constants { }` blocks, available anywhere as `@name`. */
  private readonly customConstants = new Map<string, CustomConstant>()
  /** Display-name templates, `massName(x) = "m_{{x}}"`, by name: their parameters, and their words. */
  private readonly labelTemplates = new Map<string, { params: string[]; words: string }>()
  /** Sheet-wide precision from a line like `@c:4`, used wherever `@c` has no `:n` of its own. */
  private readonly constantPrecision = new Map<string, Precision>()
  /** Sheet-wide unit from a line like `@a_0 to angstrom`. */
  private readonly constantUnit = new Map<string, string>()
  /** Set while evaluating a line whose sum/difference has no significant figures. */
  private precisionLost = false
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
    seriesRows: (base) => this.seriesRows(base),
    setView: (base, names) => this.views.set(base, names),
    clearViews: (namespace) => this.views.clear(namespace),
    newSource: () => this.nextSource++,
    evaluateLine: (text, mode) => this.evaluateLine(text, mode, false),
    evaluateParsed: (node, line) => this.evaluateParsed(node, line),
    parse: (text) => math.parse(preprocess(text, this.isVariable).text),
    evaluateNode: (node) => node.compile().evaluate(this.scope) as unknown,
    expandConstants: (text) => this.expandConstants(text),
    isUserFunction: (name) => this.isUserFunction(name),
    propagate: (node) => this.propagate(node),
    sigFigs: (node, literals) => this.sigFigsOf(node, literals, false),
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
    total: (contributions, like) => this.total(contributions, like),
    valueTex: (value, sf, unc, uncSf, forced) => this.valueTex(value, sf, unc, uncSf, forced),
    split: (value, sf, forced) => this.split(value, sf, forced),
    uncertainParts: (value, unc, uncSf) => this.uncertainParts(value, unc, uncSf),
    inNotation: (notation, fn) => this.inNotation(notation, fn),
    expressionTex: (expr) => this.expressionTex(expr),
  }

  /** The modules' line forms at a stage, in the order the modules were given. */
  private formsAt(stage: LineStage): LineForm[] {
    return this.modules.flatMap((m) => m.lineForms).filter((f) => f.stage === stage)
  }

  /** The line worked out by the first form at this stage that takes it, if one does. */
  private byForm(stage: LineStage, input: string, mode: DisplayMode, explicit: boolean, prepared?: PreparedLine): LineResult | undefined {
    for (const form of this.formsAt(stage)) {
      const result = form.evaluate({ text: input.trim(), mode, explicit, prepared }, this.host)
      if (result) return result
    }
    return undefined
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
      const f = this.scope.get(name)
      return typeof f === 'function' ? this.userFunctions.get(f)?.returnLook : undefined
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
      // Products as in a textbook, ma, ½mv², 2.0 kg · 9.81 m/s² (or with every dot, if the option is on).
      if (isOp(n, OP.multiply)) {
        const factor = (a: MathNode, side: Side) => {
          // A negative value with a unit keeps its value bracketed, like the other
          // values in the product: −(500 N) sin(30°), not −500 N sin(30°).
          const negated = unwrap(a)
          if (!this.options.productDots && isOp(negated, OP.unaryMinus)
            && isNumberWithUnit(unwrap(negated.args[0]))) {
            return `-\\left(${unwrap(negated.args[0]).toTex(options).trim()}\\right)`
          }
          const tex = a.toTex(options).trim()
          return needsBrackets(a, side, !this.options.productDots) ? `\\left(${tex}\\right)` : tex
        }
        // A display name is words, so it's set apart from its neighbour with ×:
        // Molarity of EDTA × Average volume of EDTA.
        const labelled = (node: MathNode, side: Side): boolean => {
          const e = unwrap(node)
          if (isOp(e, OP.multiply)) return labelled(side === SIDE.right ? e.args[e.args.length - 1] : e.args[0], side)
          return isSymbolNode(e) && this.vars.get(e.name)?.label !== undefined
        }
        const separator = (l: MathNode, r: MathNode) => (labelled(l, SIDE.right) || labelled(r, SIDE.left)
          ? '\\times '
          : this.options.productDots ? '\\cdot ' : productSeparator(l, r))
        return ` ${n.args.slice(1).reduce((out, a, i) => `${out}${separator(n.args[i], a)}${factor(a, SIDE.right)}`,
          factor(n.args[0], SIDE.left))}`
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
  // Significant figures
  // -------------------------------------------------------------------------

  /** Numeric size of a subexpression in SI base units, for the addition rule. */
  private magnitude(node: MathNode): number {
    try {
      const v = node.compile().evaluate(this.scope)
      if (typeof v === 'number') return v
      if (math.isUnit(v)) return (v as Unit).value ?? NaN
    } catch {
      /* not evaluable on its own */
    }
    return NaN
  }

  /**
   * Significant figures of an expression's result.
   *   - measured numbers (with a unit, or written with a decimal point or exponent)
   *     count as typed; integers without a unit are exact, e.g. the 2 in 2 * a * d
   *   - × ÷, powers and functions: the fewest sig figs among the inputs
   *   - + −: rounded to the least precise decimal place among the terms
   */
  private sigFigsOf(node: MathNode, literals: Map<number, string>, measured: boolean): number {
    if (isParenthesisNode(node)) return this.sigFigsOf(node.content, literals, measured)
    if (isConstantNode(node)) {
      if (typeof node.value !== 'number') return EXACT
      const text = literals.get(node.value) ?? String(node.value)
      return measured || isMeasuredLiteral(text) ? countSigFigs(text) : EXACT
    }
    if (isUnitCall(node)) return EXACT
    // Written with extra precision (2.00, 1.2e3): always a measured value.
    if (isLitCall(node)) return countSigFigs(unitCallText(node))
    if (isSymbolNode(node)) return this.vars.get(node.name)?.sf ?? EXACT
    // `cond ? a : b`: the sig figs of whichever it comes to.
    if (math.isConditionalNode(node)) {
      let chosen = node.trueExpr
      try {
        if (node.condition.compile().evaluate(this.scope) !== true) chosen = node.falseExpr
      } catch { /* reported when the line is worked out */ }
      return this.sigFigsOf(chosen, literals, measured)
    }
    // A call to a function that declares its result's sig figs (`f(x):3 = …`).
    if (isFunctionNode(node)) {
      const f = this.scope.get(node.fn.name)
      const declared = typeof f === 'function' ? this.userFunctions.get(f)?.returnSf : undefined
      if (declared !== undefined) return declared
      // Otherwise its return line's, as worked out when its working was traced.
      const traced = this.callSigFigs.get(node)
      if (traced !== undefined) return traced
    }
    if (isOperatorNode(node)) {
      // A number with a unit is measured; unless a module says it's an exact count
      // (a whole number of a species, `2 mol {X}`, from a balanced equation).
      if (node.fn === OP.multiply && isUnitCall(node.args[1])) {
        const [number, unit] = node.args
        return this.sigFigsOf(number, literals, !this.modules.some((m) => m.isExactCount(number, unit, literals)))
      }
      if (node.fn === OP.unaryMinus || node.fn === OP.unaryPlus) return this.sigFigsOf(node.args[0], literals, measured)
      if (node.fn === OP.add || node.fn === OP.subtract) {
        const terms = node.args.map((a) => ({ sf: this.sigFigsOf(a, literals, false), x: this.magnitude(a) }))
        const total = this.magnitude(node)
        if (Number.isNaN(total) || terms.some((t) => Number.isNaN(t.x))) return Math.min(...terms.map((t) => t.sf))
        const sf = sigFigsFromPlace(total, Math.max(...terms.map((t) => lastPlace(t.x, t.sf))))
        if (sf < 1) this.precisionLost = true
        return Math.max(1, sf)
      }
      // An exponent written as plain numbers (^0.5, ^(3/2), ^(-0.5)) is part of the
      // formula, not a measurement, so only the base limits the sig figs.
      if (node.fn === OP.pow && isPureNumber(node.args[1])) return this.sigFigsOf(node.args[0], literals, false)
    }
    let sf = EXACT
    node.forEach((child, path) => {
      if (path === 'fn') return
      // A measured zero passed to a function (cos 0.00°, exp(0.00)) has decimal places,
      // not relative precision, and the result (1) is known far better than that
      // count suggests, so it doesn't limit the sig figs.
      if (isFunctionNode(node) && this.magnitude(child) === 0) return
      sf = Math.min(sf, this.sigFigsOf(child, literals, false))
    })
    return sf
  }

  /** Whole numbers like `300 m` whose trailing zeros won't count. */
  private ambiguousLiterals(node: MathNode, literals: Map<number, string>): string[] {
    const found = new Set<string>()
    const visit = (n: MathNode, measured: boolean) => {
      n = unwrap(n)
      if (isConstantNode(n)) {
        const text = literals.get(n.value as number) ?? String(n.value)
        if (measured && hasAmbiguousZeros(text)) found.add(text)
      } else if (isOp(n, OP.multiply) && isUnitCall(n.args[1])) {
        visit(n.args[0], true)
      } else if (isOp(n, OP.unaryMinus)) {
        visit(n.args[0], measured)
      } else if (math.isConditionalNode(n)) {
        // A condition's numbers are limits to compare with (x > 10 N), not measurements.
        visit(n.trueExpr, false)
        visit(n.falseExpr, false)
      } else if (math.isRelationalNode(n) || (isOperatorNode(n) && COMPARISONS.has(n.fn))) {
        // (Nor on a comparison of its own: ok = x < 300 m.)
      } else {
        n.forEach((c) => visit(c, false))
      }
    }
    visit(node, false)
    return [...found]
  }

  // -------------------------------------------------------------------------
  // Uncertainty
  // -------------------------------------------------------------------------

  /** Combined (quadrature) uncertainty from contributions, in the same quantity as `like`. */
  private total(contributions: Contributions | undefined, like: unknown): unknown {
    if (!contributions?.size) return undefined
    let sumSq = 0
    for (const c of contributions.values()) sumSq += magnitudeOf(c) ** 2
    const t = Math.sqrt(sumSq)
    if (!(t > 0)) return undefined
    if (math.isUnit(like)) {
      const u = (like as Unit).clone()
      u.value = t
      return u
    }
    return t
  }

  private totalUncertainty(name: string): unknown {
    return this.total(this.vars.get(name)?.contributions, this.scope.get(name))
  }

  private uncertainInputs(expr: MathNode): string[] {
    const names = expr.filter((n, path) => this.isValueSymbol(n, path)).map((n) => (n as SymbolNode).name)
    return [...new Set(names)].filter((n) => this.vars.get(n)?.contributions?.size)
  }

  /**
   * Propagate uncertainty through `expr` (first order). For each source, nudge
   * every input along that source's contribution and take the central
   * difference; the result is that source's contribution to `expr`, which is
   * Σ (∂f/∂xᵢ)·δxᵢ. Combining sources in quadrature then gives
   * Δf = √(Σ (∂f/∂x · Δx)²) for independent inputs, while shared sources stay correlated.
   */
  private propagate(expr: MathNode): Contributions {
    const out: Contributions = new Map()
    const inputs = this.uncertainInputs(expr)
    // Quantities built from an uncertainty (like ΔF / F) don't carry one themselves.
    const usesUncertainty = expr.filter((n) => isSymbolNode(n) && isUncertaintyName(n.name)).length > 0
    if (!inputs.length || usesUncertainty) return out
    const code = expr.compile()
    // (Each input has contributions: uncertainInputs keeps only those.)
    const contributionsOf = (n: string) => this.vars.get(n)!.contributions!
    const sources = new Set(inputs.flatMap((n) => [...contributionsOf(n).keys()]))
    for (const source of sources) {
      const plus = innerValues(this.vars)
      const minus = innerValues(this.vars)
      for (const n of inputs) {
        const d = contributionsOf(n).get(source)
        if (d === undefined) continue
        const v = this.scope.get(n) as MathType
        const step = math.multiply(d as MathType, STEP) as MathType
        plus.set(n, math.add(v, step))
        minus.set(n, math.subtract(v, step))
      }
      const diff = math.subtract(code.evaluate(plus) as MathType, code.evaluate(minus) as MathType) as MathType
      out.set(source, math.divide(diff, 2 * STEP))
    }
    return out
  }

  /**
   * Replace `delta F` / `Delta F` with a hidden variable holding F's
   * uncertainty. Not followed by a defined variable, they stay Greek letters.
   */
  private expandDeltaRefs(line: string): string {
    return line.replace(DELTA_REF, (match, letter: UncertaintyWord, name: string) => {
      if (!this.scope.has(name) || typeof this.scope.get(name) === 'function') return match
      const value = this.scope.get(name)
      const unc = this.totalUncertainty(name) ?? math.multiply(value as MathType, 0)
      const hidden = uncertaintyName(letter, name)
      this.store(hidden, { value: unc, sf: uncertaintySigFigs(this.split(unc, EXACT)?.x ?? 0) })
      return hidden
    })
  }

  /** `2.0 kg pm 0.1 kg` → (2.0 ± 0.1) kg, keeping the numbers as typed. */
  private pmTex(value: MathNode, unc: MathNode, percent: boolean, literals: Map<number, string>): string {
    const a = unwrap(value)
    const b = unwrap(unc)
    if (!percent && isNumberWithUnit(a) && (isConstantNode(b) || (isNumberWithUnit(b)
      && unitCallText(b.args[1] as FunctionNode) === unitCallText(a.args[1] as FunctionNode)))) {
      const unit = unitTex(unitCallText(a.args[1] as FunctionNode))
      const bNum = isNumberWithUnit(b) ? b.args[0] : b
      return attachUnit(`\\left(${this.toTex(a.args[0], literals)} \\pm ${this.toTex(bNum, literals)}\\right)`, unit)
    }
    return `${this.toTex(value, literals)} \\pm ${this.toTex(unc, literals)}${percent ? '\\%' : ''}`
  }

  /**
   * Working for `delta F`: the quadrature formula over F's direct inputs, its
   * partial derivatives, and the values substituted in. Skipped when inputs
   * share an uncertainty source, since the simple formula assumes independence.
   */
  private deltaWorking(name: string, letter: UncertaintyWord): string[] {
    const def = this.vars.get(name)?.def
    if (!def) return []
    const inputs = this.uncertainInputs(def).filter((n) => !isUncertaintyName(n))
    if (!inputs.length) return []
    const sources = inputs.map((n) => new Set(this.vars.get(n)?.contributions!.keys()))
    if (sources.some((a, i) => sources.slice(i + 1).some((b) => [...a].some((s) => b.has(s))))) return []

    const target = symbolTex(name)
    // Same letter the user asked with: δx for `delta F`, Δx for `Delta F`.
    const uncOf = (n: string) => symbolTex(uncertaintyName(letter, n))
    const sqrt = (terms: string[]) => `\\sqrt{${terms.join(' + ')}}`
    const term = (factor: string, delta: string) => `\\left(${factor}\\cdot ${delta}\\right)^{2}`
    const steps = [sqrt(inputs.map((n) =>
      term(`\\frac{\\partial ${target}}{\\partial ${symbolTex(n)}}`, uncOf(n))))]
    try {
      const derivs = inputs.map((n) => math.derivative(def, n))
      const wrap = (d: MathNode, tex: string) =>
        (isOp(d, OP.add, OP.subtract, OP.unaryMinus) ? `\\left(${tex}\\right)` : tex)
      steps.push(sqrt(inputs.map((n, i) =>
        term(wrap(derivs[i], this.toTex(derivs[i], new Map())), uncOf(n)))))
      if (this.options.showSubstitution) {
        steps.push(sqrt(inputs.map((n, i) => {
          const sub = derivs[i].transform((m, path) => (this.isValueSymbol(m, path)
            ? this.variableNode(m.name)
            : m))
          return term(
            wrap(derivs[i], this.toTex(sub, new Map())),
            this.uncertaintyTex(this.totalUncertainty(n), this.scope.get(n), this.vars.get(n)?.uncSf),
          )
        })))
      }
    } catch {
      /* no symbolic derivative (units or user functions in the formula): show the general form only */
    }
    return steps
  }

  // -------------------------------------------------------------------------
  // Series aggregates
  // -------------------------------------------------------------------------

  /** Variables named base1, base2, … or base_1, base_2, …, visible from here, in index order. */
  private seriesMembers(base: string): string[] {
    // A selection's series: its members are its numbers (each a lookup; see Views).
    const view = this.views.get(base)
    if (view) return view.flatMap((name, i) => (name ? [seriesMemberName(base, i + 1)] : []))
    const found = new Map<string, number>()
    // Each level's members, from its series index (an inner level's hide an outer's of the same name).
    for (let s: Variables | undefined = this.vars; s; s = s.parent) {
      for (const name of s.membersHere(base) ?? []) {
        if (found.has(name) || isUncertaintyName(name) || this.vars.get(name)?.agg) continue
        if (typeof this.scope.get(name) === 'function') continue
        found.set(name, parseNumberedName(name)!.n)
      }
    }
    return [...found.entries()].sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0])).map(([n]) => n)
  }

  /**
   * Define any series aggregates named on this line (a, a_avg, a_std, a_count)
   * from the current members, so they are always up to date. A variable
   * defined explicitly with the same name takes precedence.
   */
  private defineAggregates(line: string, skip?: string): string | undefined {
    for (const m of line.matchAll(NAME_IN_LINE)) {
      const name = m[1]
      if (name === skip || (this.scope.has(name) && !this.vars.get(name)?.agg)) continue
      // e1, e2, … don't turn `e` into a sum: Euler's number (and pi, tau, …) win.
      if (BUILTIN_CONSTANT_NAMES.has(name)) continue
      const { base, kind } = parseAggregateName(name)
      const members = this.seriesMembers(base)
      if (!members.length) continue
      try {
        this.defineAggregate(name, { kind, base, members })
      } catch (e) {
        return `${name}: ${(e as Error).message}`
      }
    }
    return undefined
  }

  private defineAggregate(name: string, agg: Aggregate): void {
    const values = agg.members.map((n) => this.scope.get(n))
    if (values.some((v) => typeof v !== 'number' && !math.isUnit(v))) {
      throw new Error('only numbers and quantities can be combined.')
    }
    const n = values.length
    const first = values[0]
    if (values.some((v) => math.isUnit(v) !== math.isUnit(first)
      || (math.isUnit(v) && !(v as Unit).equalBase(first as Unit)))) {
      throw new Error(`${agg.members.join(', ')} don't all have the same units.`)
    }
    const total = values.reduce((acc, v) => math.add(acc as MathType, v as MathType))

    let value: unknown
    let contributions: Contributions = new Map()
    let sf = EXACT
    switch (agg.kind) {
      case AGGREGATE_KIND.count:
        value = n
        break
      case AGGREGATE_KIND.sum:
        value = total
        contributions = this.mergedContributions(agg.members)
        sf = this.seriesSigFigs(agg.members, total)
        break
      case AGGREGATE_KIND.mean:
        value = math.divide(total as MathType, n)
        sf = this.seriesSigFigs(agg.members, total)
        // Standard error σ/√n, as one source shared by every use of this mean.
        if (n >= 2) contributions = new Map([[this.aggregateSource(agg.base), this.standardError(values)]])
        else contributions = this.mergedContributions(agg.members)
        break
      case AGGREGATE_KIND.std:
      case AGGREGATE_KIND.sem:
        if (n < 2) throw new Error('a standard deviation needs at least two values.')
        value = agg.kind === AGGREGATE_KIND.std ? this.stdDev(values) : this.standardError(values)
        sf = uncertaintySigFigs(this.split(value, EXACT)?.x ?? 0)
        break
    }
    // Show sums, means and spreads in the members' own unit (s, not ms).
    value = math.isUnit(value) && math.isUnit(first)
      ? (value as Unit).to((first as Unit).formatUnits())
      : normalise(value, true)
    const unc = this.total(contributions, value)
    if (unc !== undefined) sf = this.uncertainParts(value, unc)?.sf ?? sf

    this.store(name, { value, sf, contributions, agg })
  }

  /** Uncertainty of a sum: each member's contributions added source by source. */
  private mergedContributions(members: string[]): Contributions {
    const out: Contributions = new Map()
    for (const m of members) {
      for (const [source, c] of this.vars.get(m)?.contributions ?? []) {
        out.set(source, out.has(source) ? math.add(out.get(source) as MathType, c as MathType) : c)
      }
    }
    return out
  }

  /** Sig figs of a series total by the addition rule (least precise decimal place). */
  private seriesSigFigs(members: string[], total: unknown): number {
    const place = Math.max(...members.map((m) =>
      lastPlace(magnitudeOf(this.scope.get(m)), this.vars.get(m)?.sf ?? EXACT)))
    const sf = sigFigsFromPlace(magnitudeOf(total), place)
    return Number.isFinite(sf) ? Math.max(1, sf) : EXACT
  }

  /** Sample standard deviation (n − 1), in the units of the first value. */
  private stdDev(values: unknown[]): unknown {
    const xs = values.map(magnitudeOf)
    const mean = xs.reduce((a, b) => a + b, 0) / xs.length
    const s = Math.sqrt(xs.reduce((acc, x) => acc + (x - mean) ** 2, 0) / (xs.length - 1))
    if (!math.isUnit(values[0])) return s
    const u = (values[0] as Unit).clone()
    u.value = s
    return u
  }

  /** Standard error of the mean, σ/√n. */
  private standardError(values: unknown[]): unknown {
    return math.divide(this.stdDev(values) as MathType, Math.sqrt(values.length))
  }

  private aggregateSource(base: string): number {
    let id = this.aggregateSources.get(base)
    if (id === undefined) {
      id = this.nextSource++
      this.aggregateSources.set(base, id)
    }
    return id
  }

  /** Working for a line that is just an aggregate: Σ notation, members, values. */
  private aggregateWorking(agg: Aggregate): string[] {
    const n = agg.members.length
    if (n === 1 && agg.kind !== AGGREGATE_KIND.count) return [symbolTex(agg.members[0])]
    // A long series shows its first two members, ⋯, and its last (only those are typeset).
    const list = (f: (m: string) => string) => (n > 6
      ? [f(agg.members[0]), f(agg.members[1]), '\\cdots', f(agg.members[n - 1])]
      : agg.members.map(f)).join(' + ')
    const names = list(symbolTex)
    const values = list((m) => this.toTex(this.variableNode(m), new Map()))
    const baseTex = symbolTex(agg.base)
    const ith = agg.base.includes('_') ? `\\left(${baseTex}\\right)_{i}` : `${baseTex}_{i}`
    const sum = (body: string) => `\\sum_{i=1}^{${n}} ${body}`
    const sub = this.options.showSubstitution
    switch (agg.kind) {
      case AGGREGATE_KIND.sum:
        return [sum(ith), names, ...(sub ? [values] : [])]
      case AGGREGATE_KIND.mean:
        return [`\\frac{1}{${n}}${sum(ith)}`, `\\frac{${names}}{${n}}`, ...(sub ? [`\\frac{${values}}{${n}}`] : [])]
      case AGGREGATE_KIND.std:
        return [`\\sqrt{\\frac{1}{${n}-1}${sum(`\\left(${ith}-\\bar{${baseTex}}\\right)^{2}`)}}`]
      case AGGREGATE_KIND.sem:
        return this.standardErrorWorking(agg)
      case AGGREGATE_KIND.count:
        return []
    }
  }

  /** σ/√n, then with σ and n substituted (for `a_sem` and `delta a_avg`). */
  private standardErrorWorking(agg: Aggregate): string[] {
    const n = agg.members.length
    if (n < 2) return []
    const sigma = symbolTex(`${agg.base}_std`)
    const steps = [`\\frac{${sigma}}{\\sqrt{n}}`]
    if (this.options.showSubstitution) {
      const values = agg.members.map((m) => this.scope.get(m))
      const s = this.stdDev(values)
      // σ to 2 sig figs here, so the division visibly gives the result.
      const sTex = this.uncertaintyTex(s, math.isUnit(values[0]) ? values[0] : undefined, 2)
      steps.push(`\\frac{${sTex}}{\\sqrt{${n}}}`)
    }
    return steps
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
    this.constantPrecision.set(name, digits)
  }

  /** Show every `@name` in the sheet in `unit` (from a line like `@a_0:3 to angstrom`). */
  declareConstantUnit(name: string, unit: string): void {
    this.constantUnit.set(name, unit)
  }

  /**
   * Imported data (`import("run1.csv")`): each value becomes a variable named
   * for its column and row, t_1, t_2, …, with the column's unit and its sig
   * figs as typed (a whole number without a unit is exact, as when typed).
   * A named import (`run1 = import(…)`) puts them under its name: run1.t_1.
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

  /**
   * A display name as LaTeX: its text upright, each `{{x}}` as x's value now
   * (so the name says what it was worked out from), and a module's notation
   * (`{Na^+}`, chemistry) as it draws it.
   */
  private labelTex(label: string): { tex: string; error?: string } {
    let error: string | undefined
    const withValuesIn = outsideMaths(label, (part) => part.replace(VALUE_IN_TEXT, (whole, source: string) => {
      const v = this.inlineValue(source)
      if (v.tex !== undefined) return `$${v.tex}$`
      error ??= `In its display name, ${whole}: ${v.error}`
      return whole
    }))
    // (Spaces at the ends of the words are explicit spaces, outside \text, so they survive.)
    const words = (part: string) => {
      const [, before, inner, after] = /^(\s*)([\s\S]*?)(\s*)$/.exec(part)!
      const space = (s: string) => (s ? '\\ ' : '')
      return `${space(before)}${inner ? wordsTex(inner) : ''}${space(after)}`
    }
    const tex = this.modules.reduce((text, m) => m.markupText(text), withValuesIn).split(/(\$[^$]*\$)/)
      .map((part, i) => (i % 2 ? part.slice(1, -1) : words(part)))
      .join('')
    return { tex, error }
  }

  /**
   * Define a display-name template, `massName(x) = "m_{{x}}"`: words with `{{x}}`
   * where each argument goes, used as a setting on a name, `m_w:massName(H2O) = …`.
   * Its line shows the words with each parameter in its place.
   */
  private defineTemplate(name: string, paramList: string, words: string): LineResult {
    const params = paramList.split(',').map((p) => p.trim()).filter(Boolean)
    const bad = params.find((p) => !IS_NAME.test(p))
    if (bad !== undefined) return { tex: '', error: `"${bad}" isn't a parameter name: write ${name}(x, y) = "…{{x}}…".` }
    this.labelTemplates.set(name, { params, words })
    const shown = this.labelTex(this.fillWords(words, params, params))
    return { tex: `${symbolTex(name)}\\left(${params.map(symbolTex).join(', ')}\\right) = ${shown.tex}`, error: shown.error }
  }

  /** A template's words with each `{{parameter}}` as its argument's text (other `{{…}}`, values, are left for the display name). */
  private fillWords(words: string, params: string[], args: string[]): string {
    return words.replace(VALUE_IN_TEXT, (whole, inside: string) => {
      const at = params.indexOf(inside.trim())
      return at < 0 ? whole : args[at]
    })
  }

  /** The display name a template makes from its arguments, `massName(H2O)` → "m_{H2O}", or what's wrong. */
  private fillTemplate(name: string, args: string[]): { words: string } | { error: string } {
    const template = this.labelTemplates.get(name)
    if (!template) return { error: `${name}( ) isn't a display-name template: define one first, as ${name}(x) = "…{{x}}…".` }
    if (args.length !== template.params.length) {
      const count = template.params.length
      return { error: `${name} takes ${count} argument${count === 1 ? '' : 's'} (${template.params.join(', ')}), not ${args.length}.` }
    }
    return { words: this.fillWords(template.words, template.params, args) }
  }

  /** How a variable's name is shown: its display name, if it has one. */
  private nameTex(name: string): string {
    const v = this.vars.get(name)
    return v?.label ?? v?.symbol ?? symbolTex(name)
  }

  defineConstant(input: string): CalcResult {
    const name = ASSIGNMENT.exec(input)?.[1]
    if (!name) return { tex: '', error: `Inside ${SIGIL}${CONSTANTS_BLOCK}, each line is "name = value".` }
    if (isReservedConstantName(name)) {
      return { tex: '', error: `${SIGIL}${name} is built in (a namespace, or the constants block), so a constant can't be called ${name}.` }
    }
    this.pushScope()
    try {
      const result = this.evaluate(input)
      if (!result.error && this.scope.has(name)) {
        this.customConstants.set(name, {
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

  /**
   * Replace `@name`, `@name:n` and `@name:exact` with hidden variables holding
   * the constant rounded to that many sig figs. Built-ins default to 3 sig figs;
   * constants from an `@constants` block default to the precision they were
   * written with. `:exact` gives full precision and doesn't limit sig figs.
   */
  private expandConstants(line: string): { text: string; error?: string } {
    // `@chem.mm({H2O})` is a sum of `@chem.mm.H`s and `@chem.mm.O`s, worked out below.
    const calls = expandNamespaceCalls(line)
    if (calls.error) return calls
    let error: string | undefined
    const text = calls.text.replace(CONSTANT_REF, (match, typed: string, spec?: string) => {
      // `@chem.mm.Na` is chem__mm__Na inside (with its first dot read already, or not).
      const name = constantKey(typed)
      const custom = this.customConstants.get(name)
      const builtin = builtinConstant(name)
      if (!custom && !builtin) {
        const known = [...builtinConstantKeys(), ...this.customConstants.keys()]
        const guess = suggestConstant(name, known)
        error ??= `Unknown constant ${SIGIL}${typedConstant(name)}.`
          + (guess ? ` Did you mean ${SIGIL}${typedConstant(guess)}?` : ` Define it in an ${SIGIL}${CONSTANTS_BLOCK} { } block.`)
        return match
      }
      // Precedence: this use's own :n, then the sheet's declaration, then the default.
      // A namespace's constant, `@chem.mm.Na`, has the digits it's written with (22.990), unless asked for others.
      const writtenSf = builtin && isNamespaceConstant(builtin) ? countSigFigs(builtin.written) : undefined
      const digits: Precision = spec === EXACT_SETTING
        ? EXACT_SETTING
        : spec !== undefined
          ? Number(spec)
          : this.constantPrecision.get(name) ?? (custom ? custom.sf : writtenSf ?? DEFAULT_CONSTANT_SIG_FIGS)
      if (digits === 0) {
        error ??= `${SIGIL}${typedConstant(name)}:0 isn't valid; use at least 1 sig fig, or :exact.`
        return match
      }
      // Built-ins stay in their own unit (1.602e-19 C, not 160.2 zC).
      let full = custom
        ? custom.value
        : builtin!.unit ? math.unit(builtin!.value, builtin!.unit).to(builtin!.unit) : builtin!.value
      // A sheet-wide `@name to unit` converts before rounding, so `@a_0:3 to angstrom` is 0.529 Å.
      // (If the unit doesn't fit, the declaration line itself reports the error.)
      const unit = this.constantUnit.get(name)
      if (unit && math.isUnit(full)) {
        try {
          full = (full as Unit).to(unit)
        } catch { /* reported on the declaration line */ }
      }
      const exact = digits === EXACT_SETTING || !Number.isFinite(digits)
      const hidden = constantRefName(name, exact ? EXACT_SETTING : digits)
      // `:exact` shows every digit of the value; that many sig figs is more than any
      // measurement has, so it never limits a result.
      const allDigits = custom ? custom.sf : writtenSf ?? countSigFigs(String(builtin!.value))
      this.store(hidden, {
        // (A built-in constant of a species, @chem.mm.Na, is given it once rounded.)
        value: this.modules.reduce((v, m) => m.constantValue(v, builtin), (exact ? full : this.roundTo(full, digits)) as unknown),
        sf: exact ? allDigits : digits,
        contributions: custom?.contributions,
        uncSf: custom?.uncSf,
        // An explicit precision (`@c:4`, a sheet-wide `@c:4` line, `rho:2 = …`) beats the global setting.
        declared: spec !== undefined || this.constantPrecision.has(name) || custom?.declared || undefined,
      })
      return hidden
    })
    return { text, error }
  }

  /** A number or quantity rounded to `digits` sig figs, in its own display unit. */
  private roundTo(value: unknown, digits: number): unknown {
    if (typeof value === 'number') return Number(value.toPrecision(digits))
    if (!math.isUnit(value)) return value
    const m = /^(\S+)\s+(.+)$/.exec(math.format(value as Unit, { precision: MAX_DIGITS }))
    return m ? math.unit(Number(Number(m[1]).toPrecision(digits)), m[2]).to(m[2]) : value
  }

  // -------------------------------------------------------------------------
  // Multi-line functions
  // -------------------------------------------------------------------------

  /**
   * Define a Python-style function:
   *
   *   def f(a, b)
   *       c = a * b
   *       return c + 1
   *
   * Each call runs the body in a fresh local scope whose parent is the scope the
   * function was defined in, so the body can read variables from around the
   * definition, and its own assignments stay local. Calls go through mathjs like
   * any other function, so units, sig figs and uncertainty propagation apply.
   */
  /**
   * `returnSpec`: settings for the result, written after the parameters as on a
   * variable (`f(x):3:deg`, `def polar(x, y):3`): every call's result is shown
   * (and kept) that way.
   */
  defineFunction(name: string, paramSpecs: string[], given: FunctionLine[], multiline = false, returnSpec = ''): FunctionResult {
    // (Its body is read as any line is: a species' name in it is its formula.)
    const lines = given.map((l) => ({ ...l, text: this.rewriteLine(l.text) }))
    // `m to kg`: the argument is converted to kg on the way in.
    const parsed = paramSpecs.map(parseParam)
    const params = parsed.map((p) => p?.name ?? '')
    const casts = parsed.map((p) => p?.unit)
    const ret = returnSpec ? parseDeclaration(`${name}${returnSpec} = 0`) : null
    const returnSettings = ret && !('error' in ret) ? ret : null
    const shownUnit = returnSettings?.unit && returnSettings.unit !== PERCENT ? returnSettings.unit : undefined
    const signature = `${symbolTex(name)}\\left(${parsed.map((p, i) => (p
      ? `${symbolTex(p.name)}${p.unit ? `\\,[${unitTex(p.unit)}]` : ''}`
      : paramSpecs[i])).join(', ')}\\right)${shownUnit ? `\\to[${unitTex(shownUnit)}]` : ''}`
    const body: FunctionResult['body'] = []
    if (ret && 'error' in ret) return { signature, body, error: ret.error }
    if (returnSettings?.unit === PERCENT) {
      return { signature, body, error: `${name}:percent isn't available on a function; show a result as a percentage where it's used.` }
    }
    for (const setting of returnSettings?.moduleSettings ?? []) {
      const problem = moduleSettingProblem(name, setting, SETTING_PLACE.functionResult)
      if (problem) return { signature, body, error: problem }
    }
    const returnUnit = shownUnit
    const returnSf = returnSettings?.sf === EXACT_SETTING ? EXACT : returnSettings?.sf
    const returnNotation = returnSettings?.notation
    const returnLook = this.lookSettingOf(returnSettings?.moduleSettings)?.look
      ?? this.modules.flatMap((m) => lines.map((l) => m.lookOfWritten(l.text))).find((l) => l !== undefined)
    const bad = paramSpecs.find((_, i) => !parsed[i])
    if (bad !== undefined) return { signature, body, error: `"${bad}" isn't a valid parameter: write a name, or "name to unit".` }
    const badUnit = casts.find((u) => u !== undefined && !isValidUnit(u))
    if (badUnit) return { signature, body, error: `"${badUnit}" isn't a unit MathScribe knows.` }
    type Statement = Guarded & (
      // `unit`: a display unit on the name (`th:deg = …`), which the value keeps.
      | { kind: typeof STATEMENT_KIND.assign; name: string; code: math.EvalFunction; unit?: string; settings?: string[] }
      | { kind: typeof STATEMENT_KIND.unpack; targets: TupleName[]; code: math.EvalFunction }
      | { kind: typeof STATEMENT_KIND.return; code: math.EvalFunction }
      | { kind: typeof STATEMENT_KIND.branch; text: string }
    )
    const statements: Statement[] = []
    const sources: UserFunction['statements'] = []

    const duplicate = params.find((p, i) => params.indexOf(p) !== i)
    if (duplicate) return { signature, body, error: `The parameter "${duplicate}" is listed twice.` }

    // Branches open at this line (each with its `if`/`else` line's indentation),
    // and the chains an `else` could still continue, by their `if`'s indentation.
    const open: { indent: number; id: number }[] = []
    const chains: { indent: number; chain: number }[] = []
    let nextBranch = 0

    for (const { line, text, note, command, multiline: lineMultiline, indent = 0 } of lines) {
      // A line indented no further than a branch's own line ends that branch.
      while (open.length && indent <= open.at(-1)!.indent) open.pop()
      while (chains.length && indent < chains.at(-1)!.indent) chains.pop()
      const guards = open.map((b) => b.id)
      // How far in the definition's card shows it: one step per branch around it.
      const inset = '\\quad '.repeat(guards.length)

      // `if …`, `else if …`, `else`: a branch, holding the lines indented under it.
      const elseIf = ELSE_IF_LINE.exec(text)
      const ifLine = elseIf ? null : IF_LINE.exec(text)
      const isElse = ELSE_LINE.test(text)
      if (ifLine || elseIf || isElse) {
        const continues = chains.at(-1)?.indent === indent
        if (!ifLine && !continues) {
          return { signature, body, error: `Line ${line}: this ${KEYWORD.else} has no ${KEYWORD.if} before it at the same indentation.` }
        }
        if (ifLine && continues) chains.pop()
        const id = nextBranch++
        const chain = ifLine ? id : chains.at(-1)!.chain
        if (ifLine) chains.push({ indent, chain })
        // (After an `else`, the chain is over: another `else` has nothing to continue.)
        if (isElse) chains.pop()
        const condition = ifLine?.[1] ?? elseIf?.[1]
        try {
          let code: math.EvalFunction | undefined
          let tex = '\\text{otherwise}'
          if (condition !== undefined) {
            const literals = new Map<number, string>()
            for (const m of condition.matchAll(NUMBER_LITERAL)) addLiteral(literals, m[0])
            const expanded = this.expandConstants(condition)
            if (expanded.error) throw new Error(expanded.error)
            const node = math.parse(preprocess(expanded.text, this.isVariable).text)
            code = node.compile()
            tex = `\\text{${ifLine ? KEYWORD.if : `${KEYWORD.else} ${KEYWORD.if}`} }${this.toTex(node, literals)}`
          }
          const branch = { id, chain, code }
          statements.push({ kind: STATEMENT_KIND.branch, text: condition ?? '', guards, branch })
          sources.push({ kind: STATEMENT_KIND.branch, text: condition ?? '', note, command, multiline: lineMultiline, guards, branch })
          body.push({ tex: `${inset}${tex}`, note, line })
        } catch (e) {
          return { signature, body, error: `Line ${line}: ${(e as Error).message}` }
        }
        open.push({ indent, id })
        continue
      }
      // Any other line ends the chain at its indentation: an `else` after it has no `if`.
      if (chains.at(-1)?.indent === indent) chains.pop()

      const ret = RETURN_LINE.exec(text)
      // `x = …`, or with display settings: `x:3 = …`, `theta:deg = …`.
      const assign = ASSIGNMENT_WITH_VALUE.exec(text)
      // `@tuple(a, b) = …` unpacks a tuple (checked first: it also looks like an assignment).
      const unpack = UNPACK.exec(text)
      const unpackNames = unpack?.[1].split(',').map((n) => n.trim())
      const source = ret?.[1] ?? unpack?.[2] ?? assign?.[2]
      if (!source) {
        return { signature, body, error: `Line ${line}: inside a function, each line is "name = …", "@tuple(a, b) = …", "return …", or an if / else with lines indented under it.` }
      }
      // Each unpacked name, with any settings (`@tuple(r:3, th:deg) = …`).
      const unpackTargets = unpackNames?.map(parseTupleName)
      const badTarget = unpackTargets?.find((t) => 'error' in t)
      if (badTarget && 'error' in badTarget) return { signature, body, error: `Line ${line}: ${badTarget.error}` }
      const targets = unpackTargets as TupleName[] | undefined
      const literals = new Map<number, string>()
      for (const m of source.matchAll(NUMBER_LITERAL)) addLiteral(literals, m[0])
      try {
        // Constants resolve where the function is defined, so calls can see them.
        const expanded = this.expandConstants(source)
        if (expanded.error) throw new Error(expanded.error)
        const node = math.parse(preprocess(expanded.text, this.isVariable).text)
        const code = node.compile()
        if (unpackNames) {
          statements.push({ kind: STATEMENT_KIND.unpack, targets: targets!, code, guards })
          sources.push({ kind: STATEMENT_KIND.assign, text, note, command, multiline: lineMultiline, guards })
          const names = targets!.map((t) => symbolTex(t.name)).join(', ')
          body.push({ tex: `${inset}\\left(${names}\\right) = ${this.toTex(node, literals)}`, note, line })
        } else if (ret) {
          statements.push({ kind: STATEMENT_KIND.return, code, guards })
          sources.push({ kind: STATEMENT_KIND.return, text: source, note, command, multiline: lineMultiline, guards })
          body.push({ tex: `${inset}${signature} = ${this.toTex(node, literals)}`, note, line })
        } else {
          const declared = parseDeclaration(text)
          const unit = declared && !('error' in declared) && declared.unit !== PERCENT ? declared.unit : undefined
          const settings = declared && !('error' in declared) ? declared.moduleSettings : undefined
          statements.push({ kind: STATEMENT_KIND.assign, name: assign![1], code, unit, settings, guards })
          // Keep the line as written, so a declared `x:3 =` applies when its working is shown.
          sources.push({ kind: STATEMENT_KIND.assign, text, note, command, multiline: lineMultiline, guards })
          body.push({ tex: `${inset}${symbolTex(assign![1])} = ${this.toTex(node, literals)}`, note, line })
        }
      } catch (e) {
        return { signature, body, error: `Line ${line}: ${(e as Error).message}` }
      }
    }
    // No `return`: like Python, the function gives no value. Called on a line of
    // its own, it just shows its working; used in a calculation, it's an error.
    const returns = statements.some((s) => s.kind === STATEMENT_KIND.return)

    const definedIn = this.vars
    const fn = (...args: unknown[]) => {
      if (args.length !== params.length) {
        throw new Error(`${name} takes ${params.length} argument${params.length === 1 ? '' : 's'}, `
          + `but was given ${args.length}.`)
      }
      const local = innerValues(definedIn)
      params.forEach((p, i) => local.set(p, castArgument(p, casts[i], args[i])))
      const run = new BranchRun()
      for (const s of statements) {
        if (!run.reaches(s)) continue
        if (s.kind === STATEMENT_KIND.branch) {
          const code = s.branch?.code
          if (run.open(s) && (!code || holds(code.evaluate(local), s.text))) run.take(s)
          continue
        }
        const v = s.code.evaluate(local)
        if (s.kind === STATEMENT_KIND.return) return returnUnit ? toDisplayUnit(v, returnUnit) : v
        if (s.kind === STATEMENT_KIND.unpack) {
          const values = isTuple(v) ? v.toArray() as unknown[] : null
          if (!values || values.length !== s.targets.length) {
            const names = s.targets.map((t) => t.name).join(', ')
            throw new Error(`In ${name}, @tuple(${names}) = … needs a tuple of ${s.targets.length} values.`)
          }
          s.targets.forEach((t, i) => local.set(t.name, t.unit ? toDisplayUnit(values[i], t.unit) : values[i]))
          continue
        }
        const value = s.unit ? toDisplayUnit(v, s.unit) : v
        local.set(s.name, value)
        for (const d of this.derivedVariables(s.name, value, s.settings)) local.set(d.name, d.value)
      }
      return undefined
    }
    this.userFunctions.set(fn, {
      params, casts, statements: sources, definedIn, multiline, returns, returnSf, returnNotation, returnLook, returnUnit,
    })
    this.store(name, { value: fn, sf: EXACT })
    return { signature, body: body.map((b) => ({ ...b, tex: nestBrackets(b.tex) })) }
  }

  /** Calls to multi-line functions in `node`, innermost first (arguments before the call). */
  private userCalls(node: MathNode): FunctionNode[] {
    const out: FunctionNode[] = []
    const visit = (n: MathNode) => {
      n.forEach((child) => visit(child))
      if (isFunctionNode(n)) {
        const f = this.scope.get(n.fn.name)
        if (typeof f === 'function' && this.userFunctions.has(f)) out.push(n)
      }
    }
    visit(node)
    return out
  }

  /**
   * Show what happens inside a call: replay the function's body through the
   * normal line evaluator, in a scope like the function's own, with each
   * parameter bound to its argument's value, sig figs and uncertainty. Each body
   * line then shows as `x = a + b = 2 + 3 = 5`. Returns the body's equations and
   * the pieces of the return expression, with its note and command.
   *
   * A body line's own command (`#sym`, `#val`, `#full`) decides how that step is
   * shown; otherwise the calling line's mode applies. `#hide` still runs the step
   * (later lines may need it) but leaves it out, unless it has an error.
   */
  /**
   * A line that's only a call to a function without `return`: show the working
   * inside it, with the call itself as the line (there's no value to show).
   */
  private showWorking(call: FunctionNode, ctx: ParsedLine): LineResult {
    const tex = this.toTex(call, ctx.literals)
    const warning = ctx.warnings.join(' ') || undefined
    try {
      // Run it, so mistakes (an argument that doesn't fit a cast, say) are reported.
      call.compile().evaluate(this.scope)
    } catch (e) {
      return { tex, warning, error: (e as Error).message }
    }
    const traced = ctx.mode === DISPLAY_MODE.val ? null : this.traceCall(call, ctx.literals, ctx.mode, ctx.explicit)
    return { tex, warning, trace: traced?.lines, info: ctx.info }
  }

  private traceCall(call: FunctionNode, literals: Map<number, string>, mode: DisplayMode, explicit: boolean) {
    const fn = this.scope.get(call.fn.name)
    const def = typeof fn === 'function' ? this.userFunctions.get(fn) : undefined
    if (!def || def.params.length !== call.args.length || this.traceDepth >= MAX_TRACE_DEPTH) return null

    // Arguments are worked out in the calling scope.
    let args: { value: unknown; sf: number; contributions: Contributions; shown?: string }[]
    try {
      args = call.args.map((a, i) => ({
        // A cast parameter shows its argument converted (0.100 nm → 1.00e-10 m).
        value: castArgument(def.params[i], def.casts[i], this.typedValue(a)),
        sf: this.sigFigsOf(a, literals, false),
        contributions: this.propagate(a),
        // f(pi) shows π inside the function's working, not 3.14159, and a variable
        // that stays symbolic (defined with #sym) stays symbolic as an argument.
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
      const lines: TraceLine[] = []
      const run = new BranchRun()
      for (const s of def.statements) {
        if (!run.reaches(s)) continue
        if (s.kind === STATEMENT_KIND.branch) {
          if (!run.open(s)) continue
          const code = s.branch?.code
          if (!code) {
            run.take(s)
            continue
          }
          // The comparison, with its values: v > 0 = 2.0 m/s > 0 = true.
          const shown = this.evaluateLine(s.text, mode, explicit)
          if (s.command !== LINE_COMMAND.hide || shown.error) lines.push({ tex: shown.tex, note: s.note })
          if (shown.error) break
          if (holds(code.evaluate(this.scope), s.text)) run.take(s)
          continue
        }
        const own = s.command && s.command !== LINE_COMMAND.hide ? s.command : undefined
        // The function's own #multiline (or the body line's) lays out its working too.
        const outerMultiline = this.multiline
        this.multiline = outerMultiline || def.multiline || !!s.multiline
        let r: LineResult
        try {
          r = this.evaluateLine(s.text, own ?? mode, explicit || !!own)
        } finally {
          this.multiline = outerMultiline
        }
        const hidden = s.command === LINE_COMMAND.hide && !r.error
        if (!hidden) lines.push(...(r.trace ?? []))
        if (s.kind === STATEMENT_KIND.return) {
          return { lines, ret: r.parts, retNote: s.note, retCommand: own, retSf: def.returnSf ?? r.sf }
        }
        if (!hidden) lines.push({ tex: r.tex, note: s.note })
        if (r.error) break
        // A parameter reassigned in the body is now its own value, not the argument.
        const assigned = LEADING_NAME.exec(s.text)?.[0]
        if (assigned) aliases.delete(assigned)
      }
      return { lines, ret: undefined, retNote: undefined, retCommand: undefined, retSf: undefined }
    } finally {
      this.paramAliases = callerAliases
      this.traceDepth--
      this.enter(caller)
    }
  }

  private isUserFunction(name: string): boolean {
    const f = this.scope.get(name)
    return typeof f === 'function' && this.userFunctions.has(f)
  }

  // -------------------------------------------------------------------------
  // @solve(lhs = rhs, x [, guess])
  // -------------------------------------------------------------------------

  // -------------------------------------------------------------------------
  // Evaluation
  // -------------------------------------------------------------------------

  /**
   * Evaluate one line. `explicit` says the mode was asked for with a command
   * (on the line or its block), so it isn't overridden by a called function's
   * return-line command. `notation`: `#sci` or `#dec` on the line, or on a
   * block around it.
   */
  evaluate(input: string, mode: DisplayMode = DISPLAY_MODE.full, explicit = false, multiline = false, notation: LineNotation = {}): CalcResult {
    this.multiline = multiline
    this.lineNotation = notation
    for (const m of this.modules) m.beginLine()
    try {
      const { tex, error, warning, info, trace, returnNote, plot, defines } = this.evaluateLine(this.rewriteLine(input), mode, explicit)
      // Messages name a namespace's members as typed, a.x_1 (not a__x_1), and a module's inside names as the sheet does.
      // (And one of MathScribe's functions written without its @ is explained.)
      const readable = (s: string | undefined) => (s === undefined ? s : builtinCallHint(moduleReadableMessage(s.includes(JOIN) ? fitHint(readableMembers(s)) : s)))
      // Brackets by nesting, ( ) inside [ ] inside { }, once each equation is finished.
      return {
        tex: nestBrackets(tex), error: readable(error), warning: readable(warning), info: readable(info), returnNote, plot, defines,
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

  /** `#multiline` on the line being evaluated: each `=` (and in a call's working too) on its own row. */
  private multiline = false

  /** `#sci` / `#dec` on the line being evaluated, or on a block around it. */
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
  private evaluateUnpack(namesText: string, rhs: string, mode: DisplayMode, explicit: boolean): LineResult {
    const entries = namesText.split(',').map((n) => n.trim())
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

  /** A series' values by number: t_1, t_2, … (or t1, t2, …) as 1 → "t_1", 2 → "t_2", …. */
  private seriesRows(base: string): Map<number, string> {
    const number = new RegExp(`^${escapeRegExp(base)}_?(\\d+)$`)
    return new Map(this.seriesMembers(base).map((m) => [Number(number.exec(m)![1]), m]))
  }

  /** An expression as typed, as TeX (an unnamed table column's header). */
  private expressionTex(expr: string): string {
    const literals = new Map<number, string>()
    for (const m of expr.matchAll(NUMBER_LITERAL)) addLiteral(literals, m[0])
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

  private evaluateLine(input: string, requestedMode: DisplayMode, explicit = false): LineResult {
    // A line a module works out itself, as written: a reaction, `r = @chem.reaction({2 H2 + O2 -> 2 H2O})`.
    const raw = this.byForm(LINE_STAGE.raw, input, requestedMode, explicit)
    if (raw) return raw
    // `a.x_1`, a namespace's member, is the variable a__x_1 inside.
    input = expandDots(input)
    // …and once its members are inside names: `@table(t, x)`, `@plot(t, x)`.
    const form = this.byForm(LINE_STAGE.members, input, requestedMode, explicit)
    if (form) return form

    // `@tuple(a, b, c) = …` unpacks a tuple. (Before one-line functions: it looks like one.)
    const unpack = UNPACK.exec(input.trim())
    if (unpack) return this.evaluateUnpack(unpack[1], unpack[2], requestedMode, explicit)

    // `massName(x) = "m_{{x}}"`: a display-name template. (Before one-line functions: it looks like one.)
    const template = LABEL_TEMPLATE.exec(input.trim())
    if (template) return this.defineTemplate(template[1], template[2], template[3])

    // `f(x, y) = …` is a one-line function, the same as a `def` whose body is just the return.
    const oneLiner = ONE_LINE_FUNCTION.exec(input.trim())
    const params = oneLiner?.[2].split(',').map((p) => p.trim()).filter(Boolean)
    // (Bad parameters, like `g(x y)`, get defineFunction's error rather than mathjs's.)
    if (oneLiner) {
      // `f(x):3:deg = …`: settings for what the function gives back.
      const result = this.defineFunction(oneLiner[1], params!, [{ line: 0, text: `${KEYWORD.return} ${oneLiner[4]}` }], this.multiline, oneLiner[3])
      return {
        tex: result.body[0]?.tex ?? result.signature,
        error: result.error?.replace(/^Line 0: /, ''),
      }
    }

    // `m:3 = …`, `phi:3:deg = …` set how what's assigned is shown; take them off the name.
    const declaration = parseDeclaration(input.trim())
    if (declaration && 'error' in declaration) return { tex: '', error: declaration.error }
    // Settings that are a module's: `m:formula = …`, how the named species on this line are shown.
    for (const m of this.modules) m.useLineSettings(declaration?.moduleSettings ?? [])
    // A display name is worked out now, so values in it are the ones it was computed with.
    // (One made with a template, `m_w:massName(H2O)`, is its words with the arguments put in.)
    const labelWords = declaration?.template ? this.fillTemplate(declaration.template.name, declaration.template.args) : undefined
    if (labelWords && 'error' in labelWords) return { tex: '', error: labelWords.error }
    const labelSource = declaration?.label ?? labelWords?.words
    const label = labelSource !== undefined ? this.labelTex(labelSource) : undefined
    if (label?.error) return { tex: '', error: label.error }
    const declaredSf = declaration?.sf
    const displayUnit = declaration?.unit === PERCENT ? undefined : declaration?.unit
    if (declaration) input = `${declaration.name} =${input.trim().slice(declaration.length)}`

    // `delta F =` asks for F's uncertainty; a trailing = is just a prompt.
    const constants = this.expandConstants(input.replace(/=\s*$/, '').trim())
    if (constants.error) return { tex: '', error: constants.error }
    const cleaned = constants.text
    const target = ASSIGNMENT.exec(cleaned)?.[1]
    const aggregateError = this.defineAggregates(cleaned, target)
    if (aggregateError) return { tex: '', error: aggregateError }
    // `… to percent` isn't a mathjs unit: take it off and show the result as a percentage.
    const asPercent = TO_PERCENT.test(cleaned) || declaration?.unit === PERCENT
    const line = expandParenPm(this.expandDeltaRefs(cleaned.replace(TO_PERCENT, '')))

    // Number literals as typed, so `2.0 kg` keeps its trailing zero.
    const literals = new Map<number, string>()
    for (const m of line.matchAll(NUMBER_LITERAL)) addLiteral(literals, m[0])

    // A line a module works out itself once it's read this far: `x = @solve(lhs = rhs, x)`.
    const expression = this.byForm(LINE_STAGE.expression, line, requestedMode, explicit, {
      literals, declaredSf, displayUnit, notation: declaration?.notation,
    })
    if (expression) return expression
    // A call that's a line of its own, inside an expression: `x = 2 * @table(t)`.
    const stray = strayLineFormCall(line)
    if (stray) return { tex: '', error: stray }

    // Separate `value pm uncertainty` on the right-hand side.
    const lhs = ASSIGNMENT.exec(line)?.[0] ?? ''
    const pm = splitPm(line.slice(lhs.length))
    const percent = !!pm?.[1].endsWith('%')

    let node: MathNode
    let uncNode: MathNode | undefined
    const warnings: string[] = []
    try {
      const { text, shadowed } = preprocess(pm ? lhs + pm[0] : line, this.isVariable)
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
      uncNode, percent, literals, warnings, mode: requestedMode, explicit, declaredSf, asPercent, displayUnit,
      notation: declaration?.notation, look: this.lookSettingOf(declaration?.moduleSettings), label: label?.tex,
    })
    return declaration?.moduleSettings && !result.error ? this.withDerived(declaration.name, result, requestedMode, declaration.moduleSettings) : result
  }

  /**
   * Variables a line's settings (a module's) make from the one it assigns, as
   * `F:xyz = …` makes each component of the vector F (F_x, F_y, F_z): stored at
   * its sig figs and notation, and shown under its line (except with #sym,
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
    // Kept as its notation; shown as its line is (with #sci or #dec too).
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
    const { uncNode, percent, literals, warnings, explicit } = ctx
    let mode = ctx.mode
    const assigned = isAssignmentNode(node) ? node.object.name : undefined
    const expr = isAssignmentNode(node) ? node.value : node
    // A function without `return` gives no value: it can only be called on a line of its own.
    const valueless = this.userCalls(expr).find((c) => {
      const f = this.scope.get(c.fn.name)
      return typeof f === 'function' && this.userFunctions.get(f)?.returns === false
    })
    if (valueless) {
      const name = valueless.fn.name
      if (assigned || unwrap(expr) !== valueless) {
        return {
          tex: this.toTex(node, ctx.literals),
          warning: ctx.warnings.join(' ') || undefined,
          error: `${name} has no return line, so it doesn't give a value to ${assigned ? `store in ${assigned}` : 'calculate with'}. `
            + `Add a "return …" line to ${name}, or call it on a line of its own to show its working.`,
        }
      }
      return this.showWorking(valueless, ctx)
    }

    // #multiline on the line, or a call to a function defined with #multiline.
    const multiline = this.multiline || this.userCalls(expr).some((c) => {
      const f = this.scope.get(c.fn.name)
      return typeof f === 'function' && this.userFunctions.get(f)?.multiline === true
    })
    // For `x to kN`, show `x`; the conversion shows up in the result.
    const shown = isOperatorNode(expr) && isConversion(expr) ? expr.args[0] : expr

    // A given left-hand side, such as unpacking's (a, b, c), wins over the name assigned.
    // It's for this line only, not the working of functions it calls, so take it now.
    const override = this.lhsOverride
    this.lhsOverride = undefined
    const unpackDeclaredSf = this.unpackDeclaredSf
    this.unpackDeclaredSf = undefined
    const lhsTex = override ?? (assigned ? (ctx.label ?? symbolTex(assigned)) : ctx.lhs)
    let exprTex = uncNode ? this.pmTex(shown, uncNode, percent, literals) : this.toTex(shown, literals)
    const bare = unwrap(shown)
    /** Intermediate steps between the expression and the result. */
    const steps: string[] = []
    const parts = (result?: string): EquationParts =>
      ({ lhs: lhsTex, expr: exprTex, steps, result, bareSymbol: isSymbolNode(bare) })

    // Calls to multi-line functions: show the working inside each one first.
    // When the whole right-hand side is one call, the line itself then reads
    // `r = <return expression> = … = result` instead of `r = f(y, z) = …`.
    // Lines shown before this one (e.g. the equation being solved), except for #val.
    const trace: TraceLine[] = mode === DISPLAY_MODE.val ? [] : [...(ctx.prelude ?? [])]
    let wholeLineTraced = false
    let returnNote: string | undefined
    /** For a line that's just a function call: the sig figs of what it returns. */
    let returnSf: number | undefined
    // (Worked out with #val too: each call's result has the sig figs of its return
    // line, which sigFigsOf needs when the call is part of a bigger expression.)
    for (const call of this.userCalls(shown)) {
      const t = this.traceCall(call, literals, mode, explicit)
      if (!t) continue
      if (t.retSf !== undefined) this.callSigFigs.set(call, t.retSf)
      if (mode !== DISPLAY_MODE.val) {
        trace.push(...t.lines)
        if (call === bare && t.ret) {
          exprTex = t.ret.expr
          steps.push(...t.ret.steps)
          wholeLineTraced = true
          returnNote = t.retNote
          returnSf = t.retSf
          // A command on the return line sets how this line is shown, unless
          // this line asked for something itself.
          if (t.retCommand && !explicit) mode = t.retCommand
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
        ? this.standardErrorWorking(meanOf)
        : this.deltaWorking(uncRef.of, uncRef.letter)))
    }
    // `a`, `a_avg`, …: show how the series is combined.
    const agg = isSymbolNode(bare) ? this.vars.get(bare.name)?.agg : undefined
    if (agg) steps.push(...this.aggregateWorking(agg))

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
    this.precisionLost = false
    // A function call's precision comes from its return line (including any
    // `x:3 =` declarations and measured numbers inside the body).
    const sf = returnSf ?? this.sigFigsOf(expr, literals, false)
    if (this.autoSigFigs && this.precisionLost) {
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
      const ambiguous = checked.flatMap((n) => this.ambiguousLiterals(n, literals))
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
      const declaresUnit = typeof called === 'function' && !!this.userFunctions.get(called)?.returnUnit
      // A name on its own (`c`, `y = c`) is shown as the variable is: in its unit.
      const justAName = isSymbolNode(bare)
      value = normalise(expr.compile().evaluate(this.scope), isConversion(expr) || isLiteral(expr) || declaresUnit || justAName)
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
      contributions = this.propagate(expr)
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
    const unc = this.total(contributions, value)
    // A declared `2.0 kg pm 0.1 kg` keeps the uncertainty's sig figs as typed.
    const declaredUncSf = uncNode && !percent && isLiteral(expr) ? this.literalSigFigs(uncNode, literals) : undefined
    let shownSf = unc !== undefined ? (this.uncertainParts(value, unc, declaredUncSf)?.sf ?? sf) : sf

    // Declared sig figs (`m:3 = …`) replace the counted ones, and beat the global
    // setting, unless the value has an uncertainty, which sets its precision instead.
    /** A notation asked for on this line or its block (not just inherited from a variable). */
    const explicitNotation = ctx.notation ?? this.lineNotation.own ?? this.lineNotation.block
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
      ?? (typeof callee === 'function' ? this.userFunctions.get(callee)?.returnNotation : undefined)
    // `#sci` / `#dec` only change how this line is shown: the line's own command
    // beats a variable's notation, and a block's doesn't (see LineNotation).
    const notation = ctx.notation ?? this.lineNotation.own ?? kept ?? this.lineNotation.block
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
      // Defined with #sym (on the line or its block): later substitutions keep the
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
      tex: layoutEquation(mode, finalParts, multiline), parts: finalParts, warning, trace, returnNote,
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
   * Variables defined directly in `vars`, not inherited ones, and the members
   * of the selections and named plots made there (a.x_1: each the variable it
   * looks up, under its own name).
   */
  private describe(vars: Variables): VariableSummary[] {
    // Map.prototype.entries only sees this scope's own entries. Uncertainty
    // references and series aggregates are derived on demand, so not listed.
    // Each one's TeX is worked out when it's first asked for (a hover, say): a
    // sheet with thousands of imported values would otherwise typeset them all
    // on every edit.
    const typeset = (name: string, v: Variable) =>
      `${v.label ?? symbolTex(name)} = ${this.valueTex(v.value, v.sf, this.total(v.contributions, v.value), v.uncSf, v.declared === true)}`
    const listed = (name: string, v: Variable): VariableSummary => {
      let tex: string | undefined
      // (Not enumerable, so code that walks the list's properties doesn't typeset them all.)
      return Object.defineProperty({ name, sf: v.sf }, 'tex', { get: () => (tex ??= typeset(name, v)), enumerable: false }) as VariableSummary
    }
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

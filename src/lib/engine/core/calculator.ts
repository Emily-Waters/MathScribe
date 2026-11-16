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
import { ASSIGNMENT, ASSIGNMENT_WITH_VALUE, COMPONENTS_SETTING, CONSTANT_REF, EXACT_SETTING, IS_NAME, LEADING_NAME, ONE_LINE_FUNCTION, PERCENT, CALL, ELSE_IF_LINE, ELSE_LINE, IF_LINE, KEYWORD, RETURN_LINE, SOLVE_SYSTEM, SOLVE_CALL, UNIT_VECTOR_SETTING, UNPACK, VECTOR_FUNCTION, DISPLAY_MODE, LINE_COMMAND, VALUE_IN_TEXT, CONSTANTS_BLOCK, LABEL_TEMPLATE, SIGIL, type DisplayMode, type Notation, type Precision, type UncertaintyWord, type VectorStyle } from '../../syntax.ts'
import { INLINE_VALUE_NAME, JOIN, RESERVED_NAMESPACES, constantKey, constantRefName, expandDots, typedConstant, isHiddenName, isUncertaintyName, memberName, parseNumberedName, parseUncertaintyName, readableMembers, seriesMemberName, solvedName, uncertaintyName, unpackedName } from '../../names.ts'
import { COMPARISONS, FN, OP, OP_SYMBOL, UNIT, isOp } from '../../mathjsNames.ts'
import { POLYNOMIAL_KIND, Solver, contains, countOccurrences, matchingParen, splitArgs, splitEquation } from '../../solve.ts'
import { nestBrackets } from '../../brackets.ts'
import type { CsvColumn } from '../../csv.ts'

import { isTuple, math } from './math.ts'
import { EngineModule, LINE_STAGE, installModule, moduleReadableMessage, type LineForm, type LineStage, type ModuleHost } from './module.ts'
import { outsideMaths, wordsTex } from './text.ts'
import { expandNamespaceCalls } from './builtinCalls.ts'
import { VECTOR_PRODUCTS, hasVector } from './vectors.ts'
import { BUILTIN_CONSTANT_NAMES, NUMBER_LITERAL, NAME_IN_LINE, CONVERSION_TAIL, preprocess } from './literals.ts'
import { ExplainedError, type CalcOptions, type EquationParts, layoutEquation, type FunctionResult, type FunctionLine, type TraceLine, type CalcResult, unexpectedError, fitHint, type DataColumn, type LineNotation, type LineResult, type ParsedLine, TO_PERCENT, RAW, rawNode, STEP, readableUnitError } from './results.ts'
import { NAME_THEN_SETTINGS, DELTA_REF, expandParenPm, splitPm } from './uncertainty.ts'
import { parseAggregateName, escapeRegExp } from './series.ts'
import { symbolTex, numberTex, unitTex, attachUnit, isUnitCall, unitCallText, isLitCall } from './tex.ts'
import { unwrap, isLiteral, isVectorLiteral, isPureNumber, isConversion } from './nodes.ts'
import { normalise, displayUnit, magnitudeOf, withMagnitude, isRealValue, sameValue } from './normalise.ts'
import { Scope, Views, type Variables, Values, innerValues } from './scope.ts'
import { STATEMENT_KIND, type Guarded, BranchRun, holds, type UserFunction, type CustomConstant, MAX_TRACE_DEPTH } from './functions.ts'
import { isAngleUnit, toDisplayUnit, type TupleName, parseTupleName, parseDeclaration } from './declarations.ts'
import { bracketed, UNIT_VECTOR_TEX, componentsOf, withRows } from './components.ts'
import { EXACT_DISPLAY_DIGITS, FIXED_FORMAT, FLOAT_NOISE, TINY, PERCENT_SCALE, SOLVER, addLiteral, parseParam, isValidUnit, castArgument } from './numbers.ts'
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
  /** How tuples are being shown right now (undefined: as a plain tuple, (…)); see inVectorStyle. */
  private vectorStyle: VectorStyle | undefined
  /**
   * The sig figs of each component of a vector as typed (`<0.50, -9.81>` → 2, 3),
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
    evaluateExpression: (text) => math.evaluate(preprocess(text, this.isVariable).text, this.scope) as unknown,
    total: (contributions, like) => this.total(contributions, like),
    valueTex: (value, sf, unc, uncSf) => this.valueTex(value, sf, unc, uncSf),
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
  private byForm(stage: LineStage, input: string, mode: DisplayMode, explicit: boolean): LineResult | undefined {
    for (const form of this.formsAt(stage)) {
      const result = form.evaluate({ text: input.trim(), mode, explicit }, this.host)
      if (result) return result
    }
    return undefined
  }

  constructor(options: CalcOptions, modules: readonly EngineModule[] = []) {
    this.options = options
    this.modules = modules
    for (const m of modules) installModule(m)
  }

  private get autoSigFigs() {
    return this.options.precision === 'auto'
  }

  /** mathjs format options for values without a sig-fig count (exact values, matrices). */
  private get format() {
    const p = this.options.precision
    return { ...FIXED_FORMAT, precision: p === 'auto' ? EXACT_DISPLAY_DIGITS : p }
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
   * How an expression's result is shown if it's a vector: with unit vectors if
   * any vector in it is (`F:ijk`), else ⟨…⟩ if it has a vector in it at all
   * (`<…>`, a variable holding one, a function returning one); undefined if
   * it has none (a plain tuple).
   */
  private vectorStyleOf(node: MathNode): VectorStyle | undefined {
    const styles = node.filter((n) => isSymbolNode(n) || isFunctionNode(n)).map((n) => {
      if (isSymbolNode(n)) return this.vars.get(n.name)?.vector
      const name = (n as FunctionNode).fn.name
      if (name === VECTOR_FUNCTION) return 'angle'
      const f = this.scope.get(name)
      return typeof f === 'function' ? this.userFunctions.get(f)?.returnVector : undefined
    })
    if (styles.includes(UNIT_VECTOR_SETTING)) return UNIT_VECTOR_SETTING
    return styles.includes('angle') ? 'angle' : undefined
  }

  /** Run `fn` with tuples shown as vectors in `style` (undefined: as plain tuples). */
  private inVectorStyle<T>(style: VectorStyle | undefined, fn: () => T): T {
    const saved = this.vectorStyle
    this.vectorStyle = style
    try {
      return fn()
    } finally {
      this.vectorStyle = saved
    }
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
    return declared ?? (this.autoSigFigs ? undefined : 2)
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
    // A typed vector shows each component as typed (unless sig figs were declared).
    const typed = forced ? undefined : this.typedSfs.get(tuple)
    return this.valuesTex(values, values.map((_, i) => ({ sf: typed?.[i] ?? sf, forced, notation: this.notation })), this.vectorStyle)
  }

  /**
   * Values in a tuple's brackets, each at its own sig figs and notation (as
   * unpacked names can declare). As a vector (`style`), in angle brackets,
   * ⟨3.0, 4.0⟩ N, or with unit vectors, (3.0 î + 4.0 ĵ) N.
   */
  private valuesTex(values: unknown[], shown: { sf: number; forced: boolean; notation?: Notation }[], style?: VectorStyle): string {
    const parts = values.map((v, i) => this.inNotation(shown[i].notation, () => this.split(v, shown[i].sf, shown[i].forced)))
    const unit = parts[0]?.unit
    const shared = values.length > 0 && parts.every((p) => p && p.unit === unit)
    // Each value on its own; with a shared unit, the unit is written once instead.
    const each = values.map((v, i) => (shared
      ? numberTex(parts[i]!.num)
      : this.inNotation(shown[i].notation, () => this.valueTex(v, shown[i].sf, undefined, undefined, shown[i].forced))))
    const sharedUnit = shared && unit ? unitTex(unit) : ''
    if (style === UNIT_VECTOR_SETTING && values.length >= 2 && values.length <= UNIT_VECTOR_TEX.length) {
      // 3.0 î − 4.0 ĵ: each value's sign joins the terms.
      const sum = each.map((tex, i) => {
        const negative = tex.startsWith('-')
        const term = `${negative ? tex.slice(1) : tex}\\,${UNIT_VECTOR_TEX[i]}`
        if (i === 0) return negative ? `-${term}` : term
        return `${negative ? '-' : '+'} ${term}`
      }).join(' ')
      // (Plain brackets: \left( would grow to fit the hats.)
      return sharedUnit ? attachUnit(`(${sum})`, sharedUnit) : sum
    }
    const [open, close] = style ? ['\\left\\langle ', '\\right\\rangle'] : ['\\left(', '\\right)']
    return attachUnit(`${open}${each.join(', ')}${close}`, sharedUnit)
  }

  /** A variable's value for the substitution step, at its own sig figs. */
  private variableNode(name: string): MathNode {
    const shown = this.vars.get(name)?.shown
    if (shown) return rawNode(shown)
    return this.inNotation(this.vars.get(name)?.notation, () => this.inVectorStyle(this.vars.get(name)?.vector,
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
      if (isFunctionNode(n) && n.fn.name === FN.tuple) {
        return `\\left(${n.args.map((a) => a.toTex(options).trim()).join(', ')}\\right)`
      }
      // A module's own functions (giving a value its species, `{H2O}`) are written as it says.
      if (isFunctionNode(n)) {
        for (const m of this.modules) {
          const tex = m.functionTex(n, (a) => a.toTex(options).trim())
          if (tex !== undefined) return ` ${tex}`
        }
      }
      if (isFunctionNode(n) && n.fn.name === VECTOR_FUNCTION) {
        return `\\left\\langle ${n.args.map((a) => a.toTex(options).trim()).join(', ')}\\right\\rangle`
      }
      // dot and cross products as operators, F · d and a × b (not mathjs's (F · d)),
      // bracketing an argument only where it needs it, such as a sum.
      const product = isFunctionNode(n) && n.args.length === 2 && typeof this.scope.get(n.fn.name) !== 'function'
        ? VECTOR_PRODUCTS[n.fn.name as keyof typeof VECTOR_PRODUCTS] : undefined
      if (product && isFunctionNode(n)) {
        const [a, b] = n.args.map((arg, i) => {
          const tex = arg.toTex(options).trim()
          return needsBrackets(arg, i === 0 ? SIDE.left : SIDE.right, false) ? `\\left(${tex}\\right)` : tex
        })
        return ` ${a} ${product} ${b}`
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
    if (returnSettings?.components) {
      return { signature, body, error: `${name}:${COMPONENTS_SETTING} isn't available on a function; use it on the variable that stores the result.` }
    }
    const returnUnit = shownUnit
    const returnSf = returnSettings?.sf === EXACT_SETTING ? EXACT : returnSettings?.sf
    const returnNotation = returnSettings?.notation
    const returnVector = returnSettings?.vector ?? (lines.some((l) => hasVector(l.text)) ? 'angle' : undefined)
    const bad = paramSpecs.find((_, i) => !parsed[i])
    if (bad !== undefined) return { signature, body, error: `"${bad}" isn't a valid parameter: write a name, or "name to unit".` }
    const badUnit = casts.find((u) => u !== undefined && !isValidUnit(u))
    if (badUnit) return { signature, body, error: `"${badUnit}" isn't a unit MathScribe knows.` }
    type Statement = Guarded & (
      // `unit`: a display unit on the name (`th:deg = …`), which the value keeps.
      | { kind: typeof STATEMENT_KIND.assign; name: string; code: math.EvalFunction; unit?: string; components?: boolean }
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
      // `tuple(a, b) = …` unpacks a tuple (checked first: it also looks like an assignment).
      const unpack = UNPACK.exec(text)
      const unpackNames = unpack?.[1].split(',').map((n) => n.trim())
      const source = ret?.[1] ?? unpack?.[2] ?? assign?.[2]
      if (!source) {
        return { signature, body, error: `Line ${line}: inside a function, each line is "name = …", "tuple(a, b) = …", "return …", or an if / else with lines indented under it.` }
      }
      // Each unpacked name, with any settings (`tuple(r:3, th:deg) = …`).
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
          const components = declared && !('error' in declared) ? declared.components : undefined
          statements.push({ kind: STATEMENT_KIND.assign, name: assign![1], code, unit, components, guards })
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
            throw new Error(`In ${name}, tuple(${names}) = … needs a tuple of ${s.targets.length} values.`)
          }
          s.targets.forEach((t, i) => local.set(t.name, t.unit ? toDisplayUnit(values[i], t.unit) : values[i]))
          continue
        }
        const value = s.unit ? toDisplayUnit(v, s.unit) : v
        local.set(s.name, value)
        if (s.components) componentsOf(s.name, value).forEach((c) => local.set(c.name, c.value))
      }
      return undefined
    }
    this.userFunctions.set(fn, {
      params, casts, statements: sources, definedIn, multiline, returns, returnSf, returnNotation, returnVector, returnUnit,
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

    // A vector passed in is shown inside the function as it is outside.
    const argStyles = call.args.map((a) => this.vectorStyleOf(a))
    // The body runs in a scope of its own, inside the one the function was defined in.
    const caller = this.vars
    this.enter(new Scope(def.definedIn))
    this.traceDepth++
    this.paramAliases = aliases
    try {
      def.params.forEach((p, i) => {
        this.store(p, {
          value: args[i].value, sf: args[i].sf, contributions: args[i].contributions, shown: args[i].shown,
          vector: isTuple(args[i].value) ? argStyles[i] : undefined,
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
  // solve(lhs = rhs, x [, guess])
  // -------------------------------------------------------------------------

  /**
   * `d = solve(v_f^2 = 2*a*d, d)`: rearrange the equation for the unknown and
   * evaluate the result like any formula, showing the equation, the rearranged
   * formula, the values substituted in, and the answer. Equations that can't be
   * rearranged are solved numerically from a starting guess, if one is given.
   */
  private evaluateSolve(
    line: string,
    call: RegExpExecArray,
    literals: Map<number, string>,
    mode: DisplayMode,
    explicit: boolean,
    declaredSf?: Precision,
    displayUnit?: string,
    notation?: Notation,
  ): LineResult {
    const fail = (error: string, tex = '') => ({ tex, error })
    const target = call[1]
    const open = call.index + call[0].length - 1
    const close = matchingParen(line, open)
    if (close < 0) return fail('solve( is missing its closing bracket.')
    const tail = line.slice(close + 1).trim()
    const conversion = CONVERSION_TAIL.exec(tail)?.[1]
    if (tail && !conversion) return fail('solve(…) has to be the whole right-hand side, optionally followed by "to unit".')

    const args = splitArgs(line.slice(open + 1, close))
    if (args.length < 2 || args.length > 3) return fail('Write solve(equation, unknown), or solve(equation, unknown, guess).')
    const [equation, x, guessText] = args
    if (!IS_NAME.test(x)) return fail(`The second part of solve is the unknown to solve for, like d (got "${x}").`)
    const sides = splitEquation(equation)
    if (!sides) return fail('The first part of solve is an equation with one =, like v^2 = 2*a*d.')

    let lhs: MathNode
    let rhs: MathNode
    let guess: unknown
    try {
      lhs = math.parse(preprocess(sides[0], this.isVariable).text)
      rhs = math.parse(preprocess(sides[1], this.isVariable).text)
      if (guessText) guess = math.parse(preprocess(guessText, this.isVariable).text).compile().evaluate(this.scope)
    } catch (e) {
      return fail((e as Error).message)
    }

    const equationTex = `${this.toTex(lhs, literals)} = ${this.toTex(rhs, literals)}`
    const prelude: TraceLine[] = [{ tex: equationTex, note: `solving for ${x}` }]
    const occurrences = countOccurrences(lhs, x) + countOccurrences(rhs, x)
    if (!occurrences) return fail(`${x} doesn't appear in the equation.`, equationTex)

    // Rearrange: isolate x if it appears once, else try linear / quadratic.
    const solver = new Solver(math)
    let candidates: MathNode[] | null = null
    let quadratic = false
    if (occurrences === 1) {
      candidates = contains(lhs, x) ? solver.isolate(lhs, rhs, x) : solver.isolate(rhs, lhs, x)
    }
    if (!candidates) {
      const f = new math.OperatorNode(OP_SYMBOL.subtract, OP.subtract, [lhs, new math.ParenthesisNode(rhs)])
      const poly = solver.polynomial(f, x)
      if (poly) {
        candidates = poly.solutions
        quadratic = poly.kind === POLYNOMIAL_KIND.quadratic
      }
    }

    /** The solution, converted with `to unit` if one was given. */
    const convert = (expr: MathNode, value: unknown): MathNode => {
      let shown = expr
      if (conversion) {
        const unitNode = (math.parse(preprocess(`1 to ${conversion}`, () => false).text) as math.OperatorNode).args[1]
        // Angles from asin/acos/atan come out as plain numbers in radians.
        const targetUnit = unitNode.compile().evaluate({})
        if (typeof value === 'number' && math.isUnit(targetUnit) && (targetUnit as Unit).equalBase(math.unit(UNIT.radian))) {
          shown = new math.OperatorNode(OP_SYMBOL.multiply, OP.multiply, [
            new math.ParenthesisNode(shown),
            new math.FunctionNode(new math.SymbolNode(FN.unit), [new math.ConstantNode(UNIT.radian)]),
          ])
        }
        shown = new math.OperatorNode(OP_SYMBOL.to, OP.to, [shown, unitNode])
      }
      return shown
    }
    const finish = (expr: MathNode, value: unknown, info?: string) => {
      const shown = convert(expr, value)
      const node = target ? new math.AssignmentNode(new math.SymbolNode(target), shown) : shown
      return this.evaluateParsed(node, {
        percent: false, literals, warnings: [], mode, explicit,
        lhs: target ? undefined : symbolTex(x), prelude, info, declaredSf, displayUnit, notation,
      })
    }

    if (!candidates) {
      if (guess === undefined) {
        return fail(`Can't rearrange this for ${x}. Give a starting guess to solve it numerically: `
          + `solve(…, ${x}, guess).`, equationTex)
      }
      return this.solveNumerically(lhs, rhs, x, guess, literals, equationTex, finish)
    }

    // Work out each solution, keep the real ones, and choose one.
    const real: { node: MathNode; value: unknown }[] = []
    for (const node of candidates) {
      try {
        const value = node.compile().evaluate(this.scope)
        if (isRealValue(value) && !real.some((r) => sameValue(r.value, value))) real.push({ node, value })
      } catch {
        /* this branch doesn't apply (e.g. asin of a value above 1) */
      }
    }
    if (!real.length) return fail(`This equation has no real solution for ${x}.`, equationTex)
    let chosen = real[0]
    if (guess !== undefined) {
      // The solution nearest the guess.
      const g = magnitudeOf(guess)
      chosen = real.reduce((best, r) =>
        Math.abs(magnitudeOf(r.value) - g) < Math.abs(magnitudeOf(best.value) - g) ? r : best)
    } else if (quadratic) {
      // Prefer the positive root when there's exactly one.
      const positive = real.filter((r) => magnitudeOf(r.value) > 0)
      if (positive.length === 1) chosen = positive[0]
    }
    const others = real.filter((r) => r !== chosen)
    const sf = this.sigFigsOf(chosen.node, literals, false)
    const otherTex = (o: { node: MathNode; value: unknown }) => {
      const v = conversion ? convert(o.node, o.value).compile().evaluate(this.scope) : normalise(o.value, false)
      return `$${symbolTex(x)} = ${this.valueTex(v, sf)}$`
    }
    const info = others.length
      ? `Also a solution: ${others.map(otherTex).join(', ')}`
        + (guess === undefined ? `. Give a guess to choose it: solve(…, ${x}, guess).` : '.')
      : undefined
    return finish(chosen.node, chosen.value, info)
  }

  /**
   * `tuple(x, y) = solve(eq_1, eq_2)`: a system of equations, solved for the
   * names on the left by substitution, as by hand: one equation is rearranged
   * for one unknown, which is put into the others, and so on until an unknown
   * is left in terms of known values; then each is worked out in turn. Each
   * step is an ordinary formula, so units, sig figs and uncertainty carry through.
   * (Each rearrangement must be one the single-equation solve can do; of a
   * quadratic's two solutions, the first is used.)
   */
  private evaluateSolveSystem(namesText: string, equationsText: string, mode: DisplayMode, explicit: boolean): LineResult {
    const fail = (error: string, tex = '') => ({ tex, error })
    const parsed = namesText.split(',').map((n) => n.trim()).map(parseTupleName)
    const bad = parsed.find((p) => 'error' in p)
    if (bad && 'error' in bad) return fail(bad.error)
    const targets = parsed as TupleName[]
    const names = targets.map((t) => t.name)
    const twice = names.find((n, i) => names.indexOf(n) !== i)
    if (twice) return fail(`${twice} is listed twice.`)

    const constants = this.expandConstants(equationsText)
    if (constants.error) return fail(constants.error)
    const texts = splitArgs(constants.text)
    if (texts.length !== names.length) {
      return fail(`${names.length} unknowns need ${names.length} equations, but there ${texts.length === 1 ? 'is' : 'are'} ${texts.length}: `
        + `tuple(${names.join(', ')}) = solve(${names.map((_, i) => `equation ${i + 1}`).join(', ')}).`)
    }
    const literals = new Map<number, string>()
    for (const m of constants.text.matchAll(NUMBER_LITERAL)) addLiteral(literals, m[0])

    let equations: { lhs: MathNode; rhs: MathNode }[]
    try {
      equations = texts.map((text) => {
        const sides = splitEquation(text)
        if (!sides) throw new Error(`"${text.trim()}" isn't an equation: each needs one =, like v^2 = 2*a*d.`)
        return { lhs: math.parse(preprocess(sides[0], this.isVariable).text), rhs: math.parse(preprocess(sides[1], this.isVariable).text) }
      })
    } catch (e) {
      return fail((e as Error).message)
    }
    const shownNames = names.map(symbolTex).join(', ')
    const prelude: TraceLine[] = equations.map((e, i) => ({
      tex: `${this.toTex(e.lhs, literals)} = ${this.toTex(e.rhs, literals)}`,
      note: i === 0 ? `solving for ${names.join(', ')}` : undefined,
    }))
    const failTex = prelude.map((p) => p.tex).join(' \\\\ ')
    const missing = names.find((x) => equations.every((e) => !contains(e.lhs, x) && !contains(e.rhs, x)))
    if (missing) return fail(`${missing} doesn't appear in any of the equations.`, `\\begin{gathered}${failTex}\\end{gathered}`)

    // Eliminate: rearrange one equation for one unknown, and put that into the rest.
    const solver = new Solver(math)
    const rearranged = (e: { lhs: MathNode; rhs: MathNode }, x: string): MathNode | null => {
      const occurrences = countOccurrences(e.lhs, x) + countOccurrences(e.rhs, x)
      if (!occurrences) return null
      if (occurrences === 1) {
        const isolated = contains(e.lhs, x) ? solver.isolate(e.lhs, e.rhs, x) : solver.isolate(e.rhs, e.lhs, x)
        if (isolated?.length) return isolated[0]
      }
      const f = new math.OperatorNode(OP_SYMBOL.subtract, OP.subtract, [e.lhs, new math.ParenthesisNode(e.rhs)])
      try {
        return solver.polynomial(f, x)?.solutions[0] ?? null
      } catch {
        return null
      }
    }
    const substitute = (node: MathNode, x: string, expr: MathNode) =>
      node.transform((n) => (isSymbolNode(n) && n.name === x ? new math.ParenthesisNode(expr) : n))
    const left = [...names]
    const steps: { x: string; expr: MathNode }[] = []
    while (left.length) {
      // The simplest rearrangement going: an unknown that appears once in an equation, if there is one.
      let found: { x: string; at: number; expr: MathNode; occurrences: number } | undefined
      for (const x of left) {
        for (const [at, e] of equations.entries()) {
          const occurrences = countOccurrences(e.lhs, x) + countOccurrences(e.rhs, x)
          if (!occurrences || (found && found.occurrences <= occurrences)) continue
          const expr = rearranged(e, x)
          if (expr) found = { x, at, expr, occurrences }
        }
      }
      if (!found) {
        return fail(`These equations can't be solved for ${left.join(', ')} by substitution. `
          + 'Each step has to rearrange one equation for one unknown (one that appears once, or in a linear or quadratic way). '
          + 'If they look solvable, check that two of them don\'t contradict each other or say the same thing.',
        `\\begin{gathered}${failTex}\\end{gathered}`)
      }
      const { x, at, expr } = found
      steps.push({ x, expr })
      left.splice(left.indexOf(x), 1)
      equations.splice(at, 1)
      equations = equations.map((e) => ({ lhs: substitute(e.lhs, x, expr), rhs: substitute(e.rhs, x, expr) }))
    }

    // Work each out, last first: the last is in known values only, and each one before it uses those after.
    const trace: TraceLine[] = [...prelude]
    let warning: string | undefined
    for (const { x, expr } of steps.reverse()) {
      const target = targets[names.indexOf(x)]
      const result = this.evaluateParsed(new math.AssignmentNode(new math.SymbolNode(x), expr), {
        percent: false, literals, warnings: [], mode, explicit,
        declaredSf: target.sf, displayUnit: target.unit, notation: target.notation,
      })
      trace.push(...(result.trace ?? []), { tex: result.tex })
      warning ??= result.warning
      if (result.error) return { tex: `\\left(${shownNames}\\right)`, error: `${x}: ${result.error}`, trace, warning }
    }
    const values = names.map((n) => {
      const v = this.vars.get(n)!
      return this.inNotation(v.notation, () => this.valueTex(v.value, v.sf, this.total(v.contributions, v.value), v.uncSf, v.declared === true))
    })
    return { tex: `\\left(${shownNames}\\right) = \\left(${values.join(',\\ ')}\\right)`, trace, warning }
  }

  /**
   * Solve lhs = rhs numerically from a guess (secant method on SI magnitudes).
   * The answer's uncertainty comes from implicit differentiation: for each
   * uncertainty source, δx = −δF / (∂F/∂x), where F = lhs − rhs.
   */
  private solveNumerically(
    lhs: MathNode,
    rhs: MathNode,
    x: string,
    guess: unknown,
    literals: Map<number, string>,
    equationTex: string,
    finish: (expr: MathNode, value: unknown) => LineResult,
  ): LineResult {
    const F = new math.OperatorNode(OP_SYMBOL.subtract, OP.subtract, [lhs, new math.ParenthesisNode(rhs)])
    const code = F.compile()
    const residual = (s: number) => {
      const scope = innerValues(this.vars)
      scope.set(x, withMagnitude(guess, s))
      return magnitudeOf(code.evaluate(scope))
    }

    let s0 = magnitudeOf(guess)
    let s1 = s0 === 0 ? SOLVER.secondPointFromZero : s0 * SOLVER.secondPoint
    let found = false
    try {
      let f0 = residual(s0)
      let f1 = residual(s1)
      for (let i = 0; i < SOLVER.maxIterations && Number.isFinite(f1); i++) {
        if (f1 === 0) {
          found = true
          break
        }
        if (f1 === f0) break
        const s2 = s1 - (f1 * (s1 - s0)) / (f1 - f0)
        s0 = s1
        f0 = f1
        s1 = s2
        f1 = residual(s1)
        if (Math.abs(s1 - s0) <= SOLVER.tolerance * Math.max(1, Math.abs(s1))) {
          found = Number.isFinite(f1)
          break
        }
      }
    } catch (e) {
      return { tex: equationTex, error: (e as Error).message }
    }
    if (!found || !Number.isFinite(s1)) {
      return { tex: equationTex, error: `Couldn't find a solution for ${x} near that guess; try a different one.` }
    }
    const value = withMagnitude(guess, s1)

    // Uncertainty and sig figs, with x held at the solution.
    // (In a scope of its own, so x isn't left set in the sheet.)
    const caller = this.vars
    this.enter(new Scope(caller))
    let contributions: Contributions = new Map()
    let sf: number
    try {
      this.store(x, { value, sf: EXACT })
      const h = Math.abs(s1) * SOLVER.slopeStep || SOLVER.slopeStepAtZero
      const slope = (residual(s1 + h) - residual(s1 - h)) / (2 * h)
      if (slope !== 0 && Number.isFinite(slope)) {
        for (const [source, c] of this.propagate(F)) {
          contributions.set(source, withMagnitude(value, -magnitudeOf(c) / slope))
        }
      }
      sf = this.sigFigsOf(F, literals, false)
    } finally {
      this.enter(caller)
    }

    // Hold the answer in a hidden variable, shown as x itself.
    const hidden = solvedName(x)
    this.store(hidden, { value, sf, contributions })
    return finish(new math.SymbolNode(hidden), value)
  }

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
      const readable = (s: string | undefined) => (s === undefined ? s : moduleReadableMessage(s.includes(JOIN) ? fitHint(readableMembers(s)) : s))
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
  /** While unpacking: which names declare their sig figs (`tuple(a, b:2) = …`). */
  private unpackDeclaredSf: boolean[] | undefined
  private nextUnpack = 0

  /**
   * `tuple(a, b, c) = expr`: work out the tuple on the right (shown as
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
    // Each name's own settings: `tuple(r:3, theta:deg) = …`.
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
    // …and once its members are inside names: `table(t, x)`, `plot(t, x)`.
    const form = this.byForm(LINE_STAGE.members, input, requestedMode, explicit)
    if (form) return form
    // `tuple(x, y) = solve(eq, eq)`: a system of equations, solved for the names on the left.
    const system = SOLVE_SYSTEM.exec(input.trim())
    if (system && !this.isUserFunction(CALL.solve)) return this.evaluateSolveSystem(system[1], system[2], requestedMode, explicit)

    // `tuple(a, b, c) = …` unpacks a tuple. (Before one-line functions: it looks like one.)
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

    // `x = solve(lhs = rhs, x)`: the equation needs special parsing (its `=`).
    const solveCall = SOLVE_CALL.exec(line)
    if (solveCall && !this.isUserFunction(CALL.solve)) {
      return this.evaluateSolve(line, solveCall, literals, requestedMode, explicit, declaredSf, displayUnit, declaration?.notation)
    }

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
      notation: declaration?.notation, vector: declaration?.vector, label: label?.tex,
    })
    return declaration?.components && !result.error ? this.withComponents(declaration.name, result, requestedMode) : result
  }

  /**
   * `F:xyz = …`: store each component of the vector F as a variable of its own
   * (F_x, F_y, F_z), at F's sig figs and notation, and show them under F's line
   * (except with #sym, which shows only the equation).
   */
  private withComponents(name: string, result: LineResult, mode: DisplayMode): LineResult {
    let components: ReturnType<typeof componentsOf>
    try {
      components = componentsOf(name, this.scope.get(name))
    } catch (e) {
      return { ...result, error: (e as Error).message }
    }
    const sf = this.vars.get(name)?.sf ?? EXACT
    const declared = this.vars.get(name)?.declared === true
    // Kept as the vector's notation; shown as its line is (with #sci or #dec too).
    const notation = this.vars.get(name)?.notation
    // Each at the vector's sig figs, or for a typed vector, as typed.
    const typed = declared ? undefined : this.typedSfs.get(this.scope.get(name) as object)
    const sfs = components.map((_, i) => typed?.[i] ?? sf)
    components.forEach((c, i) => this.store(c.name, { value: c.value, sf: sfs[i], declared, notation }))
    if (mode === DISPLAY_MODE.sym) return result
    const rows = components.map((c, i) =>
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
      // Unpacking `tuple(a, b:2) = tuple(300 m, 90 deg)`: a value whose name declares
      // its sig figs is settled, like a single `b:2 = 90 deg`.
      const rhs = unwrap(expr)
      const checked = !unpackDeclaredSf
        ? [expr]
        : isFunctionNode(rhs) && rhs.fn.name === FN.tuple
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
      // So does each component of a typed vector: <3000., 4000.> N stays in N, not kN.
      if (isVectorLiteral(expr) && isTuple(value)) {
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
    // `F:ijk = …`: the vector with unit vectors. Otherwise a vector keeps the look
    // of the vectors it's made from (see vectorStyleOf); a plain tuple has none.
    const vector = isTuple(value) ? ctx.vector ?? this.vectorStyleOf(expr) : undefined
    if (ctx.vector && !isTuple(value) && value !== undefined) {
      const ignored = `:${ctx.vector} is ignored because the result isn't a vector.`
      warning = warning ? `${warning} ${ignored}` : ignored
    }
    // A typed vector keeps each component's sig figs as typed: <0.50, -9.81>
    // shows as typed, not rounded to the fewest.
    if (isVectorLiteral(expr) && isTuple(value) && unc === undefined) {
      this.typedSfs.set(value, this.componentSigFigs(expr, literals))
    }
    // A typed vector is shown with unit vectors straight away: F:ijk = <3.0, 4.0> N → F = (3.0 î + 4.0 ĵ) N.
    if (ctx.vector && vector && isVectorLiteral(expr)) {
      exprTex = this.inNotation(notation, () => this.inVectorStyle(vector,
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
        value, sf: shownSf, contributions, uncSf: declaredUncSf, declared: declaredSf !== undefined, notation: kept, vector, label: ctx.label,
        shown: keepSymbol ? (ctx.label ?? symbolTex(assigned)) : this.constantForm(expr, literals),
        def: isLiteral(expr) ? undefined : expr,
      })
    }

    const { result, approx } = this.inNotation(notation, () => this.inVectorStyle(vector, () => {
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

  /** Sig figs of each component of a typed vector (`<0.50, -9.81> m/s^2` → 2, 3). */
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

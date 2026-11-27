/**
 * Calculation engine: evaluates plain-text math lines with the maths library, keeping a
 * shared scope so variables defined on one line are usable on later lines,
 * and produces LaTeX for each line (symbolic = substituted = result).
 */
import { EXACT, countSigFigs } from '../../maths/sigfigs.ts'
import { AGGREGATE_KIND, Variable, type Contributions, type VariableFields, type VariableSummary } from '../../sheet/values.ts'
import { BUILTINS, isReservedConstantName } from '../../builtins.ts'
import { EXACT_SETTING, IS_NAME, MEMBER_DOT, PERCENT, DISPLAY_MODE, CONSTANTS_BLOCK, LABEL_WORDS, SIGIL, UNCERTAINTY_WORDS, type DisplayMode, type Precision } from '../../syntax.ts'
import { INLINE_VALUE_NAME, JOIN, TUPLE_FUNCTION, RESERVED_NAMESPACES, calledName, isHiddenName, memberName, parseUncertaintyName, readableMembers, unpackedName, uncertaintyName } from '../../sheet/names.ts'
import { expandDots } from './memberAccess.ts'
import { SheetConstants } from './sheetConstants.ts'
import { DisplayNames } from './displayNames.ts'
import { SigFigs } from './sigFigs.ts'
import { Propagation } from './propagation.ts'
import { SeriesAggregates, seriesInMaths } from './aggregates.ts'
import { SheetFunctions } from './sheetFunctions.ts'
import { ValueTex } from './valueTex.ts'
import { WorkingTex } from './workingTex.ts'
import {
  MATHS_ERROR, OP, UNIT, abs, evaluate, evaluateText, exprText, findAll, fixPrefix, isAssign, isCall, isConstant, isFunctionAssign, isOp, isOperator,
  isQuantity, isSymbol, isValueMatrix, magnitude, mapValues, mathsError, multiply, parse, quantity, sameDimension, symbol, transform,
  unitText, valuesOf, withFixedPrefix, type CallExpr, type Expr, type Quantity, type SymbolExpr, type Value,
} from '../../maths/library/index.ts'

import { nestBrackets } from '../../maths/brackets.ts'
import type { CsvColumn } from '../../data/csv.ts'

import { isTuple } from './math.ts'
import {
  EngineModule, LINE_STAGE, LINE_STAGES, LineStep, inDependencyOrder, installModule, moduleExplainedMessage, moduleReadableMessage,
  type DerivedVariable, type LineInProgress, type LineStage, type LookSetting, type ModuleHost, type TupleLook,
} from './module.ts'
import { strayLineFormCall } from './builtinCalls.ts'
import { formulaSides, preprocess, typedNumbers } from './writer.ts'
import { UNCERTAINTY_WORKING, ExplainedError, builtinCallHint, type CalcOptions, type EquationParts, layoutEquation, type TraceLine, type CalcResult, unexpectedError, type DataColumn, type LineNotation, type LineResult, type ParsedLine, TO_PERCENT, readableUnitError } from './results.ts'
import { NAME_THEN_SETTINGS, expandParenPm, splitPm } from './uncertainty.ts'
import { symbolTex, unitCallText, isLitCall } from './tex.ts'
import { unwrap, isLiteral, isTupleLiteral, isConversion } from './nodes.ts'
import { NODE_KIND, TOKEN_KIND, isToken, type Part } from '../../tree/nodes.ts'
import { lexExpression } from '../../tree/lexer.ts'
import { ASSIGN, SETTING_MARK, assignedOf, lineShape, type LineShape } from '../../tree/shapes.ts'
import { normalise } from './normalise.ts'
import { Scope, Views, type Variables, Values, innerValues } from './scope.ts'
import { MAX_TRACE_DEPTH } from './functions.ts'
import { isAngleUnit, toDisplayUnit, type Declaration, type TupleName, parseTupleName, declarationOf } from './declarations.ts'
import { withRows } from './rows.ts'
import { PERCENT_SCALE, isValidUnit, castArgument } from './numbers.ts'
import { isNumberWithUnit } from './products.ts'
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
  /** Values shown: to their sig figs, in a notation, with their uncertainty, as LaTeX (valueTex.ts). */
  private readonly display = new ValueTex({ options: () => this.options, modules: () => this.modules })
  /** Expressions as the working shows them, and each variable's value in the substitution step (workingTex.ts). */
  private readonly working = new WorkingTex({
    variable: (name) => this.vars.get(name),
    value: (name) => this.scope.get(name),
    has: (name) => this.scope.has(name),
    options: () => this.options,
    modules: () => this.modules,
    moduleHost: () => this.host,
    display: () => this.display,
  })
  /** Sig figs of each call to a sheet's function's result, from its expression. */
  private readonly callSigFigs = new WeakMap<Expr, number>()
  /** The sheet's own functions: defining them, and what's kept about each (sheetFunctions.ts). */
  private readonly functions = new SheetFunctions({
    variables: () => this.vars,
    value: (name) => this.scope.get(name),
    store: (name, fields) => this.store(name, fields),
    expandConstants: (text) => this.constants.expand(text),
    parse: (text) => parse(preprocess(text, this.isVariable).text),
    tex: (node, source) => this.working.tex(node, typedNumbers(source)),
    lookSetting: (settings) => this.lookSettingOf(settings)?.look,
    lookOfWritten: (expression) => this.modules.map((m) => m.lookOfWritten(expression)).find((l) => l !== undefined),
    valueOf: (node) => evaluate(node, this.scope),
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
    valueOf: (node) => evaluate(node, this.scope),
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
    isValueSymbol: (node, path): node is SymbolExpr => this.isValueSymbol(node, path),
    scratchValues: () => innerValues(this.vars),
    store: (name, fields) => this.store(name, fields),
    displayNumber: (value) => this.display.split(value, EXACT)?.x,
    tex: (node, literals) => this.working.tex(node, literals),
    variableNode: (name) => this.working.variableNode(name),
    uncertaintyTex: (unc, like, uncSf) => this.display.uncertaintyTex(unc, like, uncSf),
    showsSubstitution: () => this.options.showSubstitution,
    uncertaintyWorking: () => this.options.uncertaintyWorking ?? UNCERTAINTY_WORKING.derivatives,
  })
  /** Series aggregates: a series' members, and the sum, mean and spread a line names (aggregates.ts). */
  private readonly aggregates = new SeriesAggregates({
    variables: () => this.vars,
    value: (name) => this.scope.get(name),
    has: (name) => this.scope.has(name),
    isSheetFunction: (name) => this.functions.has(name),
    selection: (base) => this.views.get(base),
    store: (name, fields) => this.store(name, fields),
    newSource: () => this.nextSource++,
    totalUncertainty: (contributions, like) => this.uncertainty.total(contributions, like),
    uncertainSigFigs: (value, unc) => this.display.uncertainParts(value, unc)?.sf,
    displayNumber: (value) => this.display.split(value, EXACT)?.x,
    tex: (node) => this.working.tex(node, new Map()),
    nameTex: (name) => this.working.seriesNameTex(name),
    variableNode: (name) => this.working.variableNode(name),
    uncertaintyTex: (unc, like, uncSf) => this.display.uncertaintyTex(unc, like, uncSf),
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
    lookedUp: (member) => this.views.resolveFully(member),
    clearViews: (namespace) => this.views.clear(namespace),
    newSource: () => this.nextSource++,
    evaluateLine: (text, mode) => this.evaluateLine(text, mode, false),
    evaluateParsed: (node, line) => this.evaluateParsed(node, line),
    parse: (text) => parse(preprocess(text, this.isVariable).text),
    evaluateNode: (node) => evaluate(node, this.scope) as unknown,
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
    tex: (node, literals) => this.working.tex(node, literals),
    evaluateExpression: (text) => evaluateText(preprocess(text, this.isVariable).text, this.scope) as unknown,
    total: (contributions, like) => this.uncertainty.total(contributions, like),
    valueTex: (value, sf, unc, uncSf, forced) => this.display.valueTex(value, sf, unc, uncSf, forced),
    split: (value, sf, forced) => this.display.split(value, sf, forced),
    uncertainParts: (value, unc, uncSf) => this.display.uncertainParts(value, unc, uncSf),
    inNotation: (notation, fn) => this.display.inNotation(notation, fn),
    expressionTex: (expr) => this.expressionTex(expr),
  }

  constructor(options: CalcOptions, modules: readonly EngineModule[] = []) {
    this.options = options
    // (Each module after those it requires, so their hooks are called first.)
    this.modules = inDependencyOrder(modules)
    for (const m of this.modules) installModule(m)
  }


  /** Evaluate `node`; a value typed with a unit (`1.00e-10 m`) keeps that unit for display. */
  private typedValue(node: Expr): unknown {
    const v = evaluate(node, this.scope) as unknown
    return isLiteral(node) && isQuantity(v) ? withFixedPrefix(v) : v
  }


  /** Set a variable, with everything kept about it (in the current scope). */
  private store(name: string, v: VariableFields): void {
    // A tuple with a look has its name typeset in it (a vector's with an arrow), wherever it's shown.
    const symbol = v.look === undefined || v.symbol !== undefined ? v.symbol : this.lookNameTex(name, v.look)
    const fields = symbol === v.symbol ? v : { ...v, symbol }
    // One record: it replaces whatever was kept about the name before, all of it.
    this.vars.set(name, fields instanceof Variable ? fields : new Variable(fields))
  }

  /** A name as LaTeX, as a variable holding a tuple in this look has it (a vector's, F⃗), else as usual. */
  private lookNameTex(name: string, look: TupleLook | undefined): string {
    const usual = symbolTex(name)
    if (look === undefined) return usual
    return this.modules.map((m) => m.lookNameTex(usual, look)).find((t) => t !== undefined) ?? usual
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
  private lookOf(node: Expr): TupleLook | undefined {
    const looks = findAll(node, (n) => isSymbol(n) || isCall(n)).map((n) => {
      if (isSymbol(n)) return this.vars.get(n.name)?.look
      const name = (n as CallExpr).fn.name
      const own = this.modules.map((m) => m.lookOfFunction(name)).find((l) => l !== undefined)
      if (own !== undefined) return own
      return this.functions.named(name)?.returnLook
    })
    return this.modules.map((m) => m.chooseLook(looks)).find((l) => l !== undefined)
  }


  /** Whether an expression is a tuple typed value by value, as a module's function makes one (a vector, `<0.50, -9.81>`). */
  private isTypedTuple(node: Expr): boolean {
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

  private isVariable = (id: string) => this.scope.has(id)

  private isValueSymbol(n: Expr, path: string): n is SymbolExpr {
    return isSymbol(n) && path !== 'fn' && this.scope.has(n.name)
      && typeof this.scope.get(n.name) !== 'function'
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
        min: this.display.valueTex(lowest.value, lowest.sf), max: this.display.valueTex(highest.value, highest.sf),
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
  private traceCall(call: CallExpr, literals: Map<number, string>, mode: DisplayMode, explicit: boolean) {
    const def = this.functions.named(call.fn.name)
    if (!def || def.params.length !== call.args.length || this.traceDepth >= MAX_TRACE_DEPTH) return null

    // A series given whole, f(t): its parameter is that series (the variables it is, t__1, t__2, …), not a value.
    const series = call.args.map((a) => this.seriesGiven(a))
    // Arguments are worked out in the calling scope.
    let args: ({ value: unknown; sf: number; contributions: Contributions; shown?: string } | undefined)[]
    try {
      args = call.args.map((a, i) => (series[i] ? undefined : {
        // A cast parameter shows its argument converted (0.100 nm → 1.00e-10 m).
        value: castArgument(def.params[i], def.casts[i], this.typedValue(a)),
        sf: this.sigFigs.of(a, literals, false),
        contributions: this.uncertainty.propagate(a),
        // f(pi) shows π inside the function's working, not 3.14159, and a variable
        // that stays symbolic (defined in @layout.sym) stays symbolic as an argument.
        shown: isSymbol(unwrap(a))
          ? this.vars.get((unwrap(a) as SymbolExpr).name)?.shown ?? this.working.constantForm(a, literals)
          : this.working.constantForm(a, literals),
      }))
    } catch {
      return null
    }
    // A series parameter shows as the series it was given, and so do its members and statistics: x̄ as t̄.
    const callerSeriesAliases = this.working.seriesAliases
    const seriesAliases = new Map(callerSeriesAliases)
    call.args.forEach((a, i) => {
      if (series[i]) seriesAliases.set(def.params[i], this.working.seriesAliasOf((unwrap(a) as SymbolExpr).name))
    })

    // Parameters show as the argument they were given, in the caller's terms
    // (psi_200, 2r, 1.00 Å), not as the parameter's own name.
    const callerAliases = this.working.paramAliases
    // An argument that uses the enclosing call's parameters is put in terms of
    // what those were given, so nested calls chain.
    const aliases = new Map<string, Expr>()
    call.args.forEach((a, i) => aliases.set(def.params[i], this.working.withAliases(unwrap(a))))
    // So is a parameter's uncertainty, given a variable: δA, given k1, shows as δk1.
    def.params.forEach((p) => {
      const given = aliases.get(p)
      if (!given || !isSymbol(given)) return
      for (const letter of UNCERTAINTY_WORDS) aliases.set(uncertaintyName(letter, p), symbol(uncertaintyName(letter, given.name)))
    })

    // A tuple passed in (a vector) is shown inside the function as it is outside.
    const argLooks = call.args.map((a) => this.lookOf(a))
    // The body runs in a scope of its own, inside the one the function was defined in.
    const caller = this.vars
    this.enter(new Scope(def.definedIn))
    this.views.push()
    this.traceDepth++
    this.working.paramAliases = aliases
    this.working.seriesAliases = seriesAliases
    try {
      def.params.forEach((p, i) => {
        const given = series[i]
        const arg = args[i]
        if (given) {
          // (The sheet's own series of the parameter's name, if it has one, is hidden in here.)
          this.vars.shadowSeries(p)
          this.views.set(p, given, caller)
        } else if (arg) {
          this.store(p, {
            value: arg.value, sf: arg.sf, contributions: arg.contributions, shown: arg.shown,
            look: isTuple(arg.value) ? argLooks[i] : undefined,
          })
        }
      })
      // The function's own .multiline lays out its working too.
      const outerMultiline = this.multiline
      this.multiline = outerMultiline || def.multiline
      // Given a series, the call is what its body comes to here (a function's compiled body takes only values):
      // worked out as a hidden name's line, whose value, sig figs and uncertainty the caller then uses.
      const held = series.some(Boolean) ? calledName(0) : undefined
      let r: LineResult
      try {
        r = this.evaluateLine(held ? `${held} ${ASSIGN} ${def.expression}` : def.expression, mode, explicit)
      } finally {
        this.multiline = outerMultiline
      }
      const result = held && !r.error ? this.vars.get(held) : undefined
      return { lines: r.trace ?? [], ret: r.parts, retSf: def.returnSf ?? r.sf, result, error: held ? r.error : undefined }
    } finally {
      this.working.paramAliases = callerAliases
      this.working.seriesAliases = callerSeriesAliases
      this.traceDepth--
      this.views.pop()
      this.enter(caller)
    }
  }

  /**
   * The variables a series given whole to a sheet's function is, in order (its
   * parameter then looks them up, as a slice does); undefined if the argument
   * isn't a series' name. (t, given to f(x), makes x__1 look up t__1.)
   */
  private seriesGiven(arg: Expr): string[] | undefined {
    const n = unwrap(arg)
    if (!isSymbol(n) || this.scope.has(n.name)) return undefined
    const members = this.aggregates.members(n.name)
    if (!members.length) return undefined
    // A member of a lookup (a slice's, a parameter's own series) is the variable it looks up.
    return members.map((m) => this.views.resolveFully(m) ?? m)
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
    const error = mathsError(message)
    if (error.kind !== MATHS_ERROR.undefinedName) return message
    const typed = error.name
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
      const { tex, error, warning, info, trace, figure, block, defines, parts } = this.evaluateLine(this.rewriteLine(input), mode, explicit)
      // Messages name a namespace's members as typed, a.x_1 (not a__x_1), and a module's inside names as the sheet does.
      // (And it's explained in a module's terms, if one has something to say: a named plot's missing p.slope; one of
      // MathScribe's functions written without its @; a series where a value was wanted.)
      const readable = (s: string | undefined) => (s === undefined ? s
        : builtinCallHint(moduleReadableMessage(this.seriesHint(moduleExplainedMessage(s.includes(JOIN) ? readableMembers(s) : s)))))
      // Brackets by nesting, ( ) inside [ ] inside { }, once each equation is finished.
      return {
        tex: nestBrackets(tex), error: readable(error), warning: readable(warning), info: readable(info), figure, block, defines,
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
    const values = valuesOf(value) as unknown[]
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
    const parts = { ...result.parts, result: this.display.valuesTex(converted, shown), approx: false }
    return { ...result, parts, tex: layoutEquation(mode, parts, this.multiline) }
  }

  /** An expression as typed, as TeX (an unnamed table column's header). */
  private expressionTex(expr: string): string {
    const literals = typedNumbers(expr)
    try {
      return this.working.tex(parse(preprocess(expr, this.isVariable).text), literals)
    } catch {
      return `\\text{${expr}}`
    }
  }

  /**
   * A formula, typeset and not worked out (the formula module's `@formula { }`):
   * every name a symbol, never a value, a unit or a constant, and each side of
   * its `=`s set as an expression would be (`F = m * a` → F = ma).
   */
  formulaTex(line: string): { tex: string; error?: string } {
    const sides = formulaSides(line)
    if (sides.some((s) => !s)) return { tex: '', error: 'A formula has something on each side of its =: F = m * a.' }
    const literals = typedNumbers(line)
    try {
      return { tex: sides.map((s) => this.working.tex(parse(s), literals)).join(' = ') }
    } catch (e) {
      return { tex: '', error: `This formula couldn't be read: ${e instanceof Error ? e.message : String(e)}` }
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

    let node: Expr
    let uncNode: Expr | undefined
    const warnings: string[] = []
    try {
      const { text, shadowed } = preprocess(pm ? lhs + pm[0] : line.text, this.isVariable)
      if (shadowed.length) {
        warnings.push(`"${shadowed.join('", "')}" after a number is read as a unit, not your variable. `
          + `Write 2 * ${shadowed[0]} to use the variable.`)
      }
      node = parse(text)
      if (pm) uncNode = parse(preprocess(percent ? pm[1].slice(0, -1) : pm[1], this.isVariable).text)
    } catch (e) {
      return { tex: '', error: (e as Error).message }
    }

    if (isFunctionAssign(node)) {
      const lhs = `${symbolTex(node.name)}\\left(${node.params.map(symbolTex).join(', ')}\\right)`
      const tex = `${lhs} = ${this.working.tex(node.expr, literals)}`
      const warning = warnings.join(' ') || undefined
      try {
        evaluate(node, this.scope)
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
    const typed = declared ? undefined : this.display.typedSfs.get(this.scope.get(name) as object)
    const sfs = derived.map((d) => (d.component === undefined ? undefined : typed?.[d.component]) ?? sf)
    derived.forEach((c, i) => this.store(c.name, { value: c.value, sf: sfs[i], declared, notation }))
    if (mode === DISPLAY_MODE.sym) return result
    const rows = derived.map((c, i) =>
      `${symbolTex(c.name)} &= ${this.display.inNotation(result.notation, () => this.display.valueTex(c.value, sfs[i], undefined, undefined, declared))}`)
    // (Under its name as the line shows it: F⃗, or its display name.)
    const v = this.vars.get(name)
    return { ...result, tex: withRows(result.tex, v?.label ?? v?.symbol ?? symbolTex(name), rows) }
  }

  /**
   * Evaluate a parsed line (an assignment or expression): display, substitution,
   * sig figs, uncertainty, and storing the result.
   */
  private evaluateParsed(node: Expr, ctx: ParsedLine): LineResult {
    const { uncNode, percent, literals, warnings, explicit, mode } = ctx
    const assigned = isAssign(node) ? node.object.name : undefined
    const expr = isAssign(node) ? node.value : node
    // .multiline on a block around the line, or a call to a function defined in one.
    const multiline = this.multiline || this.functions.callsIn(expr).some((c) => this.functions.named(c.fn.name)?.multiline === true)
    // For `x to kN`, show `x`; the conversion shows up in the result.
    const shown = isOperator(expr) && isConversion(expr) ? expr.args[0] : expr

    // A given left-hand side, such as unpacking's (a, b, c), wins over the name assigned.
    // It's for this line only, not the working of functions it calls, so take it now.
    const override = this.lhsOverride
    this.lhsOverride = undefined
    const unpackDeclaredSf = this.unpackDeclaredSf
    this.unpackDeclaredSf = undefined
    // (Its look, once its value's known, may typeset the name another way: see lookNameTex.)
    let lhsTex = override ?? (assigned ? (ctx.label ?? symbolTex(assigned)) : ctx.lhs)
    let exprTex = uncNode ? this.uncertainty.pmTex(shown, uncNode, percent, literals) : this.working.tex(shown, literals)
    const bare = unwrap(shown)
    /** Intermediate steps between the expression and the result. */
    const steps: string[] = []
    // Where only the value's shown (a table's cells, a series' values), the steps are worked out
    // only if an error shows the line in full: a sheet's many such lines would otherwise make them all.
    const showsWorking = mode !== DISPLAY_MODE.val
    const later: (() => string[])[] = []
    const step = (make: () => string[]) => (showsWorking ? steps.push(...make()) : later.push(make))
    const parts = (result?: string): EquationParts =>
      ({ lhs: lhsTex, expr: exprTex, steps, result, bareSymbol: isSymbol(bare) })
    /** The line in full, as an error shows it: with its steps, the ones left for later too. */
    const fullParts = (): EquationParts => ({ ...parts(), steps: [...steps, ...later.flatMap((make) => make())] })

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
    /** Each call given a series, by its text, and the hidden name of what it came to (its body's, worked out in traceCall). */
    const seriesCalls = new Map<string, string>()
    for (const call of this.functions.callsIn(shown)) {
      const t = this.traceCall(call, literals, mode, explicit)
      if (!t) continue
      if (t.error) return { tex: layoutEquation(DISPLAY_MODE.full, fullParts(), multiline), error: t.error, trace, info: ctx.info }
      if (t.result) {
        const name = calledName(seriesCalls.size + 1)
        this.store(name, { value: t.result.value, sf: t.result.sf, contributions: t.result.contributions })
        seriesCalls.set(exprText(call), name)
      }
      // (Cleared when there's none: a call written the same way on another line is the same parsed call.)
      if (t.retSf !== undefined) this.callSigFigs.set(call, t.retSf)
      else this.callSigFigs.delete(call)
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
    const uncRef = isSymbol(bare) ? parseUncertaintyName(bare.name) : null
    const deltaOf = uncRef?.of
    if (uncRef) {
      // The uncertainty of a series mean is its standard error.
      const meanOf = this.vars.get(uncRef.of)?.agg
      step(() => (meanOf?.kind === AGGREGATE_KIND.mean
        ? this.aggregates.standardErrorWorking(meanOf)
        : this.uncertainty.deltaWorking(uncRef.of, uncRef.letter)))
    }
    // `a.sum`, `a.avg`, …: show how the series is combined.
    const agg = isSymbol(bare) ? this.vars.get(bare.name)?.agg : undefined
    if (agg) step(() => this.aggregates.working(agg))

    // A module's calls written as the names they come to (`\max(t)` as t_3), as a step of its own, which the values go into.
    const named = wholeLineTraced ? shown : this.modules.reduce((n, m) => m.namedWorking(n, this.host) ?? n, shown)
    if (named !== shown) step(() => [this.working.tex(named, literals)])
    // Substitution and sig figs use the values from before this line runs.
    /** A call given a series, as the hidden name of what it came to (undefined if it isn't one). */
    const calledFor = (n: Expr) => (seriesCalls.size && isCall(n) ? seriesCalls.get(exprText(n)) : undefined)
    const usesVariables = findAll(named, (n, path) => this.isValueSymbol(n, path) || !!calledFor(n)).length > 0
    if (usesVariables && !isSymbol(unwrap(named)) && !wholeLineTraced && this.options.showSubstitution) {
      step(() => {
        const substituted = transform(named, (n, path) => {
          const called = calledFor(n)
          if (called) return this.working.variableNode(called)
          return this.isValueSymbol(n, path)
            ? this.working.variableNode(n.name)
            : n
        })
        // Typed numbers keep their trailing zeros here too (0.250 m, not 0.25 m).
        return [this.working.tex(substituted, literals)]
      })
    }
    this.sigFigs.lost = false
    // A function call's precision comes from its expression (the measured numbers in it),
    // or its declared settings.
    const sf = returnSf ?? this.sigFigs.of(expr, literals, false)
    if (this.display.autoSigFigs && this.sigFigs.lost) {
      warnings.push('This sum or difference is smaller than the precision of the values in it, '
        + 'so it has no significant figures; one is shown.')
    }
    // With a stated uncertainty or declared sig figs, those set the precision, not trailing zeros.
    if (this.display.autoSigFigs && !uncNode && ctx.declaredSf === undefined) {
      // Unpacking `@tuple(a, b:2) = @tuple(300 m, 90 deg)`: a value whose name declares
      // its sig figs is settled, like a single `b:2 = 90 deg`.
      const rhs = unwrap(expr)
      const checked = !unpackDeclaredSf
        ? [expr]
        : isCall(rhs) && rhs.fn.name === TUPLE_FUNCTION
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
      const called = isCall(bare) ? this.scope.get(bare.fn.name) : undefined
      const declaresUnit = !!this.functions.of(called)?.returnUnit
      // A name on its own (`c`, `y = c`) is shown as the variable is: in its unit.
      const justAName = isSymbol(bare)
      // (Calls to functions using their parameters' uncertainties, `delta A`, are given them: withArgumentUncertainties.)
      // (A call given a series is what its body came to: calledFor.)
      const swapped = seriesCalls.size ? transform(expr, (n) => { const c = calledFor(n); return c ? symbol(c) : n }) : expr
      const worked = this.functions.withArgumentUncertainties(swapped)
      value = normalise(evaluate(worked, this.scope), isConversion(expr) || isLiteral(expr) || declaresUnit || justAName)
      // A value follows the modules' rules (a value with species, theirs), whatever it was worked out from.
      for (const m of this.modules) {
        const problem = m.valueProblem(value)
        if (problem) throw new ExplainedError(problem)
      }
      // A value typed with a unit keeps that unit wherever it's shown (L = 1.00e-10 m
      // stays in m, not 100 pm), as a conversion's result does.
      if (isLiteral(expr) && isQuantity(value)) fixPrefix(value)
      // So does each value of a typed tuple (a vector): <3000., 4000.> N stays in N, not kN.
      if (this.isTypedTuple(expr) && isTuple(value)) {
        value = mapValues(value, (v) => (isQuantity(v) ? withFixedPrefix(v) : v))
      }
      contributions = this.uncertainty.propagate(worked)
      if (uncNode) contributions.set(this.nextSource++, this.declaredUncertainty(uncNode, value, percent))
    } catch (e) {
      const message = e instanceof RangeError
        ? 'A function here calls itself without end, so it never finishes.'
        : readableUnitError(e)
      return { tex: layoutEquation(DISPLAY_MODE.full, fullParts(), multiline), error: message, warning, trace, info: ctx.info }
    }
    if (ctx.asPercent && isQuantity(value)) {
      const u = value
      if (!sameDimension(u, quantity('m/m'))) {
        return {
          tex: layoutEquation(DISPLAY_MODE.full, fullParts(), multiline), warning, trace, info: ctx.info,
          error: `This has units of ${unitText(u)}, so it can't be a percent: only a unitless `
            + 'fraction can. (A density like 4πr²ψ² needs multiplying by a Δr first.)',
        }
      }
      value = magnitude(u, '')
    }
    // `phi:deg = …`: the result in that unit (a unitless angle counts as radians).
    if (ctx.displayUnit && value !== undefined) {
      try {
        const angle = !isQuantity(value) && !isValueMatrix(value) && isAngleUnit(ctx.displayUnit)
        value = toDisplayUnit(value, ctx.displayUnit)
        if (angle) {
          contributions = new Map([...contributions].map(([k, c]) => [k, quantity(c as number, UNIT.radian)]))
        }
      } catch (e) {
        return { tex: layoutEquation(DISPLAY_MODE.full, fullParts(), multiline), warning, trace, info: ctx.info, error: (e as Error).message }
      }
    }
    const unc = this.uncertainty.total(contributions, value)
    // A declared `2.0 kg pm 0.1 kg` keeps the uncertainty's sig figs as typed.
    const declaredUncSf = uncNode && !percent && isLiteral(expr) ? this.literalSigFigs(uncNode, literals) : undefined
    let shownSf = unc !== undefined ? (this.display.uncertainParts(value, unc, declaredUncSf)?.sf ?? sf) : sf

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
          exprTex = this.display.valueTex(value, declaredSf, undefined, undefined, true)
        }
      }
    }

    // `x:sci = …`, `x:dec = …`: the notation the result is shown in, and the
    // variable keeps. Otherwise a variable shown on its own (`x`, `x to km`,
    // `delta x`) keeps its own, and a call keeps its function's (`f(x):sci = …`).
    const callee = isCall(bare) ? this.scope.get(bare.fn.name) : undefined
    const kept = ctx.notation
      ?? (deltaOf ? this.vars.get(deltaOf)?.notation : undefined)
      ?? (isSymbol(bare) ? this.vars.get(bare.name)?.notation : undefined)
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
    const assignedTex = assigned ? (ctx.label ?? this.lookNameTex(assigned, look)) : undefined
    if (assignedTex !== undefined && override === undefined) lhsTex = assignedTex
    // A typed tuple keeps each value's sig figs as typed: <0.50, -9.81>
    // shows as typed, not rounded to the fewest.
    const typedTuple = this.isTypedTuple(expr)
    if (typedTuple && isTuple(value) && unc === undefined) {
      this.display.typedSfs.set(value, this.componentSigFigs(expr, literals))
    }
    // A typed tuple is shown in the look it's given straight away: F:ijk = <3.0, 4.0> N → F = (3.0 î + 4.0 ĵ) N.
    if (ctx.look && look && typedTuple) {
      exprTex = this.display.inNotation(notation, () => this.display.inLook(look,
        () => this.display.valueTex(value, declaredSf ?? shownSf, undefined, undefined, declaredSf !== undefined)))
    }
    // A typed value is shown in the declared notation: x:sci = 12000. m → 1.2000 × 10⁴ m.
    if (explicitNotation && isLiteral(expr) && value !== undefined) {
      exprTex = this.display.inNotation(notation, () => (declaredSf !== undefined
        ? this.display.valueTex(value, declaredSf, undefined, undefined, true)
        : this.display.valueTex(value, shownSf, unc, declaredUncSf)))
    }

    if (assigned) {
      // Defined in @layout.sym: later substitutions keep the
      // symbol instead of the value. Otherwise, constant-only values stay symbolic.
      const keepSymbol = ctx.mode === DISPLAY_MODE.sym && explicit
      this.store(assigned, {
        value, sf: shownSf, contributions, uncSf: declaredUncSf, declared: declaredSf !== undefined, notation: kept, look, label: ctx.label,
        shown: keepSymbol ? assignedTex : this.working.constantForm(expr, literals),
        def: isLiteral(expr) ? undefined : expr,
      })
    }

    const { result, approx } = this.display.inNotation(notation, () => this.display.inLook(look, () => {
    let result: string | undefined
    if (ctx.asPercent && value !== undefined) {
      // Stored as the fraction (so later lines calculate with it); shown ×100 with a %.
      const pct = multiply(value as Value, PERCENT_SCALE)
      const pctUnc = unc === undefined ? undefined : multiply(unc as Value, PERCENT_SCALE)
      const tex = this.display.valueTex(pct, declaredSf ?? sf, pctUnc, undefined, declaredSf !== undefined)
      result = pctUnc === undefined ? `${tex}\\,\\%` : `\\left(${tex}\\right)\\,\\%`
    } else if (!isLiteral(expr) && value !== undefined) {
      result = deltaOf
        ? this.display.uncertaintyTex(value, this.scope.get(deltaOf), this.vars.get(deltaOf)?.uncSf)
        // A bare variable keeps its declared uncertainty precision: `m` → (2.0 ± 0.1) kg.
        : declaredSf !== undefined
          ? this.display.valueTex(value, declaredSf, undefined, undefined, true)
          : this.display.valueTex(value, sf, unc, isSymbol(bare) ? this.vars.get(bare.name)?.uncSf : undefined,
            isSymbol(bare) && this.vars.get(bare.name)?.declared === true)
    }
    // ≈ before a rounded result: always with the setting on, otherwise only when
    // every input is exact (1/3 ≈ 0.333). A value with ± already states its precision.
    let approx = false
    if (result !== undefined && unc === undefined && !deltaOf && (this.options.approxRounded || !Number.isFinite(sf))) {
      const shownValue = ctx.asPercent ? multiply(value as Value, PERCENT_SCALE) : value
      approx = this.display.isRounded(shownValue, declaredSf ?? sf, declaredSf !== undefined)
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
  private componentSigFigs(node: Expr, literals: Map<number, string>): number[] {
    let n = unwrap(node)
    if (isOp(n, OP.multiply)) n = unwrap(n.args[0])
    return (n as CallExpr).args.map((a) => {
      const c = unwrap(a)
      return this.literalSigFigs(isOp(c, OP.unaryMinus) ? c.args[0] : c, literals) ?? EXACT
    })
  }

  /** Sig figs of a number typed directly, with or without a unit (`0.1 kg` → 1). */
  private literalSigFigs(node: Expr, literals: Map<number, string>): number | undefined {
    let n = unwrap(node)
    if (isNumberWithUnit(n)) n = unwrap(n.args[0])
    if (isLitCall(n)) return countSigFigs(unitCallText(n))
    if (!isConstant(n) || typeof n.value !== 'number') return undefined
    return countSigFigs(literals.get(n.value) ?? String(n.value))
  }

  /** The uncertainty written after `pm`, as a quantity matching `value`. */
  private declaredUncertainty(uncNode: Expr, value: unknown, percent: boolean): unknown {
    let u = evaluate(uncNode, this.scope) as unknown
    if (percent) {
      if (typeof u !== 'number') throw new Error('A percentage uncertainty must be a plain number, like pm 5%.')
      return multiply(abs(value as Value), u / PERCENT_SCALE)
    }
    // `2.0 kg pm 0.1`: the uncertainty takes the value's unit.
    if (isQuantity(value) && typeof u === 'number') u = multiply(u, quantity(unitText(value)))
    if (isQuantity(value) !== isQuantity(u) || (isQuantity(u) && !sameDimension(u, value as Quantity))) {
      throw new Error('The uncertainty must have the same units as the value.')
    }
    return abs(u as Value)
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
      `${v.label ?? v.symbol ?? symbolTex(name)} = ${this.display.valueTex(v.value, v.sf, this.uncertainty.total(v.contributions, v.value), v.uncSf, v.declared === true)}`
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

/**
 * The sheet's own functions, as the Calculator keeps them: defining one
 * (`f(a, b) = a * b + 1`, with its parameters' casts and its result's
 * settings), what's kept about each, and finding the calls to them in an
 * expression. (Showing a call's working runs the Calculator's line evaluator
 * again, inside the function, so that stays in the Calculator: traceCall.)
 */
import { isFunctionNode, type EvalFunction, type FunctionNode, type MathNode, type MathType } from 'mathjs'
import { math } from './math.ts'
import { parameterDeltas } from './propagation.ts'
import { argumentUncertaintyName } from '../../sheet/names.ts'
import { EXACT } from '../../maths/sigfigs.ts'
import type { VariableFields } from '../../sheet/values.ts'
import { EXACT_SETTING, PERCENT } from '../../syntax.ts'
import { nestBrackets } from '../../maths/brackets.ts'
import { SETTING_PLACE, moduleSettingProblem, type TupleLook } from './module.ts'
import type { LineResult } from './results.ts'
import { symbolTex, unitTex, resultUnitTex } from './tex.ts'
import { innerValues, type Variables } from './scope.ts'
import type { UserFunction } from './functions.ts'
import { toDisplayUnit, declarationOf } from './declarations.ts'
import { parseParam, isValidUnit, castArgument } from './numbers.ts'

/** What the sheet's functions need of the Calculator they're defined in. */
export interface SheetFunctionsHost {
  /** The variables in scope here, which a function defined now reads from. */
  variables(): Variables
  /** A name's value in scope (a variable's, or a function). */
  value(name: string): unknown
  /** Keep a value as a variable. */
  store(name: string, fields: VariableFields): void
  /** An expression with its `@name`s written out, or what's wrong with one. */
  expandConstants(text: string): { text: string; error?: string }
  /** An expression as typed, read as mathjs reads it. */
  parse(text: string): MathNode
  /** An expression as LaTeX, its numbers as typed in `source`. */
  tex(node: MathNode, source: string): string
  /** The look a function's result settings give the tuples it returns (`f(x):ijk`), if a module's does. */
  lookSetting(settings: readonly string[] | undefined): TupleLook | undefined
  /** The look a module reads from how a function's body is written (a vector typed in it), if any. */
  lookOfWritten(expression: string): TupleLook | undefined
  /** An expression's value, worked out in scope. */
  valueOf(node: MathNode): unknown
  /** The uncertainty of an expression worked out as `value` (a zero like it if none). */
  uncertaintyOf(node: MathNode, value: unknown): unknown
}

export class SheetFunctions {
  private readonly host: SheetFunctionsHost
  /** What's kept about each function, keyed by the callable stored in the scope. */
  private readonly defs = new WeakMap<object, UserFunction>()

  constructor(host: SheetFunctionsHost) {
    this.host = host
  }

  /** What's kept about a value, if it's one of the sheet's functions. */
  of(value: unknown): UserFunction | undefined {
    return typeof value === 'function' ? this.defs.get(value) : undefined
  }

  /** What's kept about the function a name holds in scope, if it's one of the sheet's. */
  named(name: string): UserFunction | undefined {
    return this.of(this.host.value(name))
  }

  /** Whether a name in scope is one of the sheet's functions. */
  has(name: string): boolean {
    return this.named(name) !== undefined
  }

  /** Calls to the sheet's own functions in `node`, innermost first (arguments before the call). */
  callsIn(node: MathNode): FunctionNode[] {
    const out: FunctionNode[] = []
    const visit = (n: MathNode) => {
      n.forEach((child) => visit(child))
      if (isFunctionNode(n) && this.has(n.fn.name)) out.push(n)
    }
    visit(node)
    return out
  }

  /**
   * `node` as it's worked out: each call in it to a function whose body uses its
   * parameters' uncertainties (`delta A`) given them after its arguments, each
   * worked out from the argument as written here (`agreement(k1, k2)` →
   * `agreement(k1, k2, δk1, δk2)`, held in hidden variables). Shown as typed:
   * this is only what's evaluated. (`node` itself, if there are no such calls.)
   */
  withArgumentUncertainties(node: MathNode): MathNode {
    if (!this.callsIn(node).some((c) => this.named(c.fn.name)?.deltas.length)) return node
    return node.transform((n) => {
      const def = isFunctionNode(n) ? this.named(n.fn.name) : undefined
      if (!isFunctionNode(n) || !def?.deltas.length || n.args.length !== def.params.length) return n
      const args = n.args.map((a) => this.withArgumentUncertainties(a))
      const extras = def.deltas.map((d) => {
        const argument = args[d.param]
        const hidden = argumentUncertaintyName(this.nextArgument++)
        this.host.store(hidden, { value: this.host.uncertaintyOf(argument, this.host.valueOf(argument)), sf: EXACT })
        return new math.SymbolNode(hidden)
      })
      return new math.FunctionNode(n.fn, [...args, ...extras])
    })
  }

  /** The next argument uncertainty's number (argumentUncertaintyName). */
  private nextArgument = 0

  /**
   * Define a one-line function, `f(a, b) = a * b + 1`. Each call works out its
   * expression in a fresh local scope whose parent is the scope the function was
   * defined in, so it can read variables from around the definition. Calls go
   * through mathjs like any other function, so units, sig figs and uncertainty
   * propagation apply. `returnSettings`: settings for the result, written after
   * the parameters as on a variable (`f(x):3:deg`), each without its `:`: every
   * call's result is shown (and kept) that way.
   */
  define(name: string, paramSpecs: readonly string[], expression: string, multiline: boolean, returnSettings: readonly string[]): LineResult {
    // `m to kg`: the argument is converted to kg on the way in.
    const parsed = paramSpecs.map(parseParam)
    const params = parsed.map((p) => p?.name ?? '')
    const casts = parsed.map((p) => p?.unit)
    const ret = returnSettings.length ? declarationOf(name, returnSettings) : null
    const settings = ret && !('error' in ret) ? ret : null
    const shownUnit = settings?.unit && settings.unit !== PERCENT ? settings.unit : undefined
    const signature = `${symbolTex(name)}\\left(${parsed.map((p, i) => (p
      ? `${symbolTex(p.name)}${p.unit ? `\\,[${unitTex(p.unit)}]` : ''}`
      : paramSpecs[i])).join(', ')}\\right)`
    // (The unit its results are shown in is said after the equation: `… = tan⁻¹(y/x)   in °`.)
    const inUnit = shownUnit ? resultUnitTex(unitTex(shownUnit)) : ''
    const fail = (error: string): LineResult => ({ tex: signature, error })
    if (ret && 'error' in ret) return fail(ret.error)
    if (settings?.unit === PERCENT) return fail(`${name}:percent isn't available on a function; show a result as a percentage where it's used.`)
    for (const setting of settings?.moduleSettings ?? []) {
      const problem = moduleSettingProblem(name, setting, SETTING_PLACE.functionResult)
      if (problem) return fail(problem)
    }
    const returnUnit = shownUnit
    const returnSf = settings?.sf === EXACT_SETTING ? EXACT : settings?.sf
    const returnNotation = settings?.notation
    const returnLook = this.host.lookSetting(settings?.moduleSettings) ?? this.host.lookOfWritten(expression)
    const bad = paramSpecs.find((_, i) => !parsed[i])
    if (bad !== undefined) return fail(`"${bad}" isn't a valid parameter: write a name, or "name to unit".`)
    const badUnit = casts.find((u) => u !== undefined && !isValidUnit(u))
    if (badUnit) return fail(`"${badUnit}" isn't a unit MathScribe knows.`)
    const duplicate = params.find((p, i) => params.indexOf(p) !== i)
    if (duplicate) return fail(`The parameter "${duplicate}" is listed twice.`)

    let code: EvalFunction
    let tex: string
    // (`delta A` of a parameter: the uncertainty of the argument A is given, set on each call.)
    const { text: body, deltas } = parameterDeltas(expression, params)
    try {
      // Constants resolve where the function is defined, so calls can see them.
      const expanded = this.host.expandConstants(body)
      if (expanded.error) throw new Error(expanded.error)
      const node = this.host.parse(expanded.text)
      code = node.compile()
      tex = `${signature} = ${this.host.tex(node, expression)}${inUnit}`
    } catch (e) {
      return fail((e as Error).message)
    }

    const definedIn = this.host.variables()
    // A body using its parameters' uncertainties (`delta A`) is given them after its arguments, one for each
    // (withArgumentUncertainties); called without them (from inside another function), they're none.
    const fn = (...given: unknown[]) => {
      const withUncertainties = deltas.length > 0 && given.length === params.length + deltas.length
      const args = withUncertainties ? given.slice(0, params.length) : given
      if (args.length !== params.length) {
        throw new Error(`${name} takes ${params.length} argument${params.length === 1 ? '' : 's'}, `
          + `but was given ${args.length}.`)
      }
      const local = innerValues(definedIn)
      params.forEach((p, i) => local.set(p, castArgument(p, casts[i], args[i])))
      deltas.forEach((d, k) => local.set(d.hidden, withUncertainties
        ? given[params.length + k]
        : math.multiply(args[d.param] as MathType, 0)))
      const v = code.evaluate(local)
      return returnUnit ? toDisplayUnit(v, returnUnit) : v
    }
    this.defs.set(fn, { params, casts, expression, definedIn, multiline, returnSf, returnNotation, returnLook, returnUnit, deltas })
    this.host.store(name, { value: fn, sf: EXACT })
    return { tex: nestBrackets(tex) }
  }
}

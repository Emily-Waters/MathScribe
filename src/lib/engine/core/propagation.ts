/**
 * Uncertainties, as the Calculator works them out: combining a value's
 * contributions in quadrature, propagating them through an expression, `delta F`
 * as a hidden variable holding F's uncertainty, and the working shown for it.
 * (The syntax of uncertainties, `pm` and `delta F`, is uncertainty.ts.)
 */
import { uncertaintySigFigs } from '../../maths/sigfigs.ts'
import type { Contributions, Variable, VariableFields } from '../../sheet/values.ts'
import { isArgumentUncertaintyName, isUncertaintyName, uncertaintyName } from '../../sheet/names.ts'
import type { UncertaintyWord } from '../../syntax.ts'
import {
  OP, add, compile, derivative, divide, evaluateCompiled, findAll, isConstant, isOp, isQuantity, isSymbol, multiply, subtract, transform,
  withBaseMagnitude, type CallExpr, type Expr, type ScopeMap, type SymbolExpr, type Value,
} from '../../maths/library/index.ts'
import { STEP, UNCERTAINTY_WORKING, type UncertaintyWorking } from './results.ts'
import { isSumOfInputs, powerTex, productPowers } from './uncertaintyForms.ts'
import { DELTA_REF } from './uncertainty.ts'
import { unitTex, attachUnit, unitCallText } from './tex.ts'
import { unwrap } from './nodes.ts'
import { magnitudeOf } from './normalise.ts'
import { isNumberWithUnit, signBeforeTex } from './products.ts'

/** A parameter's uncertainty in a function's body (`delta A`), as the hidden name each call sets. */
export interface ParameterDelta {
  readonly hidden: string
  /** Which parameter's (from 0). */
  readonly param: number
}

/**
 * A function's body with `delta A`, for each of its parameters A, as a hidden
 * name, which each call sets to the uncertainty of the argument A was given
 * (SheetFunctions.define): `abs(A - B) <= delta A + delta B` compares with the
 * arguments' uncertainties. (A variable's, `delta k1`, is expandDeltaRefs's, as
 * the body is worked out.)
 */
export function parameterDeltas(body: string, params: readonly string[]): { text: string; deltas: ParameterDelta[] } {
  const deltas: ParameterDelta[] = []
  const text = body.replace(DELTA_REF, (match, letter: UncertaintyWord, name: string) => {
    const param = params.indexOf(name)
    if (param < 0) return match
    const hidden = uncertaintyName(letter, name)
    if (!deltas.some((d) => d.hidden === hidden)) deltas.push({ hidden, param })
    return hidden
  })
  return { text, deltas }
}

/** How far apart, relative to their size, two nudged results can be from rounding alone (a double carries about 16 digits). */
const ROUNDING = 1e-12

/** Whether two results, nudged up and down, differ only by rounding: the result doesn't depend on what was nudged. */
function isRounding(up: unknown, down: unknown): boolean {
  if (!(typeof up === 'number' || isQuantity(up)) || !(typeof down === 'number' || isQuantity(down))) return false
  const [a, b] = [magnitudeOf(up), magnitudeOf(down)]
  return Math.abs(a - b) <= ROUNDING * Math.max(Math.abs(a), Math.abs(b))
}

/** Values by name, as an expression is worked out with them, that an input can be nudged in. */
type NudgeableValues = ScopeMap

/** What uncertainties need of the Calculator they're worked out in. */
export interface PropagationHost {
  /** A variable in scope, with everything kept about it. */
  variable(name: string): Variable | undefined
  /** A name's value in scope (a variable's, or a function). */
  value(name: string): unknown
  /** Whether a name is in scope. */
  has(name: string): boolean
  /** Whether a node is a variable holding a value (not a function's name, nor a function). */
  isValueSymbol(node: Expr, path: string): node is SymbolExpr
  /** A copy of the values in scope, to work an expression out with some of them nudged. */
  scratchValues(): NudgeableValues
  /** Keep a value as a (hidden) variable. */
  store(name: string, fields: VariableFields): void
  /** A value's number in its display unit, if it has one. */
  displayNumber(value: unknown): number | undefined
  /** An expression as LaTeX, its numbers as typed. */
  tex(node: Expr, literals: Map<number, string>): string
  /** A name as the working shows it: its display name, if it has one (WorkingTex.nameTex). */
  nameTex(name: string): string
  /** A variable's value for the substitution step, at its own sig figs. */
  variableNode(name: string): Expr
  /** An uncertainty on its own as LaTeX, in the unit of the value it belongs to. */
  uncertaintyTex(unc: unknown, like?: unknown, uncSf?: number): string
  /** Whether working shows the values substituted in. */
  showsSubstitution(): boolean
  /** How `delta F`'s working is written: by partial derivatives, or relatively (CalcOptions.uncertaintyWorking). */
  uncertaintyWorking(): UncertaintyWorking
}

export class Propagation {
  private readonly host: PropagationHost

  constructor(host: PropagationHost) {
    this.host = host
  }

  /** Combined (quadrature) uncertainty from contributions, in the same quantity as `like`. */
  total(contributions: Contributions | undefined, like: unknown): unknown {
    if (!contributions?.size) return undefined
    let sumSq = 0
    for (const c of contributions.values()) sumSq += magnitudeOf(c) ** 2
    const t = Math.sqrt(sumSq)
    if (!(t > 0)) return undefined
    return isQuantity(like) ? withBaseMagnitude(like, t) : t
  }

  /** The uncertainty of an expression worked out as `value` (a call's argument), or a zero like it if it has none. */
  uncertaintyOf(expr: Expr, value: unknown): unknown {
    return this.total(this.propagate(expr), value) ?? multiply(value as Value, 0)
  }

  /** A variable's combined uncertainty, if it has one. */
  private totalOf(name: string): unknown {
    return this.total(this.host.variable(name)?.contributions, this.host.value(name))
  }

  /** The variables an expression uses that have an uncertainty. */
  private uncertainInputs(expr: Expr): string[] {
    const names = findAll(expr, (n, path) => this.host.isValueSymbol(n, path)).map((n) => (n as SymbolExpr).name)
    return [...new Set(names)].filter((n) => this.host.variable(n)?.contributions?.size)
  }

  /**
   * Propagate uncertainty through `expr` (first order). For each source, nudge
   * every input along that source's contribution and take the central
   * difference; the result is that source's contribution to `expr`, which is
   * Σ (∂f/∂xᵢ)·δxᵢ. Combining sources in quadrature then gives
   * Δf = √(Σ (∂f/∂x · Δx)²) for independent inputs, while shared sources stay correlated.
   */
  propagate(expr: Expr): Contributions {
    const out: Contributions = new Map()
    const inputs = this.uncertainInputs(expr)
    // Quantities built from an uncertainty (like ΔF / F, or a call given its arguments') don't carry one themselves.
    const usesUncertainty = findAll(expr, (n) => isSymbol(n) && (isUncertaintyName(n.name) || isArgumentUncertaintyName(n.name))).length > 0
    if (!inputs.length || usesUncertainty) return out
    const code = compile(expr)
    // (Each input has contributions: uncertainInputs keeps only those.)
    const contributionsOf = (n: string) => this.host.variable(n)!.contributions!
    const sources = new Set(inputs.flatMap((n) => [...contributionsOf(n).keys()]))
    for (const source of sources) {
      const plus = this.host.scratchValues()
      const minus = this.host.scratchValues()
      for (const n of inputs) {
        const d = contributionsOf(n).get(source)
        if (d === undefined) continue
        const v = this.host.value(n) as Value
        const step = multiply(d as Value, STEP)
        plus.set(n, add(v, step))
        minus.set(n, subtract(v, step))
      }
      const [up, down] = [evaluateCompiled(code, plus), evaluateCompiled(code, minus)]
      // (A word, `"AGREE"`, has no uncertainty, whatever it was chosen by.)
      if (typeof up === 'string' || typeof down === 'string') return new Map()
      // A source the result doesn't depend on, though its inputs do (t.avg's in Σ(tᵢ − t̄)², which cancels):
      // what the difference has left is rounding, not an uncertainty.
      if (isRounding(up, down)) continue
      out.set(source, divide(subtract(up as Value, down as Value), 2 * STEP))
    }
    return out
  }

  /**
   * Replace `delta F` / `Delta F` with a hidden variable holding F's
   * uncertainty. Not followed by a defined variable, they stay Greek letters.
   */
  expandDeltaRefs(line: string): string {
    return line.replace(DELTA_REF, (match, letter: UncertaintyWord, name: string) => {
      if (!this.host.has(name) || typeof this.host.value(name) === 'function') return match
      const value = this.host.value(name)
      const unc = this.totalOf(name) ?? multiply(value as Value, 0)
      const hidden = uncertaintyName(letter, name)
      this.host.store(hidden, { value: unc, sf: uncertaintySigFigs(this.host.displayNumber(unc) ?? 0) })
      return hidden
    })
  }

  /** `2.0 kg pm 0.1 kg` → (2.0 ± 0.1) kg, keeping the numbers as typed. */
  pmTex(value: Expr, unc: Expr, percent: boolean, literals: Map<number, string>): string {
    const a = unwrap(value)
    const b = unwrap(unc)
    if (!percent && isNumberWithUnit(a) && (isConstant(b) || (isNumberWithUnit(b)
      && unitCallText(b.args[1] as CallExpr) === unitCallText(a.args[1] as CallExpr)))) {
      const unit = unitTex(unitCallText(a.args[1] as CallExpr))
      const bNum = isNumberWithUnit(b) ? b.args[0] : b
      return attachUnit(`\\left(${this.host.tex(a.args[0], literals)} \\pm ${this.host.tex(bNum, literals)}\\right)`, unit)
    }
    return `${this.host.tex(value, literals)} \\pm ${this.host.tex(unc, literals)}${percent ? '\\%' : ''}`
  }

  /**
   * Working for `delta F`: the quadrature formula over F's direct inputs, its
   * partial derivatives, and the values substituted in. Skipped when inputs
   * share an uncertainty source, since the simple formula assumes independence.
   */
  deltaWorking(name: string, letter: UncertaintyWord): string[] {
    const def = this.host.variable(name)?.def
    if (!def) return []
    const inputs = this.uncertainInputs(def).filter((n) => !isUncertaintyName(n))
    if (!inputs.length) return []
    const sources = inputs.map((n) => new Set(this.host.variable(n)?.contributions!.keys()))
    if (sources.some((a, i) => sources.slice(i + 1).some((b) => [...a].some((s) => b.has(s))))) return []

    // (Each name as the working shows it: its display name, δ before it for its uncertainty.)
    const nameTex = (n: string) => this.host.nameTex(n)
    const target = nameTex(name)
    // Same letter the user asked with: δx for `delta F`, Δx for `Delta F`.
    const uncOf = (n: string) => nameTex(uncertaintyName(letter, n))
    const sqrt = (terms: string[]) => `\\sqrt{${terms.join(' + ')}}`
    if (this.host.uncertaintyWorking() === UNCERTAINTY_WORKING.relative) {
      const relative = this.relativeWorking(name, def, inputs, uncOf, sqrt)
      if (relative) return relative
    }
    // (∂v/∂d δd, and its values (1/1.21 s) × 0.02 m: × before a number, as in any product.)
    const term = (factor: string, delta: string) => `\\left(${factor}${signBeforeTex(delta)}${delta}\\right)^{2}`
    const steps = [sqrt(inputs.map((n) =>
      term(`\\frac{\\partial ${target}}{\\partial ${nameTex(n)}}`, uncOf(n))))]
    try {
      const derivs = inputs.map((n) => derivative(def, n))
      const wrap = (d: Expr, tex: string) =>
        (isOp(d, OP.add, OP.subtract, OP.unaryMinus) ? `\\left(${tex}\\right)` : tex)
      steps.push(sqrt(inputs.map((n, i) =>
        term(wrap(derivs[i], this.host.tex(derivs[i], new Map())), uncOf(n)))))
      if (this.host.showsSubstitution()) {
        steps.push(sqrt(inputs.map((n, i) => {
          const sub = transform(derivs[i], (m, path) => (this.host.isValueSymbol(m, path)
            ? this.host.variableNode((m as SymbolExpr).name)
            : m))
          return term(
            wrap(derivs[i], this.host.tex(sub, new Map())),
            this.host.uncertaintyTex(this.totalOf(n), this.host.value(n), this.host.variable(n)?.uncSf),
          )
        })))
      }
    } catch {
      /* no symbolic derivative (units or user functions in the formula): show the general form only */
    }
    return steps
  }

  /**
   * Working for `delta F` written relatively (uncertaintyForms.ts), if F's
   * formula is a shape that's worked out so: a product, quotient or power,
   * δY = Y √((δA/A)² + (2 δB/B)²); a sum or difference, δY = √(δA² + δB²);
   * then, if substitution is shown, with the values put in. Undefined for any
   * other formula (its working is by derivatives).
   */
  private relativeWorking(name: string, def: Expr, inputs: string[], uncOf: (n: string) => string, sqrt: (terms: string[]) => string): string[] | undefined {
    const valueTex = (n: string) => this.host.tex(this.host.variableNode(n), new Map())
    const uncTex = (n: string) => this.host.uncertaintyTex(this.totalOf(n), this.host.value(n), this.host.variable(n)?.uncSf)
    const squared = (tex: string) => `\\left(${tex}\\right)^{2}`
    const substituted = this.host.showsSubstitution()
    const powers = productPowers(def, inputs)
    if (powers) {
      // (Each input's relative uncertainty, times its power: `2 δB/B` for B².)
      const term = (n: string, delta: string, of: string) => {
        const power = powers.get(n)!
        const factor = Math.abs(power) === 1 ? '' : `${powerTex(power)}\\,`
        return squared(`${factor}\\frac{${delta}}{${of}}`)
      }
      const steps = [`${this.host.nameTex(name)}\\,${sqrt(inputs.map((n) => term(n, uncOf(n), this.host.nameTex(n))))}`]
      if (substituted) steps.push(`${valueTex(name)} \\times ${sqrt(inputs.map((n) => term(n, uncTex(n), valueTex(n))))}`)
      return steps
    }
    if (isSumOfInputs(def, inputs)) {
      const steps = [sqrt(inputs.map((n) => squared(uncOf(n))))]
      if (substituted) steps.push(sqrt(inputs.map((n) => squared(uncTex(n)))))
      return steps
    }
    return undefined
  }
}

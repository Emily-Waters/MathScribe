/**
 * Significant figures of what a line works out, as the Calculator counts them:
 * from the numbers as typed, the variables it uses, and the functions it calls,
 * by the rules for × ÷, + − and powers. (Counting and formatting a single
 * number's sig figs is maths/sigfigs.ts.)
 */
import { isConstantNode, isFunctionNode, isOperatorNode, isParenthesisNode, isSymbolNode, type MathNode, type Unit } from 'mathjs'
import { EXACT, countSigFigs, hasAmbiguousZeros, isMeasuredLiteral, lastPlace, sigFigsFromPlace } from '../../maths/sigfigs.ts'
import { COMPARISONS, OP, isOp } from '../../maths/library/index.ts'
import { math } from './math.ts'
import { isLitCall, isUnitCall, unitCallText } from './tex.ts'
import { isPureNumber, unwrap } from './nodes.ts'

/** What sig figs need of the Calculator they're counted for. */
export interface SigFigsHost {
  /** A part of a line worked out on its own (throws if it can't be). */
  valueOf(node: MathNode): unknown
  /** A variable's sig figs, if it's one. */
  variableSigFigs(name: string): number | undefined
  /** The sig figs a function of the sheet's declares its result has (`f(x):3 = …`), if it's one that does. */
  declaredSigFigs(functionName: string): number | undefined
  /** A call's sig figs, as worked out when its working was traced, if it was. */
  tracedSigFigs(call: MathNode): number | undefined
  /** Whether a module says a number with a unit is an exact count (`2 mol {X}`, from a balanced equation). */
  isExactCount(number: MathNode, unit: MathNode, literals: Map<number, string>): boolean
}

export class SigFigs {
  private readonly host: SigFigsHost
  /** Set while counting when a sum or difference is smaller than its terms' precision: it has none, so one is shown. */
  lost = false

  constructor(host: SigFigsHost) {
    this.host = host
  }

  /** Numeric size of a subexpression in SI base units, for the addition rule. */
  private magnitude(node: MathNode): number {
    try {
      const v = this.host.valueOf(node)
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
  of(node: MathNode, literals: Map<number, string>, measured: boolean): number {
    if (isParenthesisNode(node)) return this.of(node.content, literals, measured)
    if (isConstantNode(node)) {
      if (typeof node.value !== 'number') return EXACT
      const text = literals.get(node.value) ?? String(node.value)
      return measured || isMeasuredLiteral(text) ? countSigFigs(text) : EXACT
    }
    if (isUnitCall(node)) return EXACT
    // Written with extra precision (2.00, 1.2e3): always a measured value.
    if (isLitCall(node)) return countSigFigs(unitCallText(node))
    if (isSymbolNode(node)) return this.host.variableSigFigs(node.name) ?? EXACT
    // `cond ? a : b`: the sig figs of whichever it comes to.
    if (math.isConditionalNode(node)) {
      let chosen = node.trueExpr
      try {
        if (this.host.valueOf(node.condition) !== true) chosen = node.falseExpr
      } catch { /* reported when the line is worked out */ }
      return this.of(chosen, literals, measured)
    }
    // A call to a function that declares its result's sig figs (`f(x):3 = …`).
    if (isFunctionNode(node)) {
      const declared = this.host.declaredSigFigs(node.fn.name)
      if (declared !== undefined) return declared
      // Otherwise its expression's, as worked out when its working was traced.
      const traced = this.host.tracedSigFigs(node)
      if (traced !== undefined) return traced
    }
    if (isOperatorNode(node)) {
      // A number with a unit is measured; unless a module says it's an exact count
      // (a whole number of a species, `2 mol {X}`, from a balanced equation).
      if (node.fn === OP.multiply && isUnitCall(node.args[1])) {
        const [number, unit] = node.args
        return this.of(number, literals, !this.host.isExactCount(number, unit, literals))
      }
      if (node.fn === OP.unaryMinus || node.fn === OP.unaryPlus) return this.of(node.args[0], literals, measured)
      if (node.fn === OP.add || node.fn === OP.subtract) {
        const terms = node.args.map((a) => ({ sf: this.of(a, literals, false), x: this.magnitude(a) }))
        const total = this.magnitude(node)
        if (Number.isNaN(total) || terms.some((t) => Number.isNaN(t.x))) return Math.min(...terms.map((t) => t.sf))
        const sf = sigFigsFromPlace(total, Math.max(...terms.map((t) => lastPlace(t.x, t.sf))))
        if (sf < 1) this.lost = true
        return Math.max(1, sf)
      }
      // An exponent written as plain numbers (^0.5, ^(3/2), ^(-0.5)) is part of the
      // formula, not a measurement, so only the base limits the sig figs.
      if (node.fn === OP.pow && isPureNumber(node.args[1])) return this.of(node.args[0], literals, false)
    }
    let sf = EXACT
    node.forEach((child, path) => {
      if (path === 'fn') return
      // A measured zero passed to a function (cos 0.00°, exp(0.00)) has decimal places,
      // not relative precision, and the result (1) is known far better than that
      // count suggests, so it doesn't limit the sig figs.
      if (isFunctionNode(node) && this.magnitude(child) === 0) return
      sf = Math.min(sf, this.of(child, literals, false))
    })
    return sf
  }

  /** Whole numbers like `300 m` whose trailing zeros won't count. */
  ambiguousLiterals(node: MathNode, literals: Map<number, string>): string[] {
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
}

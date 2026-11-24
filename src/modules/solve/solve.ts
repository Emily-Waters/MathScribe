/**
 * `d = @solve(v_f^2 = 2*a*d, d)`: rearrange the equation for the unknown and
 * evaluate the result like any formula, showing the equation, the rearranged
 * formula, the values substituted in, and the answer. Equations that can't be
 * rearranged are solved numerically from a starting guess, if one is given.
 */
import type { MathNode, Unit } from 'mathjs'
import {
  contains, type Contributions, CONVERSION_TAIL, countOccurrences, EXACT, FN, type FormLine, IS_NAME, isRealValue,
  LINE_STAGE, LineForm, type LineResult, magnitudeOf, matchingParen, math, type ModuleHost, normalise, OP, OP_SYMBOL,
  POLYNOMIAL_KIND, type PreparedLine, preprocess, sameValue, heldName, Solver, splitArgs, splitEquation, symbolTex,
  type TraceLine, UNIT, withMagnitude,
} from '../../lib/plugin.ts'
import { SOLVE_CALL } from './syntax.ts'

/** Solving numerically (the secant method), for `@solve(…, x, guess)`. */
const SOLVER = {
  maxIterations: 100,
  /** The second starting point, relative to the guess (or absolute, if the guess is 0). */
  secondPoint: 1.01,
  secondPointFromZero: 1e-3,
  /** Converged when a step changes x by less than this, relative to x (or 1, if smaller). */
  tolerance: 1e-12,
  /** Step for the slope at the solution (for its uncertainty), relative to x (or absolute, at 0). */
  slopeStep: 1e-6,
  slopeStepAtZero: 1e-9,
} as const

/** Writes out the solution chosen (converted, if the line says `to unit`), as the line's result. */
type Finish = (expr: MathNode, value: unknown, info?: string) => LineResult

export class SolveForm extends LineForm {
  /** (Once the line's constants are written out and its numbers read as typed: the equation's `=` needs reading as one.) */
  override readonly stage = LINE_STAGE.expression

  evaluate(line: FormLine, host: ModuleHost): LineResult | undefined {
    const call = SOLVE_CALL.exec(line.text)
    if (!call || !line.prepared) return undefined
    return solve(line.text, call, line, line.prepared, host)
  }
}

function solve(text: string, call: RegExpExecArray, line: FormLine, prepared: PreparedLine, host: ModuleHost): LineResult {
  const { literals, declaredSf, displayUnit, notation } = prepared
  const fail = (error: string, tex = '') => ({ tex, error })
  const target = call[1]
  const open = call.index + call[0].length - 1
  const close = matchingParen(text, open)
  if (close < 0) return fail('@solve( is missing its closing bracket.')
  const tail = text.slice(close + 1).trim()
  const conversion = CONVERSION_TAIL.exec(tail)?.[1]
  if (tail && !conversion) return fail('@solve(…) has to be the whole right-hand side, optionally followed by "to unit".')

  const args = splitArgs(text.slice(open + 1, close))
  if (args.length < 2 || args.length > 3) return fail('Write @solve(equation, unknown), or @solve(equation, unknown, guess).')
  const [equation, x, guessText] = args
  if (!IS_NAME.test(x)) return fail(`The second part of solve is the unknown to solve for, like d (got "${x}").`)
  const sides = splitEquation(equation)
  if (!sides) return fail('The first part of solve is an equation with one =, like v^2 = 2*a*d.')

  let lhs: MathNode
  let rhs: MathNode
  let guess: unknown
  try {
    lhs = host.parse(sides[0])
    rhs = host.parse(sides[1])
    if (guessText) guess = host.evaluateNode(host.parse(guessText))
  } catch (e) {
    return fail((e as Error).message)
  }

  const equationTex = `${host.tex(lhs, literals)} = ${host.tex(rhs, literals)}`
  const prelude: TraceLine[] = [{ tex: equationTex, note: `solving for $${symbolTex(x)}$` }] // (the unknown as it's drawn)
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
      // (Read as a unit, whatever the sheet's variables are called.)
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
  const finish: Finish = (expr, value, info) => {
    const shown = convert(expr, value)
    const node = target ? new math.AssignmentNode(new math.SymbolNode(target), shown) : shown
    return host.evaluateParsed(node, {
      percent: false, literals, warnings: [], mode: line.mode, explicit: line.explicit,
      lhs: target ? undefined : symbolTex(x), prelude, info, declaredSf, displayUnit, notation,
    })
  }

  if (!candidates) {
    if (guess === undefined) {
      return fail(`Can't rearrange this for ${x}. Give a starting guess to solve it numerically: `
        + `@solve(…, ${x}, guess).`, equationTex)
    }
    return solveNumerically(host, lhs, rhs, x, guess, literals, equationTex, finish)
  }

  // Work out each solution, keep the real ones, and choose one.
  const real: { node: MathNode; value: unknown }[] = []
  for (const node of candidates) {
    try {
      const value = host.evaluateNode(node)
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
  const sf = host.sigFigs(chosen.node, literals)
  const otherTex = (o: { node: MathNode; value: unknown }) => {
    const v = conversion ? host.evaluateNode(convert(o.node, o.value)) : normalise(o.value, false)
    return `$${symbolTex(x)} = ${host.valueTex(v, sf)}$`
  }
  const info = others.length
    ? `Also a solution: ${others.map(otherTex).join(', ')}`
      + (guess === undefined ? `. Give a guess to choose it: @solve(…, ${x}, guess).` : '.')
    : undefined
  return finish(chosen.node, chosen.value, info)
}

/**
 * Solve lhs = rhs numerically from a guess (secant method on SI magnitudes).
 * The answer's uncertainty comes from implicit differentiation: for each
 * uncertainty source, δx = −δF / (∂F/∂x), where F = lhs − rhs.
 */
function solveNumerically(
  host: ModuleHost,
  lhs: MathNode,
  rhs: MathNode,
  x: string,
  guess: unknown,
  literals: Map<number, string>,
  equationTex: string,
  finish: Finish,
): LineResult {
  const F = new math.OperatorNode(OP_SYMBOL.subtract, OP.subtract, [lhs, new math.ParenthesisNode(rhs)])
  const code = F.compile()
  const residual = (s: number) => {
    const scope = host.scratchValues()
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
  const { contributions, sf } = host.inScratchScope(() => {
    const contributions: Contributions = new Map()
    host.store(x, { value, sf: EXACT })
    const h = Math.abs(s1) * SOLVER.slopeStep || SOLVER.slopeStepAtZero
    const slope = (residual(s1 + h) - residual(s1 - h)) / (2 * h)
    if (slope !== 0 && Number.isFinite(slope)) {
      for (const [source, c] of host.propagate(F)) {
        contributions.set(source, withMagnitude(value, -magnitudeOf(c) / slope))
      }
    }
    return { contributions, sf: host.sigFigs(F, literals) }
  })

  // Hold the answer in a hidden variable, shown as x itself.
  const hidden = heldName(x)
  host.store(hidden, { value, sf, contributions })
  return finish(new math.SymbolNode(hidden), value)
}

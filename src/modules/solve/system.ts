/**
 * `@tuple(x, y) = @solve(eq_1, eq_2)`: a system of equations, solved for the
 * names on the left by substitution, as by hand: one equation is rearranged
 * for one unknown, which is put into the others, and so on until an unknown
 * is left in terms of known values; then each is worked out in turn. Each
 * step is an ordinary formula, so units, sig figs and uncertainty carry through.
 * (Each rearrangement must be one the single-equation solve can do; of a
 * quadratic's two solutions, the first is used.)
 */
import {
  assign, contains, countOccurrences, type Expr, type FormLine, isSymbol, LineForm, type LineResult, lineShape, type ModuleHost,
  NODE_KIND, OP, operator, paren, parseTupleName, symbol, transform, SIGIL, soleCall, Solver, splitArgs, splitEquation, symbolTex, type TraceLine,
  type TupleName, typedNumbers,
} from '../../lib/plugin.ts'
import { SOLVE_FUNCTION } from './syntax.ts'

/** `@solve`, as typed. */
const SOLVE_BUILTIN = `${SIGIL}${SOLVE_FUNCTION}`

/** An equation, its two sides parsed. */
interface Equation {
  lhs: Expr
  rhs: Expr
}

export class SolveSystemForm extends LineForm {
  evaluate(line: FormLine, host: ModuleHost): LineResult | undefined {
    // `@tuple(v_1, v_2) = @solve(…)`: names to unpack into, and a call to @solve and nothing else (tree/shapes.ts).
    const shape = lineShape(line.text)
    const call = soleCall(shape.valueParts)
    if (shape.target?.kind !== NODE_KIND.unpack || call?.callee !== SOLVE_BUILTIN) return undefined
    return solveSystem(shape.target.entries!, call.args, line, host)
  }
}

function solveSystem(entries: readonly string[], equationsText: string, line: FormLine, host: ModuleHost): LineResult {
  const fail = (error: string, tex = '') => ({ tex, error })
  const parsed = entries.map(parseTupleName)
  const bad = parsed.find((p) => 'error' in p)
  if (bad && 'error' in bad) return fail(bad.error)
  const targets = parsed as TupleName[]
  const names = targets.map((t) => t.name)
  const twice = names.find((n, i) => names.indexOf(n) !== i)
  if (twice) return fail(`${twice} is listed twice.`)

  const constants = host.expandConstants(equationsText)
  if (constants.error) return fail(constants.error)
  const texts = splitArgs(constants.text)
  if (texts.length !== names.length) {
    return fail(`${names.length} unknowns need ${names.length} equations, but there ${texts.length === 1 ? 'is' : 'are'} ${texts.length}: `
      + `@tuple(${names.join(', ')}) = @solve(${names.map((_, i) => `equation ${i + 1}`).join(', ')}).`)
  }
  const literals = typedNumbers(constants.text)

  let equations: Equation[]
  try {
    equations = texts.map((text) => {
      const sides = splitEquation(text)
      if (!sides) throw new Error(`"${text.trim()}" isn't an equation: each needs one =, like v^2 = 2*a*d.`)
      return { lhs: host.parse(sides[0]), rhs: host.parse(sides[1]) }
    })
  } catch (e) {
    return fail((e as Error).message)
  }
  const shownNames = names.map((n) => symbolTex(n)).join(', ')
  const prelude: TraceLine[] = equations.map((e, i) => ({
    tex: `${host.tex(e.lhs, literals)} = ${host.tex(e.rhs, literals)}`,
    // (The unknowns as they're drawn, d_stop as d with stop below: the note's `$…$` is maths.)
    note: i === 0 ? `solving for $${shownNames}$` : undefined,
  }))
  const failTex = prelude.map((p) => p.tex).join(' \\\\ ')
  const missing = names.find((x) => equations.every((e) => !contains(e.lhs, x) && !contains(e.rhs, x)))
  if (missing) return fail(`${missing} doesn't appear in any of the equations.`, `\\begin{gathered}${failTex}\\end{gathered}`)

  // Eliminate: rearrange one equation for one unknown, and put that into the rest.
  const solver = new Solver()
  const rearranged = (e: Equation, x: string): Expr | null => {
    const occurrences = countOccurrences(e.lhs, x) + countOccurrences(e.rhs, x)
    if (!occurrences) return null
    if (occurrences === 1) {
      const isolated = contains(e.lhs, x) ? solver.isolate(e.lhs, e.rhs, x) : solver.isolate(e.rhs, e.lhs, x)
      if (isolated?.length) return isolated[0]
    }
    const f = operator(OP.subtract, [e.lhs, paren(e.rhs)])
    try {
      return solver.polynomial(f, x)?.solutions[0] ?? null
    } catch {
      return null
    }
  }
  const substitute = (node: Expr, x: string, expr: Expr) =>
    transform(node, (n) => (isSymbol(n) && n.name === x ? paren(expr) : n))
  const left = [...names]
  const steps: { x: string; expr: Expr }[] = []
  while (left.length) {
    // The simplest rearrangement going: an unknown that appears once in an equation, if there is one.
    let found: { x: string; at: number; expr: Expr; occurrences: number } | undefined
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
    const result = host.evaluateParsed(assign(symbol(x), expr), {
      percent: false, literals, warnings: [], mode: line.mode, explicit: line.explicit,
      declaredSf: target.sf, displayUnit: target.unit, notation: target.notation,
    })
    trace.push(...(result.trace ?? []), { tex: result.tex })
    warning ??= result.warning
    if (result.error) return { tex: `\\left(${shownNames}\\right)`, error: `${x}: ${result.error}`, trace, warning }
  }
  const values = names.map((n) => {
    const v = host.variable(n)!
    return host.inNotation(v.notation, () => host.valueTex(v.value, v.sf, host.total(v.contributions, v.value), v.uncSf, v.declared === true))
  })
  return { tex: `\\left(${shownNames}\\right) = \\left(${values.join(',\\ ')}\\right)`, trace, warning }
}

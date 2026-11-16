/**
 * `tuple(x, y) = solve(eq_1, eq_2)`: a system of equations, solved for the
 * names on the left by substitution, as by hand: one equation is rearranged
 * for one unknown, which is put into the others, and so on until an unknown
 * is left in terms of known values; then each is worked out in turn. Each
 * step is an ordinary formula, so units, sig figs and uncertainty carry through.
 * (Each rearrangement must be one the single-equation solve can do; of a
 * quadratic's two solutions, the first is used.)
 */
import { isSymbolNode, type MathNode } from 'mathjs'
import { CALL, SOLVE_SYSTEM } from '../../../syntax.ts'
import { OP, OP_SYMBOL } from '../../../mathjsNames.ts'
import { Solver, contains, countOccurrences, splitArgs, splitEquation } from '../../../solve.ts'
import { math } from '../../core/math.ts'
import { NUMBER_LITERAL } from '../../core/literals.ts'
import { LineForm, type FormLine, type ModuleHost } from '../../core/module.ts'
import { addLiteral } from '../../core/numbers.ts'
import { parseTupleName, type TupleName } from '../../core/declarations.ts'
import type { LineResult, TraceLine } from '../../core/results.ts'
import { symbolTex } from '../../core/tex.ts'

/** An equation, its two sides parsed. */
interface Equation {
  lhs: MathNode
  rhs: MathNode
}

export class SolveSystemForm extends LineForm {
  evaluate(line: FormLine, host: ModuleHost): LineResult | undefined {
    const system = SOLVE_SYSTEM.exec(line.text)
    // (A sheet's own function called solve wins.)
    if (!system || host.isUserFunction(CALL.solve)) return undefined
    return solveSystem(system[1], system[2], line, host)
  }
}

function solveSystem(namesText: string, equationsText: string, line: FormLine, host: ModuleHost): LineResult {
  const fail = (error: string, tex = '') => ({ tex, error })
  const parsed = namesText.split(',').map((n) => n.trim()).map(parseTupleName)
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
      + `tuple(${names.join(', ')}) = solve(${names.map((_, i) => `equation ${i + 1}`).join(', ')}).`)
  }
  const literals = new Map<number, string>()
  for (const m of constants.text.matchAll(NUMBER_LITERAL)) addLiteral(literals, m[0])

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
  const shownNames = names.map(symbolTex).join(', ')
  const prelude: TraceLine[] = equations.map((e, i) => ({
    tex: `${host.tex(e.lhs, literals)} = ${host.tex(e.rhs, literals)}`,
    note: i === 0 ? `solving for ${names.join(', ')}` : undefined,
  }))
  const failTex = prelude.map((p) => p.tex).join(' \\\\ ')
  const missing = names.find((x) => equations.every((e) => !contains(e.lhs, x) && !contains(e.rhs, x)))
  if (missing) return fail(`${missing} doesn't appear in any of the equations.`, `\\begin{gathered}${failTex}\\end{gathered}`)

  // Eliminate: rearrange one equation for one unknown, and put that into the rest.
  const solver = new Solver(math)
  const rearranged = (e: Equation, x: string): MathNode | null => {
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
    const result = host.evaluateParsed(new math.AssignmentNode(new math.SymbolNode(x), expr), {
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

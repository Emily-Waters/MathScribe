/**
 * Series aggregates, as the Calculator works them out: a series' members
 * (t_1, t_2, …, or a selection's), and the sum, mean, spread and count a line
 * names (t, t_avg, t_std, t_sem, t_count), defined from the members as they are
 * now, with their sig figs, uncertainty and working. (Reading an aggregate's
 * name is series.ts.)
 */
import type { MathNode, MathType, Unit } from 'mathjs'
import { EXACT, uncertaintySigFigs, lastPlace, sigFigsFromPlace } from '../../maths/sigfigs.ts'
import { AGGREGATE_KIND, type Aggregate, type Contributions, type VariableFields } from '../../sheet/values.ts'
import { isUncertaintyName, parseNumberedName, seriesMemberName } from '../../sheet/names.ts'
import { math } from './math.ts'
import { BUILTIN_CONSTANT_NAMES, NAME_IN_LINE } from './literals.ts'
import { parseAggregateName, escapeRegExp } from './series.ts'
import { symbolTex } from './tex.ts'
import { normalise, magnitudeOf } from './normalise.ts'
import type { Variables } from './scope.ts'

/** Sig figs σ is shown with in a standard error's working, so the division visibly gives the result. */
const WORKING_SIGMA_SIG_FIGS = 2
/** More members than this, and a series' working shows its first two, ⋯, and its last. */
const LISTED_MEMBERS = 6

/** What aggregates need of the Calculator they're worked out in. */
export interface AggregatesHost {
  /** The variables in scope here (each level's own, then its parent's). */
  variables(): Variables
  /** A name's value in scope (a variable's, or a function). */
  value(name: string): unknown
  /** Whether a name is in scope. */
  has(name: string): boolean
  /** The variables a selection's series picks, if `base` is one. */
  selection(base: string): readonly (string | undefined)[] | undefined
  /** Keep a value as a variable. */
  store(name: string, fields: VariableFields): void
  /** A new uncertainty source. */
  newSource(): number
  /** Combined (quadrature) uncertainty from contributions, in the same quantity as `like`. */
  totalUncertainty(contributions: Contributions, like: unknown): unknown
  /** The sig figs a value has when shown with its uncertainty, if it can be. */
  uncertainSigFigs(value: unknown, unc: unknown): number | undefined
  /** A value's number in its display unit, if it has one. */
  displayNumber(value: unknown): number | undefined
  /** An expression as LaTeX. */
  tex(node: MathNode): string
  /** A variable's value for the substitution step, at its own sig figs. */
  variableNode(name: string): MathNode
  /** An uncertainty on its own as LaTeX, in the unit of the value it belongs to. */
  uncertaintyTex(unc: unknown, like?: unknown, uncSf?: number): string
  /** Whether working shows the values substituted in. */
  showsSubstitution(): boolean
}

export class SeriesAggregates {
  private readonly host: AggregatesHost
  /** Uncertainty source for each series mean, so repeated uses stay correlated. */
  private readonly sources = new Map<string, number>()

  constructor(host: AggregatesHost) {
    this.host = host
  }

  /** Variables named base1, base2, … or base_1, base_2, …, visible from here, in index order. */
  members(base: string): string[] {
    // A selection's series: its members are its numbers (each a lookup; see Views).
    const view = this.host.selection(base)
    if (view) return view.flatMap((name, i) => (name ? [seriesMemberName(base, i + 1)] : []))
    const vars = this.host.variables()
    const found = new Map<string, number>()
    // Each level's members, from its series index (an inner level's hide an outer's of the same name).
    for (let s: Variables | undefined = vars; s; s = s.parent) {
      for (const name of s.membersHere(base) ?? []) {
        if (found.has(name) || isUncertaintyName(name) || vars.get(name)?.agg) continue
        if (typeof this.host.value(name) === 'function') continue
        found.set(name, parseNumberedName(name)!.n)
      }
    }
    return [...found.entries()].sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0])).map(([n]) => n)
  }

  /** A series' values by number: t_1, t_2, … (or t1, t2, …) as 1 → "t_1", 2 → "t_2", …. */
  rows(base: string): Map<number, string> {
    const number = new RegExp(`^${escapeRegExp(base)}_?(\\d+)$`)
    return new Map(this.members(base).map((m) => [Number(number.exec(m)![1]), m]))
  }

  /**
   * Define any series aggregates named on this line (a, a_avg, a_std, a_count)
   * from the current members, so they are always up to date. A variable
   * defined explicitly with the same name takes precedence.
   */
  defineNamedIn(line: string, skip?: string): string | undefined {
    for (const m of line.matchAll(NAME_IN_LINE)) {
      const name = m[1]
      if (name === skip || (this.host.has(name) && !this.host.variables().get(name)?.agg)) continue
      // e1, e2, … don't turn `e` into a sum: Euler's number (and pi, tau, …) win.
      if (BUILTIN_CONSTANT_NAMES.has(name)) continue
      const { base, kind } = parseAggregateName(name)
      const members = this.members(base)
      if (!members.length) continue
      try {
        this.define(name, { kind, base, members })
      } catch (e) {
        return `${name}: ${(e as Error).message}`
      }
    }
    return undefined
  }

  private define(name: string, agg: Aggregate): void {
    const values = agg.members.map((n) => this.host.value(n))
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
        if (n >= 2) contributions = new Map([[this.source(agg.base), standardError(values)]])
        else contributions = this.mergedContributions(agg.members)
        break
      case AGGREGATE_KIND.std:
      case AGGREGATE_KIND.sem:
        if (n < 2) throw new Error('a standard deviation needs at least two values.')
        value = agg.kind === AGGREGATE_KIND.std ? stdDev(values) : standardError(values)
        sf = uncertaintySigFigs(this.host.displayNumber(value) ?? 0)
        break
    }
    // Show sums, means and spreads in the members' own unit (s, not ms).
    value = math.isUnit(value) && math.isUnit(first)
      ? (value as Unit).to((first as Unit).formatUnits())
      : normalise(value, true)
    const unc = this.host.totalUncertainty(contributions, value)
    if (unc !== undefined) sf = this.host.uncertainSigFigs(value, unc) ?? sf

    this.host.store(name, { value, sf, contributions, agg })
  }

  /** Uncertainty of a sum: each member's contributions added source by source. */
  private mergedContributions(members: string[]): Contributions {
    const out: Contributions = new Map()
    for (const m of members) {
      for (const [source, c] of this.host.variables().get(m)?.contributions ?? []) {
        out.set(source, out.has(source) ? math.add(out.get(source) as MathType, c as MathType) : c)
      }
    }
    return out
  }

  /** Sig figs of a series total by the addition rule (least precise decimal place). */
  private seriesSigFigs(members: string[], total: unknown): number {
    const place = Math.max(...members.map((m) =>
      lastPlace(magnitudeOf(this.host.value(m)), this.host.variables().get(m)?.sf ?? EXACT)))
    const sf = sigFigsFromPlace(magnitudeOf(total), place)
    return Number.isFinite(sf) ? Math.max(1, sf) : EXACT
  }

  /** The uncertainty source a series' mean has, the same for every use of it. */
  private source(base: string): number {
    let id = this.sources.get(base)
    if (id === undefined) {
      id = this.host.newSource()
      this.sources.set(base, id)
    }
    return id
  }

  /** Working for a line that is just an aggregate: Σ notation, members, values. */
  working(agg: Aggregate): string[] {
    const n = agg.members.length
    if (n === 1 && agg.kind !== AGGREGATE_KIND.count) return [symbolTex(agg.members[0])]
    // A long series shows its first two members, ⋯, and its last (only those are typeset).
    const list = (f: (m: string) => string) => (n > LISTED_MEMBERS
      ? [f(agg.members[0]), f(agg.members[1]), '\\cdots', f(agg.members[n - 1])]
      : agg.members.map(f)).join(' + ')
    const names = list(symbolTex)
    const values = list((m) => this.host.tex(this.host.variableNode(m)))
    const baseTex = symbolTex(agg.base)
    const ith = agg.base.includes('_') ? `\\left(${baseTex}\\right)_{i}` : `${baseTex}_{i}`
    const sum = (body: string) => `\\sum_{i=1}^{${n}} ${body}`
    const sub = this.host.showsSubstitution()
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
  standardErrorWorking(agg: Aggregate): string[] {
    const n = agg.members.length
    if (n < 2) return []
    const sigma = symbolTex(`${agg.base}_std`)
    const steps = [`\\frac{${sigma}}{\\sqrt{n}}`]
    if (this.host.showsSubstitution()) {
      const values = agg.members.map((m) => this.host.value(m))
      const s = stdDev(values)
      // σ to 2 sig figs here, so the division visibly gives the result.
      const sTex = this.host.uncertaintyTex(s, math.isUnit(values[0]) ? values[0] : undefined, WORKING_SIGMA_SIG_FIGS)
      steps.push(`\\frac{${sTex}}{\\sqrt{${n}}}`)
    }
    return steps
  }
}

/** Sample standard deviation (n − 1), in the units of the first value. */
function stdDev(values: unknown[]): unknown {
  const xs = values.map(magnitudeOf)
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length
  const s = Math.sqrt(xs.reduce((acc, x) => acc + (x - mean) ** 2, 0) / (xs.length - 1))
  if (!math.isUnit(values[0])) return s
  const u = (values[0] as Unit).clone()
  u.value = s
  return u
}

/** Standard error of the mean, σ/√n. */
function standardError(values: unknown[]): unknown {
  return math.divide(stdDev(values) as MathType, Math.sqrt(values.length))
}

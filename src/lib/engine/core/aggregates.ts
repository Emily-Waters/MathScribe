/**
 * Series aggregates, as the Calculator works them out: a series' members
 * (t[1], t[2], …, or a selection's), and the sum, mean, spread and count a line
 * names (t.sum, t.avg, t.std, t.sem, t.count), defined from the members as they are
 * now, with their sig figs, uncertainty and working. (Reading an aggregate's
 * name is series.ts.)
 */
import {
  add, convert, divide, isLibraryFunction, isQuantity, sameDimension, unitText, withBaseMagnitude, type Expr, type Value,
} from '../../maths/library/index.ts'
import { EXACT, uncertaintySigFigs, lastPlace, sigFigsFromPlace } from '../../maths/sigfigs.ts'
import { AGGREGATE_KIND, type Aggregate, type Contributions, type VariableFields } from '../../sheet/values.ts'
import { isUncertaintyName, parseNumberedName, seriesMemberName, seriesStatName, typedName } from '../../sheet/names.ts'
import { SERIES_STAT_SUFFIX, SUBSCRIPT } from '../../syntax.ts'
import { BUILTIN_CONSTANT_NAMES } from './literals.ts'
import { calleesIn, namesPassed, symbolsIn } from './memberAccess.ts'
import { parseAggregateName } from './series.ts'

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
  /** Whether a name is one of the sheet's own functions. */
  isSheetFunction(name: string): boolean
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
  tex(node: Expr): string
  /** A name as LaTeX, as the working shows it (in a call given a series, its parameter's as the series': WorkingTex.seriesNameTex). */
  nameTex(name: string): string
  /** A variable's value for the substitution step, at its own sig figs. */
  variableNode(name: string): Expr
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

  /** Series `base`'s members, t__1, t__2, … (`t[1]`, `t[2]`, …), visible from here, in index order. */
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

  /** A series' values by number: t[1], t[2], … as 1 → "t__1", 2 → "t__2", …. */
  rows(base: string): Map<number, string> {
    return new Map(this.members(base).map((m) => [parseNumberedName(m)!.n, m]))
  }

  /**
   * Define any series statistics named on this line (t.sum, t.avg, t.std,
   * t.count) from the current members, so they are always up to date. A
   * variable defined explicitly with the same name takes precedence.
   */
  defineNamedIn(line: string, skip?: string): string | undefined {
    for (const name of new Set(symbolsIn(line))) {
      if (name === skip || (this.host.has(name) && !this.host.variables().get(name)?.agg)) continue
      // (Euler's number, pi, tau, … are constants, whatever the sheet has made.)
      if (BUILTIN_CONSTANT_NAMES.has(name)) continue
      const stat = parseAggregateName(name)
      if (!stat) continue
      const { base, kind } = stat
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

  /**
   * A series' name in a line's maths, where a value is wanted, explained: the
   * series isn't a value (seriesInMaths). Not when the line calls a function
   * there's none of, whose error comes first. (Left to the library, `2 * t` would
   * read t as tonnes.)
   */
  seriesAsValue(line: string, skip?: string): string | undefined {
    const unknownCall = calleesIn(line).some((f) => !this.host.has(f) && !isLibraryFunction(f))
    if (unknownCall) return undefined
    // A series passed whole to one of the sheet's functions is its parameter's series: f(t).
    const passed = new Set(namesPassed(line).filter((p) => this.host.isSheetFunction(p.callee)).map((p) => p.name))
    for (const name of new Set(symbolsIn(line))) {
      if (name === skip || passed.has(name) || this.host.has(name)) continue
      const count = this.members(name).length
      if (count) return seriesInMaths(name, count)
    }
    return undefined
  }

  private define(name: string, agg: Aggregate): void {
    const values = agg.members.map((n) => this.host.value(n))
    if (values.some((v) => typeof v !== 'number' && !isQuantity(v))) {
      throw new Error('only numbers and quantities can be combined.')
    }
    const n = values.length
    const first = values[0]
    if (values.some((v) => isQuantity(v) !== isQuantity(first)
      || (isQuantity(v) && !sameDimension(v, first as never)))) {
      throw new Error(`${agg.members.join(', ')} don't all have the same units.`)
    }
    const total = values.reduce((acc, v) => add(acc as Value, v as Value))

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
        value = divide(total as Value, n)
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
    value = isQuantity(value) && isQuantity(first)
      ? convert(value, unitText(first))
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
        out.set(source, out.has(source) ? add(out.get(source) as Value, c as Value) : c)
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
    // (Names as the working shows them: in a call given a series, its parameter's as the series', x̄ as t̄.)
    const nameTex = (name: string) => this.host.nameTex(name)
    if (n === 1 && agg.kind !== AGGREGATE_KIND.count) return [nameTex(agg.members[0])]
    // A long series shows its first two members, ⋯, and its last (only those are typeset).
    const list = (f: (m: string) => string) => (n > LISTED_MEMBERS
      ? [f(agg.members[0]), f(agg.members[1]), '\\cdots', f(agg.members[n - 1])]
      : agg.members.map(f)).join(' + ')
    const names = list(nameTex)
    const values = list((m) => this.host.tex(this.host.variableNode(m)))
    const baseTex = nameTex(agg.base)
    const ith = baseTex.includes(SUBSCRIPT) ? `\\left(${baseTex}\\right)_{i}` : `${baseTex}_{i}`
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

  /** σ/√n, then with σ and n substituted (for `a.sem` and `delta a.avg`). */
  standardErrorWorking(agg: Aggregate): string[] {
    const n = agg.members.length
    if (n < 2) return []
    const sigma = this.host.nameTex(seriesStatName(agg.base, SERIES_STAT_SUFFIX.std))
    const steps = [`\\frac{${sigma}}{\\sqrt{n}}`]
    if (this.host.showsSubstitution()) {
      const values = agg.members.map((m) => this.host.value(m))
      const s = stdDev(values)
      // σ to 2 sig figs here, so the division visibly gives the result.
      const sTex = this.host.uncertaintyTex(s, isQuantity(values[0]) ? values[0] : undefined, WORKING_SIGMA_SIG_FIGS)
      steps.push(`\\frac{${sTex}}{\\sqrt{${n}}}`)
    }
    return steps
  }
}

/**
 * What's said of a series' name in a line's maths, where a value is wanted:
 * the series is its values, so one of them, or one of its statistics.
 */
export const seriesInMaths = (name: string, count: number) =>
  `${typedName(name)} is a series of ${count} value${count === 1 ? '' : 's'}: use one of them, `
  + `${typedName(seriesMemberName(name, 1))}, or a statistic of them, `
  + `${typedName(seriesStatName(name, SERIES_STAT_SUFFIX.avg))} or ${typedName(seriesStatName(name, SERIES_STAT_SUFFIX.sum))}; `
  + `or work out a series from it, [2 * ${typedName(name)}].`

/** Sample standard deviation (n − 1), in the units of the first value. */
function stdDev(values: unknown[]): unknown {
  const xs = values.map(magnitudeOf)
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length
  const s = Math.sqrt(xs.reduce((acc, x) => acc + (x - mean) ** 2, 0) / (xs.length - 1))
  return isQuantity(values[0]) ? withBaseMagnitude(values[0], s) : s
}

/** Standard error of the mean, σ/√n. */
function standardError(values: unknown[]): unknown {
  return divide(stdDev(values) as Value, Math.sqrt(values.length))
}

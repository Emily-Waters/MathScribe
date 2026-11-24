/**
 * The rows of a series where a condition holds, `x[t > 0.2 s]`: worked out row
 * by row, as a rule is (`[F / g]`), and kept where it's true, as a series of its
 * own (a lookup, renumbered from 1, as a slice is). Rows are matched by their
 * numbers, so `x[t > 0.2 s]` is x's rows where t, in the same row, is over
 * 0.2 s; a row t doesn't have isn't kept. The condition can be a series of
 * true and false already: `keep = [t > 0.2 s]`, then `x[keep]`.
 *
 * What's in the brackets that uses no series is worked out once: a whole
 * number is a member (`x[n + 1]`), and true or false keeps every row or none.
 * (A number or a slice, `x[3]`, `x[2:4]`, is read before this, by the core.)
 *
 * A step at the `names` stage, after the core's: each `x[condition]` in the
 * line is the series it makes (x__where3, `whereName`), so everything after it
 * (a table, a plot, a statistic, `x[t > 1 s].avg`) takes it as any series.
 */
import {
  IS_NAME, LINE_STAGE, type LineInProgress, type LineResult, LineStep, MEMBER_INDEX, type ModuleHost, TOKEN_KIND,
  closesBracket, describeName, expandDots, isQuantity, isTuple, lexExpression, lineTokens, opensBracket, seriesMemberName, symbolTex,
  typedName, whereName,
} from '../../lib/plugin.ts'
import { seriesUsedIn, withRowValues } from './columns.ts'

/** Each series and condition's number, so the same `x[t > 0.2 s]` is the same series wherever it's written. */
const conditions = new Map<string, number>()

/** The number for a series and condition: the one it has, or the next. */
function conditionId(base: string, condition: string): number {
  const key = `${base}${MEMBER_INDEX.open}${condition}`
  let id = conditions.get(key)
  if (id === undefined) conditions.set(key, id = conditions.size + 1)
  return id
}

/** What a condition gave for a row: kept if it's true (or a number other than 0). */
const holds = (value: unknown) => (typeof value === 'boolean' ? value : typeof value === 'number' ? value !== 0 : false)

/** A condition's value that's neither a whole number nor true or false, to say so. */
const isWhole = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value > 0

export class WhereStep extends LineStep {
  readonly stage = LINE_STAGE.names

  run(line: LineInProgress, host: ModuleHost): LineResult | undefined {
    if (!line.text.includes(MEMBER_INDEX.open)) return undefined
    const tokens = lineTokens(lexExpression(line.text)).map((l) => l.token)
    let out = ''
    let changed = false
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i]
      const open = tokens[i + 1]
      // A series' name with a bracket straight after it, `x[`: what's in it, to its `]`.
      if (t.t === TOKEN_KIND.symbol && open?.t === TOKEN_KIND.delimiter && open.text === MEMBER_INDEX.open) {
        let depth = 0
        let close = -1
        for (let j = i + 1; j < tokens.length; j++) {
          const u = tokens[j]
          if (u.t !== TOKEN_KIND.delimiter) continue
          if (opensBracket(u.text)) depth++
          else if (closesBracket(u.text) && --depth === 0) {
            close = j
            break
          }
        }
        const rows = IS_NAME.test(t.text) && !host.has(t.text) ? host.seriesRows(t.text) : new Map<number, string>()
        if (close > 0 && rows.size) {
          const condition = tokens.slice(i + 2, close).map((u) => u.text).join('').trim()
          const made = this.where(t.text, rows, condition, host)
          if ('error' in made) return { tex: '', error: made.error }
          out += made.name
          i = close
          changed = true
          continue
        }
      }
      out += t.text
    }
    // (What follows a condition's `]`, `.avg`, is read as a member now.)
    if (changed) line.text = expandDots(out)
    return undefined
  }

  /** The series of `base`'s rows where `condition` holds (or one member, for a whole number): its name; or what's wrong. */
  private where(base: string, rows: Map<number, string>, condition: string, host: ModuleHost): { name: string } | { error: string } {
    const typed = `${typedName(base)}${MEMBER_INDEX.open}${condition}${MEMBER_INDEX.close}`
    const expanded = host.expandConstants(condition)
    if (expanded.error) return { error: expanded.error }
    const used = seriesUsedIn(host, expanded.text)
    const worked = (text: string): unknown => {
      try {
        return host.evaluateExpression(text)
      } catch (e) {
        throw new Error(`In ${typed}: ${e instanceof Error ? e.message : String(e)}`)
      }
    }
    try {
      // No series in it: worked out once, a member's number, or every row or none.
      if (!used.size) {
        const value = worked(expanded.text)
        if (isWhole(value)) return { name: seriesMemberName(base, value) }
        if (typeof value !== 'boolean') {
          return { error: `In ${typed}, what's in the brackets is a member's number (a whole number from 1), a slice (2:4), or a condition (t > 0.2 s).` }
        }
        if (!value) return { error: `${condition} is false, so ${typed} has no values.` }
        return { name: this.view(base, typed, condition, [...rows.values()], host) }
      }
      // Row by row: each of base's rows where every series the condition uses has a value, and it holds.
      const kept: string[] = []
      for (const [n, member] of [...rows].sort((a, b) => a[0] - b[0])) {
        if (![...used.values()].every((r) => r.has(n))) continue
        const value = worked(withRowValues(expanded.text, used, n))
        if (isTuple(value) || isQuantity(value)) {
          return { error: `In ${typed}, the condition gives ${typeof value === 'object' ? 'a value' : String(value)}, not true or false: compare it, t > 0.2 s.` }
        }
        if (holds(value)) kept.push(member)
      }
      if (!kept.length) return { error: `No row of ${typedName(base)} has ${condition}, so ${typed} has no values.` }
      return { name: this.view(base, typed, condition, kept, host) }
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) }
    }
  }

  /** The series of these members, renumbered from 1 (a lookup, as a slice is), named and described as written. */
  private view(base: string, typed: string, condition: string, members: string[], host: ModuleHost): string {
    const name = whereName(base, conditionId(base, condition))
    host.setView(name, members)
    // Typeset as the series with its condition below: x with t > 0.2 s.
    describeName(name, typed, `{${symbolTex(base)}}_{${host.expressionTex(condition)}}`)
    return name
  }
}

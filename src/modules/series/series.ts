/**
 * `t = @series(…)`: a series made on one line, as if t_1, t_2, … were each
 * typed on a line of their own, so t_avg, @table(t) and @plot(t, …) work on it.
 *
 *   t = @series(1.52 s, 1.48 s, 1.55 s)   its values, listed: t_1, t_2, t_3
 *   m = @series(F / g)                    worked out row by row from other series:
 *                                         m_n = F_n / g (g, not a series, is used as it is)
 *   v = @series(d / t; rows 5-20)         only those rows
 *
 * Each value is worked out as a line assigning it would be, so units, sig figs
 * and uncertainty are the core's (g's uncertainty carries into every m_n, from
 * one source, so m_avg counts them as correlated). Settings on the name go on
 * every value (`m:3 = @series(F / g)`).
 *
 * A series worked out from others keeps their rows' numbers (v_5 is from d_5
 * and t_5), so @table(d, t, v) lines up; it has the rows every series it uses
 * has, with a warning when they don't all have the same ones. A series made
 * again replaces the one before: its old values are gone.
 */
import {
  type Definition, DISPLAY_MODE, type FormLine, LineForm, type LineResult, type ModuleHost, NODE_KIND, SETTING_MARK,
  SIGIL, SUBSCRIPT, attachUnit, lineShape, seriesMemberName, soleCall, splitArgs, symbolTex, unitTex,
} from '../../lib/plugin.ts'
import { rowErrors, seriesUsedIn, sharedRows, withRowValues } from './columns.ts'
import { cellParts } from './table.ts'
import { SETTING, formatRowRange, parseRowRange, settingParts, splitCallArgs } from './tableSettings.ts'
import { SERIES_CALL } from './syntax.ts'

/** `@series`, as typed. */
const SERIES_BUILTIN = `${SIGIL}${SERIES_CALL.series}`

/** How many of its values an @series line shows: all of them up to `max`; past that, the `first` and the `last`, with … between. */
export const SERIES_SHOWN = { max: 6, first: 3, last: 2 } as const

/** The row a member stands for, in the rule of a series worked out from others: m_i = F_i / g. */
const ROW_INDEX = 'i'

/** The pieces of an @series line's LaTeX. */
const SERIES_TEX = {
  separator: ',\\ ',
  gap: '\\ldots',
  equals: ' = ',
  count: (n: number) => `\\quad \\text{${n} value${n === 1 ? '' : 's'}}`,
} as const

/** Names in a list, as a sentence says them: a, b and c. */
const spoken = (items: string[]) => (items.length > 1 ? `${items.slice(0, -1).join(', ')} and ${items.at(-1)}` : items.join(''))

/** A row range, as a sentence says it: "rows 5–20", "rows 5 on". */
const rowsText = (from: number | undefined, to: number | undefined) => formatRowRange(from, to) ?? ''

/** What a series' line defines, for suggestions: its first and last members, the first standing for the rest. */
function definitions(name: string, rows: number[]): Definition[] {
  if (!rows.length) return []
  const first = seriesMemberName(name, rows[0])
  if (rows.length === 1) return [{ name: first }]
  return [{ name: first, members: rows.length - 1 }, { name: seriesMemberName(name, rows.at(-1)!), members: 1 }]
}

/** A series' values as a list, (1.52, 1.48, 1.55) s: the unit after the bracket when they share one; a long one shortened. */
function valuesTex(host: ModuleHost, members: string[]): string {
  const long = members.length > SERIES_SHOWN.max
  const shown = long ? [...members.slice(0, SERIES_SHOWN.first), ...members.slice(-SERIES_SHOWN.last)] : members
  const cells = shown.map((m) => cellParts(host, m))
  const units = new Set(cells.map((c) => c.unit))
  const shared = units.size === 1 ? [...units][0] : undefined
  const texts = cells.map((c) => (shared || !c.unit ? c.num : attachUnit(c.num, unitTex(c.unit))))
  if (long) texts.splice(SERIES_SHOWN.first, 0, SERIES_TEX.gap)
  const list = `\\left(${texts.join(SERIES_TEX.separator)}\\right)`
  return shared ? attachUnit(list, unitTex(shared)) : list
}

export class SeriesForm extends LineForm {
  evaluate(line: FormLine, host: ModuleHost): LineResult | undefined {
    const shape = lineShape(line.text)
    const call = soleCall(shape.valueParts)
    if (call?.callee !== SERIES_BUILTIN) return undefined
    const target = shape.target
    if (target?.kind !== NODE_KIND.assigned) {
      return { tex: '', error: 'Name the series: t = @series(1.52 s, 1.48 s), or m = @series(F / g) to work one out from others.' }
    }
    const { name, settings: nameSettings } = target
    // Each value is assigned as the name would be, with its settings: m_3:3 = ….
    const assigned = (n: number) => `${seriesMemberName(name, n)}${nameSettings.map((s) => `${SETTING_MARK}${s}`).join('')}`

    const parts = splitCallArgs(call.args)
    const args = splitArgs(parts.columns).map((a) => a.trim()).filter(Boolean)
    if (!args.length) {
      return { tex: '', error: 'Give the series its values, t = @series(1.52 s, 1.48 s), or a rule, m = @series(F / g).' }
    }

    // Its settings: only which rows, for now.
    let from: number | undefined
    let to: number | undefined
    for (const part of settingParts(parts.settings)) {
      const rows = parseRowRange(part)
      if (!rows) return { tex: '', error: `"${part}" isn't a setting of @series: use ${SETTING.rows} 5-20 to work out only those rows.` }
      ;({ from, to } = rows)
    }
    const sliced = from !== undefined || to !== undefined

    // Worked out from other series (one argument that uses one), or its values listed.
    const usedBy = args.map((a) => seriesUsedIn(host, a))
    const fromSeries = usedBy.some((u) => u.size > 0)
    if (fromSeries && args.length > 1) {
      return { tex: '', error: '@series takes its values listed, @series(1.52 s, 1.48 s), or one rule that uses other series, @series(F / g): not both.' }
    }
    if (!fromSeries && sliced) {
      return { tex: '', error: `${SETTING.rows} … chooses which rows of other series to work out from, so it needs a rule that uses one: m = @series(F / g; ${SETTING.rows} 5-20).` }
    }

    const before = host.seriesRows(name)
    const made: number[] = []
    const errors: string[] = []
    const work = (n: number, value: string, label: string) => {
      const result = host.evaluateLine(`${assigned(n)} = ${value}`, DISPLAY_MODE.val)
      if (result.error) errors.push(`${label}: ${result.error}`)
      else made.push(n)
    }

    let rule: string | undefined
    let warning: string | undefined
    if (fromSeries) {
      const expr = args[0]
      const used = usedBy[0]
      const inRange = (n: number) => (from === undefined || n >= from) && (to === undefined || n <= to)
      const rows = sharedRows(used).filter(inRange)
      const counts = [...used].map(([id, r]) => ({ id, count: [...r.keys()].filter(inRange).length }))
      const range = sliced ? `In ${rowsText(from, to)}, ` : ''
      if (!rows.length) {
        const which = counts.length > 1 ? `${spoken(counts.map((c) => c.id))} have no rows in common` : `${counts[0].id} has no values`
        return { tex: '', error: `${range}${which}, so there's nothing to work out ${name} from.` }
      }
      if (counts.some((c) => c.count !== rows.length)) {
        const said = counts.map((c) => `${c.id} has ${c.count} value${c.count === 1 ? '' : 's'}`)
        const all = counts.length === 2 ? 'both' : 'they all'
        warning = `${range}${spoken(said)}: ${name} uses the ${rows.length} rows ${all} have. Give ${SETTING.rows} … to choose them yourself.`
      }
      for (const n of rows) work(n, withRowValues(expr, used, n), `Row ${n}`)
      // The rule, with each series as its member in row i: m_i = F_i / g.
      const symbolic = new Map([...used.keys()].map((id) => [id, new Map([[0, `${id}${SUBSCRIPT}${ROW_INDEX}`]])]))
      rule = host.expressionTex(withRowValues(expr, symbolic, 0))
    } else {
      args.forEach((value, i) => work(i + 1, value, `Value ${i + 1}`))
    }

    // A series made again replaces the one before: its values this line didn't make are gone.
    for (const [n, member] of before) {
      if (!made.includes(n) || member !== seriesMemberName(name, n)) host.forget(member)
    }

    const error = rowErrors(errors, (n) => `${n} more`)
    if (!made.length) return { tex: '', error }
    const values = valuesTex(host, made.map((n) => seriesMemberName(name, n)))
    const count = SERIES_TEX.count(made.length)
    const lhs = rule ? symbolTex(`${name}${SUBSCRIPT}${ROW_INDEX}`) : symbolTex(name)
    const pieces = !rule ? [symbolTex(name), values]
      : line.mode === DISPLAY_MODE.sym ? [lhs, rule]
        : line.mode === DISPLAY_MODE.val ? [symbolTex(name), values]
          : [lhs, rule, values]
    return {
      tex: `${pieces.join(SERIES_TEX.equals)}${count}`,
      error,
      warning,
      defines: definitions(name, made),
    }
  }
}

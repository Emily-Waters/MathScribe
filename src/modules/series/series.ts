/**
 * A series made on one line, in square brackets, its members t[1], t[2], …, so
 * t.avg, @table(t) and @plot(t, …) work on it:
 *
 *   t = [1.52 s, 1.48 s, 1.55 s]     its values, listed: t[1], t[2], t[3]
 *   m = [F / g]                      worked out row by row from other series:
 *                                    m[n] = F[n] / g (g, not a series, is used as it is)
 *   t = [0 s:2.0 s:0.1 s]            a range: from, to (kept) and step (1 if it's left out)
 *   z = m[2:4]                       another series, or a slice of one (renumbered from 1)
 *
 * Each value is worked out as a line assigning it would be, so units, sig figs
 * and uncertainty are the core's (g's uncertainty carries into every m[n], from
 * one source, so m.avg counts them as correlated). Settings on the name go on
 * every value (`m:3 = [F / g]`). A range's values have as many decimal places
 * as its from, to and step.
 *
 * A series worked out from others keeps their rows' numbers (v[5] is from d[5]
 * and t[5]), so @table(d, t, v) lines up; it has the rows every series it uses
 * has, with a warning when they don't all have the same ones. A series made
 * from another (a slice, `z = m[2:4]`) looks its values up rather than copying
 * them, as a selection does. A series made again replaces the one before.
 */
import {
  type Definition, DISPLAY_MODE, type FormLine, IS_NAME, LineForm, type LineResult, MEMBER_INDEX, type ModuleHost, NODE_KIND,
  SEPARATOR, SETTING_MARK, SLICE_COLON, SUBSCRIPT, TOKEN_KIND, attachUnit, closesBracket, lexExpression, lineShape, lineTokens, math,
  opensBracket, parseSliceName, seriesMemberName, symbolTex, typedName, unitTex,
} from '../../lib/plugin.ts'
import { rowErrors, seriesUsedIn, sharedRows, withRowValues } from './columns.ts'
import { cellParts } from './table.ts'

/** How many of its values a series' line shows: all of them up to `max`; past that, the `first` and the `last`, with … between. */
export const SERIES_SHOWN = { max: 6, first: 3, last: 2 } as const

/** The row a member stands for, in the rule of a series worked out from others: m_i = F_i / g. */
const ROW_INDEX = 'i'

/** The pieces of a series line's LaTeX. */
const SERIES_TEX = {
  separator: ',\\ ',
  gap: '\\ldots',
  equals: ' = ',
  count: (n: number) => `\\quad \\text{${n} value${n === 1 ? '' : 's'}}`,
} as const

/** Most values a range can make (a step too small for its span is more likely a slip than a wish). */
const MOST_RANGE_VALUES = 10_000

/** Between the rows of a matrix, which a series' brackets don't take. */
const MATRIX_ROWS = ';'

/** A ternary's `?`, whose `:` isn't a range's. */
const CONDITION = '?'

/** A number as a range's from, to or step is typed, and its unit (1: the number, 2: the unit, if any). */
const RANGE_PART = /^([-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)\s*(.*)$/

/** How a series is written, for messages. */
const WRITTEN = {
  listed: 't = [1.52 s, 1.48 s]',
  rule: 'm = [F / g]',
  range: 't = [0 s:2.0 s:0.1 s]',
} as const

/** Names in a list, as a sentence says them: a, b and c. */
const spoken = (items: string[]) => (items.length > 1 ? `${items.slice(0, -1).join(', ')} and ${items.at(-1)}` : items.join(''))

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

/** A series' name, then its values: `t = (1.52, 1.48) s   2 values`. */
const listedTex = (host: ModuleHost, name: string, members: string[]) =>
  `${symbolTex(name)}${SERIES_TEX.equals}${valuesTex(host, members)}${SERIES_TEX.count(members.length)}`

/**
 * What's between a value's square brackets, if the whole of it is in them:
 * `[F / g]` → `F / g` (not `[a] + [b]`); undefined otherwise. Read from the
 * tree's tokens, so a bracket in a label in quotes is the label's.
 */
function bracketed(value: string): string | undefined {
  const tokens = lineTokens(lexExpression(value)).map((l) => l.token)
  const first = tokens[0]
  if (first?.t !== TOKEN_KIND.delimiter || first.text !== MEMBER_INDEX.open) return undefined
  let depth = 0
  for (const [i, t] of tokens.entries()) {
    if (t.t !== TOKEN_KIND.delimiter) continue
    if (opensBracket(t.text)) depth++
    else if (closesBracket(t.text) && --depth === 0) {
      if (i !== tokens.length - 1 || t.text !== MEMBER_INDEX.close) return undefined
    }
  }
  return depth === 0 ? value.trim().slice(1, -1) : undefined
}

/** Text split at a delimiter outside any brackets (a call's, a member's, a label's), as the tree reads it. */
function splitTopLevel(text: string, delimiter: string): string[] {
  const parts = ['']
  let depth = 0
  for (const { token: t } of lineTokens(lexExpression(text))) {
    if (t.t === TOKEN_KIND.delimiter) {
      if (opensBracket(t.text)) depth++
      else if (closesBracket(t.text)) depth--
      else if (depth === 0 && t.text === delimiter) {
        parts.push('')
        continue
      }
    }
    parts[parts.length - 1] += t.text
  }
  return parts.map((p) => p.trim())
}

/** Decimal places a number has as typed, or as worked out (to a sensible precision): 0.10 → 2, 2 → 0. */
const decimalsOf = (n: string) => {
  const point = n.indexOf('.')
  return point < 0 || /e/i.test(n) ? 0 : n.length - point - 1
}

/**
 * A range's values, each as typed (so its sig figs are its decimal places):
 * `0 s:2.0 s:0.1 s` → 0.0 s, 0.1 s, …, 2.0 s. From and to must be given; the
 * step is 1 if it isn't; each is in the from's unit (or converted to it).
 */
function rangeValues(parts: string[]): { values: string[] } | { error: string } {
  const [fromText, toText, stepText] = parts
  if (!fromText || !toText) return { error: `A range needs where it starts and ends: ${WRITTEN.range} (only a step can be left out).` }
  const read = [fromText, toText, stepText || '1'].map((p) => RANGE_PART.exec(p))
  if (read.some((r) => !r)) return { error: `A range's start, end and step are numbers, each with its unit: ${WRITTEN.range}.` }
  const [from, to, step] = read as RegExpExecArray[]
  const unit = from[2]
  // Each in the from's unit: its number as typed if it's in that unit, else converted (then its decimals as worked out).
  let numbers: { value: number; decimals: number }[]
  try {
    numbers = [from, to, step].map((r, i) => {
      const own = r[2] || (i === 2 && !stepText ? unit : '')
      if (own === unit) return { value: Number(r[1]), decimals: decimalsOf(r[1]) }
      if (!unit || !own) throw new Error()
      const value = math.unit(Number(r[1]), own).toNumber(unit)
      return { value, decimals: decimalsOf(String(Number(value.toPrecision(12)))) }
    })
  } catch {
    return { error: `A range's start, end and step must be in units that convert to each other: ${WRITTEN.range}.` }
  }
  const [a, b, d] = numbers
  if (d.value === 0) return { error: 'A range\'s step can\'t be 0.' }
  if ((b.value - a.value) * d.value < 0) return { error: 'A range\'s step goes away from its end: make it negative to count down.' }
  // (A little slack, so 0:2.0:0.1 reaches 2.0 though 20 × 0.1 isn't exactly 2 in binary.)
  const count = Math.floor((b.value - a.value) / d.value + 1e-9) + 1
  if (count > MOST_RANGE_VALUES) return { error: `That range is ${count} values: a series can be made of at most ${MOST_RANGE_VALUES}.` }
  const decimals = Math.max(a.decimals, b.decimals, d.decimals)
  const values = Array.from({ length: count }, (_, k) => `${(a.value + k * d.value).toFixed(decimals)}${unit ? ` ${unit}` : ''}`)
  return { values }
}

/** A series' name on a line of its own, `t` (or a slice, `t[2:4]`): the series, its values listed. */
export class SeriesShownForm extends LineForm {
  evaluate(line: FormLine, host: ModuleHost): LineResult | undefined {
    if (!IS_NAME.test(line.text) || host.has(line.text)) return undefined
    const rows = host.seriesRows(line.text)
    if (!rows.size) return undefined
    return { tex: listedTex(host, line.text, [...rows.values()]) }
  }
}

export class SeriesForm extends LineForm {
  evaluate(line: FormLine, host: ModuleHost): LineResult | undefined {
    const shape = lineShape(line.text)
    const target = shape.target
    const inner = bracketed(shape.value)
    // Another series, or a slice of one: `z = m[2:4]` (read already as the series it is).
    const other = inner === undefined && target?.kind === NODE_KIND.assigned && IS_NAME.test(shape.value) && !host.has(shape.value)
      ? host.seriesRows(shape.value) : undefined
    if (inner === undefined && !other?.size) return undefined
    if (target?.kind !== NODE_KIND.assigned) {
      return { tex: '', error: `Name the series: ${WRITTEN.listed}, or ${WRITTEN.rule} to work one out from others.` }
    }
    const { name, settings: nameSettings } = target

    // A series made again replaces the one before (a lookup of another's, too).
    const before = host.seriesRows(name)
    host.setView(name, [])
    const forgetBefore = (kept: (n: number, member: string) => boolean) => {
      for (const [n, member] of before) if (!kept(n, member)) host.forget(member)
    }

    if (other?.size) {
      const picked = [...other.values()]
      forgetBefore(() => false)
      host.setView(name, picked)
      const rows = picked.map((_, i) => i + 1)
      const members = rows.map((n) => seriesMemberName(name, n))
      return {
        tex: `${symbolTex(name)}${SERIES_TEX.equals}${symbolTex(shape.value)}${SERIES_TEX.equals}${valuesTex(host, members)}${SERIES_TEX.count(members.length)}`,
        defines: definitions(name, rows),
      }
    }

    // Each value is assigned as the name would be, with its settings: m[3]:3 = ….
    const assigned = (n: number) => `${seriesMemberName(name, n)}${nameSettings.map((s) => `${SETTING_MARK}${s}`).join('')}`
    if (splitTopLevel(inner!, MATRIX_ROWS).length > 1) {
      return { tex: '', error: `Square brackets make a series, a list of values: ${WRITTEN.listed}. A ; between rows (a matrix) isn't one.` }
    }
    let args = splitTopLevel(inner!, SEPARATOR).filter(Boolean)
    if (!args.length) {
      return { tex: '', error: `Give the series its values, ${WRITTEN.listed}, a rule, ${WRITTEN.rule}, or a range, ${WRITTEN.range}.` }
    }

    // A range, `[0 s:2.0 s:0.1 s]`: its values, listed.
    const range = args.length === 1 && !args[0].includes(CONDITION) ? splitTopLevel(args[0], SLICE_COLON) : []
    if (range.length > 1) {
      if (range.length > 3) return { tex: '', error: `A range is from, to and step: ${WRITTEN.range}.` }
      const made = rangeValues(range)
      if ('error' in made) return { tex: '', error: made.error }
      args = made.values
    }

    // (A list in the list, a matrix's row, isn't a value.)
    if (args.some((a) => bracketed(a) !== undefined)) {
      return { tex: '', error: `A series' values are single values: ${WRITTEN.listed}. A list in it (a matrix's row) isn't one.` }
    }

    // Worked out from other series (one value that uses one), or its values listed.
    const usedBy = args.map((a) => seriesUsedIn(host, a))
    const fromSeries = usedBy.some((u) => u.size > 0)
    if (fromSeries && args.length > 1) {
      return { tex: '', error: `A series is its values listed, ${WRITTEN.listed}, or one rule that uses other series, ${WRITTEN.rule}: not both.` }
    }

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
      const rows = sharedRows(used)
      const counts = [...used].map(([id, r]) => ({ id: typedName(id), count: r.size }))
      if (!rows.length) {
        const which = counts.length > 1 ? `${spoken(counts.map((c) => c.id))} have no rows in common` : `${counts[0].id} has no values`
        return { tex: '', error: `${which}, so there's nothing to work out ${name} from.` }
      }
      if (counts.some((c) => c.count !== rows.length)) {
        const said = counts.map((c) => `${c.id} has ${c.count} value${c.count === 1 ? '' : 's'}`)
        const all = counts.length === 2 ? 'both' : 'they all'
        warning = `${spoken(said)}: ${name} uses the ${rows.length} rows ${all} have. Slice them to choose: `
          + `${counts[0].id}${MEMBER_INDEX.open}1${SLICE_COLON}${rows.length}${MEMBER_INDEX.close}.`
      }
      for (const n of rows) work(n, withRowValues(expr, used, n), `Row ${n}`)
      // The rule, with each series as its member in row i: m_i = F_i / g. (A slice, F[2:4], as its series: F_i.)
      const symbolic = new Map([...used.keys()].map((id) => [id, new Map([[0, `${parseSliceName(id)?.of ?? id}${SUBSCRIPT}${ROW_INDEX}`]])]))
      // (Its constants as their values' names, @g as g, as a line shows them.)
      const ruleText = withRowValues(expr, symbolic, 0)
      rule = host.expressionTex(host.expandConstants(ruleText).text)
    } else {
      args.forEach((value, i) => work(i + 1, value, `Value ${i + 1}`))
    }

    // Its values this line didn't make are gone.
    forgetBefore((n, member) => made.includes(n) && member === seriesMemberName(name, n))

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

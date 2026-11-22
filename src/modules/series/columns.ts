/**
 * The columns of a table or plot: a series by name (`t`, its t[1], t[2], …), or
 * one worked out row by row from the series it uses (`v = x / t`).
 */
import {
  DISPLAY_MODE, IS_NAME, type ModuleHost, NAME, NAME_CHAR, seriesMemberName, symbolsIn, symbolTex,
  unpackedColumnName,
} from '../../lib/plugin.ts'

/** A column of a table or plot: its name (if it has one), its header as TeX, and the variable holding each row's value. */
export interface SeriesColumn {
  name?: string
  /** An unnamed column's expression, as typed. */
  expr?: string
  header: string
  rows: Map<number, string>
}

/** A column of a table worked out row by row, with a name: `v = x / t` (1: the name, 2: the expression). */
export const TABLE_COLUMN = new RegExp(String.raw`^(${NAME})\s*=(?!=)\s*(.+)$`)

/** A series' name where it stands for a value: not part of a longer name, a call, or a unit after a number. */
export const SERIES_IN_EXPRESSION = new RegExp(String.raw`(?<!${NAME_CHAR}|[.@])(${NAME})(?!${NAME_CHAR}|\s*\()`, 'g')

/**
 * A table column's expression for row `n`: each series it uses, replaced by
 * that row's value's name (`x / t` → `x__3 / t__3`, x[3] / t[3]).
 */
export function withRowValues(expr: string, series: Map<string, Map<number, string>>, n: number): string {
  return expr.replace(SERIES_IN_EXPRESSION, (match: string, name: string, offset: number) => {
    const member = series.get(name)?.get(n)
    // (A unit right after a number, `2.0 m`, stays a unit.)
    if (!member || /\d\.?\s+$/.test(expr.slice(0, offset))) return match
    return member
  })
}

/**
 * The series an expression uses, each with its rows: every name in it that's a
 * series (t in `x / t`) and not a variable of its own (`g` stays a value).
 */
export function seriesUsedIn(host: ModuleHost, expr: string): Map<string, Map<number, string>> {
  const used = new Map<string, Map<number, string>>()
  for (const id of symbolsIn(expr)) {
    if (used.has(id) || (host.has(id) && !host.variable(id)?.agg)) continue
    const rows = host.seriesRows(id)
    if (rows.size) used.set(id, rows)
  }
  return used
}

/** The rows every one of these series has, in order. */
export const sharedRows = (used: Map<string, Map<number, string>>): number[] => {
  const all = [...used.values()]
  return all.length ? [...all[0].keys()].filter((n) => all.every((rows) => rows.has(n))).sort((a, b) => a - b) : []
}

/** A table's or plot's columns: or what's wrong with one of its arguments. */
export type Columns = { columns: SeriesColumn[]; errors: string[]; hidden: string[] } | { error: string }

/**
 * The columns of a table or plot, from its arguments: a series by name, or a
 * column worked out row by row (`v = x / t` makes the series v; `x / t` is
 * held in hidden variables, listed in `hidden` to forget when done). Rows
 * that can't be worked out are listed in `errors`; `purpose` finishes the
 * message for a name that isn't a series ("show it in a table").
 */
export function seriesColumns(host: ModuleHost, args: string[], purpose: string): Columns {
  const columns: SeriesColumn[] = []
  const errors: string[] = []
  const hidden: string[] = []
  for (const [i, arg] of args.entries()) {
    // A series, by name.
    if (IS_NAME.test(arg)) {
      const rows = host.seriesRows(arg)
      if (!rows.size) return { error: `${arg} isn't a series: define ${arg}_1, ${arg}_2, … (or import them) to ${purpose}.` }
      columns.push({ name: arg, header: symbolTex(arg), rows })
      continue
    }
    // A column worked out row by row: `v = x / t`, or just `x / t`.
    const named = TABLE_COLUMN.exec(arg)
    const name = named?.[1]
    const expr = named ? named[2] : arg
    // The series it uses, and the rows where all of them have a value.
    const used = seriesUsedIn(host, expr)
    if (!used.size) return { error: `${expr} doesn't use any series, so it would be the same in every row.` }
    const numbers = sharedRows(used)
    const rows = new Map<number, string>()
    for (const n of numbers) {
      const target = name ? seriesMemberName(name, n) : unpackedColumnName(i, n)
      const result = host.evaluateLine(`${target} = ${withRowValues(expr, used, n)}`, DISPLAY_MODE.val)
      if (result.error) {
        errors.push(`Row ${n}: ${result.error}`)
        continue
      }
      rows.set(n, target)
      if (!name) hidden.push(target)
    }
    columns.push({ name, expr: name ? undefined : expr, header: name ? symbolTex(name) : host.expressionTex(expr), rows })
  }
  return { columns, errors, hidden }
}

/** A message for the rows that couldn't be worked out: the first, and how many more. */
export function rowErrors(errors: string[], more: (n: number) => string): string | undefined {
  if (!errors.length) return undefined
  return `${errors[0]}${errors.length > 1 ? ` (and ${more(errors.length - 1)})` : ''}`
}

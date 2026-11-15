/** Tables of series: their columns and rows. */
import { AXES, COMPONENTS_SETTING, NAME, NAME_CHAR, SUBSCRIPT } from '../../syntax.ts'
import { isTuple } from './math.ts'

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

/** How many rows a table shows: all of them up to `max`; past that, the `first` and the `last`, with ⋮ between. */
export const TABLE_ROWS = { max: 60, first: 50, last: 5 }

/** A series' name where it stands for a value: not part of a longer name, a call, or a unit after a number. */
export const SERIES_IN_EXPRESSION = new RegExp(String.raw`(?<!${NAME_CHAR}|[.@])(${NAME})(?!${NAME_CHAR}|\s*\()`, 'g')

/**
 * A table column's expression for row `n`: each series it uses, replaced by
 * that row's value's name (`x / t` → `x_3 / t_3`).
 */
export function withRowValues(expr: string, series: Map<string, Map<number, string>>, n: number): string {
  return expr.replace(SERIES_IN_EXPRESSION, (match: string, name: string, offset: number) => {
    const member = series.get(name)?.get(n)
    // (A unit right after a number, `2.0 m`, stays a unit.)
    if (!member || /\d\.?\s+$/.test(expr.slice(0, offset))) return match
    return member
  })
}

/** A tuple or vector's TeX, bracketed if it isn't already (a sum of unit vectors), to drop into a substitution. */
export const bracketed = (tex: string) => (/^(?:\\left|\()/.test(tex) ? tex : `(${tex})`)

/** The unit vectors î, ĵ, k̂, one per axis. */
export const UNIT_VECTOR_TEX = ['\\hat{\\imath}', '\\hat{\\jmath}', '\\hat{k}']

/** A vector's components, as the variables `F:xyz` makes: F → F_x, F_y (and F_z). */
export function componentsOf(name: string, value: unknown): { name: string; value: unknown }[] {
  const values = isTuple(value) ? value.toArray() as unknown[] : null
  if (!values || values.length < 2 || values.length > AXES.length) {
    throw new Error(`${name}:${COMPONENTS_SETTING} needs a vector of 2 or 3 values, like <3.0, 4.0> N.`)
  }
  return values.map((v, i) => ({ name: `${name}${SUBSCRIPT}${AXES[i]}`, value: v }))
}

/**
 * An equation with more rows under it, lined up on their `=`: `F = …` then
 * `F_x = …`, `F_y = …`. `lhs` is the equation's left-hand side, where its
 * first `=` (or ≈) is; an equation already laid out one `=` per row gets the
 * rows added to the end.
 */
export function withRows(tex: string, lhs: string, rows: string[]): string {
  const ALIGNED_END = '\\end{aligned}'
  if (tex.startsWith('\\begin{aligned}') && tex.endsWith(ALIGNED_END)) {
    return `${tex.slice(0, -ALIGNED_END.length)} \\\\ ${rows.join(' \\\\ ')}${ALIGNED_END}`
  }
  const first = tex.startsWith(`${lhs} `) ? `${lhs} &${tex.slice(lhs.length + 1)}` : `&${tex}`
  return `\\begin{aligned}${[first, ...rows].join(' \\\\ ')}\\end{aligned}`
}

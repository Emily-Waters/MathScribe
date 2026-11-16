/** A vector's components (`F:xyz`), and the rows they add under its equation. */
import { AXES, COMPONENTS_SETTING, SUBSCRIPT } from '../../syntax.ts'
import { isTuple } from './math.ts'

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

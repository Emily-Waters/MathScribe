/** Rows under an equation: variables a line's settings make from the one it assigns (F_x, F_y under F). */

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

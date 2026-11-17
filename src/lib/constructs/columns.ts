/**
 * How an `@layout.column` block splits into columns, the same for the app and
 * both exports (each draws them: PreviewPane, and ColumnArrangement in layout.ts).
 */
import { BLOCK_KIND, isContainer, isOmitted, listItems, type Block, type LayoutBlock } from '../blocks.ts'
import { COLUMN_COUNT } from '../syntax.ts'

/**
 * Whether a block inside `@layout.column` is a column of its own: a `{ }` block,
 * a layout block (not a sub-list, which belongs to its item), constants or species.
 */
const isColumnOfItsOwn = (b: Block) =>
  (isContainer(b) && !(b.kind === BLOCK_KIND.layout && b.nested)) || b.kind === BLOCK_KIND.constants || b.kind === BLOCK_KIND.species

/**
 * An `@layout.column` block's columns, row by row. Each block inside is a
 * column, and the lines between them are split into columns at blank lines;
 * columns with nothing shown are left out. With no breaks at all, the lines are
 * shared out evenly between `column(n)` columns (2 if it doesn't say). A row has
 * `n` columns, or, if it doesn't say, as many as there are (up to 4, then another row).
 */
export function columnGrid(b: LayoutBlock): { perRow: number; rows: Block[][][] } {
  const { count, breaks } = b.columns ?? { breaks: [] }
  const pieces: Block[][] = [[]]
  b.children.forEach((c, i) => {
    if (breaks.includes(i)) pieces.push([])
    if (isColumnOfItsOwn(c)) pieces.push([c], [])
    else pieces.at(-1)!.push(c)
  })
  let columns = pieces.filter((p) => p.some((c) => !isOmitted(c)))
  if (columns.length === 1) columns = shareOut(columns[0], count ?? COLUMN_COUNT.unbroken)
  const perRow = count ?? Math.min(Math.max(columns.length, 1), COLUMN_COUNT.max)
  const rows: Block[][][] = []
  for (let i = 0; i < columns.length; i += perRow) rows.push(columns.slice(i, i + perRow))
  return { perRow, rows }
}

/**
 * An `@layout.column` block's columns, row by row, each as a block of its own:
 * its lines, laid out as the block's are, with no title. A numbered list's count
 * carries on from column to column.
 */
export function columnParts(b: LayoutBlock): { perRow: number; rows: LayoutBlock[][] } {
  const { perRow, rows } = columnGrid(b)
  let before = 0
  return {
    perRow,
    rows: rows.map((row) => row.map((lines) => {
      const part: LayoutBlock = {
        ...b, title: '', note: undefined, columns: undefined, error: undefined, warning: undefined, children: lines, firstNumber: before + 1,
      }
      before += listItems(lines).length
      return part
    })),
  }
}

/** Lines shared out evenly into `n` columns, top to bottom; what isn't shown, and a sub-list, stays with the line before it. */
function shareOut(lines: Block[], n: number): Block[][] {
  const units: Block[][] = []
  for (const b of lines) {
    const joins = isOmitted(b) || (b.kind === BLOCK_KIND.layout && b.nested)
    if (joins && units.length) units.at(-1)!.push(b)
    else units.push([b])
  }
  const size = Math.ceil(units.length / n)
  const out: Block[][] = []
  for (let i = 0; i < units.length; i += size) out.push(units.slice(i, i + size).flat())
  return out
}

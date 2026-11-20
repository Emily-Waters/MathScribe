/**
 * A table's data, as `@table(…)` works it out (table.ts), and the table as an
 * `array`, as an equation shows it (in Word and the Rendered tab). A leaf: it
 * loads nothing of the engine, so the module's public face can share it (see
 * tableBlock.ts for how a table block is written to each export).
 */
import { TABLE_LINE, type TableLines } from './tableSettings.ts'

/** The series module's kinds of block, by type. */
export const SERIES_BLOCK = { table: 'series.table' } as const

/** What's in a table's cells besides its values. */
export const TABLE_CELL = {
  /** The row headers' header: none (over the row numbers or labels, as a table written by hand has). */
  rowHeadersHeader: '',
  /** A cell with no value. */
  empty: '\\text{—}',
} as const

/** A table, as its line worked it out. */
export interface TableData {
  /** Its caption, if it has one. */
  readonly title?: string
  /** How its lines are drawn. */
  readonly lines: TableLines
  /**
   * Whether its first column is row headers: the row numbers (`numbers`, the
   * default), or a series' values (`labels salts`). They're text, drawn bold as
   * a title is (`$…$` maths, `p_z` subscripts), not maths.
   */
  readonly rowHeaders: boolean
  /** Each column's header, then each row's cells: the row headers' as text, the rest as LaTeX. */
  readonly header: readonly string[]
  readonly rows: readonly (readonly string[])[]
  /** In a table shortened to its first and last rows, the row a gap (⋮) comes before. */
  readonly gapBefore?: number
}

/** The pieces of a table's LaTeX as an `array`. */
export const TABLE_TEX = {
  /** The gap in a shortened table, before its last rows. */
  gap: '\\vdots',
  rowEnd: ' \\\\ ',
  ruledRowEnd: ' \\\\ \\hline ',
  rule: '\\hline ',
  cellSeparator: ' & ',
  /** A column's alignment, and the line between two. */
  column: 'r',
  columnRule: '|',
} as const

/** A table as an `array`: its lines as its settings say (a line after the header; around every cell in a grid; none). */
export function tableTex({ lines, rowHeaders, header, rows, gapBefore }: TableData): string {
  const grid = lines === TABLE_LINE.grid
  const none = lines === TABLE_LINE.none
  const { column, columnRule, cellSeparator } = TABLE_TEX
  // A line after each row in a grid; otherwise just after the header (none for lines none).
  const rowEnd = grid ? TABLE_TEX.ruledRowEnd : TABLE_TEX.rowEnd
  const rowsTex = rows.map((cells, r) => {
    const row = cells.join(cellSeparator)
    return r === gapBefore ? `${TABLE_TEX.gap}${rowEnd}${row}` : row
  })
  const count = header.length
  const columnSpec = grid
    ? `${columnRule}${`${column}${columnRule}`.repeat(count)}`
    : none || !rowHeaders ? column.repeat(count) : `${column}${columnRule}${column.repeat(count - 1)}`
  const top = grid ? TABLE_TEX.rule : ''
  const afterHeader = none ? TABLE_TEX.rowEnd : TABLE_TEX.ruledRowEnd
  const end = grid ? TABLE_TEX.ruledRowEnd.trimEnd() : ''
  return `\\begin{array}{${columnSpec}} ${top}${header.join(cellSeparator)}${afterHeader}${rowsTex.join(rowEnd)}${end} \\end{array}`
}

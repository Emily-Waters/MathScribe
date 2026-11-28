/**
 * A table's data, as `@table(…)` works it out (table.ts), and the table as an
 * `array`, as an equation shows it (in Word and the Rendered tab). A leaf: it
 * loads nothing of the engine, so the module's public face can share it (see
 * tableBlock.ts for how a table block is written to each export).
 */
import { TEX_COLUMN_RULE } from '../../lib/plugin.ts'
import { TABLE_LINE, type TableLines } from './tableSettings.ts'

/** The series module's kinds of block, by type. */
export const SERIES_BLOCK = { table: 'series.table' } as const

/** What a table's numbered caption names its kind with: `Table 2: Runs`. */
export const TABLE_CAPTION = 'Table'

/** The series module's kinds of figure (a drawing above a line's equations), by type: a plot (plotFigure.ts). */
export const SERIES_FIGURE = { plot: 'series.plot' } as const

/** What's in a table's cells besides its values. */
export const TABLE_CELL = {
  /** The row headers' header: none (over the row numbers or labels, as a table written by hand has). */
  rowHeadersHeader: '',
  /** A cell with no value. */
  empty: '\\text{—}',
} as const

/** A cell of a typed table's upper header row: its text, and how many columns it spans. */
export interface TableGroup {
  readonly text: string
  readonly span: number
}

/** The columns each of a header's groups spans (its first, and how many), in order. */
export const groupColumns = (groups: readonly TableGroup[]) =>
  groups.map((g, i) => ({ ...g, from: groups.slice(0, i).reduce((n, h) => n + h.span, 0) }))

/** Whether a column of a two-row header is one header over both rows: its group spans only it, and nothing's under it. */
export const spansBothRows = (group: TableGroup, under: string | undefined) => group.span === 1 && !under?.trim()

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
  /**
   * Whether every cell is text, drawn as a title is (`$…$` maths, its values
   * filled in already): a typed table's. Otherwise the row headers' are text
   * and the rest LaTeX.
   */
  readonly text?: boolean
  /**
   * A typed table's header over two rows, its upper row: each cell's text and
   * how many columns it spans, left to right, over every column (a spanning
   * header with its unit, `Mass (g)` over trials 1, 2 and 3). A column whose
   * cell spans only it and has nothing under it in `header` is one header over
   * both rows (`Salt`).
   */
  readonly groups?: readonly TableGroup[]
  /** Each column's header (with groups, the row under them), then each row's cells: text or LaTeX, as `text` and `rowHeaders` say. */
  readonly header: readonly string[]
  readonly rows: readonly (readonly string[])[]
  /** In a table shortened to its first and last rows, the row a gap (⋮) comes before. */
  readonly gapBefore?: number
}

/**
 * Whether a cell of a table's body is left empty: a typed table's with nothing
 * in it, shaded in every output, as a lab table shades what wasn't measured.
 * (A table of series' missing value shows —: TABLE_CELL.empty.)
 */
export const isEmptyCell = (data: TableData, cell: string) => data.text === true && !cell.trim()

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
  columnRule: TEX_COLUMN_RULE,
  /** A text cell (a typed table's), as text in maths. */
  text: (cell: string) => `\\text{${cell}}`,
  /** A cell over `span` columns, centred. */
  spanning: (span: number, cell: string) => (span > 1 ? `\\multicolumn{${span}}{c}{${cell}}` : cell),
} as const

/** A table as an `array`: its lines as its settings say (a line after the header; around every cell in a grid; none). */
export function tableTex({ lines, rowHeaders, text, groups, header: headerCells, rows: rowCells, gapBefore }: TableData): string {
  const grid = lines === TABLE_LINE.grid
  const none = lines === TABLE_LINE.none
  const { column, columnRule, cellSeparator } = TABLE_TEX
  // (A typed table's text, as text in maths.)
  const asTex = (cells: readonly string[]) => (text ? cells.map(TABLE_TEX.text) : cells)
  const header = asTex(headerCells)
  const rows = rowCells.map(asTex)
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
  // (A typed table's spans, a row over its header.)
  const over = groups ? `${groups.map((g) => TABLE_TEX.spanning(g.span, TABLE_TEX.text(g.text))).join(cellSeparator)}${TABLE_TEX.rowEnd}` : ''
  return `\\begin{array}{${columnSpec}} ${top}${over}${header.join(cellSeparator)}${afterHeader}${rowsTex.join(rowEnd)}${end} \\end{array}`
}

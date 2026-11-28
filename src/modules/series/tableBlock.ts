/**
 * A table, `@table(t, x)`, as a block of the series module's own: what the line
 * worked out (table.ts: its data, tableData.ts), and how it's written to LaTeX
 * and Word (its construct, here) and drawn in the Rendered tab (its view,
 * tableView.tsx).
 *
 * In LaTeX it's a table as one is written by hand: a `table` float held where
 * it's written, its title the caption, full width (`tabularx`), its first
 * column (the row numbers) bold and to the left and the others centred, its
 * header bold, and its lines as its settings say:
 *
 *   \begin{table}[H]
 *       \caption{Runs}
 *       \centering
 *       \begin{tabularx}{\linewidth}{|l|*{2}{>{\centering\arraybackslash}X|}}
 *           \hline
 *           \textbf{n} & $\boldsymbol{t\,\left[\mathrm{s}\right]}$ & … \\
 *           \hline
 *           \textbf{1} & $0.10$ & … \\
 *           \hline
 *       \end{tabularx}
 *   \end{table}
 *
 * (In a list or a column, where a float can't go, it's centred where it is,
 * with `\captionof`.) In Word and the Rendered tab it's still an `array`, as an
 * equation is.
 */
import {
  BLOCK_KIND, Construct, docxKit, latexKit, type CustomBlock, type DocxOut, type LatexOut,
} from '../../lib/plugin.ts'
import { TABLE_LINE } from './tableSettings.ts'
import { TABLE_CAPTION, TABLE_TEX, groupColumns, isEmptyCell, spansBothRows, type TableData } from './tableData.ts'

/** Each column of a table but its first: centred, the columns sharing the width. */
const CENTRED_COLUMN = '>{\\centering\\arraybackslash}X'

/** The pieces of a table written as one is by hand (tabularx). */
const TABULAR = {
  /** Each level in, a tab, as hand-written LaTeX is. */
  indent: '\t',
  float: { begin: '\\begin{table}[H]', end: '\\end{table}' },
  /** Where a float can't go (in a list, or a column): centred where it is. */
  inPlace: { begin: '\\begin{center}', end: '\\end{center}' },
  centering: '\\centering',
  caption: (title: string) => `\\caption{${title}}`,
  captionInPlace: (title: string) => `\\captionof{table}{${title}}`,
  begin: (spec: string) => `\\begin{tabularx}{\\linewidth}{${spec}}`,
  end: '\\end{tabularx}',
  /** The first column, its row headers (numbers or labels): to the left. */
  first: 'l',
  /** `count` centred columns, each followed by `after` (a rule, or nothing). */
  columns: (count: number, after: string) => `*{${count}}{${CENTRED_COLUMN}${after}}`,
  rule: '|',
  hline: '\\hline',
  rowEnd: ' \\\\',
  cellSeparator: ' & ',
  /** A bold cell: its text (and any maths in it, `\boldmath`), or its maths. */
  bold: (text: string) => `\\textbf{\\boldmath ${text}}`,
  boldMaths: (tex: string) => `$\\boldsymbol{${tex}}$`,
  maths: (tex: string) => `$${tex}$`,
  /** A cell over `span` columns, its own column spec (`c`, with any rules), and a rule under columns `from` to `to` (from 1). */
  multicolumn: (span: number, spec: string, cell: string) => `\\multicolumn{${span}}{${spec}}{${cell}}`,
  cline: (from: number, to: number) => `\\cline{${from}-${to}}`,
  /** An empty cell, shaded (colortbl). */
  shaded: '\\cellcolor{gray!15}',
  /** A note, under the table. */
  note: (note: string) => `\\par\\smallskip\\textit{${note}}`,
} as const

/** What a document's preamble needs for a table: tabularx (with array), float's `[H]`, and caption's `\captionof`. */
export const TABLE_PREAMBLE = [
  '% Tables: full width (tabularx), held where they\'re written (float), captioned anywhere (caption).',
  '\\usepackage{tabularx}', '\\usepackage{float}', '\\usepackage{caption}',
] as const

/** What a document's preamble needs for a table's shaded cells: xcolor's gray!15 (loaded again harmlessly if it is already), and colortbl's \cellcolor. */
export const SHADING_PREAMBLE = ['% A table\'s empty cells, shaded.', '\\usepackage{xcolor}', '\\usepackage{colortbl}'] as const

/** Whether a document's LaTeX has a table in it (and so needs TABLE_PREAMBLE), and one with shaded cells (SHADING_PREAMBLE). */
export const usesTables = (tex: string) => tex.includes(TABULAR.end)
export const usesShading = (tex: string) => tex.includes(TABULAR.shaded)

/** The colour an empty cell is shaded in Word, as hex (as LaTeX's gray!15). */
const WORD_SHADE = 'D9D9D9'

/**
 * A table's column spec: its first column (the row headers) to the left, the
 * others centred and sharing the width; lines between them as its settings say
 * (around every cell; after the row headers; none).
 */
function columnSpec({ lines, rowHeaders, header }: TableData): string {
  const { first, rule } = TABULAR
  const others = header.length - (rowHeaders ? 1 : 0)
  if (lines === TABLE_LINE.grid) return `${rule}${rowHeaders ? `${first}${rule}` : ''}${TABULAR.columns(others, rule)}`
  if (lines === TABLE_LINE.header && rowHeaders) return `${first}${rule}${TABULAR.columns(others, '')}`
  return `${rowHeaders ? first : ''}${TABULAR.columns(others, '')}`
}

/** A table written as one is by hand (see the top of this file); `float`: as a float (not in a list or a column). */
export function tableLatex(data: TableData, note: string | undefined, float: boolean): string {
  const { lines, rowHeaders, text, groups, header, rows, gapBefore, title } = data
  const { indent, hline, rowEnd, cellSeparator } = TABULAR
  const grid = lines === TABLE_LINE.grid
  const row = (cells: string[]) => `${indent}${indent}${cells.join(cellSeparator)}${rowEnd}`
  // The row headers bold text (theirs, over them, blank); the header's maths bold; every other cell its maths.
  // (A typed table's cells are all text: its header bold.)
  const isRowHeader = (i: number) => rowHeaders && i === 0
  const bold = (cell: string) => (cell ? TABULAR.bold(latexKit.titleToLatex(cell)) : '')
  // A typed table's header over two rows: its spans over the names under them, each with a rule under it (unless
  // lines none); a column with nothing under it has its one header in the lower row, just over the body.
  const spans = groups ? groupColumns(groups) : []
  const overColumn = (i: number) => spans.find((g) => i >= g.from && i < g.from + g.span)
  const both = (i: number) => {
    const g = overColumn(i)
    return g !== undefined && spansBothRows(g, header[g.from])
  }
  const headerCells = header.map((h, i) => (both(i) ? bold(overColumn(i)!.text) : text || isRowHeader(i) ? bold(h) : TABULAR.boldMaths(h)))
  const upperCells = spans.map((g) => {
    const cell = spansBothRows(g, header[g.from]) ? '' : bold(g.text)
    return g.span > 1 ? TABULAR.multicolumn(g.span, grid ? `${g.from === 0 ? TABULAR.rule : ''}c${TABULAR.rule}` : 'c', cell) : cell
  })
  const underSpans = lines === TABLE_LINE.none ? []
    : spans.filter((g) => !spansBothRows(g, header[g.from])).map((g) => `${indent}${indent}${TABULAR.cline(g.from + 1, g.from + g.span)}`)
  const upper = groups ? [row(upperCells), ...underSpans] : []
  const cellsOf = (cells: readonly string[]) => cells.map((c, i) => (isRowHeader(i) ? bold(c)
    : isEmptyCell(data, c) ? TABULAR.shaded : text ? latexKit.titleToLatex(c) : TABULAR.maths(c)))
  const gap = header.map(() => TABULAR.maths(TABLE_TEX.gap))
  const body: string[] = []
  rows.forEach((cells, r) => {
    if (r === gapBefore) body.push(row(gap), ...(grid ? [`${indent}${indent}${hline}`] : []))
    body.push(row(cellsOf(cells)), ...(grid ? [`${indent}${indent}${hline}`] : []))
  })
  const around = float ? TABULAR.float : TABULAR.inPlace
  const caption = title === undefined ? [] : [`${indent}${(float ? TABULAR.caption : TABULAR.captionInPlace)(latexKit.titleToLatex(title))}`]
  return [
    around.begin,
    ...caption,
    ...(float ? [`${indent}${TABULAR.centering}`] : []),
    `${indent}${TABULAR.begin(columnSpec(data))}`,
    ...(grid ? [`${indent}${indent}${hline}`] : []),
    ...upper,
    row(headerCells),
    ...(lines === TABLE_LINE.none ? [] : [`${indent}${indent}${hline}`]),
    ...body,
    `${indent}${TABULAR.end}`,
    ...(note ? [`${indent}${TABULAR.note(latexKit.titleToLatex(note))}`] : []),
    around.end,
  ].join('\n')
}

/** The pieces of a table in Word. */
const WORD_TABLE = {
  /** A rule's width, in eighths of a point (½ pt, as Word's own tables have). */
  rule: 4,
  /**
   * The row headers' column: at least room for a row number, in twips (about
   * 1.4 cm); as wide as the longest label (each character about `charEms` wide,
   * bold), up to a share of the table; the rest shared by the other columns.
   */
  rowHeaders: { least: 800, charEms: 0.6, most: 0.4 },
  /** Each cell's room either side of what's in it, in twips. */
  margin: 100,
  /** A cell's room above and below, in twips. */
  padding: 20,
} as const

/** A table's sides, as Word names them: around it, and between its rows and its columns. */
const SIDES = ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'] as const
type Side = (typeof SIDES)[number]

/** Rules on some sides, as Word's border elements. */
const rules = (sides: readonly Side[]) =>
  sides.map((side) => `<w:${side} w:val="single" w:sz="${WORD_TABLE.rule}" w:space="0" w:color="auto"/>`).join('')

/**
 * A table in Word, as in LaTeX (tableLatex): its title a numbered caption over
 * it, full width, the row headers as wide as they need, bold and to the left, the others centred,
 * the header bold (and repeated on each page it runs onto), and its lines as its
 * settings say; its note under it.
 */
export function tableDocx(data: TableData, note: string | undefined, ctx: docxKit.Ctx): docxKit.Item[] {
  const { lines, rowHeaders, text, groups, header, rows, gapBefore, title } = data
  const { ALIGN } = docxKit
  const isRowHeader = (i: number) => rowHeaders && i === 0
  const width = ctx.width - ctx.indent
  const others = header.length - (rowHeaders ? 1 : 0)
  const { least, charEms, most } = WORD_TABLE.rowHeaders
  const longest = Math.max(0, ...rows.map((cells) => cells[0].length))
  const charTwips = charEms * docxKit.fontSizeOf(ctx.o) * docxKit.TWIPS_PER_EM_PER_HALF_POINT
  const rowHeadersWidth = rowHeaders ? Math.round(Math.min(width * most, Math.max(least, longest * charTwips + 2 * WORD_TABLE.margin))) : 0
  const columnWidth = Math.floor((width - rowHeadersWidth) / others)
  const widths = header.map((_, i) => (isRowHeader(i) ? rowHeadersWidth : columnWidth))
  // With lines under the header: a rule under each header cell, and after each row header.
  const underHeader = lines === TABLE_LINE.header
  /** A cell: `span` columns wide from column `i` (a typed table's span), and the start or the rest of one merged down (`merge`). */
  const cell = (i: number, content: string, isHeader: boolean, shaded = false, span = 1, merge?: 'restart' | 'continue') => {
    const first = isRowHeader(i)
    // (A cell merged down has its rule under its last part.)
    const ruled = isHeader && merge !== 'restart'
    const sides: Side[] = underHeader ? [...(ruled ? ['bottom' as const] : []), ...(first ? ['right' as const] : [])] : []
    const props = { jc: first ? ALIGN.left : ALIGN.center, before: WORD_TABLE.padding, after: WORD_TABLE.padding }
    const w = widths.slice(i, i + span).reduce((a, b) => a + b, 0)
    return `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/>${span > 1 ? `<w:gridSpan w:val="${span}"/>` : ''}`
      + `${merge ? `<w:vMerge w:val="${merge}"/>` : ''}${sides.length ? `<w:tcBorders>${rules(sides)}</w:tcBorders>` : ''}`
      + `${shaded ? `<w:shd w:val="clear" w:color="auto" w:fill="${WORD_SHADE}"/>` : ''}`
      + `<w:vAlign w:val="center"/></w:tcPr>${docxKit.paraXml({ props, content })}</w:tc>`
  }
  // The row headers bold text (theirs, over them, blank); the header's maths bold; every other cell its maths.
  // (A typed table's cells are all text: its header bold.)
  const bold = (cell: string) => docxKit.titleRuns(cell, { bold: true })
  const headerText = (h: string) => docxKit.alignedTitle(h, ALIGN.center, { bold: true })
  const HEADER_ROW = '<w:tr><w:trPr><w:tblHeader/></w:trPr>'
  // A typed table's header over two rows: its spans over the names under them; a column with nothing under it, one
  // header merged down both. (Both rows repeat on each page.)
  const spans = groups ? groupColumns(groups) : []
  const upperRow = groups ? `${HEADER_ROW}${spans.map((g) => (spansBothRows(g, header[g.from])
    ? cell(g.from, headerText(g.text), true, false, 1, 'restart')
    : cell(g.from, headerText(g.text), true, false, g.span))).join('')}</w:tr>` : ''
  const headerRow = `${upperRow}${HEADER_ROW}${spans.length
    ? spans.flatMap((g) => (spansBothRows(g, header[g.from]) ? [cell(g.from, '', true, false, 1, 'continue')]
      : header.slice(g.from, g.from + g.span).map((h, j) => cell(g.from + j, headerText(h), true)))).join('')
    : header.map((h, i) =>
      cell(i, isRowHeader(i) ? bold(h) : text ? headerText(h) : docxKit.alignedMath(h, ALIGN.center, true), true)).join('')}</w:tr>`
  const row = (cells: readonly string[]) => `<w:tr>${cells.map((c, i) =>
    cell(i, isRowHeader(i) ? bold(c) : text ? docxKit.alignedTitle(c, ALIGN.center) : docxKit.alignedMath(c, ALIGN.center), false,
      !isRowHeader(i) && isEmptyCell(data, c))).join('')}</w:tr>`
  // (The gap in a shortened table: ⋮ in every column, the row headers' too, as maths.)
  const gap = `<w:tr>${header.map((_, i) => cell(i, docxKit.alignedMath(TABLE_TEX.gap, isRowHeader(i) ? ALIGN.left : ALIGN.center), false)).join('')}</w:tr>`
  const body = rows.flatMap((cells, r) => [...(r === gapBefore ? [gap] : []), row(cells)])
  const borders = lines === TABLE_LINE.grid ? `<w:tblBorders>${rules(SIDES)}</w:tblBorders>` : ''
  const table = `<w:tbl><w:tblPr><w:tblW w:w="${width}" w:type="dxa"/>${ctx.indent ? `<w:tblInd w:w="${ctx.indent}" w:type="dxa"/>` : ''}`
    + `${borders}<w:tblLayout w:type="fixed"/>`
    + `<w:tblCellMar><w:left w:w="${WORD_TABLE.margin}" w:type="dxa"/><w:right w:w="${WORD_TABLE.margin}" w:type="dxa"/></w:tblCellMar>`
    + '<w:tblLook w:val="0000"/></w:tblPr>'
    + `<w:tblGrid>${widths.map((w) => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>`
    + `${headerRow}${body.join('')}</w:tbl>`
  const noteSize = docxKit.fontSizeOf(ctx.o) - docxKit.NOTE_SIZE_STEP
  return [
    ...(title === undefined ? [] : [docxKit.caption(ctx, TABLE_CAPTION, title)]),
    { xml: table },
    // Its note under it, or a gap after it (two tables in a row would otherwise merge).
    note ? { props: { jc: ALIGN.center }, content: docxKit.titleRuns(note, { ...docxKit.NOTE, size: noteSize }) } : { props: { after: 0 }, content: '' },
  ]
}

/** A table block: in LaTeX and Word a table (tableLatex, tableDocx). */
export class TableConstruct extends Construct<CustomBlock> {
  readonly kind = BLOCK_KIND.custom

  latex(b: CustomBlock, out: LatexOut): string {
    if (b.error) return latexKit.errorComment(b.line, b.source ?? '', b.error)
    if (b.hidden) return ''
    // (A float can't go in a column, which is a box of its own.)
    return tableLatex(b.data as TableData, b.note, out.share === 1)
  }

  docx(b: CustomBlock, ctx: docxKit.Ctx, _out: DocxOut): docxKit.Item[] {
    // Errors stay out of the document, as in the LaTeX export.
    if (b.error || b.hidden) return []
    return tableDocx(b.data as TableData, b.note, ctx)
  }

  latexItem(b: CustomBlock, out: LatexOut): string {
    if (b.error || b.hidden) return this.latex(b, out)
    // (Nor can one go in a list's item.)
    return tableLatex(b.data as TableData, b.note, false)
  }

  notes(b: CustomBlock): string[] {
    return b.note ? [b.note] : []
  }
}

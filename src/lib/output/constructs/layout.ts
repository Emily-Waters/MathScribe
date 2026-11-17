/**
 * The construct for `@layout` blocks, and one class for each layout: how its
 * lines are arranged in each export. A block with no layout (`@layout.val { }`,
 * only display settings) keeps its lines as they are.
 */
import { BLOCK_KIND, listItems, type Block, type LayoutBlock } from '../../sheet/blocks.ts'
import { columnParts } from './columns.ts'
import { LAYOUT_STYLE, LAYOUT_SYNTAX, LINE_COMMAND, type LayoutStyle } from '../../syntax.ts'
import { ALIGN } from '../alignment.ts'
import { errorComment, heading as latexHeading, titleToLatex } from '../latexKit.ts'
import {
  PAGE_BREAK, SPACING, TITLE_PAGE_SIZE_STEP, TITLE_STYLE, baseProps, fontSizeOf, heading as docxHeading, itemXml, titleRuns,
  type Ctx, type Item,
} from '../docxKit.ts'
import { Construct, type DocxOut, type LatexOut } from './construct.ts'

/** A block's title (and note) as a LaTeX run-in heading, if it has one. */
const paragraph = (title: string) => (title ? `\\paragraph{${title}}` : '')

/** One layout: how a block's lines are arranged, given its title as each export writes it. */
abstract class Layout {
  abstract latex(b: LayoutBlock, title: string, out: LatexOut): string
  abstract docx(b: LayoutBlock, ctx: Ctx, title: Item[], out: DocxOut): Item[]
}

/** Prose (`@layout.text`), or no layout at all (`@layout.val`): the lines as they are, under the title. */
class PlainLayout extends Layout {
  latex(b: LayoutBlock, title: string, out: LatexOut): string {
    return [paragraph(title), out.join(b.children)].filter(Boolean).join('\n')
  }

  docx(b: LayoutBlock, ctx: Ctx, title: Item[], out: DocxOut): Item[] {
    return [...title, ...out.blocks(b.children, ctx)]
  }
}

/** `@layout.center`: the lines centred. */
class CenterLayout extends Layout {
  /** LaTeX's environment for it. */
  private static readonly ENVIRONMENT = 'center'

  latex(b: LayoutBlock, title: string, out: LatexOut): string {
    const env = CenterLayout.ENVIRONMENT
    return [paragraph(title), `\\begin{${env}}`, out.join(b.children), `\\end{${env}}`].filter(Boolean).join('\n')
  }

  docx(b: LayoutBlock, ctx: Ctx, title: Item[], out: DocxOut): Item[] {
    return [...title, ...out.blocks(b.children, { ...ctx, center: true })]
  }
}

/** `@layout.list`, `@layout.numbered`: each line an item, with sub-lists indented under them. */
class ListLayout extends Layout {
  /** The deepest level of sub-list Word's numbering has (0, 1, 2). */
  private static readonly DEEPEST = 2

  /** LaTeX's environments for it. */
  private static readonly ENVIRONMENT = { numbered: 'enumerate', bulleted: 'itemize' } as const
  /** LaTeX's counter for a numbered list's items (at the top level). */
  private static readonly COUNTER = 'enumi'

  /** Numbered (`@layout.numbered`), or bulleted (`@layout.list`). */
  private readonly numbered: boolean

  constructor(numbered: boolean) {
    super()
    this.numbered = numbered
  }

  latex(b: LayoutBlock, title: string, out: LatexOut): string {
    const env = this.numbered ? ListLayout.ENVIRONMENT.numbered : ListLayout.ENVIRONMENT.bulleted
    const body = listItems(b.children).map(({ item, subs }) =>
      [`\\item ${out.item(item)}`, ...subs.map((s) => out.block(s))].filter(Boolean).join('\n')).join('\n')
    // (A column of a numbered list carries on from the one before it.)
    const carryOn = this.numbered && b.firstNumber && b.firstNumber > 1 ? `\\setcounter{${ListLayout.COUNTER}}{${b.firstNumber - 1}}` : ''
    return [paragraph(title), `\\begin{${env}}`, carryOn, body, `\\end{${env}}`].filter(Boolean).join('\n')
  }

  docx(b: LayoutBlock, ctx: Ctx, title: Item[], out: DocxOut): Item[] {
    return [...title, ...this.items(b, ctx, 0, out)]
  }

  /** A list's items as Word list paragraphs (and the sub-lists indented under them, a level deeper). */
  private items(b: LayoutBlock, ctx: Ctx, level: number, out: DocxOut): Item[] {
    // (A column of a numbered list carries on from the one before it.)
    ctx.nums.push({ abstract: this.numbered ? 1 : 0, start: level === 0 ? b.firstNumber : undefined })
    const id = ctx.nums.length
    // List text starts at the numbering's indent; equations' notes still reach the margin.
    const itemCtx: Ctx = { ...ctx, indent: 0, inList: true }
    return listItems(b.children).flatMap(({ item, subs }) => {
      const own = out.block(item, itemCtx)
      const first = own[0]
      const marked: Item[] = first && !('xml' in first)
        ? [{ props: { ...first.props, num: { id, level }, indent: undefined }, content: first.content }, ...own.slice(1)]
        : [{ props: { num: { id, level } }, content: '' }, ...own]
      const nested = subs.flatMap((s) => {
        const sub = s.kind === BLOCK_KIND.layout ? listLayoutOf(s) : undefined
        return sub ? sub.items(s as LayoutBlock, ctx, Math.min(level + 1, ListLayout.DEEPEST), out) : out.block(s, itemCtx)
      })
      return [...marked, ...nested]
    })
  }
}

/** `@layout.titlepage`: the title, large and bold, the lines centred under it, on a page of their own. */
class TitlePageLayout extends Layout {
  /**
   * How LaTeX sets it: its environment, the title's size (\LARGE, bold: about
   * 17 pt over 10 pt text, as a lab report's title usually is), and the space
   * under the title.
   */
  private static readonly LATEX = { environment: 'titlepage', titleSize: '\\LARGE', gap: '2em' } as const

  latex(b: LayoutBlock, title: string, out: LatexOut): string {
    const { environment, titleSize, gap } = TitlePageLayout.LATEX
    return [
      `\\begin{${environment}}`,
      '\\centering',
      '\\vspace*{\\fill}',
      title ? `{${titleSize}\\bfseries ${title}\\par}` : '',
      title && b.children.length ? `\\vspace{${gap}}` : '',
      out.join(b.children),
      '\\vspace*{\\fill}',
      `\\end{${environment}}`,
    ].filter(Boolean).join('\n')
  }

  docx(b: LayoutBlock, ctx: Ctx, _title: Item[], out: DocxOut): Item[] {
    // In Word's Title style, a way down the page; then the lines centred, then a new page.
    return [
      ...(b.title ? [{
        props: { style: TITLE_STYLE, before: SPACING.titlePage },
        content: titleRuns(b.title, { bold: true, size: fontSizeOf(ctx.o) + TITLE_PAGE_SIZE_STEP }),
      }] : []),
      ...(b.note ? [{ props: { jc: ALIGN.center, after: SPACING.author }, content: titleRuns(b.note) }] : []),
      ...out.blocks(b.children, { ...ctx, center: true }),
      { xml: PAGE_BREAK },
    ]
  }
}

/** Each layout's class; a block with none (`@layout.val`) keeps its lines as they are. */
const LAYOUTS: Record<LayoutStyle, Layout> = {
  text: new PlainLayout(),
  list: new ListLayout(false),
  numbered: new ListLayout(true),
  center: new CenterLayout(),
  titlepage: new TitlePageLayout(),
}
const NO_LAYOUT = LAYOUTS[LAYOUT_STYLE.text]

/** A block's layout. */
const layoutOf = (b: LayoutBlock): Layout => (b.style ? LAYOUTS[b.style] : NO_LAYOUT)

/**
 * `@layout.column`: the block's columns (columnGrid) side by side, row by row,
 * under its title; each column laid out as the block's layout says.
 */
class ColumnArrangement extends Layout {
  /** LaTeX: each column a minipage, the gap between them LaTeX's own between columns, and a little space between rows. */
  private static readonly LATEX = { gap: '\\columnsep', rowGap: '\\medskip' } as const
  /** Word: the gap between columns, in twips (about 0.6 cm). */
  private static readonly DOCX_GAP = 340

  latex(b: LayoutBlock, title: string, out: LatexOut): string {
    const { gap, rowGap } = ColumnArrangement.LATEX
    const { perRow, rows } = columnParts(b)
    const layout = layoutOf(b)
    const width = `\\dimexpr(\\linewidth-${perRow - 1}${gap})/${perRow}\\relax`
    // (Each column's equations have its share of the line, which decides which might not fit.)
    const column = out.within(1 / perRow)
    const row = (cells: LayoutBlock[]) => `\\noindent\n${cells
      // (\vspace{0pt}: the columns' tops line up, whatever each starts with.)
      .map((part) => [`\\begin{minipage}[t]{${width}}\\vspace{0pt}`, layout.latex(part, '', column), '\\end{minipage}'].join('\n'))
      .join(`%\n\\hspace{${gap}}%\n`)}\\par`
    // (A run-in title, \paragraph, needs something after it to be on a line of its own above
    // the columns; that empty line is taken back.)
    const heading = title && `${paragraph(title)}\\mbox{}\\par\\nobreak\\vspace{-\\baselineskip}`
    return [heading, rows.map(row).join(`\n${rowGap}\n`)].filter(Boolean).join('\n')
  }

  docx(b: LayoutBlock, ctx: Ctx, title: Item[], out: DocxOut): Item[] {
    const gap = ColumnArrangement.DOCX_GAP
    const { perRow, rows } = columnParts(b)
    const layout = layoutOf(b)
    const width = ctx.width - ctx.indent
    const cellWidth = Math.floor(width / perRow)
    // (A cell's margins are inside its width: half the gap on each side.)
    const inner: Ctx = { ...ctx, width: cellWidth - gap, indent: 0 }
    const cell = (part: LayoutBlock | undefined) => {
      const items = part ? layout.docx(part, inner, [], out) : []
      // A cell has to end with a paragraph.
      if (!items.length || 'xml' in items[items.length - 1]) items.push({ props: { after: 0 }, content: '' })
      return `<w:tc><w:tcPr><w:tcW w:w="${cellWidth}" w:type="dxa"/></w:tcPr>${items.map(itemXml).join('')}</w:tc>`
    }
    const tableRows = rows.map((cells) => `<w:tr>${Array.from({ length: perRow }, (_, i) => cell(cells[i])).join('')}</w:tr>`)
    const table = `<w:tbl><w:tblPr><w:tblW w:w="${width}" w:type="dxa"/>${ctx.indent ? `<w:tblInd w:w="${ctx.indent}" w:type="dxa"/>` : ''}`
      + `<w:tblLayout w:type="fixed"/><w:tblCellMar><w:left w:w="${gap / 2}" w:type="dxa"/><w:right w:w="${gap / 2}" w:type="dxa"/></w:tblCellMar>`
      + '<w:tblLook w:val="0000"/></w:tblPr>'
      + `<w:tblGrid>${`<w:gridCol w:w="${cellWidth}"/>`.repeat(perRow)}</w:tblGrid>`
      + `${tableRows.join('')}</w:tbl>`
    // Space after it (two tables in a row would otherwise merge).
    return [...title, { xml: table }, { props: { after: 0 }, content: '' }]
  }
}
const COLUMNS = new ColumnArrangement()

/** How a block is arranged: in columns, or as its layout alone. */
const arrangementOf = (b: LayoutBlock): Layout => (b.columns ? COLUMNS : layoutOf(b))

/** A block's layout, if it's a list (a sub-list, inside another's item). */
const listLayoutOf = (b: Block): ListLayout | undefined => {
  const layout = b.kind === BLOCK_KIND.layout ? layoutOf(b) : undefined
  return layout instanceof ListLayout ? layout : undefined
}

/** `@layout.numbered Title { … }` and the other layouts: lines arranged, shown as its display settings say. */
export class LayoutConstruct extends Construct<LayoutBlock> {
  readonly kind = BLOCK_KIND.layout

  latex(b: LayoutBlock, out: LatexOut): string {
    if (b.error && !b.children.length) return errorComment(b.line, LAYOUT_SYNTAX.openerOf(b), b.error)
    if (b.command === LINE_COMMAND.hide) return ''
    return arrangementOf(b).latex(b, latexHeading(b.title && titleToLatex(b.title), b.note), out)
  }

  docx(b: LayoutBlock, ctx: Ctx, out: DocxOut): Item[] {
    if (b.command === LINE_COMMAND.hide || (b.error && !b.children.length)) return []
    const title: Item[] = b.title || b.note
      ? [{ props: { ...baseProps(ctx), keepNext: true, ...SPACING.title }, content: docxHeading(b.title, b.note) }]
      : []
    return arrangementOf(b).docx(b, ctx, title, out)
  }

  notes(b: LayoutBlock, notesOf: (blocks: Block[]) => string[]): string[] {
    return notesOf(b.children)
  }
}

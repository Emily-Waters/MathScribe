/**
 * The construct for `@layout` blocks, and one class for each layout: how its
 * lines are arranged in each export. A block with no layout (`@layout.val { }`,
 * only display settings) keeps its lines as they are.
 */
import { BLOCK_KIND, type Block, type LayoutBlock } from '../blocks.ts'
import { listItems } from '../document.ts'
import { LAYOUT_STYLE, LINE_COMMAND, layoutOpenerText, type LayoutStyle } from '../syntax.ts'
import { ALIGN } from '../alignment.ts'
import { errorComment, heading as latexHeading, titleToLatex } from '../latexKit.ts'
import {
  PAGE_BREAK, SPACING, TITLE_PAGE_SIZE_STEP, TITLE_STYLE, baseProps, fontSizeOf, heading as docxHeading, titleRuns,
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
    return [paragraph(title), `\\begin{${env}}`, body, `\\end{${env}}`].filter(Boolean).join('\n')
  }

  docx(b: LayoutBlock, ctx: Ctx, title: Item[], out: DocxOut): Item[] {
    return [...title, ...this.items(b, ctx, 0, out)]
  }

  /** A list's items as Word list paragraphs (and the sub-lists indented under them, a level deeper). */
  private items(b: LayoutBlock, ctx: Ctx, level: number, out: DocxOut): Item[] {
    ctx.nums.push({ abstract: this.numbered ? 1 : 0 })
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

/** A block's layout, if it's a list (a sub-list, inside another's item). */
const listLayoutOf = (b: Block): ListLayout | undefined => {
  const layout = b.kind === BLOCK_KIND.layout ? layoutOf(b) : undefined
  return layout instanceof ListLayout ? layout : undefined
}

/** `@layout.numbered Title { … }` and the other layouts: lines arranged, shown as its display settings say. */
export class LayoutConstruct extends Construct<LayoutBlock> {
  readonly kind = BLOCK_KIND.layout

  latex(b: LayoutBlock, out: LatexOut): string {
    if (b.error && !b.children.length) return errorComment(b.line, layoutOpenerText(b.members ?? [b.style ?? LAYOUT_STYLE.list], b.title), b.error)
    if (b.command === LINE_COMMAND.hide) return ''
    return layoutOf(b).latex(b, latexHeading(b.title && titleToLatex(b.title), b.note), out)
  }

  docx(b: LayoutBlock, ctx: Ctx, out: DocxOut): Item[] {
    if (b.command === LINE_COMMAND.hide || (b.error && !b.children.length)) return []
    const title: Item[] = b.title || b.note
      ? [{ props: { ...baseProps(ctx), keepNext: true, ...SPACING.title }, content: docxHeading(b.title, b.note) }]
      : []
    return layoutOf(b).docx(b, ctx, title, out)
  }

  notes(b: LayoutBlock, notesOf: (blocks: Block[]) => string[]): string[] {
    return notesOf(b.children)
  }
}

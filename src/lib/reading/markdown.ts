/**
 * An `@layout.text` block read as Markdown: paragraphs (lines running together
 * until a blank line), headings of its own (`# Method`, not numbered), bulleted
 * and numbered lists (`- item`, `1. item`, nested by indenting), quotes (`> …`),
 * rules (`---`) and displayed maths (`$$…$$`). What's in the text (emphasis,
 * links, `$…$`, `{{values}}`) is read where the text is drawn (output/textSegments.ts).
 * The syntax is in syntax/text.ts.
 */
import {
  DISPLAY_MATHS_MARK, LAYOUT_STYLE, LIST_MARKER, TEXT_BULLET, TEXT_HEADING, TEXT_HEADING_LEVELS, TEXT_NUMBERED, TEXT_QUOTE, TEXT_RULE,
  bracesBalance,
} from '../syntax.ts'
import { BLOCK_KIND, type Block, type LatexBlock, type LayoutBlock, type TextBlock } from '../sheet/blocks.ts'
import type { Line } from './reader.ts'
import type { SheetReader } from './sheetReader.ts'

/** A list being read: its block, how far its items are indented, and whether it's numbered. */
interface OpenList {
  block: LayoutBlock
  indent: number
  numbered: boolean
}

/** A paragraph being read (prose, a quote or a list's item): its block, and its lines so far. */
interface OpenText {
  block: TextBlock
  lines: string[]
}

/** Displayed maths being read, `$$…$$` over several lines: its block, and its lines so far. */
interface OpenMaths {
  block: LatexBlock
  lines: string[]
}

/** Reads a text block's lines, one at a time, into its children. */
export class MarkdownReader {
  private readonly sheet: SheetReader
  private readonly into: Block[]
  private text: OpenText | undefined
  private maths: OpenMaths | undefined
  /** The lists open, the outermost first. */
  private lists: OpenList[] = []

  /** `into`: the text block's children. */
  constructor(sheet: SheetReader, into: Block[]) {
    this.sheet = sheet
    this.into = into
  }

  /** A blank line: it ends a paragraph, a quote and a list (displayed maths goes on). */
  blank(): void {
    if (this.maths) return
    this.endText()
    this.lists = []
  }

  /** A line of the block, not blank. */
  line({ number, indent, trimmed }: Line): void {
    if (this.maths) {
      this.carryOnMaths(trimmed, number)
      return
    }
    if (trimmed.startsWith(DISPLAY_MATHS_MARK)) {
      this.endAll()
      this.startMaths(trimmed, number)
      return
    }
    if (TEXT_RULE.test(trimmed)) {
      this.endAll()
      this.into.push({ kind: BLOCK_KIND.rule, line: number })
      return
    }
    const heading = TEXT_HEADING.exec(trimmed)?.groups
    if (heading) {
      this.endAll()
      const level = Math.min(heading.marks.length, TEXT_HEADING_LEVELS)
      this.into.push({ kind: BLOCK_KIND.text, line: number, heading: level, ...this.sheet.withValues(heading.text) })
      return
    }
    const bullet = TEXT_BULLET.exec(trimmed)?.groups
    const numbered = TEXT_NUMBERED.exec(trimmed)?.groups
    if (bullet || numbered) {
      this.item(number, indent, bullet ? bullet.text : numbered!.text, numbered ? Number(numbered.number) : undefined)
      return
    }
    const quote = TEXT_QUOTE.exec(trimmed)?.groups
    if (quote) {
      // (A quote carries on over the lines after it that start with > too.)
      if (!this.text?.block.quote) {
        this.endAll()
        this.startText(this.into, number, { quote: true })
      }
      this.text!.lines.push(quote.text)
      return
    }
    // Anything else carries on what's open (a paragraph, a quote, a list's item), or starts a paragraph.
    if (!this.text) this.startText(this.into, number)
    this.text!.lines.push(trimmed)
  }

  /** The block's end: whatever's still open is finished. */
  end(): void {
    this.endAll()
    if (this.maths) {
      this.maths.block.error = `Displayed maths starting ${DISPLAY_MATHS_MARK} is missing its closing ${DISPLAY_MATHS_MARK}.`
      this.endMaths()
    }
  }

  /** A list's item, at an indentation: in the list open there, or a list of its own (nested in the item before it, if indented further). */
  private item(line: number, indent: number, text: string, number: number | undefined): void {
    this.endText()
    const numbered = number !== undefined
    // Lists indented further than this item end with it.
    while (this.lists.length && this.lists.at(-1)!.indent > indent) this.lists.pop()
    const open = this.lists.at(-1)
    // A different kind of list at the same indentation ends the one open there.
    if (open && open.indent === indent && open.numbered !== numbered) this.lists.pop()
    let list = this.lists.at(-1)
    if (!list || list.indent < indent) {
      const parent = list
      const block: LayoutBlock = {
        kind: BLOCK_KIND.layout, line, title: '', children: [], indent, style: LAYOUT_STYLE.list,
        ...(numbered && { marker: LIST_MARKER.number }),
        ...(numbered && number !== 1 && { firstNumber: number }),
        // (A list inside another's item follows that item: see listItems.)
        ...(parent && { nested: true }),
      }
      ;(parent ? parent.block.children : this.into).push(block)
      list = { block, indent, numbered }
      this.lists.push(list)
    }
    this.startText(list.block.children, line)
    this.text!.lines.push(text)
  }

  /** Start a paragraph (or a quote, or an item) in `into`. */
  private startText(into: Block[], line: number, fields: Partial<TextBlock> = {}): void {
    this.endText()
    const block: TextBlock = { kind: BLOCK_KIND.text, line, text: '', ...fields }
    into.push(block)
    this.text = { block, lines: [] }
  }

  /** Finish the paragraph open: its lines run together, with `{{values}}` in it worked out. */
  private endText(): void {
    if (!this.text) return
    Object.assign(this.text.block, this.sheet.withValues(this.text.lines.join(' ')))
    this.text = undefined
  }

  /** Finish everything open but displayed maths. */
  private endAll(): void {
    this.endText()
    this.lists = []
  }

  /** `$$…`: displayed maths, finished on this line if it ends with `$$` too. */
  private startMaths(trimmed: string, line: number): void {
    const block: LatexBlock = { kind: BLOCK_KIND.latex, line, latex: '' }
    this.into.push(block)
    this.maths = { block, lines: [] }
    this.carryOnMaths(trimmed.slice(DISPLAY_MATHS_MARK.length), line)
  }

  /** A line of displayed maths: the last, if it ends with `$$`. */
  private carryOnMaths(text: string, line: number): void {
    const maths = this.maths!
    const closes = text.endsWith(DISPLAY_MATHS_MARK)
    const latex = (closes ? text.slice(0, -DISPLAY_MATHS_MARK.length) : text).trim()
    if (latex) maths.lines.push(latex)
    if (!closes) return
    if (line > maths.block.line) maths.block.endLine = line
    this.endMaths()
  }

  /** Finish the displayed maths: its lines, and whether its braces balance. */
  private endMaths(): void {
    const { block, lines } = this.maths!
    block.latex = lines.join('\n')
    if (!block.error && !block.latex) block.error = `Displayed maths has nothing between its ${DISPLAY_MATHS_MARK} marks.`
    else if (!block.error && !bracesBalance(block.latex)) block.error = 'Displayed maths has a { without its } (or a } without its {).'
    this.maths = undefined
  }
}

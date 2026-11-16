/**
 * Reading a sheet: its lines, one at a time, each offered to the readers in turn
 * (readers.ts), into blocks; and what the readers share while it's read: the
 * Calculator, the blocks open around the line, the blank lines before it, and
 * the section numbers so far.
 */
import { Calculator, markupText, outsideMaths, sheetModules, type CalcOptions } from '../engine/index.ts'
import type { VariableSummary } from '../values.ts'
import { BLOCK_CLOSE, EXACT_SETTING, LAYOUT_STYLE, LINE_COMMAND, SIGIL, VALUE_IN_TEXT, isComment, type Notation } from '../syntax.ts'
import { BLOCK_KIND, type Block, type Command, type GroupBlock, type LayoutBlock } from '../blocks.ts'
import { closesBlock, openerText, parseConstantDeclaration } from './lineSyntax.ts'
import { Line, readsLines, type LineReader } from './reader.ts'
import { lineReaders } from './readers.ts'

/** A whole sheet, evaluated: its blocks, and the variables it ends with. */
export interface Sheet {
  blocks: Block[]
  variables: VariableSummary[]
}

/** A block that holds the lines after it until it's closed: a `{ }` group, a layout block, or a sub-list. */
export type OpenBlock = GroupBlock | LayoutBlock

export class SheetReader {
  readonly lines: readonly string[]
  readonly calc: Calculator
  /** The sheet's blocks at the top. */
  readonly root: Block[] = []
  /** Blocks currently open, innermost last: `{ }` groups, `@layout.list { }` layout blocks, and the sub-lists indented inside lists. */
  readonly open: OpenBlock[] = []
  /** The index of the line being read; a reader that takes the lines after it moves this to its last. */
  index = 0
  /** Consecutive blank lines just before the line being read. */
  blankRun = 0
  /** Sections and subsections so far, as LaTeX numbers them. */
  section = 0
  subsection = 0
  /** Where each constant is declared sheet-wide (`@c:4`), by its inside name: the first declaration's line. */
  readonly declaredAt = new Map<string, number>()
  /** Lines declaring a constant that's declared already, with the warning each gets. */
  readonly duplicateDeclarations = new Map<number, string>()
  /** The readers each line is offered to: the modules' first (chemistry's `@chem.species { }`), then MathScribe's own. */
  private readonly readers: readonly LineReader[]

  constructor(source: string, options: CalcOptions) {
    this.lines = source.split(/\r?\n/)
    const modules = sheetModules()
    this.calc = new Calculator(options, modules)
    this.readers = [...modules.filter(readsLines).flatMap((m) => m.lineReaders()), ...lineReaders()]
  }

  /** Read and evaluate the whole sheet, line by line, into blocks. */
  read(): Sheet {
    // What applies to the whole sheet, above where it's written too, first.
    for (const r of this.readers) r.prepare(this)
    for (this.index = 0; this.index < this.lines.length; this.index++) this.readLine(new Line(this.index, this.lines[this.index]))
    this.closeAll()
    // The variables are listed when first asked for (for hover information): with
    // imported data there can be thousands, and most edits never need them. (Not
    // enumerable, so code that walks the sheet's properties doesn't list them all.)
    let variables: VariableSummary[] | undefined
    return Object.defineProperty({ blocks: this.root }, 'variables', {
      get: () => (variables ??= this.calc.variables()), enumerable: false,
    }) as Sheet
  }

  private readLine(line: Line): void {
    if (!line.trimmed) {
      this.blankRun++
      return
    }
    // A comment is as if it weren't there: it doesn't end a block, or break up blank lines.
    if (isComment(line.trimmed)) return
    // A sub-list ends at the first line indented no further than the items it's under.
    while (this.inSubList() && line.indent <= (this.open.at(-1) as LayoutBlock).indent) this.closeLayout()
    // In a list, a line indented further than the items starts a sub-list.
    const top = this.open.at(-1)
    if (top?.kind === BLOCK_KIND.layout && !closesBlock(line.trimmed)) {
      top.itemIndent ??= line.indent
      if (line.indent > top.itemIndent && isList(top) && top.children.length) {
        const sub: LayoutBlock = {
          kind: BLOCK_KIND.layout, line: line.number, title: '', style: top.style, children: [], nested: true,
          indent: top.itemIndent, itemIndent: line.indent,
        }
        this.add(sub)
        this.open.push(sub)
      }
    }
    // One blank line is just for readability; two or more leave a gap in the
    // output (always one line's worth). Not at the very start of a block, not
    // before a closing brace, and not between list items.
    const parent = this.open.at(-1)
    const container = parent?.children ?? this.root
    const inList = parent?.kind === BLOCK_KIND.layout && isList(parent)
    if (this.blankRun >= 2 && container.length && !closesBlock(line.trimmed) && !inList) this.add({ kind: BLOCK_KIND.spacer, line: line.number })
    this.blankRun = 0

    for (const r of this.readers) if (r.read(line, this)) return
  }

  // -------------------------------------------------------------------------
  // What readers share
  // -------------------------------------------------------------------------

  /** Add a block where the line is: in the innermost open block, or at the top. */
  add(b: Block): void {
    (this.open.at(-1)?.children ?? this.root).push(b)
  }

  /**
   * Text with each `{{x}}` (outside `$…$`) as x's value at this point in the
   * sheet, and the modules' notation (a formula, `{Na^+}`) as they draw it, in inline maths; and what's
   * wrong with the first value that can't be worked out.
   */
  withValues(text: string): { text: string; error?: string } {
    if (!text.includes('{')) return { text }
    let error: string | undefined
    const filled = outsideMaths(text, (part) => part.replace(VALUE_IN_TEXT, (whole, source: string) => {
      const v = this.calc.inlineValue(source)
      if (v.tex !== undefined) return `$${v.tex}$`
      error ??= `${whole}: ${v.error}`
      return whole
    }))
    return { text: markupText(filled), error }
  }

  /** The command the nearest open block that has one gives the lines inside it. */
  get inheritedCommand(): Command | undefined {
    return [...this.open].reverse().find((g) => g.command)?.command
  }

  /** `#hide` from the blocks around, if they say it (a block hides what's in it, whatever else it says). */
  get inheritedHide(): Command | undefined {
    return this.inheritedCommand === LINE_COMMAND.hide ? LINE_COMMAND.hide : undefined
  }

  /** Whether a block around the line puts each = on its own row. */
  get inheritedMultiline(): boolean {
    return this.open.some((g) => g.multiline)
  }

  /** The notation the nearest open block that has one gives the lines inside it. */
  get inheritedNotation(): Notation | undefined {
    return [...this.open].reverse().find((g) => g.notation)?.notation
  }

  /** Whether the innermost open block is a sub-list (which ends where its indentation does). */
  inSubList(): boolean {
    const top = this.open.at(-1)
    return top?.kind === BLOCK_KIND.layout && !!top.nested
  }

  /** Close the innermost layout block: at its `}` line, or for a sub-list, at its last line. */
  closeLayout(closingLine?: number): void {
    const layout = this.open.pop() as LayoutBlock
    layout.endLine = closingLine ?? (layout.children.length ? lastLine(layout.children.at(-1)!) : layout.line)
    if (!layout.children.length && !layout.nested) {
      layout.error = `${openerText(layout)} is empty: put the lines that belong to it before its ${BLOCK_CLOSE}.`
    }
  }

  /** The note shown on a line declaring a constant sheet-wide (`@c:4`): what it does. */
  declarationInfo(body: string, line: number): string | undefined {
    const d = parseConstantDeclaration(body)
    if (!d || this.declaredAt.get(d.key) !== line) return undefined
    const parts = [
      d.precision === undefined ? '' : d.precision === EXACT_SETTING ? 'at full precision' : `to ${d.precision} sig figs`,
      d.unit === undefined ? '' : `in ${d.unit}`,
    ].filter(Boolean).join(', ')
    const unless = d.precision === undefined ? '' : ', unless written with its own :n'
    return `Every ${SIGIL}${d.name} in this sheet uses this value, ${parts}${unless}.`
  }

  /** Close anything left open at the end, so its locals don't leak into the top level. */
  private closeAll(): void {
    while (this.open.length) {
      const block = this.open.at(-1)!
      if (block.kind === BLOCK_KIND.layout) {
        const subList = !!block.nested
        this.closeLayout(subList ? undefined : this.lines.length)
        block.error ??= subList ? undefined : `${openerText(block)} on line ${block.line} is missing its closing ${BLOCK_CLOSE}.`
        continue
      }
      this.open.pop()
      block.locals = this.calc.popScope()
      block.endLine = this.lines.length
      block.error = `Block opened on line ${block.line} is missing its closing ${BLOCK_CLOSE}.`
    }
  }
}

/** A block's last line: where it ends, or the line it's on. */
const lastLine = (b: Block): number => ('endLine' in b && b.endLine) || b.line

/** Whether a layout block is a list (bulleted or numbered), whose items can have sub-lists. */
const isList = (b: LayoutBlock) => b.style === LAYOUT_STYLE.list || b.style === LAYOUT_STYLE.numbered

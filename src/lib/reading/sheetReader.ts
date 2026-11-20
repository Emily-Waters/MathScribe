/**
 * Reading a sheet: its tree (src/lib/tree), node by node, each read by the
 * reader of its kind (readers.ts), into blocks; and what the readers share while
 * it's read: the Calculator, the blocks open around the line, the blank lines
 * before it, and the section numbers so far.
 */
import { Calculator, markupText, outsideMaths, sheetModules, type CalcOptions, type EngineModule } from '../engine/index.ts'
import type { VariableSummary } from '../sheet/values.ts'
import {
  BLOCK_CLOSE, CARRIED_JOIN, EXACT_SETTING, LAYOUT_STYLE, LAYOUT_SYNTAX, LINE_COMMAND, SIGIL, VALUE_IN_TEXT, closesBlock, joinSplit, splitNote, type Notation,
} from '../syntax.ts'
import { BLOCK_KIND, type Block, type Command, type GroupBlock, type LayoutBlock } from '../sheet/blocks.ts'
import {
  NODE_KIND, TOKEN_KIND, encode, isBlockKind, isToken, notedOf, splitLines, startsByClosing, textOf, trailingSeparatorAt, type SyntaxNode,
} from '../tree/index.ts'
import { parseConstantDeclaration } from './lineSyntax.ts'
import { Line, readsLines, type NodeReader, type TreeItem } from './reader.ts'
import { lineReaders } from './readers.ts'

/** A whole sheet, evaluated: its blocks, and the variables it ends with. */
export interface Sheet {
  blocks: Block[]
  variables: VariableSummary[]
}

/** A block that holds the lines after it until it's closed: a `{ }` group, a layout block, or a sub-list. */
export type OpenBlock = GroupBlock | LayoutBlock

export class SheetReader {
  /** The sheet's lines, as written (without what ends each). */
  readonly lines: readonly string[]
  /** The sheet's tree, as items: where each node is (its lines), at the top. */
  readonly items: readonly TreeItem[]
  readonly calc: Calculator
  /** The sheet's blocks at the top. */
  readonly root: Block[] = []
  /** Blocks currently open, innermost last: `{ }` groups, `@layout.list { }` layout blocks, and the sub-lists indented inside lists. */
  readonly open: OpenBlock[] = []
  /** Consecutive blank lines just before the line being read. */
  blankRun = 0
  /** Sections and subsections so far, as LaTeX numbers them. */
  section = 0
  subsection = 0
  /** Where each constant is declared sheet-wide (`@c:4`), by its inside name: the first declaration's line. */
  readonly declaredAt = new Map<string, number>()
  /** Lines declaring a constant that's declared already, with the warning each gets. */
  readonly duplicateDeclarations = new Map<number, string>()
  /** The readers: the modules' first (chemistry's `@chem.species { }`), then MathScribe's own. */
  private readonly readers: readonly NodeReader[]
  /** The reader of each kind of node. */
  private readonly readerOf = new Map<string, NodeReader>()

  /** `modules`: what the sheet is worked out with, every module installed unless given (a test's own, say). */
  constructor(source: string, options: CalcOptions, modules: EngineModule[] = sheetModules()) {
    // (The modules first: installing one declares its kinds of line, which reading the tree needs.)
    this.calc = new Calculator(options, modules)
    this.lines = splitLines(source).map((l) => l.text)
    this.items = itemsOf(encode(source).body, { at: 0 })
    this.readers = [...modules.filter(readsLines).flatMap((m) => m.lineReaders()), ...lineReaders()]
    for (const reader of this.readers) {
      for (const kind of reader.kinds) {
        if (this.readerOf.has(kind)) throw new Error(`Two readers read "${kind}" nodes.`)
        this.readerOf.set(kind, reader)
      }
    }
  }

  /** Read and evaluate the whole sheet, node by node, into blocks. */
  read(): Sheet {
    // What applies to the whole sheet, above where it's written too, first.
    for (const r of this.readers) r.prepare(this)
    this.readItems(this.items)
    this.closeAll()
    // The variables are listed when first asked for (for hover information): with
    // imported data there can be thousands, and most edits never need them. (Not
    // enumerable, so code that walks the sheet's properties doesn't list them all.)
    let variables: VariableSummary[] | undefined
    return Object.defineProperty({ blocks: this.root }, 'variables', {
      get: () => (variables ??= this.calc.variables()), enumerable: false,
    }) as Sheet
  }

  /** Nodes read in order (a block's body, or the sheet's top), each by its kind's reader. */
  readItems(items: readonly TreeItem[]): void {
    for (const item of items) this.readItem(item)
  }

  /** Every item, at any depth, in the order they're written (for what's read before the rest). */
  *allItems(items: readonly TreeItem[] = this.items): Generator<TreeItem> {
    for (const item of items) {
      yield item
      yield* this.allItems(item.body)
    }
  }

  private readItem(item: TreeItem): void {
    const { line } = item
    if (item.node.kind === NODE_KIND.blank) {
      this.blankRun++
      return
    }
    // A comment is as if it weren't there: it doesn't end a block, or break up blank lines.
    if (item.node.kind === NODE_KIND.comment) return
    this.beforeLine(line)
    // (A kind with no reader, which the sheet's grammar doesn't put here, is read as a calculation.)
    ;(this.readerOf.get(lineKindOf(item.node)) ?? this.readerOf.get(NODE_KIND.calc)!).read(item, this)
  }

  /** Before a line that's read (not blank, not a comment): sub-lists that end or start at it, and the gap blank lines before it leave. */
  private beforeLine(line: Line): void {
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
    // In columns, any blank line starts the next column instead.
    const columns = parent?.kind === BLOCK_KIND.layout ? parent.columns : undefined
    if (columns) {
      if (this.blankRun && container.length && !closesBlock(line.trimmed) && columns.breaks.at(-1) !== container.length) columns.breaks.push(container.length)
    } else if (this.blankRun >= 2 && container.length && !closesBlock(line.trimmed) && !inList) {
      this.add({ kind: BLOCK_KIND.spacer, line: line.number })
    }
    this.blankRun = 0
  }

  /**
   * A block's closing line, `}`: it ends the innermost open block (and any
   * sub-lists in it), a `{ }` group or an `@layout.list { }`.
   */
  closeAt(closer: Line): void {
    this.beforeLine(closer)
    while (this.inSubList()) this.closeLayout()
    const block = this.open.at(-1)
    if (block?.kind === BLOCK_KIND.layout) {
      this.closeLayout(closer.number)
    } else if (block) {
      this.open.pop()
      block.locals = this.calc.popScope()
      block.endLine = closer.number
    }
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
      layout.error = `${LAYOUT_SYNTAX.openerOf(layout)} is empty: put the lines that belong to it before its ${BLOCK_CLOSE}.`
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
        block.error ??= subList ? undefined : `${LAYOUT_SYNTAX.openerOf(block)} on line ${block.line} is missing its closing ${BLOCK_CLOSE}.`
        continue
      }
      this.open.pop()
      block.locals = this.calc.popScope()
      block.endLine = this.lines.length
      block.error = `Block opened on line ${block.line} is missing its closing ${BLOCK_CLOSE}.`
    }
  }
}

/** A line node's text, as written, without what ends it (nor the part at `leaving`, if given). */
const rawOf = (node: SyntaxNode, leaving = -1): string =>
  node.parts.map((p, i) => (i === leaving || (isToken(p) && p.t === TOKEN_KIND.eol) ? '' : textOf(p))).join('')

/** A node kept as rows (imported data's): each row, as written. */
function rowsOf(node: SyntaxNode): string[] {
  const text = node.parts.map((p) => (isToken(p) ? p.text : '')).join('')
  const rows = splitLines(text).map((l) => l.text)
  // (Its last row's line ending is its own: nothing comes after it.)
  if (rows.length > 1 && rows.at(-1) === '') rows.pop()
  return rows
}

/** The kind of line a node is read as: a line carried on over several is read as its first line's kind (a calculation, a constant). */
function lineKindOf(node: SyntaxNode): string {
  if (node.kind !== NODE_KIND.continued) return node.kind
  const first = node.parts.find((p): p is SyntaxNode => !isToken(p))
  return first?.kind ?? node.kind
}

/**
 * A line carried on over several while its brackets are open (the tree's
 * `continued` node), as one line where its first is: its lines' text joined,
 * and their bodies, #commands and notes (joinSplit). Comments among them are
 * left out, and so is a trailing comma before a closing bracket (`5678,` then
 * `)`), which is allowed there though a call on one line can't have one.
 */
function continuedLine(lines: readonly SyntaxNode[], index: number): Line {
  const said = lines.filter((l) => l.kind !== NODE_KIND.comment)
  const texts = said.map((l, i) => {
    const comma = trailingSeparatorAt(l)
    const next = said[i + 1]
    const trailing = comma >= 0 && next !== undefined && startsByClosing(rawOf(next))
    return trailing ? rawOf(l, comma).trim() : rawOf(l).trim()
  })
  // (A line with its comma left out is split again: the tree's split of it has the comma.)
  const splits = said.map((l, i) => (texts[i] === rawOf(l).trim() ? notedOf(l) : undefined) ?? splitNote(texts[i]))
  const [first] = lines[0].parts
  const indent = isToken(first) && first.t === TOKEN_KIND.indent ? first.text : ''
  return new Line(index, indent + texts.join(CARRIED_JOIN), joinSplit(splits))
}

/** Nodes as items, where each is in the sheet: `cursor.at` is the index of the next line, moved on past theirs. */
function itemsOf(nodes: readonly SyntaxNode[], cursor: { at: number }): TreeItem[] {
  return nodes.map((node): TreeItem => {
    const children = node.parts.filter((p): p is SyntaxNode => !isToken(p))
    // A line carried on over the lines after it: one line, ending at its last.
    if (node.kind === NODE_KIND.continued) {
      const line = continuedLine(children, cursor.at)
      cursor.at += children.length
      return { node, line, body: [], rows: [], last: cursor.at - 1 }
    }
    // A line (the nodes in it, if any, are its expression's).
    if (!isBlockKind(node.kind)) {
      if (node.parts.some((p) => isToken(p) && p.t === TOKEN_KIND.rows)) {
        const rows = rowsOf(node).map((text) => new Line(cursor.at++, text))
        return { node, line: rows[0], body: [], rows, last: cursor.at - 1 }
      }
      const line = new Line(cursor.at++, rawOf(node), notedOf(node))
      return { node, line, body: [], rows: [], last: line.index }
    }
    // A block: its opener, its body, and its closing line if its last part is one.
    const [opener, ...rest] = children
    const closerNode = rest.at(-1)?.kind === NODE_KIND.blockCloser ? rest.pop() : undefined
    const line = new Line(cursor.at++, rawOf(opener), notedOf(opener))
    const body = itemsOf(rest, cursor)
    const closer = closerNode ? new Line(cursor.at++, rawOf(closerNode), notedOf(closerNode)) : undefined
    return { node, line, body, closer, rows: [], last: cursor.at - 1 }
  })
}

/** A block's last line: where it ends, or the line it's on. */
const lastLine = (b: Block): number => ('endLine' in b && b.endLine) || b.line

/** Whether a layout block is a list (bulleted or numbered), whose items can have sub-lists. */
const isList = (b: LayoutBlock) => b.style === LAYOUT_STYLE.list || b.style === LAYOUT_STYLE.numbered

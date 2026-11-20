/**
 * Readers: each reads one kind of node of a sheet's tree (src/lib/tree) into
 * blocks. The tree says what each line is, and which lines a block holds, so a
 * reader is chosen by its node's kind, and a block's reader takes its lines from
 * its node rather than looking ahead through the text for its end.
 *
 * Readers go by what's written, not by the block it makes: `@latex { }` and a
 * reaction on a line of its own both make a LaTeX block, and three readers make
 * layout blocks. (How a block is written to each export is its construct's, in
 * constructs/.)
 */
import { indentOf, splitNote, type SplitLine } from '../syntax.ts'
import type { Block } from '../sheet/blocks.ts'
import { NODE_KIND, type SyntaxNode } from '../tree/index.ts'
import type { SheetReader } from './sheetReader.ts'

/** A line of the sheet, where it is. */
export class Line {
  /** Its index in the sheet's lines (from 0). */
  readonly index: number
  /** As written (without what ends it); for a line carried on over several, their text joined by a space, at the first's indentation. */
  readonly raw: string
  /** Without spaces at either end. */
  readonly trimmed: string
  /** How far it's indented, in spaces. */
  readonly indent: number
  private split: SplitLine | undefined

  /** `noted`: its body, #commands and note, if the tree read them already (tree/lines.ts notedOf). */
  constructor(index: number, raw: string, noted?: SplitLine) {
    this.index = index
    this.raw = raw
    this.trimmed = raw.trim()
    this.indent = indentOf(raw)
    this.split = noted
  }

  /** Its line number (from 1), as the editor shows it. */
  get number(): number {
    return this.index + 1
  }

  /** Its body, #commands and note: as the tree read them, or read now (a line the tree read another way). */
  get parts(): SplitLine {
    return (this.split ??= splitNote(this.trimmed))
  }
}

/**
 * A node of the tree, where it is in the sheet: a line, or a block (its opener,
 * the lines of its body as items, and its closing line).
 */
export interface TreeItem {
  readonly node: SyntaxNode
  /** Its first line: the line itself, or a block's opener (or a block of rows' first row). */
  readonly line: Line
  /** A block's body, in order (blocks in it as items of their own). */
  readonly body: readonly TreeItem[]
  /** A block's closing line, if it has one (a block that isn't closed runs to the end of the sheet). */
  readonly closer?: Line
  /** Every line of a node kept as rows (imported data's), in order. */
  readonly rows: readonly Line[]
  /** The index of its last line. */
  readonly last: number
}

/** A block's body as lines: each line's item's, blank ones too, comments left out. */
export const bodyLines = (item: TreeItem): Line[] =>
  item.body.filter((b) => b.node.kind !== NODE_KIND.comment).map((b) => b.line)

/** Reads the nodes of some kinds into blocks. */
export abstract class NodeReader {
  /** The kinds of node it reads (each kind has one reader). */
  abstract readonly kinds: readonly string[]

  /** Read a node of one of its kinds: add its block (or open one). */
  abstract read(item: TreeItem, sheet: SheetReader): void

  /**
   * Before any line is read: anything that applies to the whole sheet, above
   * where it's written too (`@constants { }`, species' names).
   */
  prepare(_sheet: SheetReader): void {}
}

/**
 * What reads nodes of its own besides MathScribe's readers: an engine module
 * with syntax of its own (chemistry's `@chem.species { }`), whose kinds of node
 * it declares (EngineModule.grammar). Its readers prepare before the core's.
 */
export interface ReadsLines {
  lineReaders(): NodeReader[]
}

/** Whether something (an engine module) reads nodes of its own. */
export const readsLines = <T extends object>(x: T): x is T & ReadsLines => typeof (x as Partial<ReadsLines>).lineReaders === 'function'

/**
 * A block that applies to the whole sheet, above where it's written too
 * (`@constants { }`): read in `prepare`, before any line, then placed where it's written.
 */
export abstract class SheetWideReader<B extends Block> extends NodeReader {
  /** The blocks read, by the item each is. */
  protected readonly prepared = new Map<TreeItem, B>()

  /** Already read: just placed. */
  read(item: TreeItem, sheet: SheetReader): void {
    const block = this.prepared.get(item)
    if (block) sheet.add(block)
  }
}

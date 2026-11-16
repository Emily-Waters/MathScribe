/**
 * Readers: each reads one kind of line of a sheet into blocks. The sheet is read
 * line by line (SheetReader), and each line is offered to the readers in turn
 * until one reads it. A reader that takes the lines after its own (a block's
 * body) moves the sheet on to its last line.
 *
 * Readers go by what's written, not by the block it makes: `@latex { }` and a
 * reaction on a line of its own both make a LaTeX block, and three readers make
 * layout blocks. (How a block is written to each export is its construct's, in
 * constructs/.)
 */
import { indentOf, isComment } from '../syntax.ts'
import type { Block } from '../blocks.ts'
import { closesBlock, splitNote, type SplitLine } from './lineSyntax.ts'
import type { SheetReader } from './sheetReader.ts'

/** The line being read. */
export class Line {
  /** Its index in the sheet's lines (from 0). */
  readonly index: number
  /** As written. */
  readonly raw: string
  /** Without spaces at either end. */
  readonly trimmed: string
  /** How far it's indented, in spaces. */
  readonly indent: number
  private split: SplitLine | undefined

  constructor(index: number, raw: string) {
    this.index = index
    this.raw = raw
    this.trimmed = raw.trim()
    this.indent = indentOf(raw)
  }

  /** Its line number (from 1), as the editor shows it. */
  get number(): number {
    return this.index + 1
  }

  /** Its body, #commands and note (splitNote). */
  get parts(): SplitLine {
    return (this.split ??= splitNote(this.trimmed))
  }
}

/** Reads one kind of line. */
export abstract class LineReader {
  /**
   * Read the line, if it's this reader's: add its block (or open one) and say
   * so. If it isn't, leave everything as it was and say so.
   */
  abstract read(line: Line, sheet: SheetReader): boolean

  /**
   * Before any line is read: anything that applies to the whole sheet, above
   * where it's written too (`@constants { }`, species' names).
   */
  prepare(_sheet: SheetReader): void {}
}

/** A line of a block's body, between its opener and its `}`. */
export interface BodyLine {
  index: number
  /** Without spaces at either end ('' for a blank line). */
  text: string
}

/** A block's body, read up to its `}`. */
export interface Body {
  /** Its lines, blank ones too, comments left out. */
  lines: BodyLine[]
  /** The index of its last line: the `}`, or the sheet's last if it isn't closed. */
  end: number
  closed: boolean
}

/**
 * What reads lines of a sheet besides MathScribe's own readers: an engine
 * module with syntax of its own (chemistry's `@chem.species { }`). Its readers
 * are offered each line before the core's, and prepare before them.
 */
export interface ReadsLines {
  lineReaders(): LineReader[]
}

/** Whether something (an engine module) reads lines of its own. */
export const readsLines = <T extends object>(x: T): x is T & ReadsLines => typeof (x as Partial<ReadsLines>).lineReaders === 'function'

/** Reads a block opened on its line and closed by a `}` on a line after it: `@constants {`, `@latex {`, `@layout.text {`. */
export abstract class BracedReader extends LineReader {
  /** Whether a line closes the block (as written). */
  protected abstract closes(raw: string): boolean

  /** The body of a block opened at `opener`: its lines up to the `}`. */
  protected body(lines: readonly string[], opener: number): Body {
    const body: BodyLine[] = []
    for (let i = opener + 1; i < lines.length; i++) {
      if (this.closes(lines[i])) return { lines: body, end: i, closed: true }
      if (!isComment(lines[i])) body.push({ index: i, text: lines[i].trim() })
    }
    return { lines: body, end: lines.length - 1, closed: false }
  }
}

/** A block read before the rest of the sheet, placed when the line it opens on is reached. */
interface Prepared<B> {
  /** The index of its last line. */
  end: number
  block: B
}

/**
 * A braced block that applies to the whole sheet, above where it's written too
 * (`@constants { }`): read in `prepare`, before any line, then placed where it's written.
 */
export abstract class SheetWideReader<B extends Block> extends BracedReader {
  /** The blocks read, by the index of the line each opens on. */
  protected readonly prepared = new Map<number, Prepared<B>>()

  protected closes(raw: string): boolean {
    return closesBlock(raw)
  }

  /** Already read: just placed. */
  read(line: Line, sheet: SheetReader): boolean {
    const prepared = this.prepared.get(line.index)
    if (!prepared) return false
    sheet.add(prepared.block)
    sheet.index = prepared.end
    return true
  }
}

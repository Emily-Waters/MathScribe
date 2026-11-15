/**
 * A construct: one kind of block of a sheet, and everything it does in one
 * place. Each kind (a heading, a calculation, an @layout block, …) is a class
 * that writes its blocks to each export, so adding a kind of block means adding
 * a construct, and the exports only ask each block's construct to write it.
 *
 * A construct writes itself with the exports' toolkits (latexKit.ts,
 * docxKit.ts). For the blocks inside it, it asks the export back, through the
 * `out` it's given, so constructs don't depend on the exports.
 */
import type { Block } from '../blocks.ts'
import type { LatexOptions } from '../latex.ts'
import type { Equation } from '../latexKit.ts'
import type { Ctx, Item } from '../docxKit.ts'

/** What a construct asks of the LaTeX export, for the blocks inside it. */
export interface LatexOut {
  readonly o: LatexOptions
  /** A block, of any kind, as LaTeX. */
  block(b: Block): string
  /** Blocks in a row, as LaTeX: hidden ones left out, equations in a row gathered into one display. */
  join(blocks: Block[]): string
  /** A block as the content of `\item`. */
  item(b: Block): string
}

/** What a construct asks of the Word export, for the blocks inside it. */
export interface DocxOut {
  /** A block, of any kind, as paragraphs and tables. */
  block(b: Block, ctx: Ctx): Item[]
  /** Blocks in a row, hidden ones left out. */
  blocks(list: Block[], ctx: Ctx): Item[]
}

/** One kind of block: how it's written to each export. */
export abstract class Construct<B extends Block = Block> {
  /** The kind of block it is. */
  abstract readonly kind: B['kind']

  /** The block as LaTeX. */
  abstract latex(b: B, out: LatexOut): string

  /** The block as Word paragraphs and tables. */
  abstract docx(b: B, ctx: Ctx, out: DocxOut): Item[]

  /**
   * The block as one equation, if that's all it is, so it can join the
   * equations around it in one display (they sit as close as in the Rendered
   * tab); null if it isn't just an equation.
   */
  equation(_b: B): Equation | null {
    return null
  }

  /** The block as the content of `\item` in a list: by default, as it is anywhere else. */
  latexItem(b: B, out: LatexOut): string {
    return this.latex(b, out)
  }

  /** Its notes, and those of the blocks inside it, for sizing the Word export's note column. */
  notes(_b: B, _notesOf: (blocks: Block[]) => string[]): string[] {
    return []
  }
}

import { type CalcOptions, type EngineModule, unexpectedError } from '../engine/index.ts'
import { BLOCK_KIND } from './blocks.ts'
import { SheetReader, type Sheet } from '../reading/sheetReader.ts'

export type { Sheet }

/**
 * Line-based document model. Each non-empty line becomes one block:
 *   # / ## / ###     → numbered \section, numbered \subsection, \textbf heading (### or more)
 *   > Some prose       → paragraph (inline $latex$ allowed)
 *   @latex { \frac{a}{b} } → displayed LaTeX, not evaluated (or over several lines, up to a `}` alone)
 *   Title {            → opens a scoped block (title optional); `}` closes it
 *   m = 2.0 kg  // note → calculation; the text after // is shown as its description
 *   // a comment       → never shown or worked out
 *   @constants {       → constants, usable anywhere as @name; `}` closes it
 *   f(a, b) = a * b    → a function, worked out where it's called
 *
 * Layout blocks are in @layout, and hold the lines up to their `}`:
 *   @layout.list(1) Steps {   → numbered list (list: bullets, center: centered)
 *       a = …                     each line is an item; indent further for a sub-list
 *   }
 *   @layout.text Discussion {  → prose: lines run into paragraphs, nothing is worked out
 *   @layout.titlepage Lab 3 {  → a title page: the title, with the lines inside centered under it
 * They also set how the lines inside are shown, the blocks inside them too:
 *   .sym   the equation only        F = m·a
 *   .val   the result only          F = 19.6 N
 *   .full  everything (the default; undoes a block around it)
 *   .hidden  worked out, but not shown
 *   .multiline  each = on its own row, lined up
 *   .sci, .dec  results in scientific notation, or plain digits
 * They only arrange lines: variables assigned inside stay available afterwards.
 *
 * Blocks scope variables like a programming language: inside a block you can
 * read everything defined above it, but anything assigned inside is local and
 * disappears at the closing `}`, leaving outer variables of the same name untouched.
 *
 * (What each kind of block holds is in blocks.ts; how a sheet is read, in
 * reading/; what the editor is told about it, in sheetIndex.ts.)
 */

/** A sheet evaluated, and how long that took (ms), to decide when to evaluate it next. */
export function evaluateSheetTimed(source: string, options: CalcOptions): { sheet: Sheet; ms: number } {
  const started = performance.now()
  return { sheet: evaluateSheetSafely(source, options), ms: performance.now() - started }
}

/**
 * A sheet evaluated, whatever happens: if reading it fails in a way nothing
 * expected, the sheet is one error saying so, rather than the app going blank.
 */
export function evaluateSheetSafely(source: string, options: CalcOptions): Sheet {
  try {
    return evaluateSheet(source, options)
  } catch (e) {
    return { blocks: [{ kind: BLOCK_KIND.calc, line: 1, source: '', tex: '', error: unexpectedError(e) }], variables: [] }
  }
}

/** Read and evaluate a whole sheet, line by line, into blocks (see reading/). */
export function evaluateSheet(source: string, options: CalcOptions, modules?: EngineModule[]): Sheet {
  return new SheetReader(source, options, modules).read()
}

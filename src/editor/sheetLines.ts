/**
 * The editor's view of a sheet's lines, from the sheet's tree (src/lib/tree):
 * what each line is, what it's inside, and where each block's lines end. Folding,
 * indentation, imported data's rows and the suggestions' quiet places all ask
 * here, so the editor reads a sheet exactly as the engine does.
 *
 * Worked out once per version of the document (and the tree's lines are cached
 * by text, so an edit reads again only what it changed).
 */
import { BRANCH_START, indentOf } from '../lib/syntax.ts'
import { LINE_CONTEXT, LINE_ROLE, NODE_KIND, TOP, stepLine, type LineState, type Step } from '../lib/tree/index.ts'
import { BODY_END } from '../lib/tree/grammar.ts'

/** A document as the editor has it: its lines, by number from 1. */
export interface DocLines {
  readonly lines: number
  line(n: number): { text: string }
}

/** A line, read in its place. */
export interface SheetLine {
  /** What the line is, and what it's inside. */
  readonly step: Step
  /** The bodies it's inside, before it's read (what it's read in). */
  readonly before: LineState
  /** For a line that opens a body: the last line of its body (before its `}`, if it has one), or undefined if the body is empty or never closed. */
  foldTo?: number
  /** For a line that opens a body: its closing line, if it has one. */
  closer?: number
}

/** Each document's lines, read (a document version is never changed: a new one is made). */
const read = new WeakMap<DocLines, SheetLine[]>()

/** Every line of a document, read in its place (index n - 1 for line n). */
export function sheetLines(doc: DocLines): SheetLine[] {
  let lines = read.get(doc)
  if (lines) return lines
  lines = []
  let state = TOP
  /** The lines that opened the bodies open now, innermost last, and their last non-blank line so far. */
  const open: { line: number; lastFilled: number }[] = []
  for (let n = 1; n <= doc.lines; n++) {
    const text = doc.line(n).text
    const step = stepLine(state, { text, eol: '' })
    // Bodies that ended before this line (where the indentation did): they end at their last non-blank line.
    for (let i = 0; i < step.ended.length; i++) {
      const o = open.pop()!
      lines[o.line - 1].foldTo = o.lastFilled > o.line ? o.lastFilled : undefined
    }
    const sheetLine: SheetLine = { step, before: state }
    lines.push(sheetLine)
    if (step.role === LINE_ROLE.closer) {
      const o = open.pop()
      if (o) {
        lines[o.line - 1].closer = n
        lines[o.line - 1].foldTo = n - 1 > o.line ? n - 1 : undefined
      }
    } else if (text.trim()) {
      for (const o of open) o.lastFilled = n
    }
    if (step.role === LINE_ROLE.opener) open.push({ line: n, lastFilled: n })
    state = step.state
  }
  // Bodies open at the end: one that ends where the indentation does ends at its last line; a braced one isn't closed.
  for (const o of open) {
    const ends = lines[o.line - 1].step.state.at(-1)?.ends
    const indented = ends === BODY_END.indent || ends === BODY_END.indentOrBlank
    lines[o.line - 1].foldTo = indented && o.lastFilled > o.line ? o.lastFilled : undefined
  }
  read.set(doc, lines)
  return lines
}

/** Line n, read in its place. */
export const sheetLine = (doc: DocLines, n: number): SheetLine => sheetLines(doc)[n - 1]

/** Whether a line opens a body (a block, a function, an import), or a branch in a function's body (indented under it). */
export const opensBody = (step: Step, text: string) => step.role === LINE_ROLE.opener || isBranch(step, text)

/** An `if` / `else` in a function's body, whose lines are indented under it. */
const isBranch = (step: Step, text: string) => step.node.kind === NODE_KIND.functionLine && BRANCH_START.test(text.trim())

/** Line n read as if it were `text` (a line being split by Enter), in its place. */
export const readAs = (doc: DocLines, n: number, text: string) => stepLine(sheetLine(doc, n).before, { text, eol: '' })

/**
 * The lines a line folds, from its end to the end of the last: a block's up to
 * (not including) its `}`, a function's or import's indented lines, a branch's.
 */
export function foldRange(doc: DocLines, n: number): { from: number; to: number } | null {
  const line = sheetLine(doc, n)
  if (line.step.role === LINE_ROLE.opener) return line.foldTo ? { from: n, to: line.foldTo } : null
  if (!isBranch(line.step, doc.line(n).text)) return null
  // A branch: its lines indented under it.
  const base = indentOf(doc.line(n).text)
  let last = n
  for (let m = n + 1; m <= doc.lines; m++) {
    const text = doc.line(m).text
    if (!text.trim()) continue
    if (indentOf(text) <= base) break
    last = m
  }
  return last > n ? { from: n, to: last } : null
}

/** Whether a line is an `@import(…)`. */
export const isImport = (text: string) => stepLine(TOP, { text, eol: '' }).node.kind === NODE_KIND.importLine

/** An `@import(…)` line and the lines of its data: the header row, then the first and last data rows. */
export interface DataBlock {
  line: number
  header: number
  rows: { first: number; last: number } | null
}

/** Every `@import(…)` line with data under it, and where its rows are (line numbers, 1-based). */
export function dataBlocks(doc: DocLines): DataBlock[] {
  const lines = sheetLines(doc)
  const out: DataBlock[] = []
  lines.forEach((line, i) => {
    if (line.step.node.kind !== NODE_KIND.importLine) return
    const n = i + 1
    const rows: number[] = []
    for (let m = n + 1; m <= lines.length && lines[m - 1].step.role === LINE_ROLE.row; m++) rows.push(m)
    if (rows.length) out.push({ line: n, header: rows[0], rows: rows.length > 1 ? { first: rows[1], last: rows.at(-1)! } : null })
  })
  return out
}

/** Whether line `n` is a row of imported data (where nothing is suggested). */
export const inDataBlock = (doc: DocLines, n: number) => sheetLine(doc, n).step.role === LINE_ROLE.row

/** Whether line `n` is inside a body of this context, and not its closing line. */
const inContext = (doc: DocLines, n: number, context: string) => {
  const { step } = sheetLine(doc, n)
  return step.context === context && step.role !== LINE_ROLE.closer
}

/** Whether line `n` is prose inside an `@layout.text { }` block (for the editor's suggestions, which stay quiet in prose). */
export const inTextBlock = (doc: DocLines, n: number) => inContext(doc, n, LINE_CONTEXT.prose)

/** Whether line `n` is LaTeX inside an `@latex { }` block. */
export const inLatexBlock = (doc: DocLines, n: number) => inContext(doc, n, LINE_CONTEXT.latex)

/** Whether line `n` is one where there are no names (prose, LaTeX), so the editor's suggestions stay quiet. */
export const inNamelessBlock = (doc: DocLines, n: number) => inTextBlock(doc, n) || inLatexBlock(doc, n)

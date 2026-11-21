/**
 * The editor's view of a sheet's lines, from the sheet's tree (src/lib/tree):
 * what each line is, what it's inside, and where each block's lines end. Folding,
 * indentation, imported data's rows and the suggestions' quiet places all ask
 * here, so the editor reads a sheet exactly as the engine does.
 *
 * Worked out once per version of the document (and the tree's lines are cached
 * by text, so an edit reads again only what it changed).
 */
import { LINE_CONTEXT, LINE_ROLE, NODE_KIND, TOKEN_KIND, TOP, isToken, stepLine, type LineState, type Step } from '../lib/tree/index.ts'
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
  /**
   * For a line that opens a body: the last line of its body (before its `}`, if
   * it has one), or undefined if the body is empty or never closed. For a
   * heading: the last line of its section (see sheetLines).
   */
  foldTo?: number
  /** For a line that opens a body: its closing line, if it has one. */
  closer?: number
}

/** Each document's lines, read (a document version is never changed: a new one is made). */
const read = new WeakMap<DocLines, SheetLine[]>()

/**
 * A heading's level, from its `#`s (the tree's marks token): 1 a section, 2 a
 * subsection, 3 a sub-subsection. A block titled as a section (`# Kinematics {`)
 * has one too. Undefined for any other line.
 */
export function headingLevel(step: Step): number | undefined {
  const { kind, parts } = step.node
  if (kind !== NODE_KIND.heading && kind !== NODE_KIND.blockOpener) return undefined
  const marks = parts.find((p) => isToken(p) && p.t === TOKEN_KIND.marks)
  return marks && isToken(marks) ? marks.text.length : undefined
}

/**
 * Every line of a document, read in its place (index n - 1 for line n); each
 * block's fold, and each heading's: its section, up to the next heading of its
 * level or above (`#` ends a `##`'s, and another `##`'s; a block titled as a
 * section, `# Kinematics {`, too) in the same body, or the end of that body or
 * the sheet; to its last line that isn't blank.
 */
export function sheetLines(doc: DocLines): SheetLine[] {
  let lines = read.get(doc)
  if (lines) return lines
  lines = []
  let state = TOP
  /** The lines that opened the bodies open now, innermost last, and their last non-blank line so far. */
  const open: { line: number; lastFilled: number }[] = []
  /** The headings whose sections are open now: each one's line, level, how many bodies it's in, and its last non-blank line so far. */
  const sections: { line: number; level: number; depth: number; lastFilled: number }[] = []
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
    // Sections that end before this line: those in a body it's outside of (a `}` ends its block's), and,
    // at a heading, those of its level or below in its body. (An opener is in the body around what it opens.)
    const depth = step.role === LINE_ROLE.opener ? step.state.length - 1 : step.state.length
    const level = headingLevel(step)
    for (let i = sections.length - 1; i >= 0; i--) {
      const s = sections[i]
      if (s.depth <= depth && (level === undefined || s.depth < depth || s.level < level)) continue
      lines[s.line - 1].foldTo = s.lastFilled > s.line ? s.lastFilled : undefined
      sections.splice(i, 1)
    }
    if (text.trim()) for (const s of sections) s.lastFilled = n
    // (A block titled as a section folds as the block it is.)
    if (level !== undefined && step.node.kind === NODE_KIND.heading) sections.push({ line: n, level, depth, lastFilled: n })
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
    const indented = ends === BODY_END.indent
    lines[o.line - 1].foldTo = indented && o.lastFilled > o.line ? o.lastFilled : undefined
  }
  // Sections open at the end run to the sheet's last line that isn't blank.
  for (const s of sections) lines[s.line - 1].foldTo = s.lastFilled > s.line ? s.lastFilled : undefined
  read.set(doc, lines)
  return lines
}

/** Line n, read in its place. */
export const sheetLine = (doc: DocLines, n: number): SheetLine => sheetLines(doc)[n - 1]

/**
 * The line a statement that line n is part of starts on: n itself, or for a
 * line carrying a statement on (a multiline `@series(…)`'s values, its `)`),
 * the line it began on, where its output is linked to.
 */
export function statementStart(doc: DocLines, n: number): number {
  const lines = sheetLines(doc)
  let start = n
  while (start > 1 && lines[start - 1].step.context === LINE_CONTEXT.continued) start--
  return start
}

/** Whether a line opens a body (a block, an import). */
export const opensBody = (step: Step) => step.role === LINE_ROLE.opener

/** Line n read as if it were `text` (a line being split by Enter), in its place. */
export const readAs = (doc: DocLines, n: number, text: string) => stepLine(sheetLine(doc, n).before, { text, eol: '' })

/**
 * The lines a line folds, from its end to the end of the last: a block's up to
 * (not including) its `}`, an import's indented lines, a heading's section.
 */
export function foldRange(doc: DocLines, n: number): { from: number; to: number } | null {
  const line = sheetLine(doc, n)
  if (line.step.role !== LINE_ROLE.opener && headingLevel(line.step) === undefined) return null
  return line.foldTo ? { from: n, to: line.foldTo } : null
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

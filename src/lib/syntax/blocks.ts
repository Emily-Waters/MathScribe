/**
 * What blocks look like: the braces that open and close them, `@latex { }`, the
 * import line (whose data is indented under it), and indentation. (`@layout`'s
 * blocks are in layout.ts, `@constants { }` in constants.ts.)
 */
import { CALL, MEMBER_DOT, NAME, NAMED, SIGIL, builtinOpening } from './lexical.ts'
import { inClass, lit, named, optional, regex, src, type Piece } from './patterns.ts'
import { CURLY_BRACKETS, QUOTE, ROUND_BRACKETS } from './punctuation.ts'

const { open: OPEN, close: CLOSE } = ROUND_BRACKETS

// ---------------------------------------------------------------------------
// Braces
// ---------------------------------------------------------------------------

/** A block's opening brace, at the end of its opener. */
export const BLOCK_OPEN = CURLY_BRACKETS.open

/** A block's closing brace, at the start of a line. */
export const BLOCK_CLOSE = CURLY_BRACKETS.close

/** What's in a block name's brackets: anything but brackets, or quoted text, which can hold them (`title "Mass (g)"`). */
export const BLOCK_ARGS = src`${lit(OPEN)}(?:${QUOTE}[^${inClass(QUOTE)}\n]*${QUOTE}|[^${inClass(OPEN, CLOSE, QUOTE)}\n])*${lit(CLOSE)}`

/**
 * A block's `@` name, at the start of its opener, with what's in its brackets
 * and any members (and what's in theirs): `@layout.column(3).list`, `@constants`,
 * `@chem.species`, `@latex`, `@table(title "Runs")`.
 */
export const BLOCK_NAME = regex(src`^${SIGIL}${NAME}(?:${BLOCK_ARGS})?(?:${lit(MEMBER_DOT)}${NAME}(?:${BLOCK_ARGS})?)*`)

/**
 * The opener of a block named after `@`, alone on its line with its brace:
 * blockOpener(CONSTANTS_BLOCK) reads `@constants {` (a name can be a pattern:
 * `table(…)`, with what's in its brackets).
 */
export const blockOpener = (name: Piece) => regex(src`^${SIGIL}${name}\s*${lit(BLOCK_OPEN)}$`)

/** Whether a line closes a block: `}`, with anything after it. */
export const closesBlock = (text: string) => text.trimStart().startsWith(BLOCK_CLOSE)

/** Whether LaTeX's braces balance, each `{` closed by a later `}` (escaped ones, `\{`, don't count). */
export function bracesBalance(latex: string): boolean {
  let depth = 0
  for (let i = 0; i < latex.length; i++) {
    const c = latex[i]
    if (c === '\\') i++
    else if (c === BLOCK_OPEN) depth++
    else if (c === BLOCK_CLOSE && --depth < 0) return false
  }
  return depth === 0
}

// ---------------------------------------------------------------------------
// `@latex { … }`
// ---------------------------------------------------------------------------

/**
 * `@latex { … }`: raw LaTeX, displayed but not worked out. Its lines go up to a
 * `}` on its own line, so they can be several (`\begin{aligned} … \end{aligned}`);
 * or it's all on one line, `@latex { \frac{a}{b} }`.
 */
export const LATEX_BLOCK = 'latex'

/** The opener of an `@latex { }` block (its group: rest, anything after its brace, for one on a single line). */
export const LATEX_OPENER = regex(src`^${SIGIL}${LATEX_BLOCK}\s*${lit(BLOCK_OPEN)}${named('rest', '.*')}$`)

/** Whether a line closes an `@latex { }` block: `}` on its own (a LaTeX line can start with one). */
export const closesLatex = (line: string) => line.trim() === BLOCK_CLOSE

// ---------------------------------------------------------------------------
// The import line
// ---------------------------------------------------------------------------

/** An import's call, `@import()` or `@import("run1.csv")`, anywhere in a line (its group: file, the file's name). */
const IMPORT_BRACKETS = src`${builtinOpening(CALL.import)}\s*${optional(src`${QUOTE}${named('file', src`[^${inClass(QUOTE)}]*`)}${QUOTE}`)}\s*${lit(CLOSE)}`

/**
 * An import line: `@import()` (no file chosen yet) or `@import("run1.csv")`,
 * with the file's rows indented under it; or a named one, `run1 = @import(…)`,
 * whose columns are run1.t, run1.x (its groups: name, if any, and file).
 */
export const IMPORT = regex(src`^${NAMED}?${IMPORT_BRACKETS}$`)

/** An import's call in a line, for the editor's file button (its group: file). */
export const IMPORT_CALL = regex(IMPORT_BRACKETS)

/** An import's call with a file named in it: `@import("run1.csv")`. */
export const importCall = (fileName: string) => `${SIGIL}${CALL.import}${OPEN}${QUOTE}${fileName}${QUOTE}${CLOSE}`

// ---------------------------------------------------------------------------
// Indentation
// ---------------------------------------------------------------------------

/** Spaces per indentation level, in the editor and the sheets it writes. */
export const INDENT_WIDTH = 4

/** One indentation level, as typed by Tab. */
export const INDENT = ' '.repeat(INDENT_WIDTH)

/** How far a line is indented, counting a tab as one level. */
export const indentOf = (line: string) => /^[ \t]*/.exec(line)![0].replace(/\t/g, INDENT).length

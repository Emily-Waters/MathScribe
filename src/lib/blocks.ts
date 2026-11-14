/**
 * The blocks a sheet is read into (see document.ts, which reads them): what
 * each kind is, and what each holds. Every block has a kind from BLOCK_KIND and
 * the line it starts on (BlockBase); the rest is built from small shared parts,
 * so what's common is written once:
 *
 *   heading, text, latex, spacer      a line of the document
 *   calc                              a calculation
 *   group, layout                     blocks holding others (ContainerBlock)
 *   function, constants, import       blocks spanning several lines (Spans)
 */
import type { DataColumn, Definition, FunctionResult, TraceLine, Variable } from './engine.ts'
import type { LayoutStyle, LineCommand, Notation } from './syntax.ts'
import type { PlotData } from './plot.ts'

/** Each kind of block. */
export const BLOCK_KIND = {
  heading: 'heading',
  text: 'text',
  latex: 'latex',
  spacer: 'spacer',
  calc: 'calc',
  group: 'group',
  layout: 'layout',
  function: 'function',
  constants: 'constants',
  import: 'import',
} as const
export type BlockKind = (typeof BLOCK_KIND)[keyof typeof BLOCK_KIND]

/** A display command on a line or block (#sym, #val, #full, #hide). */
export type Command = LineCommand

export type { LayoutStyle }

// ---------------------------------------------------------------------------
// Shared parts
// ---------------------------------------------------------------------------

/** What every block has: its kind, and the line it starts on. */
export interface BlockBase {
  kind: BlockKind
  line: number
}

/** A block with a note: the text after `#` on its line. */
export interface Noted {
  note?: string
}

/** A block that can have something wrong with it. */
export interface Faulted {
  error?: string
}

/** A block that can be hidden (`#hide`): worked out, but not shown. */
export interface Hideable {
  hidden?: boolean
}

/** A block over several lines: its last. */
export interface Spans {
  endLine: number
}

/** The display settings an opener gives the lines inside it. */
export interface BlockSettings {
  /** Display command given on the opener, inherited by lines inside. */
  command?: Command
  /** `#multiline` on the opener: every line inside is laid out one `=` per row. */
  multiline?: boolean
  /** `#sci` / `#dec` on the opener: the notation results inside are shown in. */
  notation?: Notation
}

/** A block that holds others, under a title (`{ }` blocks and layout blocks). */
export interface ContainerBlock extends BlockBase, Noted, Faulted, BlockSettings {
  title: string
  children: Block[]
  /** Last line that belongs to it (for a `{ }` block, its closing brace, if there is one). */
  endLine?: number
}

// ---------------------------------------------------------------------------
// The blocks
// ---------------------------------------------------------------------------

/** `#` → 1 (section), `##` → 2 (subsection), `###` or more → 3 (bold paragraph). */
export interface HeadingBlock extends BlockBase, Faulted {
  kind: typeof BLOCK_KIND.heading
  level: 1 | 2 | 3
  /** Its text; `{{x}}` in it is replaced by x's value. (Its error: a value that couldn't be worked out.) */
  text: string
  /** "2" or "2.1", as LaTeX numbers it. */
  number?: string
}

/** Prose; `{{x}}` in it is replaced by x's value, as inline maths. */
export interface TextBlock extends BlockBase, Faulted {
  kind: typeof BLOCK_KIND.text
  text: string
}

/** `$ \LaTeX`: displayed, not worked out. */
export interface LatexBlock extends BlockBase {
  kind: typeof BLOCK_KIND.latex
  latex: string
}

/** A gap of one empty line, from two or more blank lines in the input. */
export interface SpacerBlock extends BlockBase {
  kind: typeof BLOCK_KIND.spacer
}

/** A calculation line, worked out: its LaTeX, and anything to say about it. */
export interface CalcBlock extends BlockBase, Noted, Faulted, Hideable {
  kind: typeof BLOCK_KIND.calc
  source: string
  tex: string
  warning?: string
  /** Extra information, e.g. other solutions of an equation (may contain $inline math$). */
  info?: string
  /** Working from inside functions called on this line, shown before it. */
  trace?: TraceLine[]
  /** A `plot(…)` line's plot (`tex` is then its fits' equations, if any). */
  plot?: PlotData
  /** What a select or named plot made (a__x_1, p__slope), for suggestions. */
  defines?: Definition[]
}

/** A `Title { … }` block: the variables assigned inside it are local to it. */
export interface GroupBlock extends ContainerBlock {
  kind: typeof BLOCK_KIND.group
  /** Variables defined inside this block (not visible after it). */
  locals: Variable[]
}

/**
 * `@layout.numbered Title { … }`: a block that only arranges its lines (centered,
 * as a list, as prose, as a title page) or sets how they're shown (`@layout.val`,
 * `@layout.hidden`). Unlike `{ }` blocks, it doesn't scope variables. Indenting
 * further inside a list makes a sub-list.
 */
export interface LayoutBlock extends ContainerBlock {
  kind: typeof BLOCK_KIND.layout
  /** No style: the lines as they are, with only display settings (`@layout.val {`). */
  style?: LayoutStyle
  /** Its members as written, `val`, `multiline` in `@layout.val.multiline` (for messages). */
  members?: readonly string[]
  /** Members that clash, such as .sym with .val. */
  warning?: string
  /** A sub-list made by indenting further; it belongs to the item before it. */
  nested?: boolean
  /** Indentation of the opener; a line indented no further ends the block. */
  indent: number
  /** Indentation of its first line; a line indented further starts a sub-list. */
  itemIndent?: number
}

/** `def f(a, b)` with its indented body. */
export interface FunctionBlock extends BlockBase, FunctionResult, Spans, Noted, Hideable {
  kind: typeof BLOCK_KIND.function
  name: string
}

/** One `name = value` line of an `@constants { … }` block. */
export interface ConstantEntry extends Noted, Faulted {
  line: number
  source: string
  tex: string
  warning?: string
  info?: string
}

/** `@constants { … }`: constants usable anywhere in the sheet as `@name`. */
export interface ConstantsBlock extends BlockBase, Spans, Noted, Faulted, Hideable {
  kind: typeof BLOCK_KIND.constants
  entries: ConstantEntry[]
}

/**
 * `import("run1.csv")` with the file's rows indented under it: data whose
 * values become variables (t_1, t_2, …). Only a summary is shown, not the rows.
 */
export interface ImportBlock extends BlockBase, Spans, Noted, Faulted, Hideable {
  kind: typeof BLOCK_KIND.import
  /** Its name, for `run1 = import(…)`: its columns are run1.t, run1.x, …. */
  name?: string
  /** The file's name, or undefined for `import()` before a file is chosen. */
  file?: string
  /** What each column made. */
  columns: DataColumn[]
  rows: number
}

/** Any block of a sheet. */
export type Block =
  | HeadingBlock
  | TextBlock
  | LatexBlock
  | SpacerBlock
  | CalcBlock
  | GroupBlock
  | LayoutBlock
  | FunctionBlock
  | ConstantsBlock
  | ImportBlock

/** Whether a block holds others (a `{ }` block or a layout block). */
export const isContainer = (b: Block): b is GroupBlock | LayoutBlock =>
  b.kind === BLOCK_KIND.group || b.kind === BLOCK_KIND.layout

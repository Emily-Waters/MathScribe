/**
 * The blocks a sheet is read into (see reading/, which reads them): what
 * each kind is, and what each holds. Every block has a kind from BLOCK_KIND and
 * the line it starts on (BlockBase); the rest is built from small shared parts,
 * so what's common is written once:
 *
 *   heading, text, latex, spacer      a line of the document (latex: an @latex block, or a reaction)
 *   calc                              a calculation
 *   group, layout                     blocks holding others (ContainerBlock)
 *   card                              a card of equations, a line each: `@constants { }`, a
 *                                     module's (chemistry's species' names)
 *   import                            imported data
 *   custom                            a module's own kind of block (its `type`), which
 *                                     the module writes and draws (EngineModule.blockKinds)
 */
import type { DataColumn, Definition, LineValue, ResultBlock, TraceLine } from '../engine/index.ts'
import type { VariableSummary } from './values.ts'
import { DISPLAY, type LayoutStyle, type Display, type ListMarker, type Notation } from '../syntax.ts'
import { words, type WordOf } from '../syntax.ts'

/** Each kind of block. */
export const BLOCK_KIND = {
  heading: 'heading',
  text: 'text',
  latex: 'latex',
  spacer: 'spacer',
  rule: 'rule',
  calc: 'calc',
  group: 'group',
  layout: 'layout',
  card: 'card',
  import: 'import',
  custom: 'custom',
} as const
export type BlockKind = (typeof BLOCK_KIND)[keyof typeof BLOCK_KIND]

export type { Display }

export type { LayoutStyle }

// ---------------------------------------------------------------------------
// Shared parts
// ---------------------------------------------------------------------------

/** What every block has: its kind, and the line it starts on. */
export interface BlockBase {
  kind: BlockKind
  line: number
}

/** A block with a note: the text after `//` on its line. */
export interface Noted {
  note?: string
}

/** A block that can have something wrong with it. */
export interface Faulted {
  error?: string
}

/** A block that can be hidden (in `@layout.hidden { }`): worked out, but not shown. */
export interface Hideable {
  hidden?: boolean
}

/** A block over several lines: its last. */
export interface Spans {
  endLine: number
}

/** The display settings an opener gives the lines inside it (an `@layout` block's members; a `{ }` block's only hides, inside a hidden one). */
export interface BlockSettings {
  /** How the lines inside are shown (`.sym`, `.val`, `.full`), or hidden (`.hidden`). */
  display?: Display
  /** `.multiline`: every line inside is laid out one `=` per row. */
  multiline?: boolean
  /** `.sci` / `.dec`: the notation results inside are shown in. */
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

/** A heading's level, by how many `#` it starts with: a numbered section, a numbered subsection, or a bold paragraph (`###` or more). */
export const HEADING_LEVEL = { section: 1, subsection: 2, paragraph: 3 } as const
export type HeadingLevel = (typeof HEADING_LEVEL)[keyof typeof HEADING_LEVEL]

/** `#` → a section, `##` → a subsection, `###` or more → a bold paragraph (see HEADING_LEVEL). */
export interface HeadingBlock extends BlockBase, Faulted {
  kind: typeof BLOCK_KIND.heading
  level: HeadingLevel
  /** Its text; `{{x}}` in it is replaced by x's value. (Its error: a value that couldn't be worked out.) */
  text: string
  /** "2" or "2.1", as LaTeX numbers it. */
  number?: string
}

/** Prose; `{{x}}` in it is replaced by x's value, as inline maths. */
export interface TextBlock extends BlockBase, Faulted {
  kind: typeof BLOCK_KIND.text
  text: string
  /** A heading of an @layout.text block's own, `# Method`: its level, 1 the largest (not numbered). */
  heading?: number
  /** A quote in an @layout.text block, `> …`. */
  quote?: boolean
}

/** `---` in an @layout.text block: a rule across the page. */
export interface RuleBlock extends BlockBase {
  kind: typeof BLOCK_KIND.rule
}

/** `@latex { … }` (or a reaction, `{OH^- + H3O^+ -> 2 H2O}`): LaTeX displayed, not worked out. */
export interface LatexBlock extends BlockBase, Faulted {
  kind: typeof BLOCK_KIND.latex
  latex: string
  /** Its last line, for an `@latex { … }` block over several. */
  endLine?: number
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
  /** What the line assigned, each as it stood after it (its value at this line, for the editor's hover). */
  assigned?: VariableSummary[]
  /** Its result alone (≈ if rounded), for the editor's inline results; none for a value typed as it is. */
  result?: LineValue
  warning?: string
  /** Extra information, e.g. other solutions of an equation (may contain $inline math$). */
  info?: string
  /** Working from inside functions called on this line, shown before it. */
  trace?: TraceLine[]
  /** A drawing a module makes of the line, above its equation (CalcResult.figure): a `@plot(…)` line's plot (`tex` is then its fits' equations, if any). */
  figure?: ResultBlock
  /** What a select or named plot made (a__x_1, p__slope), for suggestions. */
  defines?: Definition[]
}

/** A `Title { … }` block: the variables assigned inside it are local to it. */
export interface GroupBlock extends ContainerBlock {
  kind: typeof BLOCK_KIND.group
  /** Variables defined inside this block (not visible after it). */
  locals: VariableSummary[]
  /** Its title as a section (`# Kinematics {`): its level, and number, as a heading's. */
  section?: SectionTitle
}

/** A block's title written as a heading, `## Energy {`: numbered with the headings, and set as one in its title bar. */
export interface SectionTitle {
  level: HeadingLevel
  /** "2" or "2.1", as LaTeX numbers it (none for a bold paragraph's level). */
  number?: string
}

/**
 * `@layout.list(1) Title { … }`: a block that only arranges its lines (centered,
 * as a list, as prose, as a title page) or sets how they're shown (`@layout.val`,
 * `@layout.hidden`). Unlike `{ }` blocks, it doesn't scope variables. Indenting
 * further inside a list makes a sub-list.
 */
export interface LayoutBlock extends ContainerBlock {
  kind: typeof BLOCK_KIND.layout
  /** No style: the lines as they are, with only display settings (`@layout.val {`). */
  style?: LayoutStyle
  /** A list's marker, `@layout.list(a)` (a sub-list's, from the list it's in); none: bulleted. */
  marker?: ListMarker
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
  /** `@layout.column`: its lines side by side in columns (see columnGrid). */
  columns?: Columns
  /** A numbered list's first number: a column's, carrying on from the column before it. */
  firstNumber?: number
}

/**
 * How an `@layout.column` block splits into columns: at each blank line
 * (`breaks`, the indexes of the children that start a column), and at each block
 * inside, which is a column of its own.
 */
export interface Columns {
  /** How many columns a row has, `@layout.column(3)`, if it says. */
  count?: number
  breaks: number[]
}

/** One line of a card: what's written, and as an equation (`g = 9.81 m/s^2`, `dietzeite = 7Ca(IO₃)₂·8CaCrO₄`). */
export interface CardEntry extends Noted, Faulted {
  line: number
  /** As written (shown as it is if it has no equation, an entry that went wrong). */
  source: string
  tex: string
  warning?: string
  info?: string
}

/**
 * Each kind of name a sheet defines, as the editor knows them. A `braced` name
 * is written in braces, `{dietzeite}` (a module's: chemistry's species' names).
 * A `namespace` is a name whose members are what's used, `p` of `p.slope` (a
 * named plot's, a selection's): gone to and renamed, not suggested on its own.
 */
export const SYMBOL_KIND = words({ variable: 'variable', parameter: 'parameter', function: 'function', constant: 'constant', braced: 'braced', namespace: 'namespace' })
export type SymbolKind = WordOf<typeof SYMBOL_KIND>

/** A name a card's entry defines, usable elsewhere in the sheet (for the editor): `@g`, a species' `{dietzeite}`. */
export interface DefinedName {
  name: string
  kind: SymbolKind
  line: number
  tex: string
  /** What it is, in a sentence, for its hover (a module's name says what it is: `Your species dietzeite, …`). */
  about?: string
  /** What it is, in a word or two, beside it in suggestions: `your species`. */
  detail?: string
}

/**
 * A card of equations, a line each, under a title: `@constants { … }`, a
 * module's (chemistry's `@chem.species { … }`). One on a line of its own
 * (`@chem.species dietzeite = {…}`) is `single`: its line, without the card.
 */
export interface CardBlock extends BlockBase, Spans, Noted, Faulted, Hideable {
  kind: typeof BLOCK_KIND.card
  /** Its title, in its header: Constants, Species. */
  title: string
  entries: CardEntry[]
  single?: boolean
  /** The names its entries define, usable anywhere in the sheet. */
  defines: DefinedName[]
}

/**
 * `@import("run1.csv")` with the file's rows indented under it: data whose
 * values become variables (t_1, t_2, …). Only a summary is shown, not the rows.
 */
export interface ImportBlock extends BlockBase, Spans, Noted, Faulted, Hideable {
  kind: typeof BLOCK_KIND.import
  /** Its name, for `run1 = @import(…)`: its columns are run1.t, run1.x, …. */
  name?: string
  /** The file's name, or undefined for `@import()` before a file is chosen. */
  file?: string
  /** What each column made. */
  columns: DataColumn[]
  rows: number
}

/**
 * A block of a module's own kind: its `type` (which the module's construct and
 * view are found by, EngineModule.blockKinds), and what the module read into it
 * (`data`). The core treats it as any block: it can be noted, go wrong, be
 * hidden, and define names; what's in it is the module's.
 */
export interface CustomBlock<D = unknown> extends BlockBase, Spans, Noted, Faulted, Hideable {
  kind: typeof BLOCK_KIND.custom
  /** Its kind among the module's, `moduleName.kind` by convention: `astronomy.orbit`. */
  type: string
  data: D
  /** The names it makes usable anywhere in the sheet, if any (as a card's do). */
  defines?: DefinedName[]
  /**
   * For a line shown as one (CalcResult.block): the line as written, and a
   * warning and something worth knowing that isn't a problem, as a calculation's.
   */
  source?: string
  warning?: string
  info?: string
}

/**
 * A kind of numbered caption, as it's named: `Table` in `Table 2: Runs`. A
 * module's kind of block says which its blocks have (ModuleBlockKind's
 * `caption`; the series module's tables, `Table`), and each output numbers
 * each kind in the order they're written.
 */
export type CaptionKind = string

/** Any block of a sheet. */
export type Block =
  | HeadingBlock
  | TextBlock
  | LatexBlock
  | SpacerBlock
  | RuleBlock
  | CalcBlock
  | GroupBlock
  | LayoutBlock
  | CardBlock
  | ImportBlock
  | CustomBlock

/** Whether a block holds others (a `{ }` block or a layout block). */
export const isContainer = (b: Block): b is GroupBlock | LayoutBlock =>
  b.kind === BLOCK_KIND.group || b.kind === BLOCK_KIND.layout

/** Whether a block is left out of the output (and so isn't a list item). */
export function isOmitted(b: Block): boolean {
  // Spacers, and imported data, which only defines variables.
  if (b.kind === BLOCK_KIND.spacer || b.kind === BLOCK_KIND.import) return true
  if (b.kind === BLOCK_KIND.calc || b.kind === BLOCK_KIND.card || b.kind === BLOCK_KIND.custom) {
    return !!b.hidden && !b.error
  }
  if (isContainer(b)) return b.display === DISPLAY.hidden && !b.error
  return false
}

/**
 * Whether a block only sets how its lines are shown, `@layout.val { … }`: an
 * `@layout` block with no layout, columns, title or note, nothing wrong, and
 * not hidden. Its lines flow on with the lines around it, as if written there.
 */
export const onlyShows = (b: Block): b is LayoutBlock =>
  b.kind === BLOCK_KIND.layout && !b.style && !b.columns && !b.title && !b.note && !b.error && b.display !== DISPLAY.hidden

/** Blocks with the lines of those that only set how they're shown in their place (onlyShows), at any depth. */
export const flowing = (blocks: readonly Block[]): Block[] =>
  blocks.flatMap((b) => (onlyShows(b) ? flowing(b.children) : [b]))

/** A list block's items, each with the sub-lists indented under it (each line of a block that only sets how they're shown an item). */
export function listItems(children: Block[]): { item: Block; subs: Block[] }[] {
  const items: { item: Block; subs: Block[] }[] = []
  for (const c of flowing(children)) {
    if (isOmitted(c)) continue
    if (c.kind === BLOCK_KIND.layout && c.nested && items.length) items.at(-1)!.subs.push(c)
    else items.push({ item: c, subs: [] })
  }
  return items
}

/** Whether a block, or anything inside it, has an error (so a hidden block still shows it). */
export const hasError = (b: Block): boolean =>
  ((b.kind === BLOCK_KIND.calc || b.kind === BLOCK_KIND.import || b.kind === BLOCK_KIND.custom) && !!b.error)
  || (b.kind === BLOCK_KIND.card && (!!b.error || b.entries.some((e) => e.error)))
  || (isContainer(b) && (!!b.error || b.children.some(hasError)))

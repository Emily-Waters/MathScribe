/**
 * `@layout` blocks: `@layout.list(1).val Steps {` … `}`. Their members (a
 * layout, an arrangement, display settings), and LayoutSyntax, which reads and
 * writes their openers.
 */
import type { BlockSettings, Columns, LayoutBlock } from '../sheet/blocks.ts'
import { DISPLAY_MODE, LINE_COMMAND, LINE_LAYOUT, MULTILINE, type DisplayMode, type LineLayout } from './commands.ts'
import { MEMBER_DOT, NAME, NAME_CHAR, NAMESPACE, SIGIL } from './lexical.ts'
import { NOTATION, type Notation } from './settings.ts'
import { BLOCK_OPEN } from './blocks.ts'
import { named, optional, regex, src, words, type WordOf } from './patterns.ts'

// ---------------------------------------------------------------------------
// Members
// ---------------------------------------------------------------------------

/**
 * The layouts in @layout, each a block opened `@layout.list Title {` (the title
 * is optional) and closed by `}`. They arrange lines without scoping them
 * (unlike `Title { }`):
 *   text        prose: lines join into paragraphs, nothing is worked out
 *   list        a list, bulleted, or numbered as its brackets say: list(1), list(a)
 *               (indent further for a sub-list)
 *   center      centered lines
 *   titlepage   a page of its own, of prose: the first line (or the opener's title) is the
 *               title, bold and larger, and the lines under it are centered, each on its own
 */
export const LAYOUT_STYLE = words({
  text: 'text',
  list: 'list',
  center: 'center',
  titlepage: 'titlepage',
})
export type LayoutStyle = WordOf<typeof LAYOUT_STYLE>

/**
 * How a numbered list's items are marked, written in its brackets as its first
 * item would be: `@layout.list(1)` 1, 2, 3; `(a)` a, b, c; `(A)` A, B, C; `(i)`
 * i, ii, iii; `(I)` I, II, III. A list without brackets is bulleted.
 */
export const LIST_MARKER = words({ number: '1', lowerLetter: 'a', upperLetter: 'A', lowerRoman: 'i', upperRoman: 'I' })
export type ListMarker = WordOf<typeof LIST_MARKER>

/**
 * A numbered list's sub-lists' marker, from its own: 1, a and i in turn (under
 * 1 it's a; under a or A, i; under i or I, 1). A bulleted list's sub-lists are bulleted.
 */
export const SUB_LIST_MARKER: Readonly<Record<ListMarker, ListMarker>> = {
  [LIST_MARKER.number]: LIST_MARKER.lowerLetter,
  [LIST_MARKER.lowerLetter]: LIST_MARKER.lowerRoman,
  [LIST_MARKER.upperLetter]: LIST_MARKER.lowerRoman,
  [LIST_MARKER.lowerRoman]: LIST_MARKER.number,
  [LIST_MARKER.upperRoman]: LIST_MARKER.number,
}

// (Each layout a single line can take as a command is one of these.)
LINE_LAYOUT.words satisfies readonly LayoutStyle[]

/** The layouts whose lines are prose rather than calculations: text blocks and title pages. */
export const PROSE_LAYOUTS: ReadonlySet<LayoutStyle> = new Set([LAYOUT_STYLE.text, LAYOUT_STYLE.titlepage])

/**
 * How a layout block's lines are arranged on the page, besides its layout, which
 * then applies within each part: `@layout.column { }` sets them side by side in
 * columns, `@layout.column(3).list { }`.
 */
export const LAYOUT_ARRANGEMENT = words({ column: 'column' })
export type LayoutArrangement = WordOf<typeof LAYOUT_ARRANGEMENT>

/**
 * How many columns a row of `@layout.column(n)` has: from 2 to 4 (more would be
 * too narrow on a page), 2 if a block with no breaks doesn't say.
 */
export const COLUMN_COUNT = { min: 2, max: 4, unbroken: 2 } as const

/**
 * What a layout block can have besides its layout: the display settings the
 * #commands give a line, for every line inside (`@layout.val.multiline {`), and
 * `hidden`, which works the block out without showing it (#hide). They combine
 * with each other and with a layout: `@layout.list(1).val {`.
 */
export const LAYOUT_MODIFIER = words({
  hidden: 'hidden',
  full: DISPLAY_MODE.full,
  sym: DISPLAY_MODE.sym,
  val: DISPLAY_MODE.val,
  multiline: MULTILINE,
  sci: NOTATION.sci,
  dec: NOTATION.dec,
})
export type LayoutModifier = WordOf<typeof LAYOUT_MODIFIER>

/** Everything that can follow `@layout.`: the layouts, the arrangements, then the display settings. */
export const LAYOUT_MEMBERS: readonly (LayoutStyle | LayoutArrangement | LayoutModifier)[] =
  [...LAYOUT_STYLE.words, ...LAYOUT_ARRANGEMENT.words, ...LAYOUT_MODIFIER.words]

// ---------------------------------------------------------------------------
// Openers
// ---------------------------------------------------------------------------

/** A layout block's opener, read: its members as written, the layout and settings they give, and its title. */
export interface LayoutOpener extends BlockSettings {
  members: string[]
  style?: LayoutStyle
  title: string
  /** `.column`, `.column(n)`: the lines in columns (the breaks are found as the block is read). */
  columns?: Columns
  /** `.list(1)`, `.list(a)`: a numbered list's marker (a list without one is bulleted). */
  marker?: ListMarker
  /** A member @layout doesn't have. */
  error?: string
  /** Members that clash, such as .sym with .val: the block still works, as described. */
  warning?: string
}

/** A member as written, read: its name, and what's in its brackets if it has them (`column(3)` → column, 3). */
export interface LayoutMember {
  name: string
  argument?: string
}

/**
 * How `@layout` blocks' openers are written and read: `@layout.list(1).val Steps {`.
 * Members combine as written; where two can't both apply (two layouts, .sym with
 * .val, .sci with .dec, a display setting on prose), there's a warning, and the
 * first layout and the last of the others are used.
 */
export class LayoutSyntax {
  /** One member, with what's in its brackets if it has them: `.column(3)` (its groups: name, argument). */
  private static readonly MEMBER = regex(src`\.${named('name', NAME)}${optional(src`\(${named('argument', '[^()\\n]*')}\)`)}`, 'g')

  /**
   * The block's name at the start of some text, with any number of members:
   * `@layout.list`, `@layout.val.multiline`, `@layout.column(3)` (its group:
   * members, each after its dot). Any name is read as a member, so one that
   * isn't gets a message rather than being taken for something else.
   */
  private static readonly NAME = src`${SIGIL}${NAMESPACE.layout}${named('members', src`(?:\.${NAME}(?:\([^()\n]*\))?)+`)}(?!${NAME_CHAR})`

  /** The opener: `@layout.list Steps {`, `@layout.val.multiline {` (its groups: members, title). */
  private static readonly OPENER = regex(src`^${LayoutSyntax.NAME}${optional(src`\s+${named('title', '.*?')}`)}\s*\{$`)

  /** The members that take something in brackets: `.column(3)`, `.list(a)`. */
  private static readonly BRACKETED: ReadonlySet<string> = new Set([LAYOUT_ARRANGEMENT.column, LAYOUT_STYLE.list])

  /** The display modes members can set, of which only one can apply: .full, .sym, .val. */
  private static readonly MODES: ReadonlySet<string> = new Set(DISPLAY_MODE.words)

  /** The block's name as written, from its members: `@layout.list`, `@layout.val.multiline`. */
  name(...members: string[]): string {
    return [`${SIGIL}${NAMESPACE.layout}`, ...members].join(MEMBER_DOT)
  }

  /** The opener as written: `@layout.list Steps {`, `@layout.text {`. */
  openerText(members: readonly string[], title = ''): string {
    return `${this.name(...members)}${title ? ` ${title}` : ''} ${BLOCK_OPEN}`
  }

  /** A block's opener as written, for messages: `@layout.list Steps {`. */
  openerOf(b: LayoutBlock): string {
    return this.openerText(b.members ?? [b.style ?? LAYOUT_STYLE.list], b.title)
  }

  /** An opener, `@layout.list(1).val Steps {`, read; null if the line isn't one. */
  read(body: string): LayoutOpener | null {
    const groups = LayoutSyntax.OPENER.exec(body)?.groups
    if (!groups) return null
    const parts = this.members(groups.members)
    const members = parts.map((p) => p.written)
    const opener: LayoutOpener = { members, title: groups.title ?? '' }
    const names = parts.map((p) => p.name)
    const unknown = names.find((x) => !LAYOUT_STYLE.has(x) && !LAYOUT_MODIFIER.has(x) && !LAYOUT_ARRANGEMENT.has(x))
    if (unknown) {
      return { ...opener, error: `${SIGIL}${NAMESPACE.layout} has no ${unknown}; its members are ${LAYOUT_MEMBERS.join(', ')}.` }
    }
    // Only .column and .list take something in brackets.
    const bracketed = parts.find((p) => p.argument !== undefined && !LayoutSyntax.BRACKETED.has(p.name))
    if (bracketed) return { ...opener, error: this.noBrackets(asMember(bracketed.name)) }
    const column = parts.findLast((p) => p.name === LAYOUT_ARRANGEMENT.column)
    const counted = columnCount(column?.argument)
    if (counted.error) return { ...opener, error: counted.error }
    if (column) opener.columns = { count: counted.count, breaks: [] }
    const list = parts.find((p) => p.name === LAYOUT_STYLE.list)
    const marked = this.marker(asMember(LAYOUT_STYLE.list), list?.argument)
    if (marked.error) return { ...opener, error: marked.error }
    opener.marker = marked.marker
    const styles = names.filter(LAYOUT_STYLE.has)
    const modifiers = names.filter(LAYOUT_MODIFIER.has)
    const modes = modifiers.filter((x) => LayoutSyntax.MODES.has(x)) as DisplayMode[]
    const notations = modifiers.filter(NOTATION.has) as Notation[]
    opener.style = styles[0]
    opener.command = modifiers.includes(LAYOUT_MODIFIER.hidden) ? LINE_COMMAND.hide : modes.at(-1)
    opener.multiline = modifiers.includes(LAYOUT_MODIFIER.multiline) || undefined
    opener.notation = notations.at(-1)
    const name = this.name(...members)
    const shown = modifiers.filter((x) => x !== LAYOUT_MODIFIER.hidden)
    const warnings = [
      styles.length > 1 && `${name} has more than one layout; it's laid out as ${asMember(styles[0])}.`,
      modes.length > 1 && `${name} has more than one of ${DISPLAY_MODE.words.map(asMember).join(', ')}; the last, ${asMember(modes.at(-1)!)}, is used.`,
      notations.length > 1 && `${name} has both ${NOTATION.words.map(asMember).join(' and ')}; the last, ${asMember(notations.at(-1)!)}, is used.`,
      opener.style && PROSE_LAYOUTS.has(opener.style) && shown.length > 0
        && `Nothing in ${this.name(opener.style)} is worked out, so ${shown.map(asMember).join(', ')} does nothing there.`,
      counted.warning,
    ].filter((w): w is string => !!w)
    if (warnings.length) opener.warning = warnings.join(' ')
    return opener
  }

  /**
   * A single line's layout command, `#list(a)`, read for what's in its
   * brackets: the list's marker, or what's wrong with it (only #list takes one).
   */
  lineMarker(layout: LineLayout, argument: string | undefined): { marker?: ListMarker; error?: string } {
    const name = `#${layout}`
    if (layout !== LINE_LAYOUT.list) return argument === undefined ? {} : { error: this.noBrackets(name) }
    return this.marker(name, argument)
  }

  /** A list's marker, from what's in its brackets as written (none: bulleted), or what's wrong with it. */
  private marker(name: string, argument: string | undefined): { marker?: ListMarker; error?: string } {
    if (argument === undefined) return {}
    const written = argument.trim()
    if (LIST_MARKER.has(written)) return { marker: written }
    return { error: `${name}(…) takes how its items are numbered, as the first would be: ${LIST_MARKER.words.join(', ')}; `
      + `${written || 'nothing'} isn't one. Without brackets, ${name} is bulleted.` }
  }

  /** The message for brackets on a member or command that takes none. */
  private noBrackets(name: string): string {
    return `${name} takes nothing in brackets; only ${asMember(LAYOUT_ARRANGEMENT.column)}(n) and ${asMember(LAYOUT_STYLE.list)}(1) do.`
  }

  /** The members of a name as written, `.val.multiline` or `.column(3).list`: each as written, and read. */
  private members(chain: string): (LayoutMember & { written: string })[] {
    return [...chain.matchAll(LayoutSyntax.MEMBER)].map((m) => ({
      written: m[0].slice(MEMBER_DOT.length), name: m.groups!.name, argument: m.groups!.argument,
    }))
  }
}

/** `@layout` blocks' openers, read and written. */
export const LAYOUT_SYNTAX = new LayoutSyntax()

/** A member written as it is in a name, for messages: `.val`. */
const asMember = (m: string) => `${MEMBER_DOT}${m}`

/**
 * `.column`'s count, `.column(3)`, read: a whole number from 2 to 4 (another is
 * rounded into that, with a warning), or what's wrong with it.
 */
function columnCount(argument: string | undefined): { count?: number; error?: string; warning?: string } {
  if (argument === undefined) return {}
  const written = Number(argument.trim())
  const name = `${asMember(LAYOUT_ARRANGEMENT.column)}(n)`
  if (!argument.trim() || !Number.isFinite(written)) return { error: `${name} takes how many columns a row has, ${COLUMN_COUNT.min} to ${COLUMN_COUNT.max}: ${argument.trim() || 'nothing'} isn't a number.` }
  const count = Math.min(COLUMN_COUNT.max, Math.max(COLUMN_COUNT.min, Math.round(written)))
  return count === written ? { count } : { count, warning: `${name} has ${COLUMN_COUNT.min} to ${COLUMN_COUNT.max} columns a row; ${argument.trim()} is set as ${count}.` }
}


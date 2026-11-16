/**
 * Reading the parts of a sheet's lines that more than one reader needs: a
 * line's note and #commands, a layout block's opener, a sheet-wide constant
 * declaration, and imported data's rows.
 */
import {
  BLOCK_CLOSE, BLOCK_OPEN, CONSTANT_DECLARATION, DISPLAY_MODES, LAYOUT_MEMBERS, LAYOUT_MODIFIER, LAYOUT_MODIFIERS, LAYOUT_OPENER,
  LAYOUT_STYLE, LAYOUT_STYLES, LINE_COMMAND, LINE_COMMANDS, LINE_LAYOUTS, MEMBER_DOT, MULTILINE, NAMESPACE, NOTATIONS, PROSE_LAYOUTS,
  SIGIL, commandPattern, layoutMembers, layoutName, layoutOpenerText,
  type DisplayMode, type LayoutModifier, type LayoutStyle, type LineLayout, type Notation,
} from '../syntax.ts'
import { constantKey } from '../names.ts'
import { parseCsv, type CsvData } from '../csv.ts'
import type { BlockSettings, Command, LayoutBlock } from '../blocks.ts'

// ---------------------------------------------------------------------------
// A line's note and #commands
// ---------------------------------------------------------------------------

/** `#sym`, `#val`, `#full`, `#hide` in a line. */
const COMMAND = commandPattern(LINE_COMMANDS, 'gi')
/** `#multiline`: a layout, so it combines with the commands above. */
const MULTILINE_COMMAND = commandPattern([MULTILINE], 'gi')
/** `#sci`, `#dec`: the notation results are shown in, which combines with the others too. */
const NOTATION_COMMAND = commandPattern(NOTATIONS, 'gi')
/** `#center`, `#list`, `#numbered`: how one line is laid out. */
const LAYOUT = commandPattern(LINE_LAYOUTS, 'gi')

/** A line split into its body, its #commands and its note. */
export interface SplitLine {
  body: string
  note?: string
  command?: Command
  multiline: boolean
  notation?: Notation
  layout?: LineLayout
}

/**
 * Split a line into its body, display command and note:
 * `F = m * a  #val  # weight` → body `F = m * a`, command `val`, note `weight`.
 * Only the known commands are taken; any other `#word` stays in the note.
 */
export function splitNote(text: string): SplitLine {
  let command: Command | undefined
  let multiline = false
  let notation: Notation | undefined
  let layout: LineLayout | undefined
  const rest = text
    .replace(LAYOUT, (_m, space: string, style: string) => {
      layout = style.toLowerCase() as LineLayout
      return space
    })
    .replace(COMMAND, (_m, space: string, cmd: string) => {
      command = cmd.toLowerCase() as Command
      return space
    })
    .replace(MULTILINE_COMMAND, (_m, space: string) => {
      multiline = true
      return space
    })
    .replace(NOTATION_COMMAND, (_m, space: string, n: string) => {
      notation = n.toLowerCase() as Notation
      return space
    })
  const hash = rest.indexOf('#')
  if (hash < 0) return { body: rest.trim(), command, multiline, notation, layout }
  return { body: rest.slice(0, hash).trim(), note: rest.slice(hash + 1).trim() || undefined, command, multiline, notation, layout }
}

// ---------------------------------------------------------------------------
// Blocks
// ---------------------------------------------------------------------------

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

/** A layout block's opener, read: its members as written, the layout and settings they give, and its title. */
export interface LayoutOpener extends BlockSettings {
  members: string[]
  style?: LayoutStyle
  title: string
  /** A member @layout doesn't have. */
  error?: string
  /** Members that clash, such as .sym with .val: the block still works, as described. */
  warning?: string
}

const isLayoutStyle = (m: string): m is LayoutStyle => (LAYOUT_STYLES as readonly string[]).includes(m)
const isLayoutModifier = (m: string): m is LayoutModifier => (LAYOUT_MODIFIERS as readonly string[]).includes(m)

/** The display modes a layout block's members can set, of which only one can apply: .full, .sym, .val. */
const MODE_MODIFIERS: ReadonlySet<string> = new Set(DISPLAY_MODES)

/** A member written as it is in a name, for messages: `.val`. */
const asMember = (m: string) => `${MEMBER_DOT}${m}`

/**
 * A layout block's opener, `@layout.numbered.val Steps {`, read; null if the line
 * isn't one. Members combine as written; where two can't both apply (two layouts,
 * .sym with .val, .sci with .dec, a display setting on prose), there's a warning,
 * and the first layout and the last of the others are used.
 */
export function layoutOpener(body: string): LayoutOpener | null {
  const m = LAYOUT_OPENER.exec(body)
  if (!m) return null
  const members = layoutMembers(m[1])
  const opener: LayoutOpener = { members, title: m[2] ?? '' }
  const unknown = members.find((x) => !isLayoutStyle(x) && !isLayoutModifier(x))
  if (unknown) {
    return { ...opener, error: `${SIGIL}${NAMESPACE.layout} has no ${unknown}; its members are ${LAYOUT_MEMBERS.join(', ')}.` }
  }
  const styles = members.filter(isLayoutStyle)
  const modifiers = members.filter(isLayoutModifier)
  const modes = modifiers.filter((x) => MODE_MODIFIERS.has(x)) as DisplayMode[]
  const notations = modifiers.filter((x) => (NOTATIONS as readonly string[]).includes(x)) as Notation[]
  opener.style = styles[0]
  opener.command = modifiers.includes(LAYOUT_MODIFIER.hidden) ? LINE_COMMAND.hide : modes.at(-1)
  opener.multiline = modifiers.includes(LAYOUT_MODIFIER.multiline) || undefined
  opener.notation = notations.at(-1)
  const name = layoutName(...members)
  const shown = modifiers.filter((x) => x !== LAYOUT_MODIFIER.hidden)
  const warnings = [
    styles.length > 1 && `${name} has more than one layout; it's laid out as ${asMember(styles[0])}.`,
    modes.length > 1 && `${name} has more than one of ${DISPLAY_MODES.map(asMember).join(', ')}; the last, ${asMember(modes.at(-1)!)}, is used.`,
    notations.length > 1 && `${name} has both ${NOTATIONS.map(asMember).join(' and ')}; the last, ${asMember(notations.at(-1)!)}, is used.`,
    opener.style && PROSE_LAYOUTS.has(opener.style) && shown.length > 0
      && `Nothing in ${layoutName(opener.style)} is worked out, so ${shown.map(asMember).join(', ')} does nothing there.`,
  ].filter((w): w is string => !!w)
  if (warnings.length) opener.warning = warnings.join(' ')
  return opener
}

/** A layout block's opener as written, for messages: `@layout.list Steps {`. */
export const openerText = (b: LayoutBlock) => layoutOpenerText(b.members ?? [b.style ?? LAYOUT_STYLE.list], b.title)

// ---------------------------------------------------------------------------
// Sheet-wide constant declarations
// ---------------------------------------------------------------------------

/**
 * A line that sets a constant's precision and/or display unit sheet-wide: `@c:4`,
 * `@a_0:3 to angstrom`, `@chem.mm.Na:3`. Its name as typed (chem.mm.Na), and inside (chem__mm__Na).
 */
export interface ConstantDeclaration { name: string; key: string; precision?: string; unit?: string }

/** A constant declaration's parts, or null if the line isn't one (`@c` alone isn't). */
export function parseConstantDeclaration(body: string): ConstantDeclaration | null {
  const m = CONSTANT_DECLARATION.exec(body)
  if (!m || (m[2] === undefined && m[3] === undefined)) return null
  return { name: m[1], key: constantKey(m[1]), precision: m[2], unit: m[3] }
}

// ---------------------------------------------------------------------------
// Imported data
// ---------------------------------------------------------------------------

/**
 * Imported data as read, kept between evaluations of the sheet (one per edit)
 * while its rows don't change, so it isn't read again, and its values (made
 * once per column read; see the engine) are reused. Only the latest few are kept.
 */
const readData = new Map<string, CsvData>()
const KEPT_IMPORTS = 8

/** Imported data's rows, read (or as read last time, if they haven't changed). */
export function readCsv(rows: string[]): CsvData {
  const key = rows.join('\n')
  let data = readData.get(key)
  if (!data) {
    data = parseCsv(rows)
    readData.set(key, data)
    if (readData.size > KEPT_IMPORTS) readData.delete(readData.keys().next().value!)
  }
  return data
}

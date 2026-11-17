/**
 * Display commands, `#sym`, `#val`, `#multiline`, `#sci`, `#center`, … after a
 * line or a block's opener, and the note after them: `F = m * a  #val  # weight`.
 */
import { NOTATION, type Notation } from './settings.ts'
import { named, regex, src, words, type WordOf } from './patterns.ts'

/**
 * How much of a calculation to show:
 *   full  F = m·a = 2.0 kg · 9.81 m/s² = 19.6 N
 *   sym   F = m·a                       (the equation only)
 *   val   F = 19.6 N                    (the result only)
 */
export const DISPLAY_MODE = words({ full: 'full', sym: 'sym', val: 'val' })
export type DisplayMode = WordOf<typeof DISPLAY_MODE>

/** The commands on a line: how much to show of it, or hide it. */
export const LINE_COMMAND = words({ full: DISPLAY_MODE.full, sym: DISPLAY_MODE.sym, val: DISPLAY_MODE.val, hide: 'hide' })
export type LineCommand = WordOf<typeof LINE_COMMAND>

/** `#multiline`: one `=` per row; a layout, so it combines with the commands above. */
export const MULTILINE = 'multiline'

/**
 * The layouts a single line can take as a command: `F = m * a  #center`. (Each
 * is one of @layout's layouts, as layout.ts checks; prose and title pages are blocks only.)
 */
export const LINE_LAYOUT = words({ center: 'center', list: 'list', numbered: 'numbered' })
export type LineLayout = WordOf<typeof LINE_LAYOUT>

/** Every display command, in the order the editor lists them. (`#sci` and `#dec` are the notations.) */
export const COMMAND_NAMES = [...LINE_COMMAND.words, MULTILINE, ...NOTATION.words, ...LINE_LAYOUT.words] as const
export type CommandName = LineCommand | typeof MULTILINE | Notation | LineLayout

/**
 * One of `names` written as a command: `#name` on its own, not inside a word
 * (its groups: before, the space or start before it, and name).
 */
export const commandPattern = (names: readonly string[], flags = '') =>
  regex(src`${named('before', '^|\\s')}#${named('name', names.join('|'))}(?=\s|$)`, flags)

// ---------------------------------------------------------------------------
// A line split into its body, #commands and note
// ---------------------------------------------------------------------------

/** `#sym`, `#val`, `#full`, `#hide` in a line. */
const COMMAND = commandPattern(LINE_COMMAND.words, 'gi')
/** `#multiline`: a layout, so it combines with the commands above. */
const MULTILINE_COMMAND = commandPattern([MULTILINE], 'gi')
/** `#sci`, `#dec`: the notation results are shown in, which combines with the others too. */
const NOTATION_COMMAND = commandPattern(NOTATION.words, 'gi')
/** `#center`, `#list`, `#numbered`: how one line is laid out. */
const LAYOUT_COMMAND = commandPattern(LINE_LAYOUT.words, 'gi')

/** Where a note starts: the first `#` that isn't a command's. */
const NOTE_MARK = '#'

/** A line split into its body, its #commands and its note. */
export interface SplitLine {
  body: string
  note?: string
  command?: LineCommand
  multiline: boolean
  notation?: Notation
  layout?: LineLayout
}

/** The groups a command pattern's match has. */
type CommandGroups = { before: string; name: string }

/**
 * Split a line into its body, display command and note:
 * `F = m * a  #val  # weight` → body `F = m * a`, command `val`, note `weight`.
 * Only the known commands are taken; any other `#word` stays in the note.
 */
export function splitNote(text: string): SplitLine {
  let command: LineCommand | undefined
  let multiline = false
  let notation: Notation | undefined
  let layout: LineLayout | undefined
  // Each command found is taken out of the line, leaving the space before it.
  const take = (pattern: RegExp, found: (name: string) => void) => (line: string) =>
    line.replace(pattern, (...args) => {
      const groups = args.at(-1) as CommandGroups
      found(groups.name.toLowerCase())
      return groups.before
    })
  const rest = [
    take(LAYOUT_COMMAND, (name) => { layout = name as LineLayout }),
    take(COMMAND, (name) => { command = name as LineCommand }),
    take(MULTILINE_COMMAND, () => { multiline = true }),
    take(NOTATION_COMMAND, (name) => { notation = name as Notation }),
  ].reduce((line, step) => step(line), text)
  const hash = rest.indexOf(NOTE_MARK)
  if (hash < 0) return { body: rest.trim(), command, multiline, notation, layout }
  return { body: rest.slice(0, hash).trim(), note: rest.slice(hash + 1).trim() || undefined, command, multiline, notation, layout }
}

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

/** Every display command, wherever it is in a line: `#val`, `#multiline`, `#sci`, `#center`. */
const ANY_COMMAND = commandPattern(COMMAND_NAMES, 'gi')

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

/** What each piece of a noted line is: its body, a #command, or its note. */
export const NOTED_PIECE = words({ body: 'body', command: 'command', note: 'note' })
export type NotedPieceKind = WordOf<typeof NOTED_PIECE>

/** A piece of a noted line, where it is in the line: `start` up to (not including) `end`. */
export interface NotedPiece {
  kind: NotedPieceKind
  start: number
  end: number
}

/** A line read for its #commands and note: what they say (SplitLine), and where each piece is. */
export interface NotedLine extends SplitLine {
  /** The line's pieces, in order, end to end: together they're the whole line. */
  pieces: readonly NotedPiece[]
}

/**
 * A line read for its body, #commands and note, in one pass:
 * `F = m * a  #val  # weight` → body `F = m * a`, command `val`, note `weight`.
 * Only the known commands are taken (anywhere in the line, after the note's `#`
 * too; of each sort, the last); any other `#word` stays in the note, which runs
 * from the first `#` that isn't a command's. (The tree's tokens for the line are
 * its pieces: tree/lines.ts.)
 */
export function readNoted(text: string): NotedLine {
  const out: Omit<NotedLine, 'body' | 'pieces'> = { multiline: false }
  // The commands, each without the space before it.
  const commands = [...text.matchAll(ANY_COMMAND)].map((m) => {
    const start = m.index + m.groups!.before.length
    const name = m.groups!.name.toLowerCase()
    if (LINE_LAYOUT.has(name)) out.layout = name
    else if (LINE_COMMAND.has(name)) out.command = name
    else if (NOTATION.has(name)) out.notation = name
    else out.multiline = true
    return { start, end: m.index + m[0].length }
  })
  const inCommand = (i: number) => commands.some((c) => i >= c.start && i < c.end)
  let noteAt = text.indexOf(NOTE_MARK)
  while (noteAt >= 0 && inCommand(noteAt)) noteAt = text.indexOf(NOTE_MARK, noteAt + 1)
  // The pieces: the text between commands, split where the note starts.
  const pieces: NotedPiece[] = []
  const between = (start: number, end: number) => {
    const at = (kind: NotedPieceKind, from: number, to: number) => {
      if (to > from) pieces.push({ kind, start: from, end: to })
    }
    if (noteAt < 0 || end <= noteAt) at(NOTED_PIECE.body, start, end)
    else if (start >= noteAt) at(NOTED_PIECE.note, start, end)
    else {
      at(NOTED_PIECE.body, start, noteAt)
      at(NOTED_PIECE.note, noteAt, end)
    }
  }
  let at = 0
  for (const c of commands) {
    between(at, c.start)
    pieces.push({ kind: NOTED_PIECE.command, start: c.start, end: c.end })
    at = c.end
  }
  between(at, text.length)
  // What the body and note say: their pieces' text (each command leaves the space before it).
  const textOf = (kind: NotedPieceKind) => pieces.filter((p) => p.kind === kind).map((p) => text.slice(p.start, p.end)).join('')
  const note = noteAt < 0 ? undefined : textOf(NOTED_PIECE.note).slice(NOTE_MARK.length).trim() || undefined
  // (Frozen: the tree keeps it with the line's node, which every sheet with the line shares.)
  return Object.freeze({ ...out, body: textOf(NOTED_PIECE.body).trim(), note, pieces: Object.freeze(pieces) })
}

/**
 * A line split into its body, display command and note (readNoted, without
 * where each piece is): `F = m * a  #val  # weight` → body `F = m * a`, command
 * `val`, note `weight`.
 */
export function splitNote(text: string): SplitLine {
  const { pieces: _pieces, ...split } = readNoted(text)
  return split
}

/** Between the pieces of a line carried on over several (its bodies, its notes), when they're joined into one. */
export const CARRIED_JOIN = ' '

/**
 * The lines a line is carried on over, each split, as one line: their bodies
 * joined, their notes joined, and of each sort of command the last (as on one
 * line). `val = @series(  # values`, `1234,`, `5678  #val`, `)` → body
 * `val = @series( 1234, 5678 )`, command `val`, note `values`.
 */
export function joinSplit(lines: readonly SplitLine[]): SplitLine {
  const joined = (texts: (string | undefined)[]) => texts.filter(Boolean).join(CARRIED_JOIN)
  const last = <K extends keyof SplitLine>(key: K) => lines.findLast((l) => l[key] !== undefined)?.[key]
  return {
    body: joined(lines.map((l) => l.body)),
    note: joined(lines.map((l) => l.note)) || undefined,
    command: last('command'),
    multiline: lines.some((l) => l.multiline),
    notation: last('notation'),
    layout: last('layout'),
  }
}

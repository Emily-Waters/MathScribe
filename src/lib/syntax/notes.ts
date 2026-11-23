/**
 * The note after a line, after its `//`: `F = m * a  // weight`, shown beside
 * the line. (A line that's all comment, `// check the units`, is never shown:
 * text.ts.) How a line is shown is set by the `@layout` block around it.
 */
import { words, type WordOf } from './patterns.ts'
import { COMMENT_START } from './text.ts'

/** Where a note starts: the line's first `//` outside a quoted string (`@import("http://…")` keeps its own). */
const NOTE_MARK = COMMENT_START

/** The quote a string is written in: `@import("run1.csv")`. */
const QUOTE = '"'

/** A line split into its body and its note. */
export interface SplitLine {
  body: string
  note?: string
}

/** What each piece of a noted line is: its body or its note. */
export const NOTED_PIECE = words({ body: 'body', note: 'note' })
export type NotedPieceKind = WordOf<typeof NOTED_PIECE>

/** A piece of a noted line, where it is in the line: `start` up to (not including) `end`. */
export interface NotedPiece {
  kind: NotedPieceKind
  start: number
  end: number
}

/** A line read for its note: what it says (SplitLine), and where each piece is. */
export interface NotedLine extends SplitLine {
  /** The line's pieces, in order, end to end: together they're the whole line. */
  pieces: readonly NotedPiece[]
}

/** Where a line's note starts: its first `//` outside quotes (-1 if it has none). */
function noteStart(text: string): number {
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    if (text[i] === QUOTE) quoted = !quoted
    else if (!quoted && text.startsWith(NOTE_MARK, i)) return i
  }
  return -1
}

/**
 * A line read for its body and note, in one pass: `F = m * a  // weight` →
 * body `F = m * a`, note `weight`. (The tree's tokens for the line are its
 * pieces: tree/lines.ts.)
 */
export function readNoted(text: string): NotedLine {
  const noteAt = noteStart(text)
  const bodyEnd = noteAt < 0 ? text.length : noteAt
  const pieces: NotedPiece[] = []
  if (bodyEnd > 0) pieces.push({ kind: NOTED_PIECE.body, start: 0, end: bodyEnd })
  if (noteAt >= 0) pieces.push({ kind: NOTED_PIECE.note, start: noteAt, end: text.length })
  const note = noteAt < 0 ? undefined : text.slice(noteAt + NOTE_MARK.length).trim() || undefined
  // (Frozen: the tree keeps it with the line's node, which every sheet with the line shares.)
  return Object.freeze({ body: text.slice(0, bodyEnd).trim(), note, pieces: Object.freeze(pieces) })
}

/**
 * A line split into its body and note (readNoted, without where each piece
 * is): `F = m * a  // weight` → body `F = m * a`, note `weight`.
 */
export function splitNote(text: string): SplitLine {
  const { pieces: _pieces, ...split } = readNoted(text)
  return split
}

/** Between the pieces of a line carried on over several (its bodies, its notes), when they're joined into one. */
export const CARRIED_JOIN = ' '

/**
 * The lines a line is carried on over, each split, as one line: their bodies
 * joined, and their notes. `val = [  // values`, `1234,`, `5678`, `]` → body
 * `val = [ 1234, 5678 ]`, note `values`.
 */
export function joinSplit(lines: readonly SplitLine[]): SplitLine {
  const joined = (texts: (string | undefined)[]) => texts.filter(Boolean).join(CARRIED_JOIN)
  return { body: joined(lines.map((l) => l.body)), note: joined(lines.map((l) => l.note)) || undefined }
}

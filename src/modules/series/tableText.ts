/**
 * A sheet's tables as text, for the grid editor (tableEditor.tsx): where each
 * is (a typed table, `@table { … }`, and a table of series, `@table(t, x)`),
 * what each says, as the grid shows it, and the text the grid writes back.
 *
 *   A typed table: its settings, and its rows' cells, written back a row a
 *   line, its columns lined up:
 *
 *       @table(title "Observations") {
 *           Trial | Mass $m$ | Colour
 *           1     | 12.3 g   | pale blue
 *       }
 *
 *   A table of series: its columns (what's between its brackets, each a series
 *   or a column worked out from them) and its settings, after a semicolon.
 */
import {
  ASSIGN, BLOCK_CLOSE, BLOCK_OPEN, CELL_SEPARATOR, INDENT, MATHS_MARK, ROUND_BRACKETS, SEPARATOR, SIGIL, TOKEN_KIND, encode, isToken,
  outsideMaths, sheetStatements, splitArgs, textOf, type Part, type SheetStatement,
} from '../../lib/plugin.ts'
import { SERIES_NODE } from './grammar.ts'
import { CALLS_WITH_SETTINGS, SERIES_CALL, type CallWithSettings as CallKind } from './syntax.ts'
import { SETTINGS_START, splitCallArgs } from './tableSettings.ts'
import { TABLE_NAME, openerSettingsText, rowCells } from './typedTable.ts'

// ---------------------------------------------------------------------------
// Where the tables (and plots) are
// ---------------------------------------------------------------------------

/** A table's or plot's call: which, where it starts (its `@`), and where what's between its brackets is (offsets in the sheet's text). */
export interface SettingsCall {
  readonly kind: CallKind
  readonly start: number
  readonly from: number
  readonly to: number
}

/** A token of a statement, and where it starts in the sheet's text. */
interface Placed {
  readonly t: string
  readonly text: string
  readonly at: number
}

/** A statement's tokens (the tree's: sheetStatements), each where it is in the sheet's text. */
const placedTokens = ({ statement, starts }: SheetStatement): Placed[] =>
  statement.tokens.map(({ token, line, at }) => ({ t: token.t, text: token.text, at: starts[line] + at }))

/** The calls with a ⚙, as written (`@table`), and which each is. */
const CALLED: ReadonlyMap<string, CallKind> = new Map(CALLS_WITH_SETTINGS.map((kind) => [`${SIGIL}${kind}`, kind]))

const isDelimiter = (p: Placed | undefined, text: string) => p?.t === TOKEN_KIND.delimiter && p.text === text
const isSpace = (p: Placed | undefined) => p?.t === TOKEN_KIND.space

/** Whether the token at `i` is the first thing said on its line, or after the name it's given (`p = @plot(…)`). */
function startsLine(tokens: readonly Placed[], i: number): boolean {
  let j = i - 1
  while (isSpace(tokens[j])) j--
  if (isDelimiter(tokens[j], ASSIGN)) {
    j--
    while (isSpace(tokens[j])) j--
    if (tokens[j]?.t !== TOKEN_KIND.symbol) return false
    j--
  }
  return j < 0 || tokens[j].t === TOKEN_KIND.indent || tokens[j].t === TOKEN_KIND.eol
}

/** The index of the `)` closing the `(` at `open` (on a later line, for a call over several), or -1. */
function closingAt(tokens: readonly Placed[], open: number): number {
  let depth = 0
  for (let i = open; i < tokens.length; i++) {
    if (isDelimiter(tokens[i], ROUND_BRACKETS.open)) depth++
    else if (isDelimiter(tokens[i], ROUND_BRACKETS.close) && --depth === 0) return i
  }
  return -1
}

/**
 * Every table and plot written as a line of its own (or a line carried on over
 * several), from the sheet's statements: a call to one, at the start of its line
 * or after the name it's given, and the bracket closing it, in the same statement.
 */
export function settingsCalls(text: string): SettingsCall[] {
  const calls: SettingsCall[] = []
  for (const statement of sheetStatements(encode(text).body)) {
    const tokens = placedTokens(statement)
    tokens.forEach((token, i) => {
      const kind = token.t === TOKEN_KIND.builtin ? CALLED.get(token.text) : undefined
      if (!kind || !startsLine(tokens, i)) return
      let open = i + 1
      while (isSpace(tokens[open])) open++
      if (!isDelimiter(tokens[open], ROUND_BRACKETS.open)) return
      const close = closingAt(tokens, open)
      if (close >= 0) calls.push({ kind, start: token.at, from: tokens[open].at + ROUND_BRACKETS.open.length, to: tokens[close].at })
    })
  }
  return calls
}

/** The kinds of table the grid edits. */
export const TABLE_KIND = { typed: 'typed', series: 'series' } as const
export type TableKind = (typeof TABLE_KIND)[keyof typeof TABLE_KIND]

/** A table in a sheet's text: which kind, where its text is (offsets), and the line it starts on (from 1). */
export interface SheetTable {
  readonly kind: TableKind
  /** A typed table's: the start of its opener's line (its indentation too); a table of series': its `@`. */
  readonly start: number
  /** Just after its `}` (a typed table's) or its `)`. */
  readonly end: number
  readonly line: number
  /** How far in its first line is. */
  readonly indent: string
  /** For the ⚙: just after its opener's `{` (a typed table's) or its `)`. */
  readonly button: number
}

const LINE_BREAK = '\n'
const lineAt = (text: string, offset: number) => text.slice(0, offset).split(LINE_BREAK).length
const indentAt = (text: string, offset: number) => /^[ \t]*/.exec(text.slice(text.lastIndexOf(LINE_BREAK, offset - 1) + 1))![0]

/** The typed tables in a sheet's tree, each closed by its `}` (one that isn't runs to the end of the sheet, so isn't offered). */
function typedTables(text: string): SheetTable[] {
  const found: SheetTable[] = []
  const visit = (parts: readonly Part[], from: number) => {
    let at = from
    for (const p of parts) {
      const length = textOf(p).length
      if (!isToken(p)) {
        if (p.kind === SERIES_NODE.table) {
          const said = textOf(p).trimEnd()
          const closer = p.parts.at(-1)
          if (closer && textOf(closer).trimStart().startsWith(BLOCK_CLOSE)) {
            const opener = textOf(p.parts[0])
            found.push({
              kind: TABLE_KIND.typed, start: at, end: at + said.length, line: lineAt(text, at), indent: indentAt(text, at),
              button: at + opener.indexOf(BLOCK_OPEN) + BLOCK_OPEN.length,
            })
          }
        } else if (p.parts.length && !isToken(p.parts[0])) visit(p.parts, at)
      }
      at += length
    }
  }
  visit(encode(text).body, 0)
  return found
}

/** Every table in a sheet's text that the grid edits, in the order they're written. */
export function sheetTables(text: string): SheetTable[] {
  const series = settingsCalls(text).filter((c) => c.kind === SERIES_CALL.table).map((c): SheetTable => ({
    kind: TABLE_KIND.series, start: c.start, end: c.to + ROUND_BRACKETS.close.length, line: lineAt(text, c.start), indent: indentAt(text, c.start),
    button: c.to + ROUND_BRACKETS.close.length,
  }))
  return [...typedTables(text), ...series].sort((a, b) => a.start - b.start)
}

// ---------------------------------------------------------------------------
// A typed table
// ---------------------------------------------------------------------------

/** A typed table as the grid shows it: its settings' text, its opener's note, and its rows (the first its header), each as many cells. */
export interface TypedTableModel {
  readonly settings: string
  readonly note?: string
  readonly rows: readonly (readonly string[])[]
}

/** A typed table's text (from its opener to its `}`) as the grid shows it: every row as many cells as the longest, and at least one. */
export function readTypedTable(text: string): TypedTableModel {
  const block = encode(text.trimStart()).body[0]
  const opener = block?.parts[0]
  const openerParts = opener && !isToken(opener) ? opener.parts : []
  const tokenOf = (t: string) => openerParts.find((p) => isToken(p) && p.t === t)
  const name = tokenOf(TOKEN_KIND.blockName)
  const note = tokenOf(TOKEN_KIND.note)
  const written = (block?.parts ?? []).filter((p) => !isToken(p) && p.kind === SERIES_NODE.tableRow).map((p) => rowCells((p as { parts: readonly Part[] }).parts))
  const columns = Math.max(1, ...written.map((cells) => cells.length))
  const rows = (written.length ? written : [[]]).map((cells) => Array.from({ length: columns }, (_, i) => cells[i] ?? ''))
  return { settings: (name && openerSettingsText(textOf(name))) ?? '', note: note && textOf(note), rows }
}

/** A cell as written in a row: a `|` of its own (outside maths) as maths, `$|$`, so it isn't read as the end of the cell. */
const cellText = (cell: string) => outsideMaths(cell.trim(), (part) => part.split(CELL_SEPARATOR).join(`${MATHS_MARK}${CELL_SEPARATOR}${MATHS_MARK}`))

/** Between a row's cells, as written. */
const BETWEEN_CELLS = ` ${CELL_SEPARATOR} `

/** A typed table as text, `indent` in: its opener (its settings in brackets, if any; its note), its rows a line each, a level in, their columns lined up, and its `}`. */
export function writeTypedTable({ settings, note, rows }: TypedTableModel, indent: string): string {
  const cells = rows.map((row) => row.map(cellText))
  const widths = cells[0]?.map((_, i) => Math.max(...cells.map((row) => row[i]?.length ?? 0))) ?? []
  const lines = cells.map((row) => `${indent}${INDENT}${row.map((c, i) => c.padEnd(widths[i])).join(BETWEEN_CELLS)}`.trimEnd())
  const opener = `${indent}${TABLE_NAME}${settings.trim() ? `(${settings.trim()})` : ''} ${BLOCK_OPEN}${note ? `  ${note}` : ''}`
  return [opener, ...lines, `${indent}${BLOCK_CLOSE}`].join(LINE_BREAK)
}

// ---------------------------------------------------------------------------
// A table of series
// ---------------------------------------------------------------------------

/** A table of series as the grid shows it: its columns (each as written: `t`, `v = x / t`), and its settings' text. */
export interface SeriesTableModel {
  readonly columns: readonly string[]
  readonly settings: string
  /** Whether it's written over several lines (and so is written back that way). */
  readonly multiline: boolean
}

/** A table of series' call, `@table(t, x; lines header)`, as the grid shows it. */
export function readSeriesTable(call: string): SeriesTableModel {
  const inner = call.slice(call.indexOf(ROUND_BRACKETS.open) + ROUND_BRACKETS.open.length, call.lastIndexOf(ROUND_BRACKETS.close))
  const { columns, settings } = splitCallArgs(inner)
  return {
    columns: splitArgs(columns).map((c) => c.trim()).filter(Boolean),
    settings: settings?.trim() ?? '',
    multiline: call.includes(LINE_BREAK),
  }
}

/**
 * A table of series' call as text: on one line, `@table(t, x; lines header)`; or,
 * as it was, over several, a column a line and its settings after them, as the
 * formatter lays one out (its first line `indent` in).
 */
export function writeSeriesTable({ columns, settings, multiline }: SeriesTableModel, indent: string): string {
  const kept = columns.map((c) => c.trim()).filter(Boolean)
  const said = settings.trim()
  if (!multiline) return `${TABLE_NAME}${ROUND_BRACKETS.open}${kept.join(`${SEPARATOR} `)}${said ? `${SETTINGS_START} ${said}` : ''}${ROUND_BRACKETS.close}`
  const inner = `${indent}${INDENT}`
  const lines = kept.map((c, i) => `${inner}${c}${i < kept.length - 1 ? SEPARATOR : said ? SETTINGS_START : ''}`)
  return [`${TABLE_NAME}${ROUND_BRACKETS.open}`, ...lines, ...(said ? [`${inner}${said}`] : []), `${indent}${ROUND_BRACKETS.close}`].join(LINE_BREAK)
}

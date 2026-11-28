/**
 * A table's settings, kept in the sheet after a semicolon inside its brackets,
 * `@table(t, x, v = x / t; rows 5-20, lines header, numbers off, all rows)`,
 * each declared once (TABLE_SETTINGS, below: how it's written and what it
 * does), from which they're read, written back and listed in their error. The
 * table's ⚙ button in the editor writes them, so they don't need typing.
 *
 * Also the pieces of a call's brackets the series module's calls share: the
 * words settings are written with, and splitting the columns from the settings.
 */

import {
  ChoiceSetting, FlagSetting, INDENT, NameSetting, RowsSetting, SettingsSpec, SwitchSetting, TitleSetting, matchesDelimiter, topLevelAt,
} from '../../lib/plugin.ts'
import { SETTINGS_START } from './syntax.ts'

// (The settings text's own pieces are the language's: lib/language/settings.ts.)
export { formatRowRange, parseRowRange, settingParts } from '../../lib/plugin.ts'

/** How a table's lines are drawn: under the header, around every cell (the default), or none. */
export const TABLE_LINE = { header: 'header', grid: 'grid', none: 'none' } as const
export type TableLines = (typeof TABLE_LINE)[keyof typeof TABLE_LINE]
export const TABLE_LINES: readonly TableLines[] = Object.values(TABLE_LINE)

export interface TableSettings {
  /** The first and last row shown (either may be left open). */
  from?: number
  to?: number
  lines: TableLines
  /** Show the row numbers down the side. */
  numbers: boolean
  /** The series whose values go down the side instead, as the rows' labels: `labels salts`. */
  labels?: string
  /** Show each value's uncertainty, ± (`uncertainty off`: the values alone). */
  uncertainty: boolean
  /** Show every row, however many. */
  allRows: boolean
  /** Its caption: `title "Reactivity of the halogens"`. */
  title?: string
}

export const DEFAULT_TABLE_SETTINGS: TableSettings = { lines: TABLE_LINE.grid, numbers: true, uncertainty: true, allRows: false }

// ---------------------------------------------------------------------------
// The words settings are written with (shared by table and plot)
// ---------------------------------------------------------------------------

/** Each setting's word. */
export const SETTING = {
  rows: 'rows',
  lines: 'lines',
  numbers: 'numbers',
  labels: 'labels',
  uncertainty: 'uncertainty',
  allRows: 'all rows',
  on: 'on',
  off: 'off',
  style: 'style',
  fit: 'fit',
  log: 'log',
  title: 'title',
  equation: 'equation',
  legend: 'legend',
  xlabel: 'xlabel',
  ylabel: 'ylabel',
  colour: 'colour',
  /** `colour`, as it's spelt in American English too. */
  color: 'color',
  from: 'from',
  to: 'to',
} as const


/** Between a call's lines, when it's over several. */
const LINE_BREAK = '\n'
/**
 * What's between a table's or plot's brackets, split at its first semicolon
 * at the top level (as the tree reads it: not in brackets or a label in
 * quotes) into the columns and the settings.
 */
export function splitCallArgs(inner: string): { columns: string; settings?: string } {
  const at = topLevelAt(inner, matchesDelimiter(SETTINGS_START))
  return at < 0 ? { columns: inner } : { columns: inner.slice(0, at), settings: inner.slice(at + SETTINGS_START.length) }
}

/**
 * A table's or plot's line with new settings text, written after a semicolon
 * in its brackets (or taken out, if `text` is empty). `inner`: where what's
 * between the brackets is, in the line. Whatever's between the last of it and
 * the closing bracket stays (a call over several lines keeps its `)` on a line
 * of its own). In a call over several lines, the settings go on a line of
 * their own after the `;`, a level in from the `)`, as the formatter lays it
 * out, so the ⚙ never leaves the sheet as the formatter wouldn't.
 */
export function withSettingsText(line: string, inner: { from: number; to: number }, text: string): string {
  const inside = line.slice(inner.from, inner.to)
  const { columns } = splitCallArgs(inside)
  const before = inside.slice(inside.trimEnd().length)
  const closeIndent = before.slice(before.lastIndexOf(LINE_BREAK) + 1)
  const settings = !text ? ''
    : before.includes(LINE_BREAK) ? `${SETTINGS_START}${LINE_BREAK}${closeIndent}${INDENT}${text}`
      : `${SETTINGS_START} ${text}`
  return `${line.slice(0, inner.from)}${columns.trimEnd()}${settings}${before}${line.slice(inner.to)}`
}

/** A table's settings from their text, or what's wrong with them (as declared: TABLE_SETTINGS). */
export const parseTableSettings = (text: string | undefined) => TABLE_SETTINGS.parse(text)

/** Settings as text, leaving out the defaults ('' if there's nothing to say). */
export const formatTableSettings = (s: TableSettings): string => TABLE_SETTINGS.format(s)

/** A table line's text with new settings (written after a semicolon, or taken out if they're all defaults). */
export const withTableSettings = (line: string, inner: { from: number; to: number }, s: TableSettings): string =>
  withSettingsText(line, inner, formatTableSettings(s))

// ---------------------------------------------------------------------------
// A table's settings, declared (the language's settings: lib/language/settings.ts)
// ---------------------------------------------------------------------------

/** How a table's lines are drawn, as a setting of a table of series and of a typed table both: its choices, and what's said of it. */
const LINES = {
  choices: [
    { value: TABLE_LINE.header, label: 'Under the header', means: 'a line under the header, and after the row headers' },
    { value: TABLE_LINE.grid, label: 'Grid', means: 'a line around every cell (as it is by itself)' },
    { value: TABLE_LINE.none, label: 'None', means: 'no lines' },
  ],
  about: { label: 'Lines', summary: 'How its lines are drawn.' },
} as const

/** What's said of a table's caption, a setting of a table of series and of a typed table both. */
const TITLE_ABOUT = { label: 'Title', summary: 'Its caption, quoted so it can hold commas: title "Reactivity of the halogens".' } as const

/** A table's settings, each declared once: how it's written, what it does and its ⚙ control, in the order they're written back. */
export const TABLE_SETTINGS = new SettingsSpec<TableSettings>('table', () => ({ ...DEFAULT_TABLE_SETTINGS }), [
  new RowsSetting({
    label: 'Rows',
    summary: 'Only these rows: rows 5-20, rows 5- (from 5 on), rows -20 (up to 20), rows 7.',
    help: 'Leave a row box empty for the first or last row. These are kept in the table’s brackets, after a semicolon.',
  }),
  new ChoiceSetting(SETTING.lines, 'lines', LINES.choices, TABLE_LINE.header, LINES.about),
  new SwitchSetting(SETTING.numbers, 'numbers', { label: 'Row numbers', summary: 'Row numbers down the side; numbers off leaves them out.' }),
  new NameSetting(SETTING.labels, 'labels', 'salts', {
    label: 'Row labels',
    summary: 'A series\' values down the side, in the row numbers\' place.',
    help: 'A series whose values go down the side in place of the row numbers: salts = ["KCl", "KBr"].',
  }),
  new SwitchSetting(SETTING.uncertainty, 'uncertainty', { label: 'Show uncertainty', summary: 'Each value with ± its uncertainty; uncertainty off shows the values alone.' }),
  new FlagSetting(SETTING.allRows, 'allRows', { label: 'Show every row', summary: 'Every row, even in a long table (one is normally shortened).' }),
  new TitleSetting(TITLE_ABOUT),
], [
  // (The ⚙ menu's order: what the table is, then which rows and what's down their side; in each, boxes and menus, then checkboxes.)
  { title: 'Table', labels: ['Title', 'Lines', 'Show uncertainty'] },
  { title: 'Rows', labels: ['Rows', 'Row labels', 'Row numbers', 'Show every row'] },
])

/** A typed table's settings, in its brackets: `@table(title "Observations", lines header) {`. */
export interface TypedTableSettings {
  lines: TableLines
  /** Its caption. */
  title?: string
}

/** A typed table's settings, declared as a table of series' are (the two it shares with one). */
export const TYPED_TABLE_SETTINGS = new SettingsSpec<TypedTableSettings>('typed table', () => ({ lines: TABLE_LINE.grid }), [
  new ChoiceSetting(SETTING.lines, 'lines', LINES.choices, TABLE_LINE.header, LINES.about),
  new TitleSetting(TITLE_ABOUT),
])

/**
 * A table's settings, kept in the sheet after a semicolon inside its brackets:
 *
 *   @table(t, x, v = x / t; rows 5-20, lines header, numbers off, all rows)
 *
 *   rows 5-20     only rows 5 to 20 (rows 5- from 5 on, rows -20 up to 20)
 *   lines header  a line under the header and after the row headers (lines
 *                 none: no lines; the default, lines grid, a line around every cell)
 *   numbers off   no row numbers down the side
 *   labels salts  a series' values down the side in their place: `salts =
 *                 @series("KCl", "KBr")` labels row 1 KCl, row 2 KBr
 *   uncertainty off  each value alone, without ± its uncertainty
 *   all rows      every row, even in a long table (normally it's shortened)
 *   title "Runs"  its caption (quoted, so it can hold commas)
 *
 * The table's ⚙ button in the editor writes them, so they don't need typing.
 */

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
// The words settings are written with (shared by table, plot and select)
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
  colour: 'colour',
  /** `colour`, as it's spelt in American English too. */
  color: 'color',
  from: 'from',
  to: 'to',
} as const

/** Between the columns and the settings, in a call's brackets. */
export const SETTINGS_START = ';'
/** Between settings: `rows 5-20, lines grid`. */
export const SETTINGS_SEPARATOR = ','
/** Between a range's ends: `rows 5-20`. */
const RANGE_DASH = '-'

/** `rows 5-20`, `rows 5-`, `rows -20` (1: from, 2: to); or one row, `rows 7` (3). */
const ROWS = new RegExp(String.raw`^${SETTING.rows}\s+(?:(\d*)\s*${RANGE_DASH}\s*(\d*)|(\d+))$`)

/** A row range setting's rows (either end may be open), or null if `part` isn't one. */
export function parseRowRange(part: string): { from?: number; to?: number } | null {
  const m = ROWS.exec(part)
  if (!m || (!m[1] && !m[2] && !m[3])) return null
  if (m[3]) return { from: Number(m[3]), to: Number(m[3]) }
  return { from: m[1] ? Number(m[1]) : undefined, to: m[2] ? Number(m[2]) : undefined }
}

/** A row range as a setting: `rows 5-20`, `rows 7` (undefined if it's open at both ends). */
export function formatRowRange(from: number | undefined, to: number | undefined): string | undefined {
  if (from === undefined && to === undefined) return undefined
  return from !== undefined && from === to ? `${SETTING.rows} ${from}` : `${SETTING.rows} ${from ?? ''}${RANGE_DASH}${to ?? ''}`
}

/** A setting as typed, tidied: trimmed, with single spaces inside. */
export const tidySetting = (part: string) => part.trim().replace(/\s+/g, ' ')

/** A title is quoted, so it can hold commas. */
const QUOTE = '"'
/** `title "Run 1"` (1: the title). */
const TITLE = new RegExp(`^${SETTING.title}\\s+${QUOTE}([^${QUOTE}]*)${QUOTE}$`)

/** A title setting's title (`title "Run 1"` → Run 1), or undefined if `part` isn't one. */
export const parseTitle = (part: string): string | undefined => TITLE.exec(part)?.[1]

/** A title as a setting: `title "Run 1"`. (A title can't hold a quote mark: it ends the title.) */
export const titleSetting = (title: string) => `${SETTING.title} ${QUOTE}${title.replaceAll(QUOTE, '')}${QUOTE}`

/** Settings text split into its settings, tidied (and empty ones left out), but not at a comma inside a quoted title. */
export function settingParts(text: string | undefined): string[] {
  const parts: string[] = []
  let current = ''
  let quoted = false
  for (const c of text ?? '') {
    if (c === QUOTE) quoted = !quoted
    if (c === SETTINGS_SEPARATOR && !quoted) {
      parts.push(current)
      current = ''
    } else current += c
  }
  parts.push(current)
  return parts.map(tidySetting).filter(Boolean)
}

/** Settings joined into their text. */
export const joinSettings = (parts: string[]) => parts.join(`${SETTINGS_SEPARATOR} `)

const LINES = new RegExp(`^${SETTING.lines}\\s+(${TABLE_LINES.join('|')})$`)
const NUMBERS_ON = `${SETTING.numbers} ${SETTING.on}`
const NUMBERS_OFF = `${SETTING.numbers} ${SETTING.off}`
/** Whether uncertainties are shown: a table's ± values, a plot's error bars (shared by both). */
export const UNCERTAINTY_ON = `${SETTING.uncertainty} ${SETTING.on}`
export const UNCERTAINTY_OFF = `${SETTING.uncertainty} ${SETTING.off}`
/** `labels salts` (1: the series; whether it is one, the table says when it's worked out). */
const LABELS = new RegExp(`^${SETTING.labels}\\s+(\\S+)$`)

/**
 * What's between a table's or plot's brackets, split at its first semicolon
 * (outside any brackets or quotes) into the columns and the settings.
 */
export function splitCallArgs(inner: string): { columns: string; settings?: string } {
  let depth = 0
  let quoted = false
  for (let i = 0; i < inner.length; i++) {
    const c = inner[i]
    if (c === '"') quoted = !quoted
    else if (quoted) continue
    else if (c === '(' || c === '[' || c === '{') depth++
    else if (c === ')' || c === ']' || c === '}') depth--
    else if (c === SETTINGS_START && depth === 0) return { columns: inner.slice(0, i), settings: inner.slice(i + 1) }
  }
  return { columns: inner }
}

/**
 * A table's or plot's line with new settings text, written after a semicolon
 * in its brackets (or taken out, if `text` is empty). `inner`: where what's
 * between the brackets is, in the line. Whatever's between the last of it and
 * the closing bracket stays (a call over several lines keeps its `)` on a line
 * of its own).
 */
export function withSettingsText(line: string, inner: { from: number; to: number }, text: string): string {
  const inside = line.slice(inner.from, inner.to)
  const { columns } = splitCallArgs(inside)
  const before = inside.slice(inside.trimEnd().length)
  return `${line.slice(0, inner.from)}${columns.trimEnd()}${text ? `${SETTINGS_START} ${text}` : ''}${before}${line.slice(inner.to)}`
}

/** A table's settings from their text, or what's wrong with them. */
export function parseTableSettings(text: string | undefined): { settings: TableSettings; error?: string } {
  const settings = { ...DEFAULT_TABLE_SETTINGS }
  for (const part of settingParts(text)) {
    const rows = parseRowRange(part)
    const lines = LINES.exec(part)
    const title = parseTitle(part)
    const labels = LABELS.exec(part)
    if (rows) {
      settings.from = rows.from
      settings.to = rows.to
    } else if (lines) settings.lines = lines[1] as TableLines
    else if (part === NUMBERS_OFF) settings.numbers = false
    else if (part === NUMBERS_ON) settings.numbers = true
    else if (labels) settings.labels = labels[1]
    else if (part === UNCERTAINTY_OFF) settings.uncertainty = false
    else if (part === UNCERTAINTY_ON) settings.uncertainty = true
    else if (part === SETTING.allRows) settings.allRows = true
    else if (title !== undefined) settings.title = title
    else {
      return {
        settings,
        error: `"${part}" isn't a table setting: use rows 5-20, lines header (or none), numbers off, labels salts, uncertainty off, all rows, `
          + 'or title "…". The table\'s ⚙ button sets them.',
      }
    }
  }
  return { settings }
}

/** Settings as text, leaving out the defaults ('' if there's nothing to say). */
export function formatTableSettings(s: TableSettings): string {
  const parts: string[] = []
  const rows = formatRowRange(s.from, s.to)
  if (rows) parts.push(rows)
  if (s.lines !== DEFAULT_TABLE_SETTINGS.lines) parts.push(`${SETTING.lines} ${s.lines}`)
  if (!s.numbers) parts.push(NUMBERS_OFF)
  if (s.labels) parts.push(`${SETTING.labels} ${s.labels}`)
  if (!s.uncertainty) parts.push(UNCERTAINTY_OFF)
  if (s.allRows) parts.push(SETTING.allRows)
  if (s.title) parts.push(titleSetting(s.title))
  return joinSettings(parts)
}

/** A table line's text with new settings (written after a semicolon, or taken out if they're all defaults). */
export const withTableSettings = (line: string, inner: { from: number; to: number }, s: TableSettings): string =>
  withSettingsText(line, inner, formatTableSettings(s))

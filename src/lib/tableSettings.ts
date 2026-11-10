/**
 * A table's settings, kept in the sheet after a semicolon inside its brackets:
 *
 *   table(t, x, v = x / t; rows 5-20, lines grid, numbers off, all rows)
 *
 *   rows 5-20     only rows 5 to 20 (rows 5- from 5 on, rows -20 up to 20)
 *   lines grid    a line around every cell (lines none: no lines; the default
 *                 is a line under the header and after the row numbers)
 *   numbers off   no n column
 *   all rows      every row, even in a long table (normally it's shortened)
 *
 * The table's ⚙ button in the editor writes them, so they don't need typing.
 */

/** How a table's lines are drawn. */
export const TABLE_LINES = ['header', 'grid', 'none'] as const
export type TableLines = (typeof TABLE_LINES)[number]

export interface TableSettings {
  /** The first and last row shown (either may be left open). */
  from?: number
  to?: number
  lines: TableLines
  /** Show the n column. */
  numbers: boolean
  /** Show every row, however many. */
  allRows: boolean
}

export const DEFAULT_TABLE_SETTINGS: TableSettings = { lines: 'header', numbers: true, allRows: false }

// ---------------------------------------------------------------------------
// The words settings are written with (shared by table, plot and select)
// ---------------------------------------------------------------------------

/** Each setting's word. */
export const SETTING = {
  rows: 'rows',
  lines: 'lines',
  numbers: 'numbers',
  allRows: 'all rows',
  on: 'on',
  off: 'off',
  style: 'style',
  fit: 'fit',
  log: 'log',
  title: 'title',
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

/** Settings text split into its settings, tidied (and empty ones left out). */
export const settingParts = (text: string | undefined): string[] =>
  (text ?? '').split(SETTINGS_SEPARATOR).map(tidySetting).filter(Boolean)

/** Settings joined into their text. */
export const joinSettings = (parts: string[]) => parts.join(`${SETTINGS_SEPARATOR} `)

const LINES = new RegExp(`^${SETTING.lines}\\s+(${TABLE_LINES.join('|')})$`)
const NUMBERS_ON = `${SETTING.numbers} ${SETTING.on}`
const NUMBERS_OFF = `${SETTING.numbers} ${SETTING.off}`

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
 * between the brackets is, in the line.
 */
export function withSettingsText(line: string, inner: { from: number; to: number }, text: string): string {
  const { columns } = splitCallArgs(line.slice(inner.from, inner.to))
  return `${line.slice(0, inner.from)}${columns.trimEnd()}${text ? `${SETTINGS_START} ${text}` : ''}${line.slice(inner.to)}`
}

/** A table's settings from their text, or what's wrong with them. */
export function parseTableSettings(text: string | undefined): { settings: TableSettings; error?: string } {
  const settings = { ...DEFAULT_TABLE_SETTINGS }
  for (const part of settingParts(text)) {
    const rows = parseRowRange(part)
    const lines = LINES.exec(part)
    if (rows) {
      settings.from = rows.from
      settings.to = rows.to
    } else if (lines) settings.lines = lines[1] as TableLines
    else if (part === NUMBERS_OFF) settings.numbers = false
    else if (part === NUMBERS_ON) settings.numbers = true
    else if (part === SETTING.allRows) settings.allRows = true
    else {
      return {
        settings,
        error: `"${part}" isn't a table setting: use rows 5-20, lines grid (or none), numbers off, or all rows. The table's ⚙ button sets them.`,
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
  if (s.allRows) parts.push(SETTING.allRows)
  return joinSettings(parts)
}

/** A table line's text with new settings (written after a semicolon, or taken out if they're all defaults). */
export const withTableSettings = (line: string, inner: { from: number; to: number }, s: TableSettings): string =>
  withSettingsText(line, inner, formatTableSettings(s))

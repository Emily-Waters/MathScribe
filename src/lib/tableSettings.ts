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

/** `rows 5-20`, `rows 5-`, `rows -20` (1: from, 2: to). */
const ROWS = /^rows\s+(\d*)\s*-\s*(\d*)$/
/** A single row: `rows 7`. */
const ROW = /^rows\s+(\d+)$/
const LINES = new RegExp(`^lines\\s+(${TABLE_LINES.join('|')})$`)

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
    else if (c === ';' && depth === 0) return { columns: inner.slice(0, i), settings: inner.slice(i + 1) }
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
  return `${line.slice(0, inner.from)}${columns.trimEnd()}${text ? `; ${text}` : ''}${line.slice(inner.to)}`
}

/** A table's settings from their text, or what's wrong with them. */
export function parseTableSettings(text: string | undefined): { settings: TableSettings; error?: string } {
  const settings = { ...DEFAULT_TABLE_SETTINGS }
  for (const part of (text ?? '').split(',').map((p) => p.trim().replace(/\s+/g, ' ')).filter(Boolean)) {
    const rows = ROWS.exec(part) ?? (ROW.test(part) ? [part, part.slice(5), part.slice(5)] : null)
    const lines = LINES.exec(part)
    if (rows) {
      settings.from = rows[1] ? Number(rows[1]) : undefined
      settings.to = rows[2] ? Number(rows[2]) : undefined
    } else if (lines) settings.lines = lines[1] as TableLines
    else if (part === 'numbers off') settings.numbers = false
    else if (part === 'numbers on') settings.numbers = true
    else if (part === 'all rows') settings.allRows = true
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
  if (s.from !== undefined || s.to !== undefined) {
    parts.push(s.from !== undefined && s.from === s.to ? `rows ${s.from}` : `rows ${s.from ?? ''}-${s.to ?? ''}`)
  }
  if (s.lines !== DEFAULT_TABLE_SETTINGS.lines) parts.push(`lines ${s.lines}`)
  if (!s.numbers) parts.push('numbers off')
  if (s.allRows) parts.push('all rows')
  return parts.join(', ')
}

/** A table line's text with new settings (written after a semicolon, or taken out if they're all defaults). */
export const withTableSettings = (line: string, inner: { from: number; to: number }, s: TableSettings): string =>
  withSettingsText(line, inner, formatTableSettings(s))

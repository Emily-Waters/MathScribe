/**
 * Reading imported CSV data: the rows of an `@import("run1.csv")` block, kept
 * in the sheet under the import line so the sheet works anywhere.
 *
 *   @import("run1.csv")
 *       t (s), x (m)
 *       0.10, 0.012
 *       0.20, 0.047
 *
 * The first row names the columns; a unit in brackets after a name, `t (s)` or
 * `t [s]`, goes with every value in that column. Each column becomes a series,
 * its values numbered by their rows: t[1], t[2], … (so t.avg, t.count and so on work too).
 * Values are kept as typed, so 0.10 keeps its two sig figs.
 *
 * A column named dx (or δx, σx, x_unc, x_err) holds x's uncertainties: each
 * x_n gets its row's, as if typed `x_n = 0.012 m pm 0.001 m`. In the column's
 * unit, or x's if it has none; `dx (%)` is a percentage of each value.
 */
import { IMPORT_CALL, INDENT, IS_NAME, importCall, indentOf } from '../syntax.ts'

/** One column: its variable name, unit, and each value as typed with the row it's on (1 = first data row). */
export interface CsvColumn {
  name: string
  unit?: string
  values: { row: number; text: string }[]
  /** Its values' uncertainties, from a column of their own (dx for x): see UNCERTAINTY_COLUMN. */
  unc?: CsvUncertainty
}

/** A column of uncertainties: its name, unit (`%` for a percentage of each value), and each as typed, by row. */
export interface CsvUncertainty {
  column: string
  unit?: string
  percent: boolean
  values: Map<number, string>
}

/**
 * A column holding another's uncertainties: dx, δx, σx, delta_x, sigma_x,
 * x_unc or x_err for column x (1: the other column's name). It only counts
 * as one when there's a column x; otherwise it's a column of its own.
 */
export const UNCERTAINTY_COLUMN_PREFIXES = ['delta_', 'sigma_', 'd', 'δ', 'σ'] as const
export const UNCERTAINTY_COLUMN_SUFFIXES = ['_unc', '_err'] as const
const UNCERTAINTY_COLUMN = [
  new RegExp(`^(?:${UNCERTAINTY_COLUMN_PREFIXES.join('|')})(.+)$`),
  new RegExp(`^(.+)(?:${UNCERTAINTY_COLUMN_SUFFIXES.join('|')})$`),
]

/** A unit that makes an uncertainty column a percentage of each value: dx (%). */
export const PERCENT_UNIT = '%'

/** The column `name` holds the uncertainties of, if any. */
function uncertaintyOf(name: string, names: Set<string>): string | undefined {
  return UNCERTAINTY_COLUMN.map((p) => p.exec(name)?.[1]).find((of) => of !== undefined && names.has(of))
}

/** Fold each uncertainty column into the column it belongs to. */
function pairUncertainties(columns: CsvColumn[]): { columns: CsvColumn[]; error?: string } {
  const names = new Set(columns.map((c) => c.name))
  const of = new Map(columns.map((c) => [c.name, uncertaintyOf(c.name, names)]))
  const out: CsvColumn[] = []
  for (const c of columns) {
    const base = of.get(c.name)
    // (An uncertainty column of an uncertainty column, ddx, is a column of its own.)
    if (!base || of.get(base)) {
      out.push(c)
      continue
    }
    const target = columns.find((t) => t.name === base)!
    if (target.unc) return { columns: [], error: `Columns ${target.unc.column} and ${c.name} are both uncertainties of ${base}: keep one.` }
    target.unc = {
      column: c.name,
      unit: c.unit === PERCENT_UNIT ? undefined : c.unit,
      percent: c.unit === PERCENT_UNIT,
      values: new Map(c.values.map((v) => [v.row, v.text.replace(/^-/, '')])),
    }
  }
  return { columns: out }
}

/** A CSV, read: its columns and how many data rows it has, or what's wrong with it. */
export interface CsvData {
  columns: CsvColumn[]
  rows: number
  error?: string
}


/** The character that separates values: a tab or semicolon if the header uses one (and no commas), else a comma. */
function separatorOf(header: string): string {
  if (header.includes(',')) return ','
  if (header.includes('\t')) return '\t'
  if (header.includes(';')) return ';'
  return ','
}

/** A row's values, with surrounding spaces and quotes taken off. */
const cellsOf = (line: string, separator: string) =>
  line.split(separator).map((c) => c.trim().replace(/^"(.*)"$/, '$1').trim())

/** A plain number as typed: 2, 0.10, -1.5e-3. */
const NUMBER = /^[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?$/

/** What each piece of a row is, as rowPieces reads it: a value, a column's name, its unit, or anything else (separators, brackets). */
export const ROW_PIECE = { number: 'number', name: 'name', unit: 'unit' } as const
export type RowPieceKind = (typeof ROW_PIECE)[keyof typeof ROW_PIECE]

/** A piece of a row, where it is in the row: `start` up to (not including) `end`. */
export interface RowPiece {
  kind: RowPieceKind
  start: number
  end: number
}

/** A header: a name, then optionally a unit in brackets (groups: name and unit, and the spaces and bracket before each, for where they are). */
const HEADER = /^(?<lead>\s*)(?<name>[^([\s]+)(?:(?<between>\s*[([]\s*)(?<unit>[^)\]]*?)\s*[)\]])?\s*$/

/**
 * A row's values, names and units, where each is in it (for the editor's
 * colours), read as parseCsv reads them: cells split at the row's separator;
 * a number is a value, and a header cell, `t (s)`, is a name and its unit.
 */
export function rowPieces(row: string): RowPiece[] {
  const separator = separatorOf(row)
  const out: RowPiece[] = []
  let at = 0
  for (const cell of row.split(separator)) {
    const text = cell.trim()
    const start = at + cell.indexOf(text)
    if (text && NUMBER.test(text)) out.push({ kind: ROW_PIECE.number, start, end: start + text.length })
    else {
      const m = HEADER.exec(cell)
      if (m && IS_NAME.test(m.groups!.name)) {
        const nameAt = at + m.groups!.lead.length
        out.push({ kind: ROW_PIECE.name, start: nameAt, end: nameAt + m.groups!.name.length })
        const unit = m.groups!.unit
        if (unit) {
          const unitAt = nameAt + m.groups!.name.length + m.groups!.between!.length
          out.push({ kind: ROW_PIECE.unit, start: unitAt, end: unitAt + unit.length })
        }
      }
    }
    at += cell.length + separator.length
  }
  return out
}

/**
 * Read a CSV's lines (header first). Empty cells are skipped (so a column can
 * be shorter than the others); anything that isn't a number is an error.
 */
export function parseCsv(lines: string[]): CsvData {
  const rows = lines.map((l) => l.trim()).filter(Boolean)
  if (!rows.length) return { columns: [], rows: 0, error: 'The data is empty: the first row should name the columns.' }
  const separator = separatorOf(rows[0])
  const columns: CsvColumn[] = []
  for (const [i, header] of cellsOf(rows[0], separator).entries()) {
    const m = HEADER.exec(header)?.groups
    if (!m || !IS_NAME.test(m.name)) {
      return { columns: [], rows: 0, error: `Column ${i + 1}'s header, "${header}", isn't a variable name: use one like x, or x (m) with a unit.` }
    }
    if (columns.some((c) => c.name === m.name)) return { columns: [], rows: 0, error: `Two columns are named ${m.name}.` }
    columns.push({ name: m.name, unit: m.unit || undefined, values: [] })
  }
  for (const [r, line] of rows.slice(1).entries()) {
    const cells = cellsOf(line, separator)
    if (cells.length > columns.length) {
      return { columns: [], rows: 0, error: `Row ${r + 1} has ${cells.length} values, but there are ${columns.length} columns.` }
    }
    for (const [c, text] of cells.entries()) {
      if (!text) continue
      if (!NUMBER.test(text)) {
        return { columns: [], rows: 0, error: `Row ${r + 1}, column ${columns[c].name}: "${text}" isn't a number.` }
      }
      columns[c].values.push({ row: r + 1, text: text.replace(/^\+/, '') })
    }
  }
  const paired = pairUncertainties(columns)
  return { columns: paired.columns, rows: rows.length - 1, ...(paired.error ? { columns: [], error: paired.error } : {}) }
}

/**
 * The sheet with a file's data put under the `@import(…)` on line `line`
 * (1-based): the line names the file, and the file's rows, indented one level
 * further, replace any it had. The line's note and commands are kept.
 */
export function withImportedData(source: string, line: number, fileName: string, csvText: string): string {
  const lines = source.split(/\r?\n/)
  const at = line - 1
  const own = lines[at] ?? ''
  const indent = /^[ \t]*/.exec(own)![0]
  const name = fileName.replace(/"/g, '')
  const head = own.replace(IMPORT_CALL, importCall(name))
  // The rows it had: the lines straight under it, indented further (a blank line ends them).
  let end = at
  for (let i = at + 1; i < lines.length && lines[i].trim() && indentOf(lines[i]) > indentOf(own); i++) end = i
  const rows = alignColumns(csvText.split(/\r?\n/).filter((l) => l.trim())).map((l) => indent + INDENT + l)
  return [...lines.slice(0, at), head, ...rows, ...lines.slice(end + 1)].join('\n')
}

/** The sheet without the `@import(…)` on line `line` (1-based) and its rows. */
export function withoutImport(source: string, line: number): string {
  const lines = source.split(/\r?\n/)
  const at = line - 1
  let end = at
  for (let i = at + 1; i < lines.length && lines[i].trim() && indentOf(lines[i]) > indentOf(lines[at] ?? ''); i++) end = i
  return [...lines.slice(0, at), ...lines.slice(end + 1)].join('\n')
}

/**
 * CSV rows laid out as a table: commas between the values, and each column
 * padded to its widest value, right-aligned so the digits line up:
 *
 *   t (s),  x (m)
 *    0.10,  0.012
 *    1.20,  1.450
 */
export function alignColumns(rows: string[]): string[] {
  if (!rows.length) return rows
  const separator = separatorOf(rows[0])
  const cells = rows.map((r) => cellsOf(r, separator))
  const widths: number[] = []
  for (const row of cells) row.forEach((c, i) => { widths[i] = Math.max(widths[i] ?? 0, c.length) })
  return cells.map((row) => row.map((c, i) => c.padStart(widths[i])).join(',  ').trimEnd())
}

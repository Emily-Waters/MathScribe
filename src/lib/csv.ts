/**
 * Reading imported CSV data: the rows of an `import("run1.csv")` block, kept
 * in the sheet under the import line so the sheet works anywhere.
 *
 *   import("run1.csv")
 *       t (s), x (m)
 *       0.10, 0.012
 *       0.20, 0.047
 *
 * The first row names the columns; a unit in brackets after a name, `t (s)` or
 * `t [s]`, goes with every value in that column. Each value becomes a variable,
 * numbered by its row: t_1, t_2, … (so t_avg, t_count and so on work too).
 * Values are kept as typed, so 0.10 keeps its two sig figs.
 */
import { INDENT, IS_NAME, indentOf } from './syntax.ts'

/** One column: its variable name, unit, and each value as typed with the row it's on (1 = first data row). */
export interface CsvColumn {
  name: string
  unit?: string
  values: { row: number; text: string }[]
}

/** A CSV, read: its columns and how many data rows it has, or what's wrong with it. */
export interface CsvData {
  columns: CsvColumn[]
  rows: number
  error?: string
}

/** A header: a name, then optionally a unit in brackets (1: the name, 2: the unit). */
const HEADER = /^\s*([^([\s]+)\s*(?:[([]\s*([^)\]]*?)\s*[)\]])?\s*$/

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
    const m = HEADER.exec(header)
    if (!m || !IS_NAME.test(m[1])) {
      return { columns: [], rows: 0, error: `Column ${i + 1}'s header, "${header}", isn't a variable name: use one like x, or x (m) with a unit.` }
    }
    if (columns.some((c) => c.name === m[1])) return { columns: [], rows: 0, error: `Two columns are named ${m[1]}.` }
    columns.push({ name: m[1], unit: m[2] || undefined, values: [] })
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
  return { columns, rows: rows.length - 1 }
}

/**
 * The sheet with a file's data put under the `import(…)` on line `line`
 * (1-based): the line names the file, and the file's rows, indented one level
 * further, replace any it had. The line's note and commands are kept.
 */
export function withImportedData(source: string, line: number, fileName: string, csvText: string): string {
  const lines = source.split(/\r?\n/)
  const at = line - 1
  const own = lines[at] ?? ''
  const indent = /^[ \t]*/.exec(own)![0]
  const name = fileName.replace(/"/g, '')
  const head = own.replace(/import\s*\([^)]*\)/, `import("${name}")`)
  // The rows it had: the lines straight under it, indented further (a blank line ends them).
  let end = at
  for (let i = at + 1; i < lines.length && lines[i].trim() && indentOf(lines[i]) > indentOf(own); i++) end = i
  const rows = alignColumns(csvText.split(/\r?\n/).filter((l) => l.trim())).map((l) => indent + INDENT + l)
  return [...lines.slice(0, at), head, ...rows, ...lines.slice(end + 1)].join('\n')
}

/** The sheet without the `import(…)` on line `line` (1-based) and its rows. */
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

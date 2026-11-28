/**
 * A typed table, `@table(title "Observations") { … }`: a table written out
 * rather than worked out from series, a row a line, its cells between `|`s (the
 * tree reads each row's cells: CONTENT.cells). Its first row is its header.
 * Each cell is text, as prose is: `$…$` maths, and `{{m}}` a value from the
 * sheet. It's drawn as a table of series is (tableBlock.ts), every cell as text.
 * An empty cell after a filled one in its first row joins it, a header over
 * several columns, and the second row is then the header under it.
 *
 * Its settings are in its brackets, as declared (TYPED_TABLE_SETTINGS); the
 * grid editor in the Output pane (tableEditor.tsx) writes the whole of it.
 */
import {
  BLOCK_CLOSE, BLOCK_KIND, CELL_SEPARATOR, NODE_KIND, NodeReader, SIGIL, TOKEN_KIND, isToken, textOf,
  type Part, type SheetReader, type TreeItem,
} from '../../lib/plugin.ts'
import { SERIES_NODE } from './grammar.ts'
import { SERIES_CALL } from './syntax.ts'
import { SERIES_BLOCK, type TableData, type TableGroup } from './tableData.ts'
import { TYPED_TABLE_SETTINGS } from './tableSettings.ts'

/** What a table is called, `@table`: a typed table's opener, before its brackets, and a table of series' call. */
export const TABLE_NAME = `${SIGIL}${SERIES_CALL.table}`

/** A typed table's opener's brackets. */
const BRACKETS = { open: '(', close: ')' } as const

/** What's in a typed table's opener's brackets, from its name as the tree read it (`@table(title "Runs")`): its settings. */
export function openerSettingsText(name: string): string | undefined {
  const rest = name.slice(TABLE_NAME.length)
  return rest.startsWith(BRACKETS.open) && rest.endsWith(BRACKETS.close) ? rest.slice(BRACKETS.open.length, -BRACKETS.close.length) : undefined
}

/** A row's cells, from its parts as the tree read them: each cell's text, '' for an empty one (`a | | c`). */
export function rowCells(parts: readonly Part[]): string[] {
  const cells = ['']
  for (const p of parts) {
    if (isToken(p)) {
      if (p.t === TOKEN_KIND.delimiter && p.text === CELL_SEPARATOR) cells.push('')
    } else if (p.kind === NODE_KIND.cell) cells[cells.length - 1] = textOf(p)
  }
  return cells
}

/** A typed table's settings text (what's in its opener's brackets), from its tree item. */
export function typedTableSettingsText(item: TreeItem): string | undefined {
  const opener = item.node.parts[0]
  const name = opener && !isToken(opener) ? opener.parts.find((p) => isToken(p) && p.t === TOKEN_KIND.blockName) : undefined
  return name ? openerSettingsText(textOf(name)) : undefined
}

/** A typed table's rows, each its cells' text, as written (blank lines and comments left out), and the line each is on. */
export function typedTableRows(item: TreeItem): { line: number; cells: string[] }[] {
  return item.body.filter((b) => b.node.kind === SERIES_NODE.tableRow).map((b) => ({ line: b.line.number, cells: rowCells(b.node.parts) }))
}

/**
 * How many of a typed table's rows are its header: two when its first row has
 * a cell that spans (an empty cell after a filled one joins it), the second
 * row the names under the spans; otherwise one.
 */
export function headerRowCount(rows: readonly (readonly string[])[]): 1 | 2 {
  const first = rows[0] ?? []
  const spans = first.some((c, i) => !c.trim() && first.slice(0, i).some((d) => d.trim()))
  return spans ? 2 : 1
}

/** A typed table's upper header row as its groups: each filled cell (or one before any is) with the empty cells after it, which it spans. */
export function headerGroups(first: readonly string[]): TableGroup[] {
  const groups: TableGroup[] = []
  for (const cell of first) {
    const last = groups.at(-1)
    if (cell.trim() || !groups.some((g) => g.text.trim())) groups.push({ text: cell, span: 1 })
    else groups[groups.length - 1] = { ...last!, span: last!.span + 1 }
  }
  return groups
}

/** A typed table's header and body, from its rows (their values filled in): its groups and header over two rows, or its first row. */
export function typedTableParts(rows: readonly (readonly string[])[]): Pick<TableData, 'groups' | 'header' | 'rows'> {
  const columns = rows[0]?.length ?? 0
  if (headerRowCount(rows) === 1) return { header: rows[0] ?? [], rows: rows.slice(1) }
  return { groups: headerGroups(rows[0]), header: rows[1] ?? Array.from({ length: columns }, () => ''), rows: rows.slice(2) }
}

/** `@table { … }`: a table of text, read where it's written (each value in it as it is at that point). */
export class TypedTableReader extends NodeReader {
  readonly kinds = [SERIES_NODE.table]

  read(item: TreeItem, sheet: SheetReader): void {
    const { line } = item
    const { settings, error: settingsError } = TYPED_TABLE_SETTINGS.parse(typedTableSettingsText(item))
    const written = typedTableRows(item).map((r) => r.cells)
    const columns = Math.max(0, ...written.map((cells) => cells.length))
    let valueError: string | undefined
    const filled = written.map((cells) => Array.from({ length: columns }, (_, i) => {
      const { text, error } = sheet.withValues(cells[i] ?? '')
      valueError ??= error
      return text
    }))
    const data: TableData = { title: settings.title, lines: settings.lines, rowHeaders: false, text: true, ...typedTableParts(filled) }
    const error = !item.closer ? `The ${TABLE_NAME} block on line ${line.number} is missing its closing ${BLOCK_CLOSE}.`
      : settingsError ?? (!written.length
        ? `A typed table needs at least its header: a line inside it, its cells between ${CELL_SEPARATOR}s (Trial ${CELL_SEPARATOR} Mass).`
        : undefined)
    // (A value that can't be worked out is left as typed, as in prose, and said; the table is still shown.)
    sheet.add({
      kind: BLOCK_KIND.custom, type: SERIES_BLOCK.table, line: line.number, endLine: item.last + 1, data, note: line.parts.note, error,
      warning: valueError,
    })
  }
}

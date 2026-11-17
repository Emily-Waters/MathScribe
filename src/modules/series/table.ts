/**
 * `@table(t, x, v = x / t)`: series side by side, a row per number (t_1, x_1,
 * v_1 in the first). A name is a series' values; `name = expression` is worked
 * out row by row from the series it uses, and makes a series of its own (v_1,
 * v_2, …, so v_avg works afterwards); an expression without a name is just
 * shown. A long table shows its first and last rows.
 */
import {
  attachUnit, EXACT, type FormLine, LineForm, type LineResult, type ModuleHost, numberTex, splitArgs, unitTex,
} from '../../lib/plugin.ts'
import { TABLE_LINE, parseTableSettings, splitCallArgs } from './tableSettings.ts'
import { rowErrors, seriesColumns } from './columns.ts'
import { TABLE_CALL } from './syntax.ts'

/** How many rows a table shows: all of them up to `max`; past that, the `first` and the `last`, with ⋮ between. */
export const TABLE_ROWS = { max: 60, first: 50, last: 5 } as const

/** The pieces of a table's LaTeX. */
const TABLE_TEX = {
  /** The row-number column's header. */
  numberHeader: 'n',
  /** A cell with no value. */
  empty: '\\text{—}',
  /** The gap in a shortened table, before its last rows. */
  gap: '\\vdots',
  rowEnd: ' \\\\ ',
  ruledRowEnd: ' \\\\ \\hline ',
  rule: '\\hline ',
  cellSeparator: ' & ',
  /** A column's alignment, and the line between two. */
  column: 'r',
  columnRule: '|',
} as const

/** A table cell (or a value in an @series line): a variable's value as a number (± its uncertainty), and its unit, in its own notation. */
export function cellParts(host: ModuleHost, name: string): { num: string; unit?: string } {
  const value = host.value(name)
  const v = host.variable(name)
  const sf = v?.sf ?? EXACT
  const unc = host.total(v?.contributions, value)
  return host.inNotation(v?.notation, () => {
    const u = unc !== undefined ? host.uncertainParts(value, unc, v?.uncSf) : null
    if (u) {
      const core = `${numberTex(u.num)} \\pm ${numberTex(u.unc)}`
      return { num: u.exp !== undefined ? `\\left(${core}\\right) \\times 10^{${u.exp}}` : core, unit: u.unit }
    }
    const p = host.split(value, sf, v?.declared === true)
    return p ? { num: numberTex(p.num), unit: p.unit } : { num: host.valueTex(value, sf) }
  })
}

export class TableForm extends LineForm {
  evaluate(line: FormLine, host: ModuleHost): LineResult | undefined {
    const table = TABLE_CALL.exec(line.text)
    if (!table) return undefined
    // The settings come after a semicolon (see tableSettings.ts).
    const parts = splitCallArgs(table[1])
    const { settings, error: settingsError } = parseTableSettings(parts.settings)
    if (settingsError) return { tex: '', error: settingsError }
    const args = splitArgs(parts.columns).map((a) => a.trim()).filter(Boolean)
    if (!args.length) {
      return { tex: '', error: 'Name the series to show, @table(t, x), and any columns worked out from them: @table(t, x, v = x / t).' }
    }
    const made = seriesColumns(host, args, 'show it in a table')
    if ('error' in made) return { tex: '', error: made.error }
    const { columns, errors, hidden } = made

    // Every row that any column has, in order (within the settings' rows); a long
    // table shows its first and last rows, unless the settings ask for all of them.
    const all = [...new Set(columns.flatMap((c) => [...c.rows.keys()]))].sort((a, b) => a - b)
      .filter((n) => (settings.from === undefined || n >= settings.from) && (settings.to === undefined || n <= settings.to))
    const shortened = !settings.allRows && all.length > TABLE_ROWS.max
    const shown = shortened ? [...all.slice(0, TABLE_ROWS.first), ...all.slice(-TABLE_ROWS.last)] : all

    // Each cell, with the column's unit taken out to its header when every value shares it.
    const body = columns.map((c) => {
      const cells = shown.map((n) => (c.rows.has(n) ? cellParts(host, c.rows.get(n)!) : undefined))
      const units = new Set(cells.filter((p) => p).map((p) => p!.unit))
      const shared = units.size === 1 ? [...units][0] : undefined
      return {
        header: shared ? `${c.header}\\,\\left[${unitTex(shared)}\\right]` : c.header,
        cells: cells.map((p) => (!p ? TABLE_TEX.empty : shared || !p.unit ? p.num : attachUnit(p.num, unitTex(p.unit)))),
      }
    })
    for (const name of hidden) host.forget(name)

    // The n column (unless it's turned off), then the columns.
    const grid = settings.lines === TABLE_LINE.grid
    const none = settings.lines === TABLE_LINE.none
    const cellsOf = (n: number, r: number) => [...(settings.numbers ? [String(n)] : []), ...body.map((c) => c.cells[r])]
    const header = [...(settings.numbers ? [TABLE_TEX.numberHeader] : []), ...body.map((c) => c.header)].join(TABLE_TEX.cellSeparator)
    // A line after each row in a grid; otherwise just after the header (none for lines none).
    const rowEnd = grid ? TABLE_TEX.ruledRowEnd : TABLE_TEX.rowEnd
    const rowsTex = shown.map((n, r) => {
      const row = cellsOf(n, r).join(TABLE_TEX.cellSeparator)
      return shortened && r === TABLE_ROWS.first ? `${TABLE_TEX.gap}${rowEnd}${row}` : row
    })
    const count = columns.length + (settings.numbers ? 1 : 0)
    const { column, columnRule } = TABLE_TEX
    const columnSpec = grid
      ? `${columnRule}${`${column}${columnRule}`.repeat(count)}`
      : none || !settings.numbers ? column.repeat(count) : `${column}${columnRule}${column.repeat(count - 1)}`
    const top = grid ? TABLE_TEX.rule : ''
    const afterHeader = none ? TABLE_TEX.rowEnd : TABLE_TEX.ruledRowEnd
    const end = grid ? TABLE_TEX.ruledRowEnd.trimEnd() : ''
    const tex = `\\begin{array}{${columnSpec}} ${top}${header}${afterHeader}${rowsTex.join(rowEnd)}${end} \\end{array}`
    const range = settings.from !== undefined || settings.to !== undefined
    return {
      tex,
      error: rowErrors(errors, (n) => `${n} more row${n > 1 ? 's' : ''}`),
      info: shortened
        ? `${all.length} rows${range ? ' in range' : ''}: the first ${TABLE_ROWS.first} and the last ${TABLE_ROWS.last} are shown (the ⚙ button can show them all).`
        : !all.length && range ? 'No rows in this range.' : undefined,
    }
  }
}

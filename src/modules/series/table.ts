/**
 * `@table(t, x, v = x / t)`: series side by side, a row per number (t_1, x_1,
 * v_1 in the first). A name is a series' values; `name = expression` is worked
 * out row by row from the series it uses, and makes a series of its own (v_1,
 * v_2, …, so v_avg works afterwards); an expression without a name is just
 * shown. A long table shows its first and last rows.
 *
 * The line is shown as a table block (tableBlock.ts), not an equation: what's
 * worked out here is its cells, and the block writes them to each export.
 */
import {
  attachUnit, EXACT, type FormLine, LineForm, type LineResult, markupText, type ModuleHost, nestBrackets, numberTex, splitArgs, unitTex,
} from '../../lib/plugin.ts'
import { parseTableSettings, splitCallArgs } from './tableSettings.ts'
import { rowErrors, seriesColumns } from './columns.ts'
import { TABLE_CALL } from './syntax.ts'
import { SERIES_BLOCK, TABLE_CELL, type TableData } from './tableData.ts'

/** How many rows a table shows: all of them up to `max`; past that, the `first` and the `last`, with ⋮ between. */
export const TABLE_ROWS = { max: 60, first: 50, last: 5 } as const

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

/**
 * A row's label, as text drawn as a title is: a text value as it is (`"KCl"` is
 * KCl; `$…$` maths in it, and a module's notation, `{KCl}` a formula, as in a
 * sheet's text), any other value
 * as its maths (`$2.0\,\mathrm{m}$`); '' for a row the series doesn't have.
 */
function labelText(host: ModuleHost, name: string | undefined): string {
  if (name === undefined) return ''
  const value = host.value(name)
  if (typeof value === 'string') return markupText(value)
  const { num, unit } = cellParts(host, name)
  return `$${unit ? attachUnit(num, unitTex(unit)) : num}$`
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
        cells: cells.map((p) => (!p ? TABLE_CELL.empty : shared || !p.unit ? p.num : attachUnit(p.num, unitTex(p.unit)))),
      }
    })
    for (const name of hidden) host.forget(name)

    // Down the side, each row's header: its label (`labels salts`: salts' value in that row), or its number
    // (unless they're turned off). Then the columns, each cell's brackets by nesting, as every equation's are.
    const labels = settings.labels === undefined ? undefined : host.seriesRows(settings.labels)
    if (labels && !labels.size) {
      return { tex: '', error: `${settings.labels} isn't a series, so it can't label the rows: define ${settings.labels}_1, ${settings.labels}_2, … (or @series("…", "…")).` }
    }
    const rowHeaders = labels !== undefined || settings.numbers
    const rowHeader = (n: number) => (labels ? [labelText(host, labels.get(n))] : settings.numbers ? [String(n)] : [])
    const data: TableData = {
      title: settings.title,
      lines: settings.lines,
      rowHeaders,
      header: [...(rowHeaders ? [TABLE_CELL.rowHeadersHeader] : []), ...body.map((c) => nestBrackets(c.header))],
      rows: shown.map((n, r) => [...rowHeader(n), ...body.map((c) => nestBrackets(c.cells[r]))]),
      gapBefore: shortened ? TABLE_ROWS.first : undefined,
    }
    const range = settings.from !== undefined || settings.to !== undefined
    return {
      tex: '',
      block: { type: SERIES_BLOCK.table, data },
      error: rowErrors(errors, (n) => `${n} more row${n > 1 ? 's' : ''}`),
      info: shortened
        ? `${all.length} rows${range ? ' in range' : ''}: the first ${TABLE_ROWS.first} and the last ${TABLE_ROWS.last} are shown (the ⚙ button can show them all).`
        : !all.length && range ? 'No rows in this range.' : undefined,
    }
  }
}

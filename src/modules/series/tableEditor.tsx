/**
 * A table's grid editor, in the Output pane's place (an OutputPanel), opened
 * by the table's ⚙ in the editor (tableMenu.ts). It edits the sheet's text, so
 * the text is always what's shown: each change writes the table back
 * (tableText.ts), and a change typed in the editor is read into the grid.
 *
 * - A typed table, `@table { … }`: its cells typed into, rows and columns added
 *   and taken away, its first row its header; each cell text, as prose is
 *   (`$…$` maths, `{{m}}` a value from the sheet).
 * - A table of series, `@table(t, x)`: its columns (each a series, or one
 *   worked out from them, `v = x / t`) typed into, added and taken away; its
 *   cells shown as worked out, not typed (they're the series').
 *
 * Either's settings are above it, their controls as declared (settingsPanel.ts).
 */
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { Tex, Title, type CustomBlock, type OutputPanel, type OutputPanelProps } from '../../lib/plugin.ts'
import { DOM_PANEL } from './settingsPanel.ts'
import { SERIES_BLOCK, TABLE_TEX, type TableData } from './tableData.ts'
import { TABLE_SETTINGS, TYPED_TABLE_SETTINGS } from './tableSettings.ts'
import { headerRowCount } from './typedTable.ts'
import {
  TABLE_KIND, readSeriesTable, readTypedTable, sheetTables, writeSeriesTable, writeTypedTable, type SeriesTableModel, type TypedTableModel,
} from './tableText.ts'
import './tableEditor.css'

/** What the pane's header calls it. */
const PANEL_TITLE = 'Table'

/** Which table a panel is for: its place among the sheet's tables (sheetTables), so a ⚙ can tell whether it's its own that's open. */
export const tablePanelKey = (index: number) => `${SERIES_BLOCK.table}:${index}`

/** The grid editor of the sheet's table at `index` (among sheetTables), as a panel in the Output pane's place. */
export function tableEditorPanel(index: number): OutputPanel {
  return { title: PANEL_TITLE, key: tablePanelKey(index), view: (props) => <TableEditor {...props} index={index} /> }
}

/** What a typed table's cells can say, under its grid. */
const CELL_HELP = 'Each cell is text: $…$ for maths ($m_1$), {{name}} for a value from the sheet ({{m.avg}}). '
  + 'An empty header cell after a filled one joins it, a header over several columns; the row under it then names them.'

/** What an empty cell of the first row that joins the one before it shows. */
const SPAN_HINT = '← joins'

/** What a table of series' cells are, under its grid. */
const SERIES_HELP = 'Each column is a series, or one worked out from them (v = x / t); its cells are worked out from the sheet. '
  + 'A table typed cell by cell is written @table { … }.'

/** Whether a key press is Enter, which moves down a row (Shift+Enter up). */
const isEnter = (e: KeyboardEvent) => e.key === 'Enter' && !e.nativeEvent.isComposing

/**
 * A grid's model, kept as it's typed (a cell's spaces as they're typed, though
 * the text trims them), and written back as text; read again from the text
 * only when the text changes otherwise (typed in the editor).
 */
function useModel<M>(text: string, read: (text: string) => M, write: (model: M) => string, replace: (text: string) => void) {
  const [model, setModel] = useState(() => read(text))
  const written = useRef(text)
  useEffect(() => {
    if (text === written.current) return
    written.current = text
    setModel(read(text))
  }, [text, read])
  const update = (next: M) => {
    setModel(next)
    const t = write(next)
    written.current = t
    if (t !== text) replace(t)
  }
  return [model, update] as const
}

/** The grid editor of the sheet's table at `index`. */
function TableEditor({ source, setSource, customBlockAt, close, index }: OutputPanelProps & { index: number }) {
  const table = useMemo(() => sheetTables(source)[index], [source, index])
  if (!table) {
    return (
      <div className="ms-grid">
        <p className="ms-grid__help">This table isn't in the sheet any more.</p>
        <button className="ms-grid__add" onClick={close}>Back to the output</button>
      </div>
    )
  }
  const text = source.slice(table.start, table.end)
  const replace = (next: string) => setSource(`${source.slice(0, table.start)}${next}${source.slice(table.end)}`)
  return table.kind === TABLE_KIND.typed
    ? <TypedGrid text={text} indent={table.indent} replace={replace} />
    : <SeriesGrid text={text} indent={table.indent} replace={replace} block={customBlockAt(table.line)} />
}

interface GridProps {
  /** The table's text, from its first character to its last. */
  text: string
  /** How far in its first line is. */
  indent: string
  /** Write the table's text in its place. */
  replace: (text: string) => void
}

/** A × button that takes a row or column away. */
function RemoveButton({ what, disabled, onClick }: { what: string; disabled?: boolean; onClick: () => void }) {
  return <button className="ms-grid__remove" title={`Take away ${what}`} aria-label={`Take away ${what}`} disabled={disabled} onClick={onClick}>×</button>
}

/** A typed table's grid: its settings, its cells to type into, and its rows and columns to add and take away. */
function TypedGrid({ text, indent, replace }: GridProps) {
  const write = (m: TypedTableModel) => writeTypedTable(m, indent)
  const [model, update] = useModel(text, readTypedTable, write, replace)
  const { rows } = model
  const columns = rows[0]?.length ?? 1
  // (Two header rows when the first has a span: an empty cell after a filled one joins it.)
  const heads = headerRowCount(rows)
  const isHead = (r: number) => r < heads
  const label = (r: number) => (isHead(r) ? 'Header' : String(r - heads + 1))
  /** Whether a cell of the first row joins the filled one before it. */
  const joins = (c: number) => !rows[0][c].trim() && rows[0].slice(0, c).some((d) => d.trim())
  const cells = useRef(new Map<string, HTMLInputElement>())
  /** The cell to put the cursor in once the grid's drawn again (after a row's added). */
  const [focus, setFocus] = useState<string | null>(null)
  useEffect(() => {
    if (focus === null) return
    cells.current.get(focus)?.focus()
    setFocus(null)
  }, [focus])
  const key = (r: number, c: number) => `${r}:${c}`

  const setRows = (next: string[][]) => update({ ...model, rows: next })
  const copy = () => rows.map((row) => [...row])
  const setCell = (r: number, c: number, value: string) => {
    const next = copy()
    next[r][c] = value
    setRows(next)
  }
  const addRow = () => setRows([...copy(), Array.from({ length: columns }, () => '')])
  const addColumn = () => setRows(copy().map((row) => [...row, '']))
  const removeRow = (r: number) => setRows(copy().filter((_, i) => i !== r))
  const removeColumn = (c: number) => setRows(copy().map((row) => row.filter((_, i) => i !== c)))

  /** Enter: down a row (a new one after the last); Shift+Enter: up a row. */
  const onKey = (e: KeyboardEvent, r: number, c: number) => {
    if (!isEnter(e)) return
    e.preventDefault()
    const to = e.shiftKey ? r - 1 : r + 1
    if (to < 0) return
    if (to >= rows.length) addRow()
    setFocus(key(to, c))
  }

  return (
    <div className="ms-grid">
      <SettingsPanel
        text={model.settings}
        build={(t, save) => TYPED_TABLE_SETTINGS.controls(DOM_PANEL, t, save)}
        save={(settings) => update({ ...model, settings })}
      />
      <div className="ms-grid__scroll">
        <table className="ms-grid__table">
          <thead>
            <tr>
              <th />
              {rows[0]?.map((_, c) => (
                <th key={c} className="ms-grid__tools">
                  <RemoveButton what={`column ${c + 1}`} disabled={columns <= 1} onClick={() => removeColumn(c)} />
                </th>
              ))}
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, r) => (
              <tr key={r} className={isHead(r) ? 'ms-grid__header' : undefined}>
                <th className="ms-grid__tools ms-grid__row-tools" scope="row">
                  <span>{label(r)}</span>
                  <RemoveButton what={isHead(r) ? 'a header row' : `row ${label(r)}`} disabled={rows.length <= 1} onClick={() => removeRow(r)} />
                </th>
                {row.map((cell, c) => (
                  <td key={c}>
                    <input
                      ref={(el) => {
                        if (el) cells.current.set(key(r, c), el)
                        else cells.current.delete(key(r, c))
                      }}
                      className="ms-grid__cell"
                      value={cell}
                      placeholder={r > 0 ? '' : joins(c) ? SPAN_HINT : `Column ${c + 1}`}
                      aria-label={isHead(r) ? `Header of column ${c + 1}` : `Row ${label(r)}, column ${c + 1}`}
                      spellCheck={false}
                      onChange={(e) => setCell(r, c, e.target.value)}
                      onKeyDown={(e) => onKey(e, r, c)}
                    />
                  </td>
                ))}
                {r === 0 && (
                  <td rowSpan={rows.length} className="ms-grid__side">
                    <button className="ms-grid__add" title="Add a column" onClick={addColumn}>+ Column</button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button className="ms-grid__add" title="Add a row" onClick={addRow}>+ Row</button>
      <p className="ms-grid__help">{CELL_HELP}</p>
    </div>
  )
}

/** A table of series' grid: its settings, its columns to type into, add and take away, and its cells as worked out. */
function SeriesGrid({ text, indent, replace, block }: GridProps & { block: CustomBlock | undefined }) {
  const write = (m: SeriesTableModel) => writeSeriesTable(m, indent)
  const [model, update] = useModel(text, readSeriesTable, write, replace)
  const data = block?.type === SERIES_BLOCK.table ? block.data as TableData : undefined
  const offset = data?.rowHeaders ? 1 : 0
  const columns = model.columns.length ? model.columns : ['']
  const setColumns = (next: string[]) => update({ ...model, columns: next })
  const setColumn = (i: number, value: string) => setColumns(columns.map((c, j) => (j === i ? value : c)))

  return (
    <div className="ms-grid">
      <SettingsPanel
        text={model.settings}
        build={(t, save) => TABLE_SETTINGS.controls(DOM_PANEL, t, save)}
        save={(settings) => update({ ...model, settings })}
      />
      <div className="ms-grid__scroll">
        <table className="ms-grid__table">
          <thead>
            <tr>
              {offset > 0 && <th />}
              {columns.map((c, i) => (
                <th key={i} className="ms-grid__column">
                  <input
                    className="ms-grid__cell"
                    value={c}
                    placeholder="t, or v = x / t"
                    aria-label={`Column ${i + 1}`}
                    spellCheck={false}
                    onChange={(e) => setColumn(i, e.target.value)}
                  />
                  <RemoveButton what={`column ${i + 1}`} disabled={columns.length <= 1} onClick={() => setColumns(columns.filter((_, j) => j !== i))} />
                </th>
              ))}
              <th className="ms-grid__side">
                <button className="ms-grid__add" title="Add a column" onClick={() => setColumns([...columns, ''])}>+ Column</button>
              </th>
            </tr>
            {data && (
              <tr className="ms-grid__header">
                {data.header.map((h, i) => <th key={i}>{i < offset ? <Title text={h} bold /> : <Tex latex={h} />}</th>)}
                <th />
              </tr>
            )}
          </thead>
          {data && (
            <tbody>
              {data.rows.flatMap((row, r) => [
                ...(r === data.gapBefore ? [<tr key="gap">{row.map((_, i) => <td key={i} className="ms-grid__worked"><Tex latex={TABLE_TEX.gap} /></td>)}<td /></tr>] : []),
                <tr key={r}>
                  {row.map((cell, i) => (
                    <td key={i} className="ms-grid__worked" title="Worked out from the series">
                      {i < offset ? <Title text={cell} bold /> : <Tex latex={cell} />}
                    </td>
                  ))}
                  <td />
                </tr>,
              ])}
            </tbody>
          )}
        </table>
      </div>
      {block?.error && <p className="ms-grid__error">{block.error}</p>}
      <p className="ms-grid__help">{SERIES_HELP}</p>
    </div>
  )
}

/**
 * A call's settings' controls above a grid, as declared (DOM elements, as the
 * plot's ⚙ panel has them): built from the settings' text, and again when it
 * changes otherwise than by them (typed in the editor).
 */
function SettingsPanel({ text, build, save }: {
  text: string
  build: (text: string, save: (text: string) => void) => HTMLElement[]
  save: (text: string) => void
}) {
  const box = useRef<HTMLDivElement>(null)
  /** The settings text they last saved (so they aren't built again under the cursor). */
  const saved = useRef<string | null>(null)
  // (The newest render's: it knows where the table is now.)
  const latest = useRef({ build, save })
  latest.current = { build, save }
  useEffect(() => {
    if (!box.current || text === saved.current) return
    box.current.replaceChildren(...latest.current.build(text, (next) => {
      saved.current = next
      latest.current.save(next)
    }))
  }, [text])
  return <div className="ms-grid__settings" ref={box} />
}

/**
 * A table block in the Rendered tab, as it is in the exports (tableBlock.ts): its
 * title a numbered caption over it, the full width, the row headers bold and to the left, the
 * others centred, the header bold, its lines as its settings say, its note under
 * it, and the line's messages.
 */
import { BlockMessages, Tex, Title, useCaptionNumber, useLineLink, type CustomBlock } from '../../lib/plugin.ts'
import { TABLE_CAPTION, TABLE_TEX, groupColumns, isEmptyCell, spansBothRows, type TableData } from './tableData.ts'
import './tableView.css'

/** The whole of something, in percent (a column's share of the width). */
const PERCENT = 100

/** A header cell's maths, bold (as in the exports). */
const boldTex = (tex: string) => `\\boldsymbol{${tex}}`

export function TableView({ block }: { block: CustomBlock }) {
  const link = useLineLink()
  const number = useCaptionNumber(block)
  // Hidden tables stay hidden unless something went wrong.
  if (block.hidden && !block.error) return null
  const data = block.data as TableData
  const { lines, rowHeaders, text, groups, header, rows, gapBefore, title } = data
  /** Whether column `i` is the row headers (numbers or labels): bold text, to the left. */
  const isRowHeader = (i: number) => rowHeaders && i === 0
  /** Each other column's share of the width, in percent. */
  const share = PERCENT / (header.length - (rowHeaders ? 1 : 0))
  // (The gap in a shortened table: ⋮ in every column, the row headers' too.)
  const gap = (
    <tr key="gap">
      {header.map((_, i) => <td key={i} className={isRowHeader(i) ? 'ms-table__n' : undefined}><Tex latex={TABLE_TEX.gap} /></td>)}
    </tr>
  )
  const cells = (row: readonly string[], key: string) => (
    <tr key={key}>
      {row.map((c, i) => (isRowHeader(i)
        ? <td key={i} className="ms-table__n"><Title text={c} bold /></td>
        : isEmptyCell(data, c) ? <td key={i} className="ms-table__empty" />
          : <td key={i}>{text ? <Title text={c} /> : <Tex latex={c} />}</td>))}
    </tr>
  )
  return (
    <div className={`calc ms-table${block.error ? ' calc--error' : ''}`} {...link(block.line)}>
      {title !== undefined && (
        <p className="ms-table__caption">
          {/* (Numbered as the exports number it: `Table 2: Runs`.) */}
          {number !== undefined && <span>{`${TABLE_CAPTION} ${number}: `}</span>}
          <Title text={title} />
        </p>
      )}
      <div className="ms-table__scroll">
        <table className={`ms-table__table ms-table--${lines}`}>
          {/* (The columns but the row headers share the width equally, as in the exports; the row headers as narrow as they can be.) */}
          <colgroup>
            {header.map((_, i) => <col key={i} className={isRowHeader(i) ? 'ms-table__n' : undefined} style={isRowHeader(i) ? undefined : { width: `${share}%` }} />)}
          </colgroup>
          <thead>
            {groups ? (
              <>
                {/* (A typed table's header over two rows: its spans over the names under them; a column with nothing under it, one header down both.) */}
                <tr>
                  {groupColumns(groups).map((g) => (spansBothRows(g, header[g.from])
                    ? <th key={g.from} rowSpan={2}><Title text={g.text} bold /></th>
                    : <th key={g.from} colSpan={g.span}><Title text={g.text} bold /></th>))}
                </tr>
                <tr>
                  {groupColumns(groups).flatMap((g) => (spansBothRows(g, header[g.from]) ? []
                    : header.slice(g.from, g.from + g.span).map((h, i) => <th key={g.from + i}><Title text={h} bold /></th>)))}
                </tr>
              </>
            ) : (
              <tr>
                {header.map((h, i) => (isRowHeader(i)
                  ? <th key={i} className="ms-table__n"><Title text={h} bold /></th>
                  : <th key={i}>{text ? <Title text={h} bold /> : <Tex latex={boldTex(h)} />}</th>))}
              </tr>
            )}
          </thead>
          <tbody>
            {rows.flatMap((row, r) => [...(r === gapBefore ? [gap] : []), cells(row, String(r))])}
          </tbody>
        </table>
      </div>
      {block.note && <p className="ms-table__note"><Title text={block.note} /></p>}
      <BlockMessages line={block.line} error={block.error} warning={block.warning} />
      {block.info && <p className="calc__msg calc__msg--info">{block.info}</p>}
    </div>
  )
}

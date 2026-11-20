/**
 * A table block in the Rendered tab, as it is in the exports (tableBlock.ts): its
 * title a caption over it, the full width, the n column bold and to the left, the
 * others centred, the header bold, its lines as its settings say, its note under
 * it, and the line's messages.
 */
import { BlockMessages, Tex, Title, useLineLink, type CustomBlock } from '../../lib/plugin.ts'
import { TABLE_TEX, type TableData } from './tableData.ts'
import './tableView.css'

/** The whole of something, in percent (a column's share of the width). */
const PERCENT = 100

/** A header cell's maths, bold (as in the exports). */
const boldTex = (tex: string) => `\\boldsymbol{${tex}}`

export function TableView({ block }: { block: CustomBlock }) {
  const link = useLineLink()
  // `#hide` tables stay hidden unless something went wrong.
  if (block.hidden && !block.error) return null
  const { lines, rowHeaders, header, rows, gapBefore, title } = block.data as TableData
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
        : <td key={i}><Tex latex={c} /></td>))}
    </tr>
  )
  return (
    <div className={`calc ms-table${block.error ? ' calc--error' : ''}`} {...link(block.line)}>
      {title !== undefined && <p className="ms-table__caption"><Title text={title} /></p>}
      <div className="ms-table__scroll">
        <table className={`ms-table__table ms-table--${lines}`}>
          {/* (The columns but the row headers share the width equally, as in the exports; the row headers as narrow as they can be.) */}
          <colgroup>
            {header.map((_, i) => <col key={i} className={isRowHeader(i) ? 'ms-table__n' : undefined} style={isRowHeader(i) ? undefined : { width: `${share}%` }} />)}
          </colgroup>
          <thead>
            <tr>
              {header.map((h, i) => (isRowHeader(i)
                ? <th key={i} className="ms-table__n"><Title text={h} bold /></th>
                : <th key={i}><Tex latex={boldTex(h)} /></th>))}
            </tr>
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

/**
 * The views of blocks over several lines that aren't layouts, in the Rendered
 * tab: a card (`@constants { }`, species' names), imported data, and a scoped
 * `Title { }` block (the app's side of lib/output/constructs/blocks.ts).
 */
import { useContext, type MouseEvent } from 'react'
import { HEADING_LEVEL, hasError, type CardBlock, type GroupBlock, type HeadingLevel, type ImportBlock } from '../../lib/sheet/blocks.ts'
import { DIAGNOSTIC_KIND } from '../../lib/sheet/sheetIndex.ts'
import { LINE_COMMAND } from '../../lib/syntax.ts'
import { symbolTex, unitTex } from '../../lib/engine/index.ts'
import { BlockMessages, LineMessage, Tex, Title } from './shared.tsx'
import { ImportFile, useLineLink } from './context.ts'
import { RenderedBlock } from './index.tsx'

/** A card of equations under its title: `@constants { … }`, species' names (one on its own line, without the card). */
export function CardView({ block }: { block: CardBlock }) {
  const link = useLineLink()
  const failed = hasError(block)
  if (block.hidden && !failed) return null
  const entries = block.entries.map((e) => (
    <div className={`calc${e.error ? ' calc--error' : ''}`} key={e.line} {...link(e.line)}>
      <div className="calc__row">
        {e.tex ? <Tex latex={e.tex} display /> : <code className="calc__source">{e.source}</code>}
        {e.note && <span className="calc__note"><Title text={e.note} /></span>}
      </div>
      <BlockMessages line={e.line} error={e.error} warning={e.warning} />
      {e.info && <p className="calc__msg calc__msg--info">{e.info}</p>}
    </div>
  ))
  if (block.single) return <>{entries}</>
  return (
    <section className={`group group--card${failed ? ' group--error' : ''}`}>
      <header className="group__header" {...link(block.line)}>
        <span className="group__title"><span className="group__kind">{block.title}</span></span>
        {block.note && <span className="calc__note"><Title text={block.note} /></span>}
      </header>
      <div className="group__body">{entries}</div>
      <BlockMessages line={block.line} error={block.error} />
    </section>
  )
}

/**
 * Imported data: in place of its rows, a summary: the file, and for each column
 * the variables it made and the range of its values. A button removes it.
 */
export function ImportView({ block }: { block: ImportBlock }) {
  const link = useLineLink()
  const removeImport = useContext(ImportFile)
  if (block.hidden && !block.error) return null
  const remove = (e: MouseEvent) => {
    e.stopPropagation()
    removeImport?.(block.line)
  }
  const loaded = block.columns.length > 0
  return (
    <section className={`group group--import${block.error ? ' group--error' : ''}`}>
      <header className="group__header" {...link(block.line)}>
        <span className="group__title">
          <span className="group__kind">Data</span>
          {block.file ?? 'no file chosen yet: choose one in the import line'}
          {block.name && <span className="import__rows"> as <strong>{block.name}</strong></span>}
          {loaded && <span className="import__rows"> · {block.rows} row{block.rows === 1 ? '' : 's'}</span>}
        </span>
        {block.note && <span className="calc__note"><Title text={block.note} /></span>}
        {removeImport && (
          <span className="import__actions">
            <button className="import__choose" onClick={remove} title="Remove this import and its data from the sheet">Remove</button>
          </span>
        )}
      </header>
      {loaded && (
        <table className="import__columns" {...link(block.line)}>
          <tbody>
            {block.columns.map((c) => (
              <tr key={c.name}>
                <td>
                  <Tex latex={symbolTex(c.name)} />{c.unit && <> <Tex latex={`\\left[${unitTex(c.unit)}\\right]`} /></>}
                  {c.uncertainty && <span className="import__unc" title={`Each value's uncertainty is in column ${c.uncertainty}`}> ± {c.uncertainty}</span>}
                </td>
                <td>{c.count
                  ? <Tex latex={c.count === 1 ? symbolTex(`${c.name}_${c.first}`) : `${symbolTex(`${c.name}_${c.first}`)} \\ldots ${symbolTex(`${c.name}_${c.last}`)}`} />
                  : 'no values'}</td>
                <td>{c.min !== undefined && <Tex latex={c.min === c.max ? c.min : `${c.min} \\text{ to } ${c.max}`} />}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {block.error && <LineMessage kind={DIAGNOSTIC_KIND.error} line={block.line} text={block.error} />}
    </section>
  )
}

/** How a block titled as a heading looks, by its level (a modifier of its header's class). */
const SECTION_LOOK: Record<HeadingLevel, string> = {
  [HEADING_LEVEL.section]: 'section',
  [HEADING_LEVEL.subsection]: 'subsection',
  [HEADING_LEVEL.paragraph]: 'paragraph',
}

/** `Title { … }`: a card, its variables scoped to it. Untitled (and without a note), it has no header. */
export function GroupView({ block }: { block: GroupBlock }) {
  const link = useLineLink()
  if (block.command === LINE_COMMAND.hide && !hasError(block)) return null
  const header = !!block.title || !!block.note
  // A title written as a heading (`# Kinematics {`) is set as one, with its number.
  const section = block.section ? ` group__header--${SECTION_LOOK[block.section.level]}` : ''
  return (
    // (Without a header, the card itself goes to the line that opens it.)
    <section className={`group${block.error ? ' group--error' : ''}`} {...(header ? {} : link(block.line))}>
      {header && (
        <header className={`group__header${section}`} {...link(block.line)}>
          <span className="group__title">
            {block.section?.number && <span className="doc__heading-number">{block.section.number}</span>}
            {block.title && <Title text={block.title} />}
          </span>
          {block.note && <span className="calc__note"><Title text={block.note} /></span>}
        </header>
      )}
      <div className="group__body">
        {block.children.map((b) => <RenderedBlock key={`${b.line}-${b.kind}`} block={b} />)}
      </div>
      {block.error && <p className="calc__msg calc__msg--error">{block.error}</p>}
    </section>
  )
}

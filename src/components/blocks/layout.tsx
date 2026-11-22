/**
 * The view of `@layout` blocks in the Rendered tab: a list (with sub-lists),
 * columns, or the lines arranged as the layout says (the app's side of
 * lib/output/constructs/layout.ts).
 */
import type { ReactNode } from 'react'
import { hasError, listItems, type LayoutBlock } from '../../lib/sheet/blocks.ts'
import { LAYOUT_STYLE, LINE_COMMAND } from '../../lib/syntax.ts'
import { columnParts } from '../../lib/output/constructs/columns.ts'
import { BlockMessages, Title } from './shared.tsx'
import { useLineLink } from './context.ts'
import { RenderedBlock } from './index.tsx'

/** `@layout.…`: a list (with sub-lists), or its lines arranged as its layout says. */
export function LayoutView({ block }: { block: LayoutBlock }) {
  const link = useLineLink()
  if (block.command === LINE_COMMAND.hide && !hasError(block)) return null
  const title = (block.title || block.note) && (
    <p className="layout__title" {...link(block.line)}>
      <Title text={block.title} />
      {block.note && <span className="calc__note"><Title text={block.note} /></span>}
    </p>
  )
  const messages = <BlockMessages line={block.line} error={block.error} warning={block.warning} />
  // In columns: each column laid out as the block is, side by side, wrapping to a new row after a row's worth.
  if (block.columns) {
    const { perRow, rows } = columnParts(block)
    return (
      <div className="layout layout--columns">
        {title}
        <div className="layout__columns" style={{ gridTemplateColumns: `repeat(${perRow}, minmax(0, 1fr))` }}>
          {rows.flat().map((part) => <LayoutView key={`${part.children[0].line}-column`} block={part} />)}
        </div>
        {messages}
      </div>
    )
  }
  if (block.style === LAYOUT_STYLE.list) {
    // (A numbered list's marker is just what HTML's own list types are named: 1, a, A, i, I.)
    const list = (children: ReactNode, start?: number) => block.marker
      ? <ol className="layout__list" type={block.marker} start={start}>{children}</ol>
      : <ul className="layout__list">{children}</ul>
    const items = listItems(block.children).map(({ item, subs }) => (
      <li key={`${item.line}-${item.kind}`}>
        <RenderedBlock block={item} />
        {subs.map((s) => <RenderedBlock key={`${s.line}-sub`} block={s} />)}
      </li>
    ))
    // A sub-list is just the list, inside its parent's item.
    if (block.nested) return list(items)
    // (A column of a numbered list carries on from the one before it.)
    return <div className="layout">{title}{list(items, block.firstNumber)}{messages}</div>
  }
  return (
    <div className={`layout layout--${block.style ?? 'plain'}`}>
      {title}
      <div className="layout__body">
        {block.children.map((b) => <RenderedBlock key={`${b.line}-${b.kind}`} block={b} />)}
      </div>
      {messages}
    </div>
  )
}

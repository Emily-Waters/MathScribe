/**
 * Every kind of block's view in the Rendered tab, by its kind: the app's side
 * of the constructs (lib/output/constructs/), which write the same blocks to
 * LaTeX and Word. Each file here mirrors one there: lines.tsx, blocks.tsx,
 * layout.tsx. Adding a kind of block means adding its view here, and
 * TypeScript checks that every kind has one.
 */
import type { ReactNode } from 'react'
import type { Block, BlockKind } from '../../lib/sheet/blocks.ts'
import { CalcView, HeadingView, LatexView, SpacerView, TextView } from './lines.tsx'
import { CardView, GroupView, ImportView } from './blocks.tsx'
import { LayoutView } from './layout.tsx'

/** Each kind of block's view. */
const BLOCK_VIEWS: { readonly [K in BlockKind]: (props: { block: Extract<Block, { kind: K }> }) => ReactNode } = {
  heading: HeadingView,
  text: TextView,
  latex: LatexView,
  spacer: SpacerView,
  calc: CalcView,
  group: GroupView,
  layout: LayoutView,
  card: CardView,
  import: ImportView,
}

/** One block of the sheet as it appears in the Rendered tab, as its kind's view draws it. */
export function RenderedBlock({ block }: { block: Block }) {
  const View = BLOCK_VIEWS[block.kind] as (props: { block: Block }) => ReactNode
  return <View block={block} />
}

export { Tex, Title } from './shared.tsx'

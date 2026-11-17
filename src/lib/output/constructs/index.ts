/**
 * Every kind of block's construct, by its kind. The exports ask a block's
 * construct to write it (constructOf); adding a kind of block means adding its
 * construct here, and TypeScript checks that every kind has one.
 */
import type { Block, BlockKind } from '../../sheet/blocks.ts'
import type { Construct } from './construct.ts'
import { CalcConstruct, HeadingConstruct, LatexConstruct, SpacerConstruct, TextConstruct } from './lines.ts'
import { CardConstruct, CustomConstruct, GroupConstruct, ImportConstruct } from './blocks.ts'
import { LayoutConstruct } from './layout.ts'

/** Each kind's construct, for the blocks of that kind. */
type Constructs = { readonly [K in BlockKind]: Construct<Extract<Block, { kind: K }>> }

/** The construct of every kind of block. */
const CONSTRUCTS: Constructs = {
  heading: new HeadingConstruct(),
  text: new TextConstruct(),
  latex: new LatexConstruct(),
  spacer: new SpacerConstruct(),
  calc: new CalcConstruct(),
  group: new GroupConstruct(),
  layout: new LayoutConstruct(),
  card: new CardConstruct(),
  import: new ImportConstruct(),
  custom: new CustomConstruct(),
}

/** A block's construct. */
export const constructOf = <B extends Block>(b: B): Construct<B> => CONSTRUCTS[b.kind] as unknown as Construct<B>

export type { Construct, DocxOut, LatexOut } from './construct.ts'

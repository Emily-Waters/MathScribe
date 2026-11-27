/** The Rendered tab: every kind of block is drawn by its kind's component. */
import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { RenderedBlock } from './blocks/index.tsx'
import { sheet } from '../test/helpers.ts'
import { BLOCK_KIND, isContainer, type Block, type BlockKind } from '../lib/sheet/blocks.ts'

/** A sheet with a block of every kind. */
const SOURCE = [
  '# Heading',
  '> Some prose with $x^2$',
  '@latex { \\frac{a}{b} }',
  'm = 2.00 kg   // mass',
  '',
  '',
  'f(x) = x^2',
  '@constants {',
  '    k = 2.0 N/m',
  '}',
  '@chem.species {',
  '    dietzeite = {7Ca(IO3)2*8CaCrO4}',
  '}',
  'Block {',
  '    y = 1',
  '}',
  '@layout.list(1) Steps {',
  '    z = 3',
  '        > a sub-item',
  '}',
  '@layout.text {',
  '    # Its own heading',
  '    > a quote, with [a link](https://example.com)',
  '    ---',
  '}',
  '@import("data.csv")',
  '    t (s)',
  '    0.10',
].join('\n')

/** Every block, at any depth. */
const allBlocks = (blocks: Block[]): Block[] => blocks.flatMap((b) => [b, ...(isContainer(b) ? allBlocks(b.children) : [])])

describe('the Rendered tab', () => {
  const blocks = sheet(SOURCE).blocks
  const html = blocks.map((block) => renderToStaticMarkup(createElement(RenderedBlock, { block }))).join('\n')

  // (Every kind but a module's own, `custom`, which only a module's lines make: plugin.test.ts draws one.)
  it('has a sheet with every kind of block to draw', () => {
    const kinds = new Set<BlockKind>(allBlocks(blocks).map((b) => b.kind))
    expect([...kinds].sort()).toEqual(Object.values(BLOCK_KIND).filter((k) => k !== BLOCK_KIND.custom).sort())
  })

  it('draws each kind', () => {
    expect(html).toContain('doc__heading--section')
    expect(html).toContain('doc__text')
    expect(html).toContain('doc__spacer')
    expect(html).toContain('group--card')
    expect(html).toContain('Species')
    expect(html).toContain('group--import')
    expect(html).toContain('<ol class="layout__list" type="1">')
    expect(html).toContain('<ol class="layout__list" type="a">')
    expect(html).toContain('calc__note')
    expect(html).toContain('katex')
  })
})

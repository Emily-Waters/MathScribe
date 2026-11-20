/** Templates: each works out as it is, so a sheet started from one has no errors. */
import { describe, expect, it } from 'vitest'
import { lines, sheet } from '../../test/helpers.ts'
import { TEMPLATES } from './templates.ts'
import { BLOCK_KIND, isContainer, type Block } from '../sheet/blocks.ts'

/** Every error in a sheet's blocks, at any depth. */
const errors = (blocks: readonly Block[]): string[] => blocks.flatMap((b) => [
  ...('error' in b && b.error ? [`line ${b.line}: ${b.error}`] : []),
  ...(isContainer(b) ? errors(b.children) : []),
])

describe('templates', () => {
  it('each work out without errors', () => {
    for (const t of TEMPLATES) {
      expect(errors(sheet(t.source).blocks), t.name).toEqual([])
      expect(lines(t.source).filter((l) => l.warning).map((l) => `${l.line}: ${l.warning}`), t.name).toEqual([])
    }
  })

  it('have names of their own, and a title page', () => {
    expect(new Set(TEMPLATES.map((t) => t.name)).size).toBe(TEMPLATES.length)
    for (const t of TEMPLATES) expect(sheet(t.source).blocks[0].kind).toBe(BLOCK_KIND.layout)
  })
})

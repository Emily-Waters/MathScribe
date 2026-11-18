import { describe, expect, it } from 'vitest'
import { fixedPanelPosition } from './popover.ts'

describe('fixed popover placement', () => {
  it('clamps a panel to the right and bottom edges', () => {
    expect(fixedPanelPosition(
      { top: 260, bottom: 280, left: 470, right: 490 }, 200, 100, 500, 300,
    )).toEqual({ left: 292, top: 154 })
  })

  it('uses the left edge when the anchor is on the left', () => {
    expect(fixedPanelPosition(
      { top: 20, bottom: 40, left: 12, right: 32 }, 200, 100, 500, 300,
    )).toEqual({ left: 12, top: 46 })
  })
})

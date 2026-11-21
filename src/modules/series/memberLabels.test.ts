/** A series' members' names before its values in the editor, for a series written over several lines. */
import { describe, expect, it } from 'vitest'
import { memberLabels } from './memberLabels.ts'

/** Each label as the text it's before, `x_1 → 1.0 s`. */
const shown = (text: string) => memberLabels(text).map((l) => `${l.name} → ${text.slice(l.at).split(/,?\n/)[0]}`)

describe('member labels', () => {
  it('name each value of a series over several lines, numbered from 1', () => {
    expect(shown('x = @series(\n    1.0 s,\n    2.0 s,\n    3.0 s\n)')).toEqual(['x_1 → 1.0 s', 'x_2 → 2.0 s', 'x_3 → 3.0 s'])
  })

  it('name values sharing a line, and one on the opening line, each its own', () => {
    expect(memberLabels('v = @series(1, 2,\n    3, 4\n)').map((l) => l.name)).toEqual(['v_1', 'v_2', 'v_3', 'v_4'])
  })

  it('count a value with brackets or a call in it as one, and skip a trailing comma', () => {
    const text = 'a = @series(\n    (1 + 2) m,\n    max(3, 4) m,\n)'
    expect(shown(text)).toEqual(['a_1 → (1 + 2) m', 'a_2 → max(3, 4) m'])
  })

  it('leave a series on one line, and other calls, alone', () => {
    expect(memberLabels('x = @series(1, 2, 3)')).toEqual([])
    expect(memberLabels('@table(\n    t,\n    x\n)')).toEqual([])
    expect(memberLabels('y = max(\n    1,\n    2\n)')).toEqual([])
  })
})

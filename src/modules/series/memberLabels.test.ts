/** A series' members' names before its values in the editor, for a series written over several lines. */
import { describe, expect, it } from 'vitest'
import { memberLabels } from './memberLabels.ts'
import { typedName } from '../../lib/plugin.ts'

/** Each label as the text it's before, `x[1] → 1.0 s`. */
const shown = (text: string) => memberLabels(text).map((l) => `${typedName(l.name)} → ${text.slice(l.at).split(/,?\n/)[0]}`)

describe('member labels', () => {
  it('name each value of a series over several lines, numbered from 1', () => {
    expect(shown('x = [\n    1.0 s,\n    2.0 s,\n    3.0 s\n]')).toEqual(['x[1] → 1.0 s', 'x[2] → 2.0 s', 'x[3] → 3.0 s'])
  })

  it('name values sharing a line, and one on the opening line, each its own', () => {
    expect(memberLabels('v = [1, 2,\n    3, 4\n]').map((l) => typedName(l.name))).toEqual(['v[1]', 'v[2]', 'v[3]', 'v[4]'])
  })

  it('count a value with brackets or a call in it as one, and skip a trailing comma', () => {
    const text = 'a = [\n    (1 + 2) m,\n    max(3, 4) m,\n]'
    expect(shown(text)).toEqual(['a[1] → (1 + 2) m', 'a[2] → max(3, 4) m'])
  })

  it('leave a series on one line, and other calls, alone', () => {
    expect(memberLabels('x = [1, 2, 3]')).toEqual([])
    expect(memberLabels('@table(\n    t,\n    x\n)')).toEqual([])
    expect(memberLabels('y = max(\n    1,\n    2\n)')).toEqual([])
  })

  it('leave a list added up where it is alone: it makes no series', () => {
    expect(memberLabels('x_sum = [\n    1,\n    2\n].sum')).toEqual([])
  })
})

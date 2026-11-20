/** Where the ⚙ of a table or a plot goes: its call, found from the sheet's tree, on one line or over several. */
import { describe, expect, it } from 'vitest'
import { settingsCalls } from './tableMenu.ts'

/** Each call found: which, and what's between its brackets. */
const found = (text: string) => settingsCalls(text).map((c) => [c.kind, text.slice(c.from, c.to)])

describe('the ⚙ of a table or a plot', () => {
  it('finds a table or a plot on a line of its own, named or not', () => {
    expect(found('@table(t, x)\np = @plot(t, x; fit linear)')).toEqual([['table', 't, x'], ['plot', 't, x; fit linear']])
  })

  it('finds one over several lines, up to the bracket closing it', () => {
    const text = 'Box {\n    @table(\n        t,\n        f(x);\n        rows 2-3\n    )\n}'
    expect(found(text)).toEqual([['table', '\n        t,\n        f(x);\n        rows 2-3\n    ']])
  })

  it('finds none in the middle of a line, or one never closed', () => {
    expect(found('y = 2 * @table(t)\n@plot(t, x')).toEqual([])
    // (Nor one whose bracket a later statement closes: the call ends at the blank line.)
    expect(found('@table(t,\n\nx = f(1)')).toEqual([])
  })
})

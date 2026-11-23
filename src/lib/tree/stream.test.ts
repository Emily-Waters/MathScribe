/** Reading a sheet a line at a time: a line carrying on a continued line is read after a short context that reads the same as everything said. */
import { describe, expect, it } from 'vitest'
import { carriedContext, lexTail } from './lexer.ts'
import { stepLine, TOP, type LineState } from './stream.ts'
import { splitLines } from './index.ts'
// (The engine installs its modules as it loads: their lex rules, a species' and a table's settings, are then the lexer's.)
import '../engine/index.ts'

/** What a line carrying on after `said` reads as: its tokens, as text and kind. */
const tail = (said: string, text: string) => JSON.stringify(lexTail(said, text))

describe('a continued line', () => {
  it('reads each line after its carried context as it would after everything said', () => {
    // [said, the next line]: each case one where what's read depends on what came before.
    const cases: [string, string][] = [
      ['t = [1.21 s, 1.17 s,', '1.24 s]'],
      ['@table(t, x;', 'rows 2-3, lines grid)'],
      ['@table(t, x; rows 2-3,', 'lines grid)'],
      ['p = @plot(t,', 'x; fit linear)'],
      ['@tuple(r:3,', 'theta:deg) = p'],
      ['x = f(a, g(b,', 'c), d = 2)'],
      ['m = 2.0', 'kg'],
      // A quote, a brace and a `<` closed on the next line: one part, from before the comma.
      ['n = f("work, energy', 'and momentum")'],
      ['title={\'Copy the prompt, to paste', '+ \'more\'}'],
      ['F = <3.0,', '4.0> N'],
      ['n = 2.0 mol ({EDTA},', '3)'],
    ]
    for (const [said, text] of cases) expect(tail(carriedContext(said), text), `${said} ⏎ ${text}`).toBe(tail(said, text))
  })

  it('carries a short context however long it runs, so reading it takes time in step with its length', () => {
    const lines = splitLines(`t = [\n${Array.from({ length: 2000 }, (_, i) => `    ${(1 + i / 1000).toFixed(3)} s,`).join('\n')}\n]`)
    let state: LineState = TOP
    let longest = 0
    for (const line of lines) {
      state = stepLine(state, line).state
      longest = Math.max(longest, ...state.map((f) => f.carried?.length ?? 0))
    }
    // (Everything said would be some 24,000 characters by the end.)
    expect(longest).toBeLessThan(40)
    expect(state).toEqual(TOP)
  })

  it('keeps an opener a later line could close, and lets go of one that’s decided', () => {
    // A `{` with a brace after it can't be a species any more, and a `<` with a `>` after it is decided.
    expect(carriedContext('f({ a: 1, b: { c: 2 }, d: 3,')).toBe('f(,')
    expect(carriedContext('f(x, "ops: <, >, <=,')).toBe('f(, "ops: <, >, <=,')
    expect(carriedContext('f(a <, >, b,')).toBe('f(,')
    // One that can still close is kept, with the part before it (a `<` opens a vector only after `=`, `(`, …).
    expect(carriedContext('f(a, {b, c,')).toBe('f(, {b, c,')
    expect(carriedContext('F = f(a, <3.0, 4.0,')).toBe('= f(, <3.0, 4.0,')
  })
})

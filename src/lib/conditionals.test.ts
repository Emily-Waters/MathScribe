/** Conditions: `cond ? a : b` in a line, and if / else if / else in a function's body. */
import { describe, expect, it } from 'vitest'
import { last, lines, sheet, value } from '../test/helpers.ts'
import { BLOCK_KIND, type FunctionBlock } from './blocks.ts'

const friction = [
  'mu = 0.30', 'N = 20.0 N',
  'def friction(v)',
  '    if v > 0 m/s',
  '        f = -mu * N',
  '        return f',
  '    else if v < 0 m/s:',
  '        return mu * N',
  '    else',
  '        return 0 N',
  '',
].join('\n')

const functionBlock = (source: string) => sheet(source).blocks.find((b) => b.kind === BLOCK_KIND.function) as FunctionBlock

describe('cond ? a : b', () => {
  it('gives whichever it comes to, with that one’s sig figs', () => {
    expect(value('N = 20.0 N\nF = N > 10 N ? 5.0 N : 0 N')).toBe('5.0 N')
    expect(value('N = 2.0 N\nF = N > 10 N ? 5.0 N : 0.25 N')).toBe('0.25 N')
  })

  it('makes a one-line function piecewise', () => {
    expect(value('ramp(x) = x > 0 ? x : 0\ny = ramp(3.0)')).toBe('3.0')
    expect(value('ramp(x) = x > 0 ? x : 0\ny = ramp(-2)')).toBe('0')
  })
})

describe('if / else in a function', () => {
  it('runs the first branch whose condition holds, or the else', () => {
    expect(value(`${friction}a = friction(2.0 m/s)`)).toBe('-6.0 N')
    expect(value(`${friction}a = friction(-1.0 m/s)`)).toBe('6.0 N')
    expect(value(`${friction}a = friction(0 m/s)`)).toBe('0 N')
  })

  it('shows each comparison it made in the working, then the branch taken', () => {
    const trace = last(`${friction}a = friction(-1.0 m/s)`).trace!.map((t) => t.tex)
    expect(trace).toHaveLength(2)
    expect(trace[0]).toContain('= \\text{false}')
    expect(trace[1]).toContain('= \\text{true}')
  })

  it('nests, and carries on after a branch', () => {
    const sign = 'def size(x)\n    s = 0\n    if x > 0\n        s = 1\n        if x > 10\n            s = 2\n    return s\n'
    expect(value(`${sign}p = size(50)`)).toBe('2')
    expect(value(`${sign}p = size(5)`)).toBe('1')
    expect(value(`${sign}p = size(-5)`)).toBe('0')
  })

  it('decides a branch once: a variable changed inside it doesn’t undo it', () => {
    const flip = 'def flip(x)\n    if x > 0\n        x = -x\n        y = 1\n    else\n        y = 2\n    return y\n'
    expect(value(`${flip}p = flip(3)`)).toBe('1')
  })

  it('shows the branches in the definition, indented', () => {
    const body = functionBlock(friction).body.map((l) => l.tex)
    expect(body[0]).toMatch(/^\\text\{if \}/)
    expect(body[1]).toMatch(/^\\quad f = /)
    expect(body[3]).toMatch(/^\\text\{else if \}/)
    expect(body[5]).toBe('\\text{otherwise}')
  })

  it('explains an else without an if, and a condition that isn’t one', () => {
    expect(functionBlock('def f(x)\n    else\n        return 1').error).toMatch(/this else has no if before it/)
    expect(functionBlock('def f(x)\n    y = 1\n    else\n        return 1').error).toMatch(/this else has no if/)
    expect(lines('def f(x)\n    if x + 1\n        return 1\n    return 2\ny = f(1)').at(-1)!.error).toMatch(/isn't a condition/)
  })
})

describe('limits in conditions', () => {
  it('aren’t measurements, so their trailing zeros don’t warn', () => {
    expect(last('N = 20.0 N\nF = N > 10 N ? 5.0 N : 0 N').warning).toBeUndefined()
    expect(last('x = 250. m\nok = x < 300 m').warning).toBeUndefined()
    expect(last('x = 300 m').warning).toMatch(/Trailing zeros/)
  })
})

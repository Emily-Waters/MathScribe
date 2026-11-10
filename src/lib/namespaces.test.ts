/** Namespaces, `a.x_1`: slices (select), named imports and named plots. */
import { describe, expect, it } from 'vitest'
import { last, lines, sheet, value } from '../test/helpers.ts'
import { symbolTex } from './engine.ts'
import { collectSymbols, type ImportBlock } from './document.ts'
import { expandDots, parseMemberName, readableMembers } from './names.ts'

const data = 't1 = 0.10 s\nt2 = 0.20 s\nt3 = 0.30 s\nt4 = 0.40 s\n'
  + 'x1 = 0.051 m pm 0.004 m\nx2 = 0.098 m pm 0.004 m\nx3 = 0.152 m pm 0.004 m\nx4 = 0.199 m pm 0.004 m\n'

/** How many rows a select line kept, of how many: "2 of 4". */
const rowsOf = (source: string) => /(\d+) \\text\{ of \} (\d+)/.exec(last(source).tex)?.slice(1).join(' of ')

describe('dot access', () => {
  it('reads a.x_1 as the inside name a__x_1, leaving numbers and quoted text alone', () => {
    expect(expandDots('v = a.x_1 / a.t1 + 2.5')).toBe('v = a__x_1 / a__t1 + 2.5')
    expect(expandDots('plot(a.t, a.x; title "Run 1. a.x")')).toBe('plot(a__t, a__x; title "Run 1. a.x")')
    expect(expandDots('y = 1.5e3 * x')).toBe('y = 1.5e3 * x')
    expect(parseMemberName('a__x_1')).toEqual({ namespace: 'a', member: 'x_1' })
    expect(parseMemberName('delta__x')).toBeNull()
    expect(readableMembers('Undefined symbol a__x_9')).toBe('Undefined symbol a.x_9')
  })

  it('shows a member with its namespace first in the subscript', () => {
    expect(symbolTex('a__x_1')).toBe('x_{a,1}')
    expect(symbolTex('a__x')).toBe('x_{a}')
    expect(symbolTex('a__x_avg')).toBe('\\bar{x}_{a}')
    expect(symbolTex('run1__theta_2')).toBe('\\theta_{\\mathrm{run1},2}')
    expect(symbolTex('p__slope')).toBe('\\mathrm{slope}_{p}')
    expect(symbolTex('p__r2')).toBe('R^{2}_{p}')
  })
})

describe('select()', () => {
  it('keeps the rows where the conditions hold, as new series numbered from 1', () => {
    const src = `${data}a = select(t, x; t from 0.2 to 0.3)\n`
    expect(rowsOf(`${data}a = select(t, x; t from 0.2 to 0.3)`)).toBe('2 of 4')
    expect(value(`${src}y = a.x_1`)).toBe('(0.098 ± 0.004) m')
    expect(value(`${src}y = a.x1`)).toBe('(0.098 ± 0.004) m') // a.x1 is a.x_1, as anywhere
    expect(value(`${src}y = a.t_2`)).toBe('0.30 s')
    expect(value(`${src}n = a.x_count`)).toBe('2')
    expect(value(`${src}m = a.x_avg`)).toBe('(0.13 ± 0.03) m')
  })

  it('takes either end of a range, units on the bounds, rows, and several conditions', () => {
    expect(rowsOf(`${data}b = select(x; t from 250 ms)`)).toBe('2 of 4')
    expect(rowsOf(`${data}b = select(x; t to 0.1)`)).toBe('1 of 4')
    expect(rowsOf(`${data}b = select(t, x; rows 2-4, x to 0.16)`)).toBe('2 of 4')
  })

  it('works with tables, plots and other slices', () => {
    const src = `${data}a = select(t, x; t from 0.2)\n`
    expect(last(`${src}table(a.t, a.x)`).error).toBeUndefined()
    expect(last(`${src}plot(a.t, a.x)`).plot?.series[0].points).toHaveLength(3)
    expect(value(`${src}b = select(a.x; rows 2-)\ny = b.x_1`)).toBe('(0.152 ± 0.004) m')
  })

  it('keeps each value’s uncertainty as the same source (a slice is correlated with its data)', () => {
    // x_2 − a.x_1 is the same measurement minus itself: exactly 0, with no uncertainty.
    expect(value(`${data}a = select(x; t from 0.2)\nd = x_2 - a.x_1`)).toBe('0 m')
  })

  it('names members as typed in its messages, and explains a bad condition', () => {
    expect(last(`${data}a = select(t, x; t from 0.2)\ny = a.x_9`).error).toBe('Undefined symbol a.x_9')
    expect(last(`${data}a = select(t, x; colour red)`).error).toMatch(/"colour red" isn't a condition/)
    expect(last(`${data}a = select(q)`).error).toMatch(/q isn't a series/)
    expect(last(`${data}a = select(t; t from 3 kg)`).error).toBeDefined()
    expect(last(`${data}delta = select(t)`).error).toMatch(/reserved/)
  })

  it('is local to a { } block, as a variable is', () => {
    const src = `${data}Run {\n  a = select(x; t from 0.3)\n  y = a.x_1\n}\nz = a.x_1`
    expect(lines(src).find((l) => l.source.startsWith('y'))!.error).toBeUndefined()
    expect(last(src).error).toBe('Undefined symbol a.x_1')
  })

  it('says so when nothing matches', () => {
    expect(last(`${data}a = select(t; t from 9)`).info).toMatch(/No rows match/)
  })
})

describe('named plots', () => {
  it('put their fit under their name: p.slope, p.intercept, p.r2', () => {
    const src = `${data}p = plot(t, x; fit linear)\n`
    expect(value(`${src}v = p.slope`)).toBe('(0.498 ± 0.018) m/s')
    expect(value(`${src}b = p.intercept`)).toMatch(/ m$/)
    expect(value(`${src}r = p.r2`)).toMatch(/^0\.99/)
    // An unnamed plot keeps making x_slope; a named one doesn't.
    expect(last(`${src}v = x_slope`).error).toBeDefined()
    expect(value(`${data}plot(t, x; fit linear)\nv = x_slope`)).toBe('(0.498 ± 0.018) m/s')
  })

  it('hold the series they plot: p.t, p.x, the rows drawn, numbered from 1', () => {
    const src = `${data}p = plot(t, x; rows 2-3)\n`
    expect(value(`${src}y = p.x_1`)).toBe('(0.098 ± 0.004) m')
    expect(value(`${src}y = p.t_2`)).toBe('0.30 s')
    expect(value(`${src}n = p.x_count`)).toBe('2')
    expect(last(`${src}y = p.x_3`).error).toBe('Undefined symbol p.x_3')
    // Without a fit too, and from other namespaces: run1.x is p.x.
    expect(value(`${data}a = select(t, x)\np = plot(a.t, a.x)\ny = p.x_4`)).toBe('(0.199 ± 0.004) m')
  })

  it('keep only what’s on the axes: a range leaves points out of p.x and the fit', () => {
    const src = `${data}p = plot(t, x; fit linear, x from 0.15 to 0.35)\n`
    expect(value(`${src}n = p.x_count`)).toBe('2')
    expect(value(`${src}y = p.t_1`)).toBe('0.20 s')
    expect(last(`${data}p = plot(t, x; fit linear, x from 0.15 to 0.35)`).plot?.series[0].points.map((p) => p.n)).toEqual([2, 3])
    expect(value(`${data}p = plot(t, x; y to 0.1)\nn = p.x_count`)).toBe('2')
  })

  it('explain a missing slope: it needs a fit', () => {
    expect(last(`${data}p = plot(t, x)\nv = p.slope`).error).toMatch(/only with a fit\. Add fit linear/)
  })

  it('with several series, name each one’s: p.x_slope', () => {
    const src = `${data}y1 = 1 m\ny2 = 2 m\ny3 = 3 m\ny4 = 4 m\np = plot(t, x, y; fit linear)\n`
    expect(value(`${src}v = p.y_slope`)).toMatch(/m\/s$/)
  })
})

describe('named imports', () => {
  const run = (name: string, rows: string[]) => `${name} = import("${name}.csv")\n    t (s), x (m)\n${rows.map((r) => `    ${r}`).join('\n')}\n\n`

  it('keep two files with the same columns apart', () => {
    const src = run('run1', ['0.10, 0.05', '0.20, 0.10']) + run('run2', ['0.10, 0.07', '0.20, 0.14'])
    expect(value(`${src}d = run2.x_2 - run1.x_2`)).toBe(value('a = 0.14 m\nb = 0.10 m\nd = a - b'))
    expect(value(`${src}d = run2.x_1`)).toBe('0.07 m')
    expect(value(`${src}n = run1.x_count`)).toBe('2')
    // In a condition, t is the selected run1.t.
    expect(value(`${src}a = select(run1.t, run1.x; t from 0.2)\ny = a.x_1`)).toBe('0.10 m')
    const block = sheet(src).blocks[0] as ImportBlock
    expect(block.name).toBe('run1')
    expect(block.columns.map((c) => c.name)).toEqual(['run1__t', 'run1__x'])
  })
})

describe('suggestions', () => {
  it('list what a select or named plot made, not a plain variable', () => {
    const src = `${data}a = select(t, x; t from 0.2)\np = plot(t, x; fit linear)\nz = 1`
    const names = collectSymbols(sheet(src), src).map((s) => s.name)
    expect(names).toEqual(expect.arrayContaining(['a__t_1', 'a__t_3', 'a__x_1', 'a__x_3', 'p__slope', 'p__intercept', 'p__r2']))
    expect(names).not.toContain('a')
    expect(names).not.toContain('p')
  })
})

describe('lines', () => {
  it('a decimal point after a name isn’t dot access', () => {
    expect(lines('x = 2\ny = 2.5 * x').at(-1)!.error).toBeUndefined()
  })
})

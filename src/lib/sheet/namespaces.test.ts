/** Namespaces, `a.x[1]`: slices (select), named imports and named plots. */
import { describe, expect, it } from 'vitest'
import { last, lines, sheet, value } from '../../test/helpers.ts'
import { symbolTex } from '../engine/index.ts'
import { SYMBOL_KIND, collectSymbols } from './sheetIndex.ts'
import type { ImportBlock } from './blocks.ts'
import { parseMemberName, readableMembers } from './names.ts'
import { expandDots } from '../engine/core/memberAccess.ts'

const data = 't = [0.10 s, 0.20 s, 0.30 s, 0.40 s]\n'
  + 'x = [0.051 m pm 0.004 m, 0.098 m pm 0.004 m, 0.152 m pm 0.004 m, 0.199 m pm 0.004 m]\n'

/** How many rows a select line kept, of how many: "2 of 4". */
const rowsOf = (source: string) => /(\d+) \\text\{ of \} (\d+)/.exec(last(source).tex)?.slice(1).join(' of ')

describe('dot access', () => {
  it('reads a.x[1] as the inside name a__x__1, a.v_0 as a__v_0, leaving numbers and quoted text alone', () => {
    expect(expandDots('v = a.x[1] / a.t1 + 2.5 + t[2] + a.v_0')).toBe('v = a__x__1 / a__t1 + 2.5 + t__2 + a__v_0')
    expect(expandDots('m = t.avg + a.x.avg')).toBe('m = t__avg + a__x__avg')
    expect(expandDots('@plot(a.t, a.x; title "Run 1. a.x")')).toBe('@plot(a__t, a__x; title "Run 1. a.x")')
    expect(expandDots('y = 1.5e3 * x')).toBe('y = 1.5e3 * x')
    expect(parseMemberName('a__x_1')).toEqual({ namespace: 'a', member: 'x_1' })
    expect(parseMemberName('a__x__1')).toEqual({ namespace: 'a', member: 'x__1' })
    expect(parseMemberName('delta__x')).toBeNull()
    expect(readableMembers('Undefined symbol a__x__9 and a__v_0')).toBe('Undefined symbol a.x[9] and a.v_0')
  })

  it('shows a member with its namespace first in the subscript', () => {
    expect(symbolTex('a__x__1')).toBe('x_{a,1}')
    expect(symbolTex('t__1')).toBe('t_{1}')
    expect(symbolTex('v_0__2')).toBe('v_{0,2}')
    expect(symbolTex('a__x')).toBe('x_{a}')
    expect(symbolTex('a__x__avg')).toBe('\\bar{x}_{a}')
    expect(symbolTex('run1__theta__2')).toBe('\\theta_{\\mathrm{run1},2}')
    expect(symbolTex('p__slope')).toBe('\\mathrm{slope}_{p}')
    expect(symbolTex('p__r2')).toBe('R^{2}_{p}')
  })
})

describe('@select()', () => {
  it('keeps the rows where the conditions hold, as new series numbered from 1', () => {
    const src = `${data}a = @select(t, x; t from 0.2 to 0.3)\n`
    expect(rowsOf(`${data}a = @select(t, x; t from 0.2 to 0.3)`)).toBe('2 of 4')
    expect(value(`${src}y = a.x[1]`)).toBe('(0.098 ± 0.004) m')
    expect(value(`${src}y = a.t[2]`)).toBe('0.30 s')
    expect(value(`${src}n = a.x.count`)).toBe('2')
    expect(value(`${src}m = a.x.avg`)).toBe('(0.13 ± 0.03) m')
  })

  it('takes either end of a range, units on the bounds, rows, and several conditions', () => {
    expect(rowsOf(`${data}b = @select(x; t from 250 ms)`)).toBe('2 of 4')
    expect(rowsOf(`${data}b = @select(x; t to 0.1)`)).toBe('1 of 4')
    expect(rowsOf(`${data}b = @select(t, x; rows 2-4, x to 0.16)`)).toBe('2 of 4')
  })

  it('works with tables, plots and other slices', () => {
    const src = `${data}a = @select(t, x; t from 0.2)\n`
    expect(last(`${src}@table(a.t, a.x)`).error).toBeUndefined()
    expect(last(`${src}@plot(a.t, a.x)`).plot?.series[0].points).toHaveLength(3)
    expect(value(`${src}b = @select(a.x; rows 2-)\ny = b.x[1]`)).toBe('(0.152 ± 0.004) m')
  })

  it('keeps each value’s uncertainty as the same source (a slice is correlated with its data)', () => {
    // x[2] − a.x[1] is the same measurement minus itself: exactly 0, with no uncertainty.
    expect(value(`${data}a = @select(x; t from 0.2)\nd = x[2] - a.x[1]`)).toBe('0 m')
  })

  it('names members as typed in its messages, and explains a bad condition', () => {
    expect(last(`${data}a = @select(t, x; t from 0.2)\ny = a.x[9]`).error).toBe('Undefined symbol a.x[9]')
    expect(last(`${data}a = @select(t, x; colour red)`).error).toMatch(/"colour red" isn't a condition/)
    expect(last(`${data}a = @select(q)`).error).toMatch(/q isn't a series/)
    expect(last(`${data}a = @select(t; t from 3 kg)`).error).toBeDefined()
    expect(last(`${data}delta = @select(t)`).error).toMatch(/reserved/)
  })

  it('lists its members among the sheet’s variables, each with the value it looks up (for hover)', () => {
    const vars = sheet(`${data}a = @select(t, x; t from 0.2)`).variables
    expect(vars.find((v) => v.name === 'a__x__2')?.tex).toBe('x_{a,2} = \\left(0.152 \\pm 0.004\\right)\\,\\mathrm{m}')
    expect(vars.filter((v) => v.name.startsWith('a__'))).toHaveLength(6)
  })

  it('is local to a { } block, as a variable is', () => {
    const src = `${data}Run {\n  a = @select(x; t from 0.3)\n  y = a.x[1]\n}\nz = a.x[1]`
    expect(lines(src).find((l) => l.source.startsWith('y'))!.error).toBeUndefined()
    expect(last(src).error).toBe('Undefined symbol a.x[1]')
  })

  it('says so when nothing matches', () => {
    expect(last(`${data}a = @select(t; t from 9)`).info).toMatch(/No rows match/)
  })
})

describe('named plots', () => {
  it('put their fit under their name: p.slope, p.intercept, p.r2', () => {
    const src = `${data}p = @plot(t, x; fit linear)\n`
    expect(value(`${src}v = p.slope`)).toBe('(0.498 ± 0.018) m/s')
    expect(value(`${src}b = p.intercept`)).toMatch(/ m$/)
    expect(value(`${src}r = p.r2`)).toMatch(/^0\.99/)
    // An unnamed plot makes x.slope; a named one doesn't.
    expect(last(`${src}v = x.slope`).error).toBeDefined()
    expect(value(`${data}@plot(t, x; fit linear)\nv = x.slope`)).toBe('(0.498 ± 0.018) m/s')
  })

  it('hold the series they plot: p.t, p.x, the rows drawn, numbered from 1', () => {
    const src = `${data}p = @plot(t, x; rows 2-3)\n`
    expect(value(`${src}y = p.x[1]`)).toBe('(0.098 ± 0.004) m')
    expect(value(`${src}y = p.t[2]`)).toBe('0.30 s')
    expect(value(`${src}n = p.x.count`)).toBe('2')
    expect(last(`${src}y = p.x[3]`).error).toBe('Undefined symbol p.x[3]')
    // Without a fit too, and from other namespaces: run1.x is p.x.
    expect(value(`${data}a = @select(t, x)\np = @plot(a.t, a.x)\ny = p.x[4]`)).toBe('(0.199 ± 0.004) m')
  })

  it('keep only what’s on the axes: a range leaves points out of p.x and the fit', () => {
    const src = `${data}p = @plot(t, x; fit linear, x from 0.15 to 0.35)\n`
    expect(value(`${src}n = p.x.count`)).toBe('2')
    expect(value(`${src}y = p.t[1]`)).toBe('0.20 s')
    expect(last(`${data}p = @plot(t, x; fit linear, x from 0.15 to 0.35)`).plot?.series[0].points.map((p) => p.n)).toEqual([2, 3])
    expect(value(`${data}p = @plot(t, x; y to 0.1)\nn = p.x.count`)).toBe('2')
  })

  it('explain a missing slope: it needs a fit', () => {
    expect(last(`${data}p = @plot(t, x)\nv = p.slope`).error).toMatch(/only with a fit\. Add fit linear/)
  })

  it('with several series, name each one’s: p.x.slope', () => {
    const src = `${data}y = [1 m, 2 m, 3 m, 4 m]\np = @plot(t, x, y; fit linear)\n`
    expect(value(`${src}v = p.y.slope`)).toMatch(/m\/s$/)
  })
})

describe('named imports', () => {
  const run = (name: string, rows: string[]) => `${name} = @import("${name}.csv")\n    t (s), x (m)\n${rows.map((r) => `    ${r}`).join('\n')}\n\n`

  it('keep two files with the same columns apart', () => {
    const src = run('run1', ['0.10, 0.05', '0.20, 0.10']) + run('run2', ['0.10, 0.07', '0.20, 0.14'])
    expect(value(`${src}d = run2.x[2] - run1.x[2]`)).toBe(value('a = 0.14 m\nb = 0.10 m\nd = a - b'))
    expect(value(`${src}d = run2.x[1]`)).toBe('0.07 m')
    expect(value(`${src}n = run1.x.count`)).toBe('2')
    // In a condition, t is the selected run1.t.
    expect(value(`${src}a = @select(run1.t, run1.x; t from 0.2)\ny = a.x[1]`)).toBe('0.10 m')
    const block = sheet(src).blocks[0] as ImportBlock
    expect(block.name).toBe('run1')
    expect(block.columns.map((c) => c.name)).toEqual(['run1__t', 'run1__x'])
  })
})

describe('suggestions', () => {
  it('list what a select or named plot made, not a plain variable', () => {
    const src = `${data}a = @select(t, x; t from 0.2)\np = @plot(t, x; fit linear)\nz = 1`
    const symbols = collectSymbols(sheet(src), src)
    const names = symbols.map((s) => s.name)
    expect(names).toEqual(expect.arrayContaining(['a__t__1', 'a__t__3', 'a__x__1', 'a__x__3', 'p__slope', 'p__intercept', 'p__r2']))
    // (a and p are namespaces, to go to and rename, not variables.)
    expect(symbols.filter((s) => s.name === 'a' || s.name === 'p').map((s) => s.kind)).toEqual([SYMBOL_KIND.namespace, SYMBOL_KIND.namespace])
  })
})

describe('lines', () => {
  it('a decimal point after a name isn’t dot access', () => {
    expect(lines('x = 2\ny = 2.5 * x').at(-1)!.error).toBeUndefined()
  })
})

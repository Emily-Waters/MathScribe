/** `t = […]`: a series on one line, its values listed or worked out row by row from other series. */
import { describe, expect, it } from 'vitest'
import { lines, readable, value } from '../test/helpers.ts'

/** The last line of a sheet that makes a series: `name = […]`, or `name = m[2:4]`. */
const made = (source: string) => lines(source).filter((l) => /^\S* ?= ?\S*\[|^\[/.test(l.source)).at(-1)!
/** It as text: its values' commas and gap, and its count, tidied too. */
const shown = (source: string) => readable(made(source).tex)
  .replace(/,\\ /g, ', ').replace(/\\ldots/g, '…').replace(/\\quad \\text/, '  ')

const FORCES = 'F = [2.00 N, 3.00 N, 10.0 N]\n'

describe('a series in square brackets', () => {
  it('keeps a comma in a label in quotes in its value', () => {
    expect(value('s = ["KBr, solid", "KCl"]\nw = s[1]')).toContain('"KBr, solid"')
    expect(value('s = ["KBr, solid", "KCl"]\nw = s[2]')).toContain('"KCl"')
  })

  it('makes a series of the values listed, as typed', () => {
    const source = 't = [1.52 s, 1.48 s, 1.55 s]\n'
    expect(value(`${source}w = t[2]`)).toBe('1.48 s')
    expect(value(`${source}t.count`)).toBe('3')
    expect(value(`${source}w = t.avg`)).toMatch(/^\(1\.52 ± 0\.02\) s$/)
    expect(shown(source)).toMatch(/^t = \(1\.52, 1\.48, 1\.55\) s\s+3 values$/)
  })

  it('keeps each value’s own uncertainty and settings on the name', () => {
    expect(value('x = [2.0 m pm 0.1 m, 3.0 m]\nw = x[1]')).toBe('(2.0 ± 0.1) m')
    expect(value('L:cm = [1.500 m, 2.000 m]\nw = L[2]')).toBe('200.0 cm')
  })

  it('works a series out row by row from another and a single value', () => {
    const source = `${FORCES}g_0 = 9.81 m/s^2\nm = [F / g_0]\n`
    expect(value(`${source}w = m[1]`)).toBe('0.204 kg')
    expect(value(`${source}w = m[3]`)).toBe('1.02 kg')
    expect(value(`${source}m.count`)).toBe('3')
    expect(made(source).tex).toMatch(/^m_\{i\} = \\frac\{F_\{i\}\}\{g_\{0\}\} = /)
    expect(shown(source)).toMatch(/ = \(0\.204, 0\.306, 1\.02\) kg\s+3 values$/)
    // A constant in the rule is shown as itself.
    expect(made(`${FORCES}m = [F / @g]`).tex).toMatch(/^m_\{i\} = \\frac\{F_\{i\}\}\{g\} = /)
  })

  it('carries a single value’s uncertainty into every row, as one source', () => {
    const source = `${FORCES}g_0 = 9.8 m/s^2 pm 0.2 m/s^2\nm = [F / g_0]\n`
    expect(value(`${source}w = m[2]`)).toBe('(0.306 ± 0.006) kg')
    // The same source in every row: m[1] - m[1] has none, and nor does a difference of two rows scaled alike.
    expect(value(`${source}w = m[2] - m[2]`)).toBe('0 kg')
  })

  it('works one out from two series, row by row', () => {
    const source = 'd = [3.50 m, 3.48 m, 3.52 m]\nt = [1.21 s, 1.17 s, 1.24 s]\nv = [d / t]\n'
    expect(value(`${source}w = v[2]`)).toBe('2.97 m/s')
    expect(made(source).warning).toBeUndefined()
  })

  it('uses the rows every series has, with a warning when they differ', () => {
    const source = 'd = [3.50 m, 3.48 m, 3.52 m, 3.47 m]\nt = [1.21 s, 1.17 s, 1.24 s]\nv = [d / t]\n'
    expect(value(`${source}v.count`)).toBe('3')
    expect(made(source).warning).toBe('d has 4 values and t has 3 values: v uses the 3 rows both have. Slice them to choose: d[1:3].')
  })

  it('works out a rule from slices, renumbered from 1', () => {
    const source = 'd = [3.50 m, 3.48 m, 3.52 m, 3.47 m]\nt = [1.21 s, 1.17 s, 1.24 s, 1.19 s]\nv = [d[2:3] / t[2:3]]\n'
    expect(value(`${source}v.count`)).toBe('2')
    expect(value(`${source}w = v[2]`)).toBe('2.84 m/s')
    expect(made(source).warning).toBeUndefined()
    expect(lines(`${source}w = v[3]`).at(-1)!.error).toBeDefined()
  })

  it('slices a series: from, to (both kept) and step, any left out, renumbered from 1, looked up not copied', () => {
    const source = 'm = [1.0 kg, 2.0 kg, 3.0 kg, 4.0 kg, 5.0 kg]\n'
    const listed = (slice: string) => shown(`${source}z = ${slice}`).replace(/^z = .* = \(/, '(')
    expect(listed('m[2:4]')).toMatch(/^\(2\.0, 3\.0, 4\.0\) kg\s+3 values$/)
    expect(listed('m[::2]')).toMatch(/^\(1\.0, 3\.0, 5\.0\) kg/)
    expect(listed('m[4:]')).toMatch(/^\(4\.0, 5\.0\) kg/)
    expect(listed('m[:2]')).toMatch(/^\(1\.0, 2\.0\) kg/)
    expect(listed('m[1:5:2]')).toMatch(/^\(1\.0, 3\.0, 5\.0\) kg/)
    expect(value(`${source}z = m[2:4]\nw = z[1]`)).toBe('2.0 kg')
    expect(value(`${source}w = m[2:4].avg`)).toBe('(3.0 ± 0.6) kg')
    expect(value(`${source}w = m[::2].count`)).toBe('3')
    // The same values: a slice's member minus its series' is exactly 0.
    expect(value('m = [1.0 kg pm 0.1 kg, 2.0 kg pm 0.1 kg]\nz = m[2:]\nw = z[1] - m[2]')).toBe('0 kg')
  })

  it('makes a range: from and to (both kept), and step (1 if it\'s left out), in the from\'s unit, to its decimal places', () => {
    expect(shown('t = [0 s:2.0 s:0.5 s]')).toMatch(/^t = \(0, 0\.5, 1\.0, 1\.5, 2\.0\) s\s+5 values$/)
    expect(shown('n = [1:5]')).toMatch(/^n = \(1, 2, 3, 4, 5\)\s+5 values$/)
    expect(shown('k = [10:0:-5]')).toMatch(/^k = \(10, 5, 0\)/)
    expect(shown('r = [0 s:500 ms:100 ms]')).toMatch(/^r = \(0, 0\.1, 0\.2, 0\.3, 0\.4, 0\.5\) s/)
    expect(value('t = [0 s:2.0 s:0.1 s]\nw = t.count')).toBe('21')
    expect(value('t = [0.10 s:0.30 s:0.10 s]\nw = t[3]')).toBe('0.30 s')
  })

  it('replaces a series made again', () => {
    const source = 't = [1.0 s, 2.0 s, 3.0 s]\nt = [5.0 s, 6.0 s]\n'
    expect(value(`${source}t.count`)).toBe('2')
    expect(value(`${source}w = t[1]`)).toBe('5.0 s')
  })

  it('shows just the rule with #sym, and just the values with #val', () => {
    const source = `${FORCES}m = [F / 2]`
    expect(shown(`${source}  #sym`)).not.toMatch(/kg/)
    expect(shown(`${source}  #val`)).toMatch(/^m = \(1\.00, 1\.50, 5\.00\) N\s+3 values$/)
  })

  it('shortens a long series, and is listed for suggestions by its first and last values', () => {
    const source = 'n = [1, 2, 3, 4, 5, 6, 7, 8]\n'
    expect(shown(source)).toMatch(/^n = \(1, 2, 3, …, 7, 8\)\s+8 values$/)
  })

  it('explains what it can’t do', () => {
    expect(made('[1, 2]').error).toMatch(/Name the series/)
    expect(made('t = []').error).toMatch(/Give the series its values/)
    expect(made(`${FORCES}m = [F / 2, 3 kg]`).error).toMatch(/not both/)
    expect(made('t = [1, 2; 3, 4]').error).toMatch(/A ; between rows \(a matrix\) isn't one/)
    expect(made('M = [[1, 2], [3, 4]]').error).toMatch(/A list in it/)
    expect(made('t = [::1]').error).toMatch(/A range needs where it starts and ends/)
    expect(made('t = [0 s:2 s:0 s]').error).toMatch(/step can't be 0/)
    expect(made('t = [0 s:2 s:-1 s]').error).toMatch(/goes away from its end/)
    expect(made('t = [0 s:2 kg]').error).toMatch(/units that convert/)
    expect(lines('w = 2 * [1, 2]').at(-1)!.error).toMatch(/Square brackets make a series, on a line that names it/)
    expect(made('t = [1 s, 2 kg + 3 s]').error).toMatch(/^Value 2: /)
  })
})

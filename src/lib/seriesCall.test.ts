/** `t = @series(…)`: a series on one line, its values listed or worked out row by row from other series. */
import { describe, expect, it } from 'vitest'
import { lines, readable, value } from '../test/helpers.ts'

/** The last @series line of a sheet. */
const made = (source: string) => lines(source).filter((l) => l.source.includes('@series')).at(-1)!
/** It as text: its values' commas and gap, and its count, tidied too. */
const shown = (source: string) => readable(made(source).tex)
  .replace(/,\\ /g, ', ').replace(/\\ldots/g, '…').replace(/\\quad \\text/, '  ')

const FORCES = 'F_1 = 2.00 N\nF_2 = 3.00 N\nF_3 = 10.0 N\n'

describe('@series', () => {
  it('makes a series of the values listed, as typed', () => {
    const source = 't = @series(1.52 s, 1.48 s, 1.55 s)\n'
    expect(value(`${source}w = t_2`)).toBe('1.48 s')
    expect(value(`${source}t_count`)).toBe('3')
    expect(value(`${source}w = t_avg`)).toMatch(/^\(1\.52 ± 0\.02\) s$/)
    expect(shown(source)).toMatch(/^t = \(1\.52, 1\.48, 1\.55\) s\s+3 values$/)
  })

  it('keeps each value’s own uncertainty and settings on the name', () => {
    expect(value('x = @series(2.0 m pm 0.1 m, 3.0 m)\nw = x_1')).toBe('(2.0 ± 0.1) m')
    expect(value('L:cm = @series(1.500 m, 2.000 m)\nw = L_2')).toBe('200.0 cm')
  })

  it('works a series out row by row from another and a single value', () => {
    const source = `${FORCES}g_0 = 9.81 m/s^2\nm = @series(F / g_0)\n`
    expect(value(`${source}w = m_1`)).toBe('0.204 kg')
    expect(value(`${source}w = m_3`)).toBe('1.02 kg')
    expect(value(`${source}m_count`)).toBe('3')
    expect(made(source).tex).toMatch(/^m_\{i\} = \\frac\{F_\{i\}\}\{g_\{0\}\} = /)
    expect(shown(source)).toMatch(/ = \(0\.204, 0\.306, 1\.02\) kg\s+3 values$/)
  })

  it('carries a single value’s uncertainty into every row, as one source', () => {
    const source = `${FORCES}g_0 = 9.8 m/s^2 pm 0.2 m/s^2\nm = @series(F / g_0)\n`
    expect(value(`${source}w = m_2`)).toBe('(0.306 ± 0.006) kg')
    // The same source in every row: m_1 - m_1 has none, and nor does a difference of two rows scaled alike.
    expect(value(`${source}w = m_2 - m_2`)).toBe('0 kg')
  })

  it('works one out from two series, row by row', () => {
    const source = 'd = @series(3.50 m, 3.48 m, 3.52 m)\nt = @series(1.21 s, 1.17 s, 1.24 s)\nv = @series(d / t)\n'
    expect(value(`${source}w = v_2`)).toBe('2.97 m/s')
    expect(made(source).warning).toBeUndefined()
  })

  it('uses the rows every series has, with a warning when they differ', () => {
    const source = 'd = @series(3.50 m, 3.48 m, 3.52 m, 3.47 m)\nt = @series(1.21 s, 1.17 s, 1.24 s)\nv = @series(d / t)\n'
    expect(value(`${source}v_count`)).toBe('3')
    expect(made(source).warning).toBe('d has 4 values and t has 3 values: v uses the 3 rows both have. Give rows … to choose them yourself.')
  })

  it('keeps the rows’ numbers, and works out just a slice', () => {
    const source = 'd = @series(3.50 m, 3.48 m, 3.52 m, 3.47 m)\nt = @series(1.21 s, 1.17 s, 1.24 s, 1.19 s)\nv = @series(d / t; rows 2-3)\n'
    expect(value(`${source}v_count`)).toBe('2')
    expect(value(`${source}w = v_3`)).toBe('2.84 m/s')
    expect(made(source).warning).toBeUndefined()
    expect(lines(`${source}w = v_1`).at(-1)!.error).toBeDefined()
  })

  it('replaces a series made again', () => {
    const source = 't = @series(1.0 s, 2.0 s, 3.0 s)\nt = @series(5.0 s, 6.0 s)\n'
    expect(value(`${source}t_count`)).toBe('2')
    expect(value(`${source}w = t_1`)).toBe('5.0 s')
  })

  it('shows just the rule with #sym, and just the values with #val', () => {
    const source = `${FORCES}m = @series(F / 2)`
    expect(shown(`${source}  #sym`)).not.toMatch(/kg/)
    expect(shown(`${source}  #val`)).toMatch(/^m = \(1\.00, 1\.50, 5\.00\) N\s+3 values$/)
  })

  it('shortens a long series, and is listed for suggestions by its first and last values', () => {
    const source = 'n = @series(1, 2, 3, 4, 5, 6, 7, 8)\n'
    expect(shown(source)).toMatch(/^n = \(1, 2, 3, …, 7, 8\)\s+8 values$/)
  })

  it('explains what it can’t do', () => {
    expect(made('@series(1, 2)').error).toMatch(/Name the series/)
    expect(made('t = @series()').error).toMatch(/Give the series its values/)
    expect(made(`${FORCES}m = @series(F / 2, 3 kg)`).error).toMatch(/not both/)
    expect(made('t = @series(1 s, 2 s; rows 1-2)').error).toMatch(/needs a rule that uses one/)
    expect(made(`${FORCES}m = @series(F; every other)`).error).toMatch(/isn't a setting of @series/)
    expect(made('t = @series(1 s, 2 kg + 3 s)').error).toMatch(/^Value 2: /)
  })
})

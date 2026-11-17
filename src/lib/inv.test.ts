/** `@inv(x)`: 1/x, written as its fraction turned over. */
import { describe, expect, it } from 'vitest'
import { last, value } from '../test/helpers.ts'

describe('@inv', () => {
  it('turns a fraction over: m/V as V/m', () => {
    expect(last('m = 998 g\nV = 1.00 L\nx = @inv(m / V)').tex)
      .toMatch(/^x = \\frac\{V\}\{m\} = \\frac\{1\.00\\,\\mathrm\{L\}\}\{998\\,\\mathrm\{g\}\} = /)
  })

  it('turns a value whose unit is a fraction over, as a conversion factor: 18.015 g/mol as 1 mol / 18.015 g', () => {
    const src = 'H2O = @chem.substance({H2O})\nn = 36.0 g {H2O} * @inv(H2O.M)'
    expect(last(src).tex).toContain('\\frac{1\\,\\mathrm{mol}\\,\\ce{H2O}}{18.015\\,\\mathrm{g}\\,\\ce{H2O}}')
    expect(value(src)).toBe('2.00 mol H2O')
  })

  it('writes anything else as 1/x, and is 1/x, with its sig figs and uncertainty', () => {
    expect(last('T = 2.0 s pm 0.1 s\nf = @inv(T)').tex).toMatch(/^f = \\frac\{1\}\{T\} = \\frac\{1\}\{2\.0\\,\\mathrm\{s\}\} = /)
    expect(value('T = 2.0 s pm 0.1 s\nf = @inv(T)')).toBe('(0.50 ± 0.03) Hz')
    expect(value('k = @inv(4)')).toBe('0.25')
  })

  it('is set apart with ×, as every fraction in a product is, so a chain of conversion factors reads factor by factor', () => {
    const src = [
      'D = @chem.substance({7Ca(IO3)2*8CaCrO4})',
      'm = 5.00 kg {7Ca(IO3)2*8CaCrO4}',
      'x = m * @inv(D.M) * (D.Cr.n / D.n) * D.Cr.M',
    ].join('\n')
    const [symbolic, substituted] = last(src).tex.split(' = ').slice(1)
    // m × 1/M × n_Cr/n × M_Cr: a × on each side of each fraction.
    expect(symbolic.match(/\\times/g)).toHaveLength(3)
    expect(substituted.match(/\\times/g)).toHaveLength(3)
    // (A fraction of numbers is a coefficient, as before: ½mv².)
    expect(last('m = 2.0 kg\nv = 3.0 m/s\nE = 1/2 * m * v^2').tex).toMatch(/^E = \\frac\{1\}\{2\} m \{v\}\^\{2\}/)
  })

  it('flips a mole ratio’s species with it', () => {
    expect(value('r = (1 mol {Ca}) / (6 mol {EDTA})\nq = @inv(r)')).toBe('6 mol EDTA/mol Ca')
  })

  it('explains zero, a tuple, and nothing to flip', () => {
    expect(last('x = @inv(0)').error).toMatch(/of zero isn't defined/)
    expect(last('x = @inv(@tuple(1, 2))').error).toMatch(/a tuple has none to flip/)
    expect(last('x = @inv()').error).toMatch(/needs the value to flip/)
  })
})

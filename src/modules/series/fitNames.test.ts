import { describe, expect, it } from 'vitest'
import { last } from '../../test/helpers.ts'
import { symbolTex } from '../../lib/plugin.ts'

const data = 't = [0.10 s, 0.20 s, 0.30 s, 0.40 s]\nx = [0.051 m, 0.098 m, 0.152 m, 0.199 m]\n'

describe('a named plot\'s fit, as the series module says it', () => {
  it('typesets its R² and reduced χ² as written by hand, and other members as any', () => {
    expect(symbolTex('p__r2')).toBe('R^{2}_{p}')
    expect(symbolTex('p__chi2')).toBe('\\chi^{2}_{\\nu,p}')
    expect(symbolTex('p__slope')).toBe('\\mathrm{slope}_{p}')
  })

  it('explains a missing slope (no fit) and a missing χ² (no weighted fit)', () => {
    expect(last(`${data}p = @plot(t, x)\nv = p.slope`).error).toMatch(/only with a fit\. Add fit linear/)
    expect(last(`${data}p = @plot(t, x; fit linear)\nc = p.chi2`).error).toMatch(/χ² only for a weighted fit/)
  })
})

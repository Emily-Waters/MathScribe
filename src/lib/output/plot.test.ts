/** @plot(): its settings, its linear fit, the engine's plot data, and its drawings. */
import { describe, expect, it } from 'vitest'
import { last, value } from '../../test/helpers.ts'
import { formatPlotSettings, parsePlotSettings } from '../../modules/series/public.ts'
import { PRINT_PALETTE, linearFit, plotSvg } from './plot.ts'

const data = 't1 = 0.10 s\nt2 = 0.20 s\nt3 = 0.30 s\nt4 = 0.40 s\n'
  + 'x1 = 0.051 m pm 0.004 m\nx2 = 0.098 m pm 0.004 m\nx3 = 0.152 m pm 0.004 m\nx4 = 0.199 m pm 0.004 m\n'

describe('plot settings', () => {
  it('reads and writes them, leaving out the defaults', () => {
    const text = 'rows 2-, style both, fit linear, x from 0 to 2, log y, title "Run 1, cart"'
    const { settings, error } = parsePlotSettings(text)
    expect(error).toBeUndefined()
    expect(settings).toMatchObject({ from: 2, style: 'both', fit: 'linear', x: { from: 0, to: 2, log: false }, y: { log: true }, title: 'Run 1, cart' })
    expect(formatPlotSettings(settings)).toBe(text)
    expect(formatPlotSettings(parsePlotSettings('style points, fit none').settings)).toBe('')
  })

  it('says what’s wrong with one it doesn’t know', () => {
    expect(parsePlotSettings('colour red').error).toMatch(/"colour red" isn't a plot setting/)
  })
})

describe('linearFit', () => {
  it('finds the best line, its standard errors and R²', () => {
    const fit = linearFit([{ x: 0, y: 1 }, { x: 1, y: 3 }, { x: 2, y: 5 }])!
    expect(fit.slope).toBeCloseTo(2)
    expect(fit.intercept).toBeCloseTo(1)
    expect(fit.slopeUnc).toBeCloseTo(0)
    expect(fit.r2).toBeCloseTo(1)
    const noisy = linearFit([{ x: 0, y: 0 }, { x: 1, y: 1.2 }, { x: 2, y: 1.8 }, { x: 3, y: 3.1 }])!
    expect(noisy.slopeUnc).toBeGreaterThan(0)
    expect(noisy.r2).toBeLessThan(1)
  })

  it('weights each point by 1/δy² when every point has one, with uncertainties from the bars', () => {
    // The middle point's bar is ten times smaller, so the line keeps close to it.
    const points = [{ x: 0, y: 0, dy: 1 }, { x: 1, y: 2, dy: 0.1 }, { x: 2, y: 2, dy: 1 }]
    const fit = linearFit(points)!
    expect(fit.weighted).toBe(true)
    expect(fit.slope * 1 + fit.intercept).toBeCloseTo(2, 1)
    expect(linearFit(points.map(({ x, y }) => ({ x, y })))!.slope * 1 + linearFit(points.map(({ x, y }) => ({ x, y })))!.intercept).toBeCloseTo(4 / 3)
    // Equal bars: the same line as unweighted, but uncertainties from the bars: σ/√Σ(x − x̄)².
    const equal = linearFit([{ x: 0, y: 0, dy: 0.5 }, { x: 1, y: 1.2, dy: 0.5 }, { x: 2, y: 1.8, dy: 0.5 }])!
    expect(equal.slope).toBeCloseTo(0.9)
    expect(equal.slopeUnc).toBeCloseTo(0.5 / Math.sqrt(2))
    // Residuals about y = 0.9x + 0.1: −0.1, 0.2, −0.1; χ²/(n − 2) = 0.06 / 0.5² / 1.
    expect(equal.chi2).toBeCloseTo(0.24)
  })

  it('counts x uncertainties too, through the slope (effective variance)', () => {
    // T² against m, from a lab: the masses known to about 1%, the periods to 0.01%.
    const points = [
      [0.0285, 0.0003, 0.16635, 0.00003], [0.0338, 0.0006, 0.20260, 0.00004], [0.0390, 0.0004, 0.22911, 0.00004],
      [0.0442, 0.0004, 0.25813, 0.00004], [0.0497, 0.0003, 0.29240, 0.00005], [0.0544, 0.0004, 0.32039, 0.00005],
      [0.0603, 0.0004, 0.35272, 0.00005],
    ].map(([x, dx, y, dy]) => ({ x, dx, y, dy }))
    const yOnly = linearFit(points.map(({ x, y, dy }) => ({ x, y, dy })))!
    const both = linearFit(points)!
    // By the periods alone, the line is trusted far beyond what the masses allow.
    expect(yOnly.chi2).toBeGreaterThan(1000)
    expect(yOnly.xWeighted).toBeUndefined()
    // Counting the masses' uncertainties, the points scatter as their bars say.
    expect(both.xWeighted).toBe(true)
    expect(both.chi2).toBeCloseTo(0.53, 1)
    expect(both.slope).toBeCloseTo(5.874, 2)
    expect(both.slopeUnc).toBeCloseTo(0.077, 2)
    // Its weights are the settled slope's: refitting once more changes nothing.
    const w = points.map((p) => ({ x: p.x, y: p.y, dy: Math.hypot(p.dy, both.slope * p.dx) }))
    expect(linearFit(w)!.slope).toBeCloseTo(both.slope, 9)
  })

  it('says so under a plot whose x values have uncertainties, and its slope is that fit’s', () => {
    const sheet = 'm = @series(0.0285 kg pm 0.0003 kg, 0.0390 kg pm 0.0004 kg, 0.0497 kg pm 0.0003 kg, 0.0603 kg pm 0.0004 kg)\n'
      + 'T2 = @series(0.16635 s^2 pm 0.00003 s^2, 0.22911 s^2 pm 0.00004 s^2, 0.29240 s^2 pm 0.00005 s^2, 0.35272 s^2 pm 0.00005 s^2)\n'
      + 'p = @plot(m, T2; fit linear)\n'
    expect(last(sheet).tex).toMatch(/weighted by \}\\delta T_\{2\}\\text\{ and \}\\delta m\\text\{\)\}/)
    // An uncertainty the masses allow (0.08 s²/kg), not the periods' alone (about 0.002).
    expect(value(`${sheet}k = p.slope`)).toBe('(5.88 ± 0.08) s^2/kg')
  })

  it('weights by y alone when no point has an x uncertainty', () => {
    const fit = linearFit([{ x: 0, y: 0, dy: 0.5, dx: 0 }, { x: 1, y: 1.2, dy: 0.5 }, { x: 2, y: 1.8, dy: 0.5 }])!
    expect(fit.xWeighted).toBeUndefined()
    expect(fit.slopeUnc).toBeCloseTo(0.5 / Math.sqrt(2))
  })

  it('counts every point the same unless every one has a y uncertainty', () => {
    expect(linearFit([{ x: 0, y: 0, dy: 1 }, { x: 1, y: 1 }, { x: 2, y: 2 }])!.weighted).toBe(false)
  })

  it('needs two different x values', () => {
    expect(linearFit([{ x: 1, y: 1 }])).toBeNull()
    expect(linearFit([{ x: 1, y: 1 }, { x: 1, y: 2 }])).toBeNull()
  })
})

describe('@plot()', () => {
  it('plots one series against another, with error bars for uncertainties', () => {
    const r = last(`${data}@plot(t, x)`)
    expect(r.error).toBeUndefined()
    expect(r.plot?.x).toMatchObject({ name: 't', unit: 's' })
    expect(r.plot?.y).toMatchObject({ name: 'x', unit: 'm' })
    expect(r.plot?.series[0].points).toHaveLength(4)
    expect(r.plot?.series[0].points[0]).toMatchObject({ n: 1, x: 0.1, y: 0.051, dy: 0.004 })
  })

  it('fits a line, shows its equation and makes its slope and intercept variables', () => {
    const r = last(`${data}@plot(t, x; fit linear)`)
    expect(r.plot?.series[0].fit?.slope).toBeCloseTo(0.494, 2)
    expect(r.tex).toContain('R^{2}')
    expect(value(`${data}@plot(t, x; fit linear)\nv = x_slope`)).toBe('(0.498 ± 0.018) m/s')
    expect(value(`${data}@plot(t, x; fit linear)\nx0 = x_intercept`)).toMatch(/ m$/)
  })

  it('keeps to the rows asked for', () => {
    expect(last(`${data}@plot(t, x; rows 2-3)`).plot?.series[0].points.map((p) => p.n)).toEqual([2, 3])
  })

  it('says what’s wrong with its settings or series', () => {
    expect(last(`${data}@plot(t, x; colour red)`).error).toMatch(/isn't a plot setting/)
    expect(last(`${data}@plot(t)`).error).toBeDefined()
  })

  it('draws as an SVG, with its axes’ names', () => {
    const svg = plotSvg(last(`${data}@plot(t, x; fit linear, title "Run 1")`).plot!, PRINT_PALETTE)
    expect(svg).toMatch(/^<svg/)
    expect(svg).toContain('Run 1')
    expect(svg).toContain('stroke-dasharray') // the fit line
  })
})

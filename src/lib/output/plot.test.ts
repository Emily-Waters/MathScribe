/** @plot(): its settings, its linear fit, the engine's plot data, and its drawings. */
import { describe, expect, it } from 'vitest'
import { last, lines, value } from '../../test/helpers.ts'
import { PLOT_PART, formatPlotSettings, parsePlotSettings, partColour } from '../../modules/series/public.ts'
import { NAMED_COLOURS, PRINT_PALETTE, axisTicks, linearFit, plotScales, plotSvg, tickLabelText } from './plot.ts'
import { centredEquation, plotToLatex } from './latexKit.ts'

const data = 't1 = 0.10 s\nt2 = 0.20 s\nt3 = 0.30 s\nt4 = 0.40 s\n'
  + 'x1 = 0.051 m pm 0.004 m\nx2 = 0.098 m pm 0.004 m\nx3 = 0.152 m pm 0.004 m\nx4 = 0.199 m pm 0.004 m\n'

/** A second series, y, to plot beside x. */
const SECOND = 'y1 = 0.10 m\ny2 = 0.21 m\ny3 = 0.29 m\ny4 = 0.40 m\n'

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

  it('shows its points’ uncertainties as error bars, unless its settings say not; a fit still weighs by them', () => {
    /** An error bar: a line with caps at each end, `M…V…M…H…`. */
    const bars = (svg: string) => svg.match(/<path d="M[^"]*V[^"]*M[^"]*H/g)?.length ?? 0
    const shown = last(`${data}@plot(t, x; fit linear)`).plot!
    const hidden = last(`${data}@plot(t, x; fit linear, uncertainty off)`).plot!
    expect(bars(plotSvg(shown, PRINT_PALETTE))).toBe(4)
    expect(bars(plotSvg(hidden, PRINT_PALETTE))).toBe(0)
    expect(plotToLatex(shown)).toContain('error bars/.cd')
    expect(plotToLatex(hidden)).not.toContain('error bars')
    expect(hidden.series[0].fit).toEqual(shown.series[0].fit)
    const { settings } = parsePlotSettings('fit linear, uncertainty off')
    expect(settings.uncertainty).toBe(false)
    expect(formatPlotSettings(settings)).toBe('fit linear, uncertainty off')
  })

  it('shows its fit’s equation centred under it, unless its settings say not (its numbers are still variables)', () => {
    expect(last(`${data}p = @plot(t, x; fit linear)`).tex).toContain('R^{2}')
    const hidden = last(`${data}p = @plot(t, x; fit linear, equation off)\ns = p.slope`)
    expect(hidden.tex).not.toContain('R^{2}')
    expect(value(`${data}p = @plot(t, x; fit linear, equation off)\ns = p.slope`)).toMatch(/m\/s$/)
    expect(formatPlotSettings(parsePlotSettings('fit linear, equation off').settings)).toBe('fit linear, equation off')
    const plot = lines(`${data}@plot(t, x; fit linear)`).at(-1)!
    expect(centredEquation({ tex: plot.tex })).toMatch(/^\\begin\{center\}\n\$\\displaystyle /)
  })

  it('has a legend where its settings say, with each series and fit; by itself, only for several series', () => {
    const one = last(`${data}@plot(t, x; fit linear)`).plot!
    expect(plotSvg(one, PRINT_PALETTE)).not.toContain('Best fit')
    expect(plotToLatex(one)).not.toContain('legend')
    expect(plotToLatex(one)).toContain('forget plot')
    const placed = last(`${data}@plot(t, x; fit linear, legend bottom right)`).plot!
    expect(plotSvg(placed, PRINT_PALETTE)).toContain('Best fit')
    const tex = plotToLatex(placed)
    expect(tex).toContain('legend pos=south east')
    expect(tex).toContain('\\addlegendentry{Best fit}')
    expect(tex).not.toContain('forget plot')
    expect(plotToLatex(last(`${data}${SECOND}@plot(t, x, y; legend off)`).plot!)).not.toContain('legend')
    expect(plotToLatex(last(`${data}${SECOND}@plot(t, x, y)`).plot!)).toContain('legend pos=north west')
  })

  it('colours a series’ points, line and fit as its settings say: every series’, or one’s own', () => {
    const text = 'style both, fit linear, legend outside, colour fit red, colour y line purple, color points black'
    const { settings, error } = parsePlotSettings(text)
    expect(error).toBeUndefined()
    expect(formatPlotSettings(settings)).toBe(text.replace('color points', 'colour points'))
    expect(partColour(settings, 'y', PLOT_PART.line)).toBe('purple')
    expect(partColour(settings, 'x', PLOT_PART.line)).toBeUndefined()
    expect(partColour(settings, 'x', PLOT_PART.fit)).toBe('red')
    const plot = last(`${data}${SECOND}@plot(t, x, y; ${text})`).plot!
    const svg = plotSvg(plot, PRINT_PALETTE)
    expect(svg).toContain(`stroke="${NAMED_COLOURS.red}" stroke-width="1.5" stroke-dasharray`)
    expect(svg).toContain(`stroke="${NAMED_COLOURS.purple}" stroke-width="1.75"/>`)
    const tex = plotToLatex(plot)
    expect(tex).toContain('color={rgb,255:red,214;green,39;blue,40}, dashed')
    expect(tex).toContain('legend pos=outer north east')
    expect(parsePlotSettings('colour fit pink').error).toMatch(/isn't a plot setting/)
  })

  it('keeps a log axis to its values when its range is set from 0 (kept from a linear axis), on 1, 2 and 5', () => {
    const plot = last(`${data}@plot(t, x; fit linear, x from 0, y from 0, log x, log y)`).plot!
    const { x, y } = plotScales(plot)
    expect([x.from, x.to, x.ticks]).toEqual([0.1, 0.5, [0.1, 0.2, 0.5]])
    expect([y.from, y.to]).toEqual([0.02, 0.5])
    expect(plotToLatex(plot)).toContain('xmin=0.1, xmax=0.5')
    expect(plotSvg(plot, PRINT_PALETTE)).not.toContain('NaN')
  })

  it('gives a fit’s slope in y’s unit over x’s, as the series give them', () => {
    const src = 'x = @series(0.010 m, 0.020 m, 0.030 m)\nF = @series(0.066 N, 0.133 N, 0.199 N)\np = @plot(x, F; fit linear)\nk = p.slope'
    expect(value(src)).toMatch(/N\/m$/)
    expect(last(src.split('\nk')[0]).tex).toContain('\\mathrm{N}/\\mathrm{m}')
  })

  it('has the same axes in LaTeX as drawn, and a fit across the whole of x’s', () => {
    const plot = last(`${data}@plot(t, x; fit linear)`).plot!
    const { x } = plotScales(plot)
    const tex = plotToLatex(plot)
    expect(tex).toContain(`xmin=${x.from}, xmax=${x.to}`)
    expect(tex).toContain(`domain=${x.from}:${x.to}`)
    expect(tex).toContain('xticklabels={$0.05$,$0.1$,$0.15$,')
    expect(tex).toContain('scaled ticks=false')
  })

  it('labels an axis’s ticks with one power of ten, said in its label, when they’d need one', () => {
    const plot = last('t = @series(1 s, 2 s, 3 s, 4 s)\nd = @series(2e-4 m, 5e-4 m, 9e-4 m, 1.6e-3 m)\n@plot(t, d)').plot!
    const ticks = axisTicks(plotScales(plot).y, false)
    expect(ticks.power).toBe(-3)
    expect(ticks.labels.map(tickLabelText)).toEqual(['0', '0.2', '0.4', '0.6', '0.8', '1', '1.2', '1.4', '1.6', '1.8'])
    expect(plotToLatex(plot)).toContain('ylabel={$d\\,\\left[10^{-3}\\,\\mathrm{m}\\right]$}')
    expect(plotSvg(plot, PRINT_PALETTE)).toContain('[10⁻³ m]')
    // (A log axis keeps a power under each tick that needs one.)
    expect(axisTicks({ from: 1e-3, to: 1, ticks: [1e-3, 1e-2, 0.1, 1], place: () => 0 }, true).labels.map(tickLabelText))
      .toEqual(['0.001', '0.01', '0.1', '1'])
  })
})

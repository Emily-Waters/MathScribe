/** A series' display name, `t:"Time" = [...]`: shown for the series, in its table's header and on its plot. */
import { describe, expect, it } from 'vitest'
import { last, lines, shown } from '../../test/helpers.ts'
import { PRINT_PALETTE, plotSvg } from './plotGraph.ts'
import { plotToLatex } from './plotLatex.ts'

const DATA = 't:"Time" = [0.10 s, 0.20 s]\nx:"Height h_0" = [1.0 m, 2.0 m]\n'

describe("a series' display name", () => {
  it('is shown in place of its name, on its line and where it is shown on its own', () => {
    const [t, x] = lines(DATA)
    expect(t.tex).toContain('\\text{Time} = ')
    expect(x.tex).toContain('\\text{Height }\\text{h}_{\\text{0}} = ')
    expect(last(`${DATA}t`).tex).toMatch(/^\\text\{Time\} = \\left\(0\.10/)
  })

  it("is the series', not each value's; its other settings are its values'", () => {
    expect(shown(`${DATA}t[1]`)).toBe('t_1 = 0.10 s')
    expect(shown('m:"Mass":3 = [1 kg, 2 kg]\nm[2]')).toBe('m_2 = 2.00 kg')
  })

  it('names a series worked out by a rule, as a variable\'s does its line', () => {
    expect(last(`${DATA}v:"Speed" = [x / t]`).tex).toMatch(/^\\text\{Speed\} = \\frac\{x_\{i\}\}\{t_\{i\}\} = /)
  })

  it('can be made by a template', () => {
    expect(shown('massName(x) = "Mass of {{x}}"\nm:massName(ball) = [1 kg, 2 kg]')).toContain('Mass of ball = ')
  })

  it('is gone when the series is made again without one', () => {
    expect(last(`${DATA}t = [1 s, 2 s]\nt`).tex).toMatch(/^t = /)
  })

  it("heads the series' column in a table", () => {
    const table = last(`${DATA}@table(t, x)`).tex
    expect(table).toContain('\\text{Time}\\,\\left[\\mathrm{s}\\right]')
    expect(table).toContain('\\text{Height }\\text{h}_{\\text{0}}\\,\\left[\\mathrm{m}\\right]')
  })

  it("labels a plot's axes and legend, in the drawing and in LaTeX", () => {
    const plot = last(`${DATA}@plot(t, x)`).plot!
    const svg = plotSvg(plot, PRINT_PALETTE)
    expect(svg).toContain('>Time [s]<')
    expect(svg).toContain('Height h<tspan baseline-shift="sub" font-size="75%">0</tspan> [m]')
    const tex = plotToLatex(plot)
    expect(tex).toContain('xlabel={$\\text{Time}\\,\\left[\\mathrm{s}\\right]$}')
    const several = plotToLatex(last(`${DATA}y:"Depth" = [3.0 m, 4.0 m]\n@plot(t, x, y)`).plot!)
    expect(several).toContain('\\addlegendentry{$\\text{Depth}$}')
  })

  it("gives way to a plot's own axis label", () => {
    const plot = last(`${DATA}@plot(t, x; xlabel "Elapsed")`).plot!
    expect(plotSvg(plot, PRINT_PALETTE)).toContain('>Elapsed [s]<')
  })
})

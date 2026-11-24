/**
 * A plot as LaTeX: a pgfplots graph, with the axes, ticks, colours and legend
 * the drawing has (plotGraph.ts), so the export matches the Rendered tab.
 */
import { latexKit, symbolTex, unitTex } from '../../lib/plugin.ts'
import {
  FIT_LEGEND, NAMED_COLOURS, axisTicks, chosenColours, labelledAxes, plotScales, tickLabelTex, type PlotData, type PlotName, type Scale,
} from './plotGraph.ts'
import { LEGEND_POSITION, PLOT_STYLE, showsLegend, type LegendPosition, type PlotColour } from './plotSettings.ts'

/** What a document with a plot in it needs in its preamble. */
export const PLOT_PREAMBLE = ['% Plots.', '\\usepackage{pgfplots}', '\\pgfplotsset{compat=1.18}'] as const

/** Each series' colour, in order (xcolor names, as pgfplots loads xcolor). */
const PLOT_COLOURS = ['blue', 'orange', 'teal', 'violet', 'brown', 'cyan']

/** Where pgfplots puts a legend, for each place a plot's settings can say (`off` has none: showsLegend). */
const LEGEND_PLACE: Record<LegendPosition, string> = {
  [LEGEND_POSITION.topLeft]: 'north west',
  [LEGEND_POSITION.topRight]: 'north east',
  [LEGEND_POSITION.bottomLeft]: 'south west',
  [LEGEND_POSITION.bottomRight]: 'south east',
  [LEGEND_POSITION.outside]: 'outer north east',
  [LEGEND_POSITION.off]: '',
}

/** A colour's shade (`#d62728`) as xcolor writes it in a pgfplots option: `{rgb,255:red,214;green,39;blue,40}`. */
function rgbColour(hex: string): string {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
  return `{rgb,255:red,${r};green,${g};blue,${b}}`
}

/** A number for pgfplots: plain, without float noise. */
const plotNumber = (v: number) => String(Number(v.toPrecision(10)))

/**
 * An axis's or series' name and unit as LaTeX: `$t\,[\mathrm{s}]$`; with the
 * power of ten an axis's ticks share, if they do (axisTicks): `$d\,[10^{-3}\,\mathrm{m}]$`.
 */
function plotLabel(p: PlotName & { unit?: string }, power?: number): string {
  const name = p.name ? symbolTex(p.name) : p.expr ? `\\text{${latexKit.escapeTex(p.expr)}}` : ''
  const scale = power === undefined ? '' : `${p.unit ? '' : '\\times '}10^{${power}}`
  const inside = [scale, p.unit ? unitTex(p.unit) : ''].filter(Boolean).join('\\,')
  const unit = inside ? `\\left[${inside}\\right]` : ''
  return `$${[name, unit].filter(Boolean).join('\\,')}$`
}

/**
 * A plot as a pgfplots graph: its points (with error bars for uncertainties, unless its settings say not),
 * lines between them if its style says so, and its fits as dashed lines.
 */
export function plotToLatex(plot: PlotData): string {
  const { settings } = plot
  // (The axes the drawing has, plotScales: the same range and ticks, each labelled as the drawing labels it,
  // not by pgfplots' own scaling, which writes 1·10⁻² under every tick; and a fit drawn across the whole x range.)
  const scales = plotScales(plot)
  const ticks = { x: axisTicks(scales.x, settings.x.log), y: axisTicks(scales.y, settings.y.log) }
  const legend = showsLegend(settings, plot.series.length)
  // (Each axis by its own name if the settings give one: xlabel "Extension".)
  const axes = labelledAxes(plot)
  const axisOptions = (axis: 'x' | 'y', s: Scale) => [
    `${axis}min=${plotNumber(s.from)}`, `${axis}max=${plotNumber(s.to)}`,
    `${axis}tick={${s.ticks.map(plotNumber).join(',')}}`, `${axis}ticklabels={${ticks[axis].labels.map(tickLabelTex).join(',')}}`,
  ]
  const options = [
    'width=0.8\\linewidth', 'height=0.5\\linewidth', 'grid=major', 'scaled ticks=false',
    `xlabel={${plotLabel(axes.x, ticks.x.power)}}`, `ylabel={${plotLabel(axes.y, ticks.y.power)}}`,
    ...(settings.title ? [`title={${latexKit.escapeTex(settings.title)}}`] : []),
    ...(settings.x.log ? ['xmode=log'] : []),
    ...(settings.y.log ? ['ymode=log'] : []),
    ...axisOptions('x', scales.x),
    ...axisOptions('y', scales.y),
    ...(legend ? [`legend pos=${LEGEND_PLACE[settings.legend ?? LEGEND_POSITION.topLeft]}`, 'legend cell align=left'] : []),
  ]
  const lines = ['\\begin{center}', '\\begin{tikzpicture}', `\\begin{axis}[${options.join(', ')}]`]
  plot.series.forEach((s, i) => {
    // Its colours: its own, unless the plot's settings choose one for a part (as RGB: the drawing's shade).
    const own = PLOT_COLOURS[i % PLOT_COLOURS.length]
    const chosen = chosenColours(plot, s)
    const of = (c: PlotColour | undefined) => (c ? rgbColour(NAMED_COLOURS[c]) : own)
    const [point, line, fit] = [of(chosen.points), of(chosen.line), of(chosen.fit)]
    // A function's curve: a line through where it was worked out.
    if (s.curve) {
      const coordinates = s.points.map((p) => `(${plotNumber(p.x)}, ${plotNumber(p.y)})`)
      lines.push(`\\addplot[color=${line}, no markers, thick${legend ? '' : ', forget plot'}] coordinates {${coordinates.join(' ')}};`)
      if (legend) lines.push(`\\addlegendentry{${plotLabel(s)}}`)
      return
    }
    // (Error bars only if the plot's settings show uncertainties.)
    const errors = settings.uncertainty !== false && s.points.some((p) => p.dx || p.dy)
    const marks = settings.style !== PLOT_STYLE.lines
    const joined = settings.style !== PLOT_STYLE.points
    const style = [
      // (The line's colour, with the points and their error bars in theirs, if they differ.)
      `color=${joined ? line : point}`,
      marks ? 'mark=*' : 'no markers',
      ...(marks && joined && point !== line ? [`mark options={draw=${point}, fill=${point}}`] : []),
      ...(!joined ? ['only marks'] : []),
      ...(errors ? ['error bars/.cd', 'x dir=both', 'x explicit', 'y dir=both', 'y explicit', ...(joined && point !== line ? [`error bar style={color=${point}}`] : [])] : []),
    ]
    const coordinates = [...s.points].sort((a, b) => a.x - b.x).map((p) => `(${plotNumber(p.x)}, ${plotNumber(p.y)})`
      + (errors ? ` +- (${plotNumber(p.dx ?? 0)}, ${plotNumber(p.dy ?? 0)})` : ''))
    lines.push(`\\addplot[${style.join(', ')}] coordinates {${coordinates.join(' ')}};`)
    if (legend) lines.push(`\\addlegendentry{${plotLabel(s)}}`)
    if (s.fit && s.points.length) {
      const domain = `${plotNumber(scales.x.from)}:${plotNumber(scales.x.to)}`
      // (In the legend, if there is one: `Best fit`, or `Best fit, x` with several series.)
      lines.push(`\\addplot[color=${fit}, dashed, no markers, domain=${domain}, samples=${settings.x.log ? 50 : 2}${legend ? '' : ', forget plot'}] {${plotNumber(s.fit.slope)}*x + ${plotNumber(s.fit.intercept)}};`)
      if (legend) lines.push(`\\addlegendentry{${FIT_LEGEND}${plot.series.length > 1 ? `, ${plotLabel(s)}` : ''}}`)
    }
  })
  lines.push('\\end{axis}', '\\end{tikzpicture}', '\\end{center}')
  return lines.join('\n')
}

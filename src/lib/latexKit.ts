/**
 * The LaTeX export's toolkit: text, equations, cards, errors and plots, as LaTeX.
 * These are the pieces each kind of block writes itself with (see constructs/);
 * none of them knows about blocks, so a construct can use them without the
 * export (latex.ts) being involved.
 */
import { TITLE_SEGMENT, titleSegments } from './document.ts'
import { symbolTex, unitTex } from './engine.ts'
import type { PlotData, PlotName } from './plot.ts'
import type { LatexOptions } from './latex.ts'

// ---------------------------------------------------------------------------
// Text and equations
// ---------------------------------------------------------------------------

/** Text, with the characters LaTeX treats specially escaped. */
export const escapeTex = (s: string) =>
  s.replace(/[\\{}#%&_^~$]/g, (c) =>
    c === '\\' ? '\\textbackslash{}' : c === '^' ? '\\^{}' : c === '~' ? '\\~{}' : `\\${c}`)

/** A heading or block title in LaTeX: `2p_z` → 2p\textsubscript{z}. */
export function titleToLatex(text: string): string {
  return titleSegments(text).map((s) => (s.kind === TITLE_SEGMENT.math
    ? `$${s.value}$`
    : s.kind === TITLE_SEGMENT.sub ? `\\textsubscript{${escapeTex(s.value)}}` : escapeTex(s.value))).join('')
}

/** Title and note of a block, as one heading. */
export const heading = (title: string, note?: string) =>
  [title, note && escapeTex(note)].filter(Boolean).join(' --- ')

/** An equation to display, with its note (set at the right margin). */
export interface Equation {
  tex: string
  note?: string
}

/**
 * Equations in a row, as one `gather*`: they sit as close together as in the
 * Rendered tab (separate displays would each get a paragraph's spacing), each
 * with its note on the right.
 */
export function gather(eqs: Equation[]): string {
  const rows = eqs.map((e) => `  ${e.tex}${e.note ? ` \\tag*{${escapeTex(e.note)}}` : ''}`)
  return ['\\begin{gather*}', rows.join(' \\\\\n'), '\\end{gather*}'].join('\n')
}


/** A block with a title: a card (with cards on), else a paragraph heading and an indented body. */
export function titled(o: LatexOptions, title: string, body: string): string {
  if (o.cards) {
    return [`\\begin{mdframed}[style=msblock${title ? `, frametitle={${title}}` : ''}]`, body, '\\end{mdframed}'].join('\n')
  }
  return [title ? `\\paragraph{${title}}` : '', '\\begin{quote}', body, '\\end{quote}'].filter(Boolean).join('\n')
}

/** A line with an error, as a LaTeX comment (so it doesn’t stop the document compiling). */
export const errorComment = (line: number, what: string, error: string) => `% Line ${line}: ${what}\n% Error: ${error}`

// ---------------------------------------------------------------------------
// Plots (pgfplots)
// ---------------------------------------------------------------------------

/** Each series' colour, in order (xcolor names, as pgfplots loads xcolor). */
const PLOT_COLOURS = ['blue', 'orange', 'teal', 'violet', 'brown', 'cyan']

/** A number for pgfplots: plain, without float noise. */
const plotNumber = (v: number) => String(Number(v.toPrecision(10)))

/** An axis's or series' name and unit as LaTeX: `$t\,[\mathrm{s}]$`. */
function plotLabel(p: PlotName & { unit?: string }): string {
  const name = p.name ? symbolTex(p.name) : p.expr ? `\\text{${escapeTex(p.expr)}}` : ''
  const unit = p.unit ? `\\left[${unitTex(p.unit)}\\right]` : ''
  return `$${[name, unit].filter(Boolean).join('\\,')}$`
}

/**
 * A plot as a pgfplots graph: its points (with error bars for uncertainties),
 * lines between them if its style says so, and its fits as dashed lines.
 */
export function plotToLatex(plot: PlotData): string {
  const { settings } = plot
  const xs = plot.series.flatMap((s) => s.points.map((p) => p.x))
  const options = [
    'width=0.8\\linewidth', 'height=0.5\\linewidth', 'grid=major',
    `xlabel={${plotLabel(plot.x)}}`, `ylabel={${plotLabel(plot.y)}}`,
    ...(settings.title ? [`title={${escapeTex(settings.title)}}`] : []),
    ...(settings.x.log ? ['xmode=log'] : []),
    ...(settings.y.log ? ['ymode=log'] : []),
    ...(settings.x.from !== undefined ? [`xmin=${settings.x.from}`] : []),
    ...(settings.x.to !== undefined ? [`xmax=${settings.x.to}`] : []),
    ...(settings.y.from !== undefined ? [`ymin=${settings.y.from}`] : []),
    ...(settings.y.to !== undefined ? [`ymax=${settings.y.to}`] : []),
    ...(plot.series.length > 1 ? ['legend pos=north west'] : []),
  ]
  const lines = ['\\begin{center}', '\\begin{tikzpicture}', `\\begin{axis}[${options.join(', ')}]`]
  plot.series.forEach((s, i) => {
    const colour = PLOT_COLOURS[i % PLOT_COLOURS.length]
    const errors = s.points.some((p) => p.dx || p.dy)
    const style = [
      `color=${colour}`,
      settings.style === 'lines' ? 'no markers' : 'mark=*',
      ...(settings.style === 'points' ? ['only marks'] : []),
      ...(errors ? ['error bars/.cd', 'x dir=both', 'x explicit', 'y dir=both', 'y explicit'] : []),
    ]
    const coordinates = [...s.points].sort((a, b) => a.x - b.x).map((p) => `(${plotNumber(p.x)}, ${plotNumber(p.y)})`
      + (errors ? ` +- (${plotNumber(p.dx ?? 0)}, ${plotNumber(p.dy ?? 0)})` : ''))
    lines.push(`\\addplot[${style.join(', ')}] coordinates {${coordinates.join(' ')}};`)
    if (plot.series.length > 1) lines.push(`\\addlegendentry{${plotLabel(s)}}`)
    if (s.fit && xs.length) {
      const domain = `${plotNumber(Math.min(...xs))}:${plotNumber(Math.max(...xs))}`
      lines.push(`\\addplot[color=${colour}, dashed, no markers, domain=${domain}, samples=${settings.x.log ? 50 : 2}, forget plot] {${plotNumber(s.fit.slope)}*x + ${plotNumber(s.fit.intercept)}};`)
    }
  })
  lines.push('\\end{axis}', '\\end{tikzpicture}', '\\end{center}')
  return lines.join('\n')
}

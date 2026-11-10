/**
 * Plots: `plot(t, x)` draws x against t, one point per row of the series.
 * This module has what a plot is (the engine works out its data; see
 * evaluatePlot), the linear fit, and drawing it as SVG. The same drawing is
 * shown in the output, in the app's colours, and exported as an image, in
 * fixed ones.
 */
import type { PlotSettings } from './plotSettings.ts'
import { GREEK_BY_NAME, parseMemberName } from './syntax.ts'

/** One point: its row number, and its x and y (in the axes' units), with any uncertainties. */
export interface PlotPoint {
  n: number
  x: number
  y: number
  dx?: number
  dy?: number
}

/** A straight line through a series' points, by least squares, with the uncertainties of its slope and intercept. */
export interface LinearFit {
  slope: number
  intercept: number
  slopeUnc: number
  interceptUnc: number
  /** How much of the spread the line explains (1: every point on it). */
  r2: number
  /** Whether each point was weighted by its y uncertainty (1/δy²). */
  weighted: boolean
  /**
   * For a weighted fit of 3 or more points, the reduced chi-squared: about 1
   * when the points scatter as much as their error bars say; much more, they
   * scatter more (or the line is the wrong shape); much less, the bars are too big.
   */
  chi2?: number
}

/** What a series or axis is called: a variable's name (`v_f`), or the expression it was worked out from. */
export interface PlotName {
  name?: string
  expr?: string
}

export interface PlotSeries extends PlotName {
  points: PlotPoint[]
  fit?: LinearFit
}

export interface PlotAxis extends PlotName {
  /** The unit its values are in (as mathjs writes it), if they have one. */
  unit?: string
}

export interface PlotData {
  x: PlotAxis
  /** The y axis: named for its one series, or just its unit when there are several. */
  y: PlotAxis
  series: PlotSeries[]
  settings: PlotSettings
}

// ---------------------------------------------------------------------------
// The linear fit
// ---------------------------------------------------------------------------

/**
 * The least-squares line through points, with the uncertainties of its slope
 * and intercept.
 *
 * - When every point has a y uncertainty, each is weighted by 1/δy², so the
 *   precise points count most, and the slope's and intercept's uncertainties
 *   come from the error bars. (x uncertainties aren't used.)
 * - Otherwise every point counts the same, and the uncertainties come from how
 *   far the points scatter about the line (which needs 3 or more points; with
 *   2, the line goes through both and they're 0).
 */
export function linearFit(points: { x: number; y: number; dy?: number }[]): LinearFit | null {
  const n = points.length
  if (n < 2) return null
  const weighted = points.every((p) => p.dy !== undefined && p.dy > 0)
  const w = points.map((p) => (weighted ? 1 / p.dy! ** 2 : 1))
  const sum = (f: (p: { x: number; y: number }, i: number) => number) => points.reduce((s, p, i) => s + w[i] * f(p, i), 0)
  const total = sum(() => 1)
  const mx = sum((p) => p.x) / total
  const my = sum((p) => p.y) / total
  const sxx = sum((p) => (p.x - mx) ** 2)
  if (sxx === 0) return null
  const slope = sum((p) => (p.x - mx) * (p.y - my)) / sxx
  const intercept = my - slope * mx
  const residuals = sum((p) => (p.y - (slope * p.x + intercept)) ** 2)
  const spread = sum((p) => (p.y - my) ** 2)
  const r2 = spread === 0 ? 1 : 1 - residuals / spread
  if (weighted) {
    return {
      slope, intercept, r2, weighted,
      slopeUnc: Math.sqrt(1 / sxx),
      interceptUnc: Math.sqrt(1 / total + mx ** 2 / sxx),
      ...(n > 2 ? { chi2: residuals / (n - 2) } : {}),
    }
  }
  const slopeUnc = Math.sqrt((n > 2 ? residuals / (n - 2) : 0) / sxx)
  const interceptUnc = slopeUnc * Math.sqrt(points.reduce((s, p) => s + p.x ** 2, 0) / n)
  return { slope, intercept, slopeUnc, interceptUnc, r2, weighted }
}

// ---------------------------------------------------------------------------
// Axes
// ---------------------------------------------------------------------------

/** About how many ticks an axis gets. */
const TICKS = 6

/** Room left beyond the values at each end of an axis, as a fraction of their span. */
const EDGE_ROOM = 0.04

/** A tidy step for about `count` ticks across `span`: 1, 2 or 5 times a power of 10. */
function niceStep(span: number, count: number): number {
  const rough = span / count
  const power = 10 ** Math.floor(Math.log10(rough))
  const scaled = rough / power
  return (scaled < 1.5 ? 1 : scaled < 3.5 ? 2 : scaled < 7.5 ? 5 : 10) * power
}

/** An axis: its range, ticks, and how to place a value on it (0 at `from`, 1 at `to`). */
interface Scale {
  from: number
  to: number
  ticks: number[]
  place: (v: number) => number
}

/** An axis's scale from its values, the settings' range (which wins), and whether it's logarithmic. */
function scaleFor(values: number[], range: { from?: number; to?: number }, log: boolean): Scale {
  const shown = log ? values.filter((v) => v > 0) : values
  let lo = range.from ?? (shown.length ? Math.min(...shown) : 0)
  let hi = range.to ?? (shown.length ? Math.max(...shown) : 1)
  if (log) {
    lo = Math.max(lo, Number.MIN_VALUE)
    if (hi <= lo) hi = lo * 10
    const first = Math.floor(Math.log10(lo))
    const last = Math.ceil(Math.log10(hi))
    const from = range.from ?? 10 ** first
    const to = range.to ?? 10 ** Math.max(last, first + 1)
    const ticks: number[] = []
    for (let k = first; k <= last; k++) {
      for (const m of last - first <= 1 ? [1, 2, 5] : [1]) {
        const t = m * 10 ** k
        if (t >= from * (1 - 1e-9) && t <= to * (1 + 1e-9)) ticks.push(t)
      }
    }
    const a = Math.log10(from)
    const b = Math.log10(to)
    return { from, to, ticks, place: (v) => (Math.log10(v) - a) / (b - a) }
  }
  if (hi === lo) {
    const pad = lo === 0 ? 1 : Math.abs(lo) * 0.1
    lo -= pad
    hi += pad
  } else {
    // A little room, so points at the ends aren't cut in half (but not past 0, if the values don't cross it).
    const pad = (hi - lo) * EDGE_ROOM
    if (range.from === undefined) lo = lo >= 0 ? Math.max(0, lo - pad) : lo - pad
    if (range.to === undefined) hi = hi <= 0 ? Math.min(0, hi + pad) : hi + pad
  }
  const step = niceStep(hi - lo, TICKS)
  // Round out to whole steps (unless the settings fix that end).
  const from = range.from ?? Math.floor(lo / step + 1e-9) * step
  const to = range.to ?? Math.ceil(hi / step - 1e-9) * step
  const ticks: number[] = []
  for (let t = Math.ceil(from / step - 1e-9) * step; t <= to + step * 1e-9; t += step) ticks.push(Number(t.toPrecision(12)))
  return { from, to, ticks, place: (v) => (v - from) / (to - from) }
}

/** A tick's label: plain digits, or a power of ten for very large or small values. */
export function tickLabel(v: number): string {
  if (v === 0) return '0'
  const a = Math.abs(v)
  if (a >= 1e5 || a < 1e-3) {
    const [m, e] = v.toExponential(2).split('e')
    const mantissa = String(Number(m))
    const exp = Number(e)
    return mantissa === '1' ? `10${superscript(exp)}` : `${mantissa}×10${superscript(exp)}`
  }
  return String(Number(v.toPrecision(6)))
}

// ---------------------------------------------------------------------------
// Names and units as text
// ---------------------------------------------------------------------------

const SUPERSCRIPTS: Record<string, string> = {
  '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '-': '⁻', '.': '·',
}
const superscript = (n: number | string) => [...String(n)].map((c) => SUPERSCRIPTS[c] ?? c).join('')

const escapeXml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** A name's base and subscript as SVG text: `v_f` → v with f lowered, `theta` → θ; one letter in italics. */
export function nameSvg(p: PlotName): string {
  if (!p.name) return escapeXml(p.expr ?? '')
  // A namespace's series, a.x, reads x with a lowered, as in the equations.
  const member = parseMemberName(p.name)
  const [base, ...rest] = (member?.member ?? p.name).split('_')
  const subs = member ? [member.namespace, ...rest] : rest
  const part = (s: string) => GREEK_BY_NAME.get(s) ?? s
  const shownBase = part(base)
  const italic = [...shownBase].length === 1
  const baseSvg = italic ? `<tspan font-style="italic">${escapeXml(shownBase)}</tspan>` : escapeXml(shownBase)
  const sub = subs.filter(Boolean).map(part).join(',')
  return sub ? `${baseSvg}<tspan baseline-shift="sub" font-size="75%">${escapeXml(sub)}</tspan>` : baseSvg
}

/** Words in units, written as they're shown elsewhere. */
const UNIT_WORDS: Record<string, string> = { angstrom: 'Å', angstroms: 'Å', deg: '°', ohm: 'Ω' }

/** A unit as plain text: `m/s^2` → m/s², `kg m^2` → kg·m², `um` → µm. */
export function unitText(unit: string): string {
  return unit.trim()
    .replace(/\s*\/\s*/g, '/')
    .replace(/\s*[*·]\s*|\s+/g, '·')
    .replace(/\^\(?(-?[\d.]+)\)?/g, (_m, p: string) => superscript(p))
    .replace(/[A-Za-z]+/g, (w) => UNIT_WORDS[w] ?? (w.length > 1 && w.startsWith('u') && w !== 'u' ? `µ${w.slice(1)}` : w))
}

/** An axis's label: its name and unit, `t [s]`, or just the unit for a shared y axis. */
function axisLabel(a: PlotAxis): string {
  const unit = a.unit ? ` [${escapeXml(unitText(a.unit))}]` : ''
  const name = nameSvg(a)
  return name ? `${name}${unit}` : unit.trim()
}

// ---------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------

/** The colours a plot is drawn in: CSS variables in the app, fixed colours for an exported image. */
export interface PlotPalette {
  text: string
  muted: string
  grid: string
  background: string
  series: string[]
}

/** The app's colours (they follow its theme). */
export const THEME_PALETTE: PlotPalette = {
  text: 'var(--text)',
  muted: 'var(--muted)',
  grid: 'var(--border)',
  background: 'transparent',
  series: ['var(--accent)', '#e8743b', '#19a979', '#945ecf', '#d4a017', '#13a4b4'],
}

/** Fixed colours on white, for an exported image. */
export const PRINT_PALETTE: PlotPalette = {
  text: '#1a1a1a',
  muted: '#555555',
  grid: '#d9d9d9',
  background: '#ffffff',
  series: ['#3a5bd9', '#e8743b', '#19a979', '#945ecf', '#d4a017', '#13a4b4'],
}

/** The drawing's size, in its own units (it scales to fit). */
export const PLOT_SIZE = { width: 640, height: 400 }

/** Points, cap widths and line weights, in drawing units. */
const MARK = { point: 3.5, cap: 4, line: 1.75, fit: 1.5 }

/** How many plots have been drawn, for each one's own clip-path id. */
let plotCount = 0

/**
 * A plot as SVG markup, in `palette`'s colours, with a note of anything left
 * out (points that can't go on a log scale).
 */
export function plotSvg(plot: PlotData, palette: PlotPalette): string {
  const { settings } = plot
  const all = plot.series.flatMap((s) => s.points)
  const xs = all.flatMap((p) => (p.dx ? [p.x - p.dx, p.x + p.dx] : [p.x]))
  const ys = all.flatMap((p) => (p.dy ? [p.y - p.dy, p.y + p.dy] : [p.y]))
  // A fit's line counts towards the y range where it crosses the x range.
  for (const s of plot.series) {
    if (!s.fit) continue
    for (const x of [Math.min(...xs), Math.max(...xs)]) ys.push(s.fit.slope * x + s.fit.intercept)
  }
  const sx = scaleFor(xs, settings.x, settings.x.log)
  const sy = scaleFor(ys, settings.y, settings.y.log)

  const { width, height } = PLOT_SIZE
  const legend = plot.series.length > 1
  // Room at the top for the title and the legend (a row above the plot, clear of the points).
  const margin = { left: 74, right: 18, top: 18 + (settings.title ? 24 : 0) + (legend ? 24 : 0), bottom: 56 }
  const w = width - margin.left - margin.right
  const h = height - margin.top - margin.bottom
  const X = (v: number) => margin.left + sx.place(v) * w
  const Y = (v: number) => margin.top + (1 - sy.place(v)) * h
  const onX = (v: number) => !settings.x.log || v > 0
  const onY = (v: number) => !settings.y.log || v > 0
  const f = (n: number) => n.toFixed(1)

  const out: string[] = []
  // (Each plot's clip path has its own id: several plots can be on one page.)
  const clip = `plot-area-${++plotCount}`
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" font-family="'Latin Modern Roman', 'Times New Roman', serif" font-size="14" fill="${palette.text}">`)
  if (palette.background !== 'transparent') out.push(`<rect width="${width}" height="${height}" fill="${palette.background}"/>`)
  out.push(`<defs><clipPath id="${clip}"><rect x="${margin.left}" y="${margin.top}" width="${w}" height="${h}"/></clipPath></defs>`)
  if (settings.title) out.push(`<text x="${margin.left + w / 2}" y="24" text-anchor="middle" font-size="16">${escapeXml(settings.title)}</text>`)

  // Grid and ticks.
  for (const t of sx.ticks) {
    const x = f(X(t))
    out.push(`<line x1="${x}" y1="${margin.top}" x2="${x}" y2="${margin.top + h}" stroke="${palette.grid}" stroke-width="1"/>`)
    out.push(`<text x="${x}" y="${margin.top + h + 18}" text-anchor="middle" font-size="12" fill="${palette.muted}">${escapeXml(tickLabel(t))}</text>`)
  }
  for (const t of sy.ticks) {
    const y = f(Y(t))
    out.push(`<line x1="${margin.left}" y1="${y}" x2="${margin.left + w}" y2="${y}" stroke="${palette.grid}" stroke-width="1"/>`)
    out.push(`<text x="${margin.left - 8}" y="${y}" dy="0.35em" text-anchor="end" font-size="12" fill="${palette.muted}">${escapeXml(tickLabel(t))}</text>`)
  }
  out.push(`<rect x="${margin.left}" y="${margin.top}" width="${w}" height="${h}" fill="none" stroke="${palette.muted}" stroke-width="1"/>`)

  // Axis labels.
  out.push(`<text x="${margin.left + w / 2}" y="${height - 12}" text-anchor="middle">${axisLabel(plot.x)}</text>`)
  out.push(`<text transform="translate(18 ${margin.top + h / 2}) rotate(-90)" text-anchor="middle">${axisLabel(plot.y)}</text>`)

  // The series: fit lines, error bars, lines, points.
  out.push(`<g clip-path="url(#${clip})">`)
  plot.series.forEach((s, i) => {
    const colour = palette.series[i % palette.series.length]
    const points = s.points.filter((p) => onX(p.x) && onY(p.y)).sort((a, b) => a.x - b.x)
    if (s.fit) {
      // Enough short pieces to follow the line on a log scale too.
      const pieces = settings.x.log || settings.y.log ? 60 : 1
      const coords: string[] = []
      for (let k = 0; k <= pieces; k++) {
        const x = settings.x.log ? sx.from * (sx.to / sx.from) ** (k / pieces) : sx.from + (sx.to - sx.from) * (k / pieces)
        const y = s.fit.slope * x + s.fit.intercept
        if (onY(y)) coords.push(`${f(X(x))},${f(Y(y))}`)
      }
      if (coords.length > 1) out.push(`<polyline points="${coords.join(' ')}" fill="none" stroke="${colour}" stroke-width="${MARK.fit}" stroke-dasharray="6 4"/>`)
    }
    for (const p of points) {
      const x = X(p.x)
      const y = Y(p.y)
      if (p.dy && onY(p.y - p.dy)) {
        const top = f(Y(p.y + p.dy))
        const bottom = f(Y(p.y - p.dy))
        out.push(`<path d="M${f(x)},${top}V${bottom}M${f(x - MARK.cap)},${top}H${f(x + MARK.cap)}M${f(x - MARK.cap)},${bottom}H${f(x + MARK.cap)}" stroke="${colour}" stroke-width="1" fill="none"/>`)
      }
      if (p.dx && onX(p.x - p.dx)) {
        const left = f(X(p.x - p.dx))
        const right = f(X(p.x + p.dx))
        out.push(`<path d="M${left},${f(y)}H${right}M${left},${f(y - MARK.cap)}V${f(y + MARK.cap)}M${right},${f(y - MARK.cap)}V${f(y + MARK.cap)}" stroke="${colour}" stroke-width="1" fill="none"/>`)
      }
    }
    if (settings.style !== 'points' && points.length > 1) {
      out.push(`<polyline points="${points.map((p) => `${f(X(p.x))},${f(Y(p.y))}`).join(' ')}" fill="none" stroke="${colour}" stroke-width="${MARK.line}"/>`)
    }
    if (settings.style !== 'lines') {
      for (const p of points) out.push(`<circle cx="${f(X(p.x))}" cy="${f(Y(p.y))}" r="${MARK.point}" fill="${colour}"/>`)
    }
  })
  out.push('</g>')

  // A legend, when there's more than one series: a row above the plot, from its left edge.
  if (legend) {
    const y = margin.top - 14
    const step = 90
    plot.series.forEach((s, i) => {
      const colour = palette.series[i % palette.series.length]
      const x = margin.left + i * step
      out.push(`<circle cx="${x + 6}" cy="${y}" r="${MARK.point}" fill="${colour}"/>`)
      out.push(`<text x="${x + 16}" y="${y}" dy="0.35em" font-size="13">${nameSvg(s)}</text>`)
    })
  }
  out.push('</svg>')
  return out.join('')
}

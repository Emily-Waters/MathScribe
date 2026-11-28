/**
 * Plots: `@plot(t, x)` draws x against t, one point per row of the series.
 * This file has what a plot is (its line form works out its data: plot.ts),
 * the linear fit, and drawing it as SVG. The same drawing is shown in the
 * Rendered tab, in the app's colours, and exported as a picture, in fixed ones
 * (plotFigure.ts).
 */
import {
  type DisplayName, GREEK_BY_NAME, GREEK_CHARS, SUBSCRIPT, TEXT_SUBSCRIPT, UNIT_LOOKS, parseMemberName, regex, src, subscriptOf, typedName,
  unescapeUnderscores,
} from '../../lib/plugin.ts'
import {
  LEGEND_POSITION, PLOT_PART, PLOT_STYLE, partColour, showsLegend, type PlotColour, type PlotPart, type PlotSettings,
} from './plotSettings.ts'

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
  /** Whether each point was weighted by its y uncertainty (1/δy²; with its x uncertainty too, if `xWeighted`). */
  weighted: boolean
  /** Whether points' x uncertainties counted in their weights too (see linearFit). */
  xWeighted?: boolean
  /**
   * For a weighted fit of 3 or more points, the reduced chi-squared: about 1
   * when the points scatter as much as their error bars say; much more, they
   * scatter more (or the line is the wrong shape); much less, the bars are too big.
   */
  chi2?: number
}

/**
 * What a series or axis is called: a variable's name (`v_f`), or the expression
 * it was worked out from; shown as its series' display name, if it has one.
 */
export interface PlotName {
  name?: string
  expr?: string
  /** Its series' display name, `t:"Time" = …`: shown in place of its name. */
  label?: DisplayName
}

export interface PlotSeries extends PlotName {
  points: PlotPoint[]
  fit?: LinearFit
  /**
   * A function's curve, not data: its points are where it was worked out, across
   * the x axis, drawn as a smooth line (no marks, error bars or fit), and they
   * don't widen the x axis.
   */
  curve?: boolean
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

/** Refitting with x uncertainties: at most `rounds` times, stopping once the slope changes by less than `settled` of itself. */
const EFFECTIVE_VARIANCE = { rounds: 50, settled: 1e-12 } as const

/** The weighted least-squares line through points, with the sums its uncertainties are worked out from; null if every x is the same. */
function fitWith(points: { x: number; y: number }[], w: number[]) {
  const sum = (f: (p: { x: number; y: number }) => number) => points.reduce((s, p, i) => s + w[i] * f(p), 0)
  const total = sum(() => 1)
  const mx = sum((p) => p.x) / total
  const my = sum((p) => p.y) / total
  const sxx = sum((p) => (p.x - mx) ** 2)
  if (sxx === 0) return null
  const slope = sum((p) => (p.x - mx) * (p.y - my)) / sxx
  const intercept = my - slope * mx
  const residuals = sum((p) => (p.y - (slope * p.x + intercept)) ** 2)
  const spread = sum((p) => (p.y - my) ** 2)
  return { slope, intercept, total, mx, sxx, residuals, r2: spread === 0 ? 1 : 1 - residuals / spread }
}

/**
 * The least-squares line through points, with the uncertainties of its slope
 * and intercept.
 *
 * - When every point has a y uncertainty, each is weighted by 1/σ², so the
 *   precise points count most, and the slope's and intercept's uncertainties
 *   come from the error bars. σ is δy, and if the point has an x uncertainty
 *   too, that as well, by how far it moves the point along y on the line:
 *   σ² = δy² + (slope · δx)² (the effective variance method). As that depends
 *   on the slope, the line is fitted again with each slope's weights until it
 *   settles. So a fit of T² against m, whose masses are known to 1% and
 *   periods to 0.01%, isn't trusted as if the masses were exact.
 * - Otherwise every point counts the same, and the uncertainties come from how
 *   far the points scatter about the line (which needs 3 or more points; with
 *   2, the line goes through both and they're 0).
 */
export function linearFit(points: { x: number; y: number; dx?: number; dy?: number }[]): LinearFit | null {
  const n = points.length
  if (n < 2) return null
  const weighted = points.every((p) => p.dy !== undefined && p.dy > 0)
  const xWeighted = weighted && points.some((p) => p.dx !== undefined && p.dx > 0)
  // The line for these weights, from y's alone at first; then refitted with
  // each point's x uncertainty seen through the slope, until the slope settles.
  let fit = fitWith(points, points.map((p) => (weighted ? 1 / p.dy! ** 2 : 1)))
  for (let round = 0; xWeighted && fit && round < EFFECTIVE_VARIANCE.rounds; round++) {
    const slope = fit.slope
    fit = fitWith(points, points.map((p) => 1 / (p.dy! ** 2 + (slope * (p.dx ?? 0)) ** 2)))
    if (fit && Math.abs(fit.slope - slope) <= EFFECTIVE_VARIANCE.settled * Math.abs(fit.slope)) break
  }
  if (!fit) return null
  const { slope, intercept, total, mx, sxx, residuals, r2 } = fit
  if (weighted) {
    return {
      slope, intercept, r2, weighted, ...(xWeighted ? { xWeighted } : {}),
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
export interface Scale {
  from: number
  to: number
  ticks: number[]
  place: (v: number) => number
}

/** A log axis's ticks in each decade, when it spans few enough of them (LOG_FINE_DECADES): 1, 2 and 5 times a power of ten. */
const LOG_STEPS = [1, 2, 5]
/** Up to how many decades a log axis has ticks at 1, 2 and 5 of each (beyond, at each power of ten). */
const LOG_FINE_DECADES = 2

/** An axis's scale from its values, the settings' range (which wins), and whether it's logarithmic. */
function scaleFor(values: number[], set: { from?: number; to?: number }, log: boolean): Scale {
  // (A log axis can't reach 0 or below: an end set there, `x from 0` kept from a linear axis, is left to the data.)
  const range = log ? { from: set.from !== undefined && set.from > 0 ? set.from : undefined, to: set.to !== undefined && set.to > 0 ? set.to : undefined } : set
  const shown = log ? values.filter((v) => v > 0) : values
  let lo = range.from ?? (shown.length ? Math.min(...shown) : 0)
  let hi = range.to ?? (shown.length ? Math.max(...shown) : 1)
  if (log) {
    lo = Math.max(lo, Number.MIN_VALUE)
    if (hi <= lo) hi = lo * 10
    const first = Math.floor(Math.log10(lo))
    const last = Math.ceil(Math.log10(hi))
    // Over a decade or two, ticks at 1, 2 and 5 of each, and the axis's ends on the nearest of them around
    // the values (0.013 … 0.103: 0.01 to 0.2); over more, at each power of ten, and its ends on them.
    const steps = last - first <= LOG_FINE_DECADES ? LOG_STEPS : [1]
    const marks: number[] = []
    for (let k = first; k <= last; k++) for (const m of steps) marks.push(Number((m * 10 ** k).toPrecision(12)))
    const from = range.from ?? marks.findLast((t) => t <= lo * (1 + 1e-9)) ?? 10 ** first
    const to = range.to ?? marks.find((t) => t >= hi * (1 - 1e-9) && t > from) ?? 10 ** Math.max(last, first + 1)
    const ticks = marks.filter((t) => t >= from * (1 - 1e-9) && t <= to * (1 + 1e-9))
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

/**
 * A plot's axes: their ranges and ticks, from its points (and their error bars,
 * if it shows them), where its fits cross the x range, and its settings. The
 * drawing and the LaTeX export both use these, so a plot has the same axes,
 * ticks and fit lines wherever it's shown.
 */
export function plotScales(plot: PlotData): { x: Scale; y: Scale } {
  const { settings } = plot
  const bars = settings.uncertainty !== false
  // (The x axis is the data's; a curve is drawn across it. With no data, it's the curves'.)
  const data = plot.series.filter((s) => !s.curve && s.points.length)
  const all = (data.length ? data : plot.series).flatMap((s) => s.points)
  const xs = all.flatMap((p) => (bars && p.dx ? [p.x - p.dx, p.x + p.dx] : [p.x]))
  const ys = all.flatMap((p) => (bars && p.dy ? [p.y - p.dy, p.y + p.dy] : [p.y]))
  // A curve counts towards the y range.
  if (data.length) for (const s of plot.series) if (s.curve) for (const p of s.points) ys.push(p.y)
  // A fit's line counts towards the y range where it crosses the x range.
  for (const s of plot.series) {
    if (!s.fit) continue
    for (const x of [Math.min(...xs), Math.max(...xs)]) ys.push(s.fit.slope * x + s.fit.intercept)
  }
  return { x: scaleFor(xs, settings.x, settings.x.log), y: scaleFor(ys, settings.y, settings.y.log) }
}

/**
 * A plot's axes as they're labelled: each by its own name if its settings give
 * one (`xlabel "Extension"`, written as it is, not as a variable's name), else
 * by its series'; with its unit either way.
 */
export function labelledAxes(plot: PlotData): { x: PlotAxis; y: PlotAxis } {
  const own = (axis: PlotAxis, label: string | undefined): PlotAxis => (label ? { unit: axis.unit, expr: label } : axis)
  return { x: own(plot.x, plot.settings.xLabel), y: own(plot.y, plot.settings.yLabel) }
}

/** Below this, or at or above `large`, a value's written with a power of ten: 2×10⁻⁴, 10⁵. */
const PLAIN_TICKS = { small: 1e-3, large: 1e5 } as const

/** Whether a value is written as plain digits (0.25, 1200), not with a power of ten. */
const isPlain = (v: number) => v === 0 || (Math.abs(v) >= PLAIN_TICKS.small && Math.abs(v) < PLAIN_TICKS.large)

/** A number's digits, without float noise: 0.30000000000000004 → 0.3. */
const digits = (v: number) => String(Number(v.toPrecision(6)))

/** A tick's label: plain digits (`0.25`), or, on a log axis, a power of ten (`10⁻³`, `2×10⁻⁴`). */
export type TickLabel = { plain: string } | { mantissa: string; exp: number }

/**
 * An axis's tick labels. On a log axis, each is its own power of ten where it
 * needs one (10⁻³, 10⁻², 10⁻¹). On a linear axis, either every tick is plain
 * digits, or, if any would need a power of ten (0.0002, 0.0016), the axis has
 * one for them all, `power`, said once in its label (`d [10⁻³ m]`), and the
 * ticks are 0.2, 0.4, …, 1.6: never a mix, or a power under every tick.
 */
export function axisTicks(s: Scale, log: boolean): { labels: TickLabel[]; power?: number } {
  if (log) {
    return {
      labels: s.ticks.map((v) => {
        if (isPlain(v)) return { plain: digits(v) }
        const [m, e] = v.toExponential(2).split('e')
        return { mantissa: String(Number(m)), exp: Number(e) }
      }),
    }
  }
  if (s.ticks.every(isPlain)) return { labels: s.ticks.map((v) => ({ plain: digits(v) })) }
  const largest = Math.max(...s.ticks.map(Math.abs))
  const power = Math.floor(Math.log10(largest))
  return { labels: s.ticks.map((v) => ({ plain: digits(v / 10 ** power) })), power }
}

/** A tick's label as text: `0.25`, `10⁻³`, `2×10⁻⁴`. */
export function tickLabelText(t: TickLabel): string {
  if ('plain' in t) return t.plain
  return t.mantissa === '1' ? `10${superscript(t.exp)}` : `${t.mantissa}×10${superscript(t.exp)}`
}

/** A tick's label as LaTeX: `$0.25$`, `$10^{-3}$`, `$2\times10^{-4}$`. */
export function tickLabelTex(t: TickLabel): string {
  if ('plain' in t) return `$${t.plain}$`
  return `$${t.mantissa === '1' ? '' : `${t.mantissa}\\times`}10^{${t.exp}}$`
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
/** A letter, then a number (and maybe letters), with no underscore: `m1`, `v1x` (1: the letter, 2: the rest). */
const LETTER_THEN_NUMBER = regex(src`^([A-Za-z${GREEK_CHARS}])(\d+[A-Za-z]*)$`)

/**
 * A display name's words as SVG text, each subscript lowered as in names
 * (`Speed v_0` → Speed v with 0 below); `\_` a plain underscore.
 */
function wordsSvg(words: string): string {
  let out = ''
  let last = 0
  for (const m of words.matchAll(TEXT_SUBSCRIPT)) {
    out += `${escapeXml(unescapeUnderscores(words.slice(last, m.index)))}<tspan baseline-shift="sub" font-size="75%">${escapeXml(subscriptOf(m.groups!.subscript))}</tspan>`
    last = m.index + m[0].length
  }
  return out + escapeXml(unescapeUnderscores(words.slice(last)))
}

/** A name as plain text, for its length: its display name's words, its name as typed, or its expression. */
const plainName = (p: PlotName) => p.label?.words ?? (p.name ? typedName(p.name) : p.expr ?? '')

export function nameSvg(p: PlotName): string {
  if (p.label) return wordsSvg(p.label.words)
  if (!p.name) return escapeXml(p.expr ?? '')
  // A namespace's series, a.x, reads x with a lowered, as in the equations.
  const member = parseMemberName(p.name)
  const own = member?.member ?? p.name
  // A letter then a number, without an underscore (`m1`, `v1x`), is the letter with the rest lowered.
  const numbered = LETTER_THEN_NUMBER.exec(own)
  const [base, ...rest] = numbered ? [numbered[1], numbered[2]] : own.split(SUBSCRIPT)
  const subs = member ? [member.namespace, ...rest] : rest
  const part = (s: string) => GREEK_BY_NAME.get(s) ?? s
  const shownBase = part(base)
  const italic = [...shownBase].length === 1
  const baseSvg = italic ? `<tspan font-style="italic">${escapeXml(shownBase)}</tspan>` : escapeXml(shownBase)
  const sub = subs.filter(Boolean).map(part).join(',')
  return sub ? `${baseSvg}<tspan baseline-shift="sub" font-size="75%">${escapeXml(sub)}</tspan>` : baseSvg
}


/** A unit as plain text: `m/s^2` → m/s², `kg m^2` → kg·m², `um` → µm. */
export function unitText(unit: string): string {
  return unit.trim()
    .replace(/\s*\/\s*/g, '/')
    .replace(/\s*[*·]\s*|\s+/g, '·')
    .replace(/\^\(?(-?[\d.]+)\)?/g, (_m, p: string) => superscript(p))
    .replace(/[A-Za-z]+/g, (w) => UNIT_LOOKS[w]?.text ?? (w.length > 1 && w.startsWith('u') && w !== 'u' ? `µ${w.slice(1)}` : w))
}

/**
 * An axis's label: its name and unit, `t [s]`, or just the unit for a shared y
 * axis; with the power of ten its ticks are in, if they share one (axisTicks):
 * `d [10⁻³ m]`, or `y [×10⁻³]` with no unit.
 */
function axisLabel(a: PlotAxis, power?: number): string {
  const scale = power === undefined ? '' : `10${superscript(power)}`
  const inside = [scale, a.unit ? unitText(a.unit) : ''].filter(Boolean).join(' ')
  const unit = inside ? ` [${escapeXml(a.unit ? inside : `×${inside}`)}]` : ''
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
  /** Behind a legend in a corner of the plot, over what's drawn there. */
  legendBackground: string
  /** Each series' colour, in order, unless its settings choose one. */
  series: string[]
  /** The shade of each colour a plot's settings can choose (`colour fit red`). */
  named: Record<PlotColour, string>
}

/**
 * The shade of each colour a plot's settings can choose, on white: the
 * exported image's, and the LaTeX export's (latexKit.ts writes them as RGB, so
 * a chosen colour is the same shade in both).
 */
export const NAMED_COLOURS: Record<PlotColour, string> = {
  black: '#1a1a1a', grey: '#7f7f7f', blue: '#3a5bd9', red: '#d62728', green: '#2ca02c',
  orange: '#e8743b', purple: '#945ecf', teal: '#13a4b4', brown: '#8c564b',
}

/** The app's colours (they follow its theme: black and grey are its text's, so they show on a dark one too). */
export const THEME_PALETTE: PlotPalette = {
  text: 'var(--text)',
  muted: 'var(--muted)',
  grid: 'var(--border)',
  background: 'transparent',
  legendBackground: 'var(--surface)',
  series: ['var(--accent)', '#e8743b', '#19a979', '#945ecf', '#d4a017', '#13a4b4'],
  named: { ...NAMED_COLOURS, black: 'var(--text)', grey: 'var(--muted)' },
}

/** Fixed colours on white, for an exported image. */
export const PRINT_PALETTE: PlotPalette = {
  text: '#1a1a1a',
  muted: '#555555',
  grid: '#d9d9d9',
  background: '#ffffff',
  legendBackground: '#ffffff',
  series: ['#3a5bd9', '#e8743b', '#19a979', '#945ecf', '#d4a017', '#13a4b4'],
  named: NAMED_COLOURS,
}

/** The colours chosen for each part of a series (its points, line and fit), by its plot's settings; undefined where none is. */
export function chosenColours(plot: PlotData, s: PlotSeries): Record<PlotPart, PlotColour | undefined> {
  // (A series is named in settings as it's typed: a.x, not a__x.)
  const name = s.name === undefined ? undefined : typedName(s.name)
  return {
    points: partColour(plot.settings, name, PLOT_PART.points),
    line: partColour(plot.settings, name, PLOT_PART.line),
    fit: partColour(plot.settings, name, PLOT_PART.fit),
  }
}

/** What a legend says for each series' fit: `Best fit`, or with several series, `Best fit, x`. */
export const FIT_LEGEND = 'Best fit'

/** The drawing's size, in its own units (it scales to fit). */
export const PLOT_SIZE = { width: 640, height: 400 }

/** Points, cap widths and line weights, in drawing units. */
const MARK = { point: 3.5, cap: 4, line: 1.75, fit: 1.5 }

/** How many plots have been drawn, for each one's own clip-path id. */
let plotCount = 0

/** A legend's sizes, in drawing units: its rows, the sample of each mark beside its label, and its padding. */
const LEGEND = { row: 18, sample: 24, gap: 6, padding: 8, inset: 8, charWidth: 7, fontSize: 13, beside: 12 } as const

/** One row of a legend: what it shows (a series' marks, or a fit's dashed line), in its colours, and its label. */
interface LegendEntry {
  label: string
  /** Its label's length in characters (for the legend's width). */
  length: number
  point?: string
  line?: string
  dashed?: string
}

/**
 * A plot's legend rows: each series (its points and line, as its style draws
 * them) and each fit (`Best fit`, or `Best fit, x` with several series).
 */
function legendEntries(plot: PlotData, colours: { point: string; line: string; fit: string }[]): LegendEntry[] {
  const { style } = plot.settings
  const several = plot.series.length > 1
  return plot.series.flatMap((s, i) => {
    const c = colours[i]
    // (A curve is a line, whatever the plot's style.)
    const series: LegendEntry = {
      label: nameSvg(s), length: plainName(s).length,
      ...(style !== PLOT_STYLE.lines && !s.curve ? { point: c.point } : {}),
      ...(style !== PLOT_STYLE.points || s.curve ? { line: c.line } : {}),
    }
    if (!s.fit) return [series]
    const fitLabel = several ? `${FIT_LEGEND}, ` : FIT_LEGEND
    const fit: LegendEntry = {
      label: several ? `${escapeXml(fitLabel)}${nameSvg(s)}` : escapeXml(fitLabel),
      length: fitLabel.length + (several ? plainName(s).length : 0),
      dashed: c.fit,
    }
    return [series, fit]
  })
}

/**
 * A plot as SVG markup, in `palette`'s colours, with a note of anything left
 * out (points that can't go on a log scale).
 */
export function plotSvg(plot: PlotData, palette: PlotPalette): string {
  const { settings } = plot
  // (Error bars, and the room the axes make for them, only if the plot's settings show uncertainties.)
  const bars = settings.uncertainty !== false
  const { x: sx, y: sy } = plotScales(plot)

  // Each series' colours: its own (the palette's next), unless its settings choose one for a part.
  const colours = plot.series.map((s, i) => {
    const own = palette.series[i % palette.series.length]
    const chosen = chosenColours(plot, s)
    const of = (c: PlotColour | undefined) => (c ? palette.named[c] : own)
    return { point: of(chosen.points), line: of(chosen.line), fit: of(chosen.fit) }
  })
  const entries = showsLegend(settings, plot.series.length) ? legendEntries(plot, colours) : []
  const legendWidth = LEGEND.padding * 2 + LEGEND.sample + LEGEND.gap + Math.max(0, ...entries.map((e) => e.length)) * LEGEND.charWidth
  const legendHeight = LEGEND.padding * 2 + entries.length * LEGEND.row - (LEGEND.row - LEGEND.fontSize)
  const outside = entries.length > 0 && settings.legend === LEGEND_POSITION.outside

  const { width, height } = PLOT_SIZE
  // Room at the top for the title, and at the right for a legend beside the plot.
  const margin = { left: 74, right: 18 + (outside ? legendWidth + LEGEND.beside : 0), top: 18 + (settings.title ? 24 : 0), bottom: 56 }
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
  const xTicks = axisTicks(sx, settings.x.log)
  const yTicks = axisTicks(sy, settings.y.log)
  sx.ticks.forEach((t, i) => {
    const x = f(X(t))
    out.push(`<line x1="${x}" y1="${margin.top}" x2="${x}" y2="${margin.top + h}" stroke="${palette.grid}" stroke-width="1"/>`)
    out.push(`<text x="${x}" y="${margin.top + h + 18}" text-anchor="middle" font-size="12" fill="${palette.muted}">${escapeXml(tickLabelText(xTicks.labels[i]))}</text>`)
  })
  sy.ticks.forEach((t, i) => {
    const y = f(Y(t))
    out.push(`<line x1="${margin.left}" y1="${y}" x2="${margin.left + w}" y2="${y}" stroke="${palette.grid}" stroke-width="1"/>`)
    out.push(`<text x="${margin.left - 8}" y="${y}" dy="0.35em" text-anchor="end" font-size="12" fill="${palette.muted}">${escapeXml(tickLabelText(yTicks.labels[i]))}</text>`)
  })
  out.push(`<rect x="${margin.left}" y="${margin.top}" width="${w}" height="${h}" fill="none" stroke="${palette.muted}" stroke-width="1"/>`)

  // Axis labels.
  const axes = labelledAxes(plot)
  out.push(`<text x="${margin.left + w / 2}" y="${height - 12}" text-anchor="middle">${axisLabel(axes.x, xTicks.power)}</text>`)
  out.push(`<text transform="translate(18 ${margin.top + h / 2}) rotate(-90)" text-anchor="middle">${axisLabel(axes.y, yTicks.power)}</text>`)

  // The series: fit lines, error bars, lines, points.
  out.push(`<g clip-path="url(#${clip})">`)
  plot.series.forEach((s, i) => {
    const colour = colours[i]
    const points = s.points.filter((p) => onX(p.x) && onY(p.y)).sort((a, b) => a.x - b.x)
    // A function's curve: a smooth line through where it was worked out.
    if (s.curve) {
      if (points.length > 1) {
        out.push(`<polyline points="${points.map((p) => `${f(X(p.x))},${f(Y(p.y))}`).join(' ')}" fill="none" stroke="${colour.line}" stroke-width="${MARK.line}" stroke-linejoin="round"/>`)
      }
      return
    }
    if (s.fit) {
      // Enough short pieces to follow the line on a log scale too.
      const pieces = settings.x.log || settings.y.log ? 60 : 1
      const coords: string[] = []
      for (let k = 0; k <= pieces; k++) {
        const x = settings.x.log ? sx.from * (sx.to / sx.from) ** (k / pieces) : sx.from + (sx.to - sx.from) * (k / pieces)
        const y = s.fit.slope * x + s.fit.intercept
        if (onY(y)) coords.push(`${f(X(x))},${f(Y(y))}`)
      }
      if (coords.length > 1) out.push(`<polyline points="${coords.join(' ')}" fill="none" stroke="${colour.fit}" stroke-width="${MARK.fit}" stroke-dasharray="6 4"/>`)
    }
    for (const p of points) {
      const x = X(p.x)
      const y = Y(p.y)
      if (bars && p.dy && onY(p.y - p.dy)) {
        const top = f(Y(p.y + p.dy))
        const bottom = f(Y(p.y - p.dy))
        out.push(`<path d="M${f(x)},${top}V${bottom}M${f(x - MARK.cap)},${top}H${f(x + MARK.cap)}M${f(x - MARK.cap)},${bottom}H${f(x + MARK.cap)}" stroke="${colour.point}" stroke-width="1" fill="none"/>`)
      }
      if (bars && p.dx && onX(p.x - p.dx)) {
        const left = f(X(p.x - p.dx))
        const right = f(X(p.x + p.dx))
        out.push(`<path d="M${left},${f(y)}H${right}M${left},${f(y - MARK.cap)}V${f(y + MARK.cap)}M${right},${f(y - MARK.cap)}V${f(y + MARK.cap)}" stroke="${colour.point}" stroke-width="1" fill="none"/>`)
      }
    }
    if (settings.style !== PLOT_STYLE.points && points.length > 1) {
      out.push(`<polyline points="${points.map((p) => `${f(X(p.x))},${f(Y(p.y))}`).join(' ')}" fill="none" stroke="${colour.line}" stroke-width="${MARK.line}"/>`)
    }
    if (settings.style !== PLOT_STYLE.lines) {
      for (const p of points) out.push(`<circle cx="${f(X(p.x))}" cy="${f(Y(p.y))}" r="${MARK.point}" fill="${colour.point}"/>`)
    }
  })
  out.push('</g>')

  // The legend: in a corner of the plot (on a background, over what's under it), or beside it.
  if (entries.length) {
    const position = settings.legend ?? LEGEND_POSITION.topLeft
    const right = position === LEGEND_POSITION.topRight || position === LEGEND_POSITION.bottomRight
    const bottom = position === LEGEND_POSITION.bottomLeft || position === LEGEND_POSITION.bottomRight
    const left = outside
      ? margin.left + w + LEGEND.beside
      : right ? margin.left + w - LEGEND.inset - legendWidth : margin.left + LEGEND.inset
    const top = bottom && !outside ? margin.top + h - LEGEND.inset - legendHeight : margin.top + (outside ? 0 : LEGEND.inset)
    out.push(`<rect x="${f(left)}" y="${f(top)}" width="${f(legendWidth)}" height="${f(legendHeight)}" fill="${palette.legendBackground}" stroke="${palette.grid}" stroke-width="1"/>`)
    entries.forEach((e, k) => {
      const y = top + LEGEND.padding + LEGEND.fontSize / 2 + k * LEGEND.row
      const x0 = left + LEGEND.padding
      const x1 = x0 + LEGEND.sample
      if (e.line) out.push(`<line x1="${f(x0)}" y1="${f(y)}" x2="${f(x1)}" y2="${f(y)}" stroke="${e.line}" stroke-width="${MARK.line}"/>`)
      if (e.dashed) out.push(`<line x1="${f(x0)}" y1="${f(y)}" x2="${f(x1)}" y2="${f(y)}" stroke="${e.dashed}" stroke-width="${MARK.fit}" stroke-dasharray="6 4"/>`)
      if (e.point) out.push(`<circle cx="${f((x0 + x1) / 2)}" cy="${f(y)}" r="${MARK.point}" fill="${e.point}"/>`)
      out.push(`<text x="${f(x1 + LEGEND.gap)}" y="${f(y)}" dy="0.35em" font-size="${LEGEND.fontSize}">${e.label}</text>`)
    })
  }
  out.push('</svg>')
  return out.join('')
}

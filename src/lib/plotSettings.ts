/**
 * A plot's settings, kept in the sheet after a semicolon inside its brackets,
 * as a table's are (see tableSettings.ts):
 *
 *   plot(t, x; style both, fit linear, x from 0 to 2, log y, title "Run 1")
 *
 *   rows 5-20            only rows 5 to 20 (rows 5- from 5 on, rows -20 up to 20)
 *   style lines          lines between the points (style both: points and lines;
 *                        the default is points)
 *   fit linear           a best-fit line, with its slope and intercept
 *   x from 0 to 2        the x axis's range (either end may be left out)
 *   y from … to …        the y axis's
 *   log x, log y         a logarithmic axis
 *   title "Run 1"        a title over the plot
 *
 * The plot's ⚙ button in the editor writes them, so they don't need typing.
 */

export const PLOT_STYLES = ['points', 'lines', 'both'] as const
export type PlotStyle = (typeof PLOT_STYLES)[number]

export const PLOT_FITS = ['none', 'linear'] as const
export type PlotFit = (typeof PLOT_FITS)[number]

/** One axis's settings: its range (either end may be open), and a log scale. */
export interface AxisSettings {
  from?: number
  to?: number
  log: boolean
}

export interface PlotSettings {
  /** The first and last row plotted (either may be left open). */
  from?: number
  to?: number
  style: PlotStyle
  fit: PlotFit
  x: AxisSettings
  y: AxisSettings
  title?: string
}

export const defaultPlotSettings = (): PlotSettings => ({
  style: 'points', fit: 'none', x: { log: false }, y: { log: false },
})

/** A number as typed in a setting: -1.5, 2e-3. */
const NUM = String.raw`[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?`
const ROWS = /^rows\s+(\d*)\s*-\s*(\d*)$/
const ROW = /^rows\s+(\d+)$/
/** `x from 0 to 2`, `x from 0`, `x to 2` (1: axis, 2: from, 3: to). */
const RANGE = new RegExp(String.raw`^([xy])(?:\s+from\s+(${NUM}))?(?:\s+to\s+(${NUM}))?$`)
const TITLE = /^title\s+"([^"]*)"$/

/** Settings text split at its commas, but not inside a quoted title. */
function settingParts(text: string): string[] {
  const parts: string[] = []
  let current = ''
  let quoted = false
  for (const c of text) {
    if (c === '"') quoted = !quoted
    if (c === ',' && !quoted) {
      parts.push(current)
      current = ''
    } else current += c
  }
  parts.push(current)
  return parts.map((p) => p.trim().replace(/\s+/g, ' ')).filter(Boolean)
}

/** A plot's settings from their text, or what's wrong with them. */
export function parsePlotSettings(text: string | undefined): { settings: PlotSettings; error?: string } {
  const s = defaultPlotSettings()
  for (const part of settingParts(text ?? '')) {
    const rows = ROWS.exec(part) ?? (ROW.test(part) ? [part, part.slice(5), part.slice(5)] : null)
    const range = RANGE.exec(part)
    const title = TITLE.exec(part)
    if (rows) {
      s.from = rows[1] ? Number(rows[1]) : undefined
      s.to = rows[2] ? Number(rows[2]) : undefined
    } else if (range && (range[2] !== undefined || range[3] !== undefined)) {
      const axis = s[range[1] as 'x' | 'y']
      axis.from = range[2] !== undefined ? Number(range[2]) : undefined
      axis.to = range[3] !== undefined ? Number(range[3]) : undefined
    } else if (/^style (points|lines|both)$/.test(part)) s.style = part.slice(6) as PlotStyle
    else if (/^fit (none|linear)$/.test(part)) s.fit = part.slice(4) as PlotFit
    else if (part === 'log x') s.x.log = true
    else if (part === 'log y') s.y.log = true
    else if (title) s.title = title[1]
    else {
      return {
        settings: s,
        error: `"${part}" isn't a plot setting: use rows 5-20, style lines (or both), fit linear, `
          + 'x from 0 to 10, log y, or title "…". The plot\'s ⚙ button sets them.',
      }
    }
  }
  return { settings: s }
}

/** An axis range as a setting: `x from 0 to 2` ('' if it's open at both ends). */
const rangeText = (axis: 'x' | 'y', a: AxisSettings) => (a.from === undefined && a.to === undefined ? ''
  : `${axis}${a.from !== undefined ? ` from ${a.from}` : ''}${a.to !== undefined ? ` to ${a.to}` : ''}`)

/** Settings as text, leaving out the defaults ('' if there's nothing to say). */
export function formatPlotSettings(s: PlotSettings): string {
  const parts: string[] = []
  if (s.from !== undefined || s.to !== undefined) {
    parts.push(s.from !== undefined && s.from === s.to ? `rows ${s.from}` : `rows ${s.from ?? ''}-${s.to ?? ''}`)
  }
  if (s.style !== 'points') parts.push(`style ${s.style}`)
  if (s.fit !== 'none') parts.push(`fit ${s.fit}`)
  for (const axis of ['x', 'y'] as const) {
    const range = rangeText(axis, s[axis])
    if (range) parts.push(range)
    if (s[axis].log) parts.push(`log ${axis}`)
  }
  // (A title can't hold a quote mark: it ends the title.)
  if (s.title) parts.push(`title "${s.title.replace(/"/g, '')}"`)
  return parts.join(', ')
}

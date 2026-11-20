/**
 * A plot's settings, kept in the sheet after a semicolon inside its brackets,
 * as a table's are (see tableSettings.ts):
 *
 *   @plot(t, x; style both, fit linear, x from 0 to 2, log y, title "Run 1")
 *
 *   rows 5-20            only rows 5 to 20 (rows 5- from 5 on, rows -20 up to 20)
 *   style lines          lines between the points (style both: points and lines;
 *                        the default is points)
 *   fit linear           a best-fit line, with its slope and intercept
 *   x from 0 to 2        the x axis's range (either end may be left out)
 *   y from … to …        the y axis's
 *   log x, log y         a logarithmic axis
 *   uncertainty off      no error bars (a fit still weighs the points by their uncertainties)
 *   title "Run 1"        a title over the plot
 *
 * The plot's ⚙ button in the editor writes them, so they don't need typing.
 */
import {
  SETTING, UNCERTAINTY_OFF, UNCERTAINTY_ON, formatRowRange, joinSettings, parseRowRange, parseTitle, settingParts, titleSetting,
} from './tableSettings.ts'

/** How a plot's points are drawn: as points, joined by lines, or both. */
export const PLOT_STYLE = { points: 'points', lines: 'lines', both: 'both' } as const
export type PlotStyle = (typeof PLOT_STYLE)[keyof typeof PLOT_STYLE]
export const PLOT_STYLES: readonly PlotStyle[] = Object.values(PLOT_STYLE)

/** A plot's best-fit line: none, or a straight line. */
export const PLOT_FIT = { none: 'none', linear: 'linear' } as const
export type PlotFit = (typeof PLOT_FIT)[keyof typeof PLOT_FIT]
export const PLOT_FITS: readonly PlotFit[] = Object.values(PLOT_FIT)

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
  /** Draw each point's uncertainty as error bars (`uncertainty off`: the points alone; a fit still weighs them by it). */
  uncertainty: boolean
}

export const defaultPlotSettings = (): PlotSettings => ({
  style: PLOT_STYLE.points, fit: PLOT_FIT.none, x: { log: false }, y: { log: false }, uncertainty: true,
})

/** The axes, as written in settings: `x from 0 to 2`, `log y`. */
export const PLOT_AXES = ['x', 'y'] as const
export type PlotAxisName = (typeof PLOT_AXES)[number]

/** A number as typed in a setting: -1.5, 2e-3. */
const NUM = String.raw`[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?`
/** `x from 0 to 2`, `x from 0`, `x to 2` (1: axis, 2: from, 3: to). */
const RANGE = new RegExp(String.raw`^(${PLOT_AXES.join('|')})(?:\s+${SETTING.from}\s+(${NUM}))?(?:\s+${SETTING.to}\s+(${NUM}))?$`)
const STYLE = new RegExp(`^${SETTING.style} (${PLOT_STYLES.join('|')})$`)
const FIT_SETTING = new RegExp(`^${SETTING.fit} (${PLOT_FITS.join('|')})$`)
const LOG = new RegExp(`^${SETTING.log} (${PLOT_AXES.join('|')})$`)

/** A plot's settings from their text, or what's wrong with them. */
export function parsePlotSettings(text: string | undefined): { settings: PlotSettings; error?: string } {
  const s = defaultPlotSettings()
  for (const part of settingParts(text)) {
    const rows = parseRowRange(part)
    const range = RANGE.exec(part)
    const style = STYLE.exec(part)
    const fit = FIT_SETTING.exec(part)
    const log = LOG.exec(part)
    const title = parseTitle(part)
    if (rows) {
      s.from = rows.from
      s.to = rows.to
    } else if (range && (range[2] !== undefined || range[3] !== undefined)) {
      const axis = s[range[1] as PlotAxisName]
      axis.from = range[2] !== undefined ? Number(range[2]) : undefined
      axis.to = range[3] !== undefined ? Number(range[3]) : undefined
    } else if (style) s.style = style[1] as PlotStyle
    else if (fit) s.fit = fit[1] as PlotFit
    else if (log) s[log[1] as PlotAxisName].log = true
    else if (title !== undefined) s.title = title
    else if (part === UNCERTAINTY_OFF) s.uncertainty = false
    else if (part === UNCERTAINTY_ON) s.uncertainty = true
    else {
      return {
        settings: s,
        error: `"${part}" isn't a plot setting: use rows 5-20, style lines (or both), fit linear, `
          + 'x from 0 to 10, log y, uncertainty off, or title "…". The plot\'s ⚙ button sets them.',
      }
    }
  }
  return { settings: s }
}

/** An axis range as a setting: `x from 0 to 2` ('' if it's open at both ends). */
const rangeText = (axis: PlotAxisName, a: AxisSettings) => (a.from === undefined && a.to === undefined ? ''
  : `${axis}${a.from !== undefined ? ` ${SETTING.from} ${a.from}` : ''}${a.to !== undefined ? ` ${SETTING.to} ${a.to}` : ''}`)

/** Settings as text, leaving out the defaults ('' if there's nothing to say). */
export function formatPlotSettings(s: PlotSettings): string {
  const defaults = defaultPlotSettings()
  const parts: string[] = []
  const rows = formatRowRange(s.from, s.to)
  if (rows) parts.push(rows)
  if (s.style !== defaults.style) parts.push(`${SETTING.style} ${s.style}`)
  if (s.fit !== defaults.fit) parts.push(`${SETTING.fit} ${s.fit}`)
  for (const axis of PLOT_AXES) {
    const range = rangeText(axis, s[axis])
    if (range) parts.push(range)
    if (s[axis].log) parts.push(`${SETTING.log} ${axis}`)
  }
  if (!s.uncertainty) parts.push(UNCERTAINTY_OFF)
  if (s.title) parts.push(titleSetting(s.title))
  return joinSettings(parts)
}

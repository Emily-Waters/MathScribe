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
import {
  SETTING, SETTINGS_SEPARATOR, formatRowRange, joinSettings, parseRowRange, tidySetting,
} from './tableSettings.ts'

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
/** A title is quoted, so it can hold commas. */
const QUOTE = '"'
const TITLE = new RegExp(`^${SETTING.title}\\s+${QUOTE}([^${QUOTE}]*)${QUOTE}$`)

/** Settings text split into its settings, but not at a comma inside the quoted title. */
function plotSettingParts(text: string): string[] {
  const parts: string[] = []
  let current = ''
  let quoted = false
  for (const c of text) {
    if (c === QUOTE) quoted = !quoted
    if (c === SETTINGS_SEPARATOR && !quoted) {
      parts.push(current)
      current = ''
    } else current += c
  }
  parts.push(current)
  return parts.map(tidySetting).filter(Boolean)
}

/** A plot's settings from their text, or what's wrong with them. */
export function parsePlotSettings(text: string | undefined): { settings: PlotSettings; error?: string } {
  const s = defaultPlotSettings()
  for (const part of plotSettingParts(text ?? '')) {
    const rows = parseRowRange(part)
    const range = RANGE.exec(part)
    const style = STYLE.exec(part)
    const fit = FIT_SETTING.exec(part)
    const log = LOG.exec(part)
    const title = TITLE.exec(part)
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
  // (A title can't hold a quote mark: it ends the title.)
  if (s.title) parts.push(`${SETTING.title} ${QUOTE}${s.title.replaceAll(QUOTE, '')}${QUOTE}`)
  return joinSettings(parts)
}

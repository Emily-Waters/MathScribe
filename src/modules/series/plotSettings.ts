/**
 * A plot's settings, kept in the sheet after a semicolon inside its brackets,
 * as a table's are: `@plot(t, x; style both, fit linear, x from 0 to 2, log y,
 * legend top right, colour fit red, title "Run 1")`. Each is declared once
 * (PLOT_SETTINGS, below: how it's written and what it does), from which
 * they're read, written back and listed in their error. The plot's ⚙ button in
 * the editor writes them, so they don't need typing.
 */
import {
  ChoiceSetting, RowsSetting, Setting, SettingsSpec, SwitchSetting, TextSetting, TitleSetting, type SettingAbout, type SettingsPanel, type SettingsState,
} from '../../lib/plugin.ts'
import { SETTING } from './tableSettings.ts'

/** How a plot's points are drawn: as points, joined by lines, or both. */
export const PLOT_STYLE = { points: 'points', lines: 'lines', both: 'both' } as const
export type PlotStyle = (typeof PLOT_STYLE)[keyof typeof PLOT_STYLE]
export const PLOT_STYLES: readonly PlotStyle[] = Object.values(PLOT_STYLE)

/** A plot's best-fit line: none, or a straight line. */
export const PLOT_FIT = { none: 'none', linear: 'linear' } as const
export type PlotFit = (typeof PLOT_FIT)[keyof typeof PLOT_FIT]
export const PLOT_FITS: readonly PlotFit[] = Object.values(PLOT_FIT)

/**
 * Where a plot's legend goes: in a corner of the plot, beside it, or nowhere.
 * Without the setting, there's one (top left) when the plot has several series.
 */
export const LEGEND_POSITION = {
  topLeft: 'top left', topRight: 'top right', bottomLeft: 'bottom left', bottomRight: 'bottom right', outside: 'outside', off: 'off',
} as const
export type LegendPosition = (typeof LEGEND_POSITION)[keyof typeof LEGEND_POSITION]
export const LEGEND_POSITIONS: readonly LegendPosition[] = Object.values(LEGEND_POSITION)

/** The colours a plot's parts can be: names the drawing and LaTeX both know (plotGraph.ts gives each its shade). */
export const PLOT_COLOUR = {
  black: 'black', grey: 'grey', blue: 'blue', red: 'red', green: 'green', orange: 'orange', purple: 'purple', teal: 'teal', brown: 'brown',
} as const
export type PlotColour = (typeof PLOT_COLOUR)[keyof typeof PLOT_COLOUR]
export const PLOT_COLOURS: readonly PlotColour[] = Object.values(PLOT_COLOUR)

/** The parts of a series that can each have a colour: its points (and error bars), the line joining them, its fit. */
export const PLOT_PART = { points: 'points', line: 'line', fit: 'fit' } as const
export type PlotPart = (typeof PLOT_PART)[keyof typeof PLOT_PART]
export const PLOT_PARTS: readonly PlotPart[] = Object.values(PLOT_PART)

/** A colour for a part of a plot's series: `colour fit red` (every series'), `colour F_2 points green` (one series'). */
export interface PartColour {
  /** The series it's for, by name, or every series if none. */
  series?: string
  part: PlotPart
  colour: PlotColour
}

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
  /** Show a fit's equation (and R²) under the plot (`equation off`: the line alone; its slope and intercept are still variables). */
  equation: boolean
  /** Where its legend goes; undefined: top left if it has several series, else none. */
  legend?: LegendPosition
  /** Colours chosen for parts of its series, in the order written (a later one for the same part wins). */
  colours: PartColour[]
  /** The x axis's name of one's own, in place of its series' (`xlabel "Extension"`); its unit is still added. */
  xLabel?: string
  /** The y axis's, as xLabel. */
  yLabel?: string
}

export const defaultPlotSettings = (): PlotSettings => ({
  style: PLOT_STYLE.points, fit: PLOT_FIT.none, x: { log: false }, y: { log: false }, uncertainty: true, equation: true, colours: [],
})

/** The colour chosen for a part of a series (by its name), if one is: its own, else every series'. */
export function partColour(s: PlotSettings, series: string | undefined, part: PlotPart): PlotColour | undefined {
  const chosen = s.colours.filter((c) => c.part === part)
  return (chosen.findLast((c) => series !== undefined && c.series === series) ?? chosen.findLast((c) => c.series === undefined))?.colour
}

/** Whether a plot has a legend: as its setting says, or, without one, if it has several series. */
export const showsLegend = (s: PlotSettings, seriesCount: number) => (s.legend === undefined ? seriesCount > 1 : s.legend !== LEGEND_POSITION.off)

/** The axes, as written in settings: `x from 0 to 2`, `log y`. */
export const PLOT_AXES = ['x', 'y'] as const
export type PlotAxisName = (typeof PLOT_AXES)[number]

/** A number as typed in a setting: -1.5, 2e-3. */
const NUM = String.raw`[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?`
/** `x from 0 to 2`, `x from 0`, `x to 2` (1: axis, 2: from, 3: to). */
const RANGE = new RegExp(String.raw`^(${PLOT_AXES.join('|')})(?:\s+${SETTING.from}\s+(${NUM}))?(?:\s+${SETTING.to}\s+(${NUM}))?$`)
const LOG = new RegExp(`^${SETTING.log} (${PLOT_AXES.join('|')})$`)
/** `colour fit red`, `colour F_2 points green`, `color line black` (1: the series, if one; 2: the part; 3: the colour). */
const COLOUR = new RegExp(String.raw`^(?:${SETTING.colour}|${SETTING.color})\s+(?:(\S+)\s+)?(${PLOT_PARTS.join('|')})\s+(${PLOT_COLOURS.join('|')})$`)

/** An axis range as a setting: `x from 0 to 2` ('' if it's open at both ends). */
const rangeText = (axis: PlotAxisName, a: AxisSettings) => (a.from === undefined && a.to === undefined ? ''
  : `${axis}${a.from !== undefined ? ` ${SETTING.from} ${a.from}` : ''}${a.to !== undefined ? ` ${SETTING.to} ${a.to}` : ''}`)

// ---------------------------------------------------------------------------
// A plot's settings, declared (the language's settings: lib/language/settings.ts)
// ---------------------------------------------------------------------------

/** An axis's range and scale, `x from 0 to 2` (either end may be left out) and `log x`: the field `x` or `y` (in the menu, a row of both). */
class AxisSetting extends Setting<PlotSettings> {
  readonly axis: PlotAxisName
  constructor(axis: PlotAxisName, about: SettingAbout) {
    super(about)
    this.axis = axis
  }
  get examples() {
    return [`${this.axis} ${SETTING.from} 0 ${SETTING.to} 10`, `${SETTING.log} ${this.axis}`]
  }
  read(part: string, into: PlotSettings): boolean {
    const range = RANGE.exec(part)
    if (range?.[1] === this.axis && (range[2] !== undefined || range[3] !== undefined)) {
      into[this.axis].from = range[2] !== undefined ? Number(range[2]) : undefined
      into[this.axis].to = range[3] !== undefined ? Number(range[3]) : undefined
      return true
    }
    if (LOG.exec(part)?.[1] !== this.axis) return false
    into[this.axis].log = true
    return true
  }
  write(s: PlotSettings): string[] {
    const range = rangeText(this.axis, s[this.axis])
    return [...(range ? [range] : []), ...(s[this.axis].log ? [`${SETTING.log} ${this.axis}`] : [])]
  }
  protected rows<C>(panel: SettingsPanel<C>, { current, set }: SettingsState<PlotSettings>): C[] {
    const update = (patch: Partial<AxisSettings>) => set({ ...current(), [this.axis]: { ...current()[this.axis], ...patch } })
    const axis = current()[this.axis]
    return [panel.row(this.about.label,
      panel.numberBox(axis.from, 'auto', false, (from) => update({ from })), SETTING.to,
      panel.numberBox(axis.to, 'auto', false, (to) => update({ to })),
      panel.checkBox(axis.log, (log) => update({ log })), SETTING.log)]
  }
}

/** How each part a colour can be chosen for is named in the menu. */
const PART_LABELS: Record<PlotPart, string> = { [PLOT_PART.points]: 'Point colour', [PLOT_PART.line]: 'Line colour', [PLOT_PART.fit]: 'Fit colour' }

/** The menu's choice for a part's colour as it is by itself: each series its own. */
const OWN_COLOUR = { value: '', label: 'auto' } as const

/**
 * A colour for a part of the series, `colour fit red`, or of one series,
 * `colour F_2 points green` (`color` too): the list `colours`. In the menu, a
 * choice for each part, of every series' colour (one series' own are typed).
 */
class ColourSetting extends Setting<PlotSettings> {
  readonly examples = [`${SETTING.colour} ${PLOT_PART.fit} ${PLOT_COLOUR.red}`]
  override get values() {
    return PLOT_COLOURS.map((value) => ({ value, label: value, means: value }))
  }
  read(part: string, into: PlotSettings): boolean {
    const colour = COLOUR.exec(part)
    if (!colour) return false
    into.colours.push({ ...(colour[1] ? { series: colour[1] } : {}), part: colour[2] as PlotPart, colour: colour[3] as PlotColour })
    return true
  }
  write(s: PlotSettings): string[] {
    return s.colours.map((c) => [SETTING.colour, c.series, c.part, c.colour].filter(Boolean).join(' '))
  }
  protected rows<C>(panel: SettingsPanel<C>, { current, set }: SettingsState<PlotSettings>): C[] {
    return PLOT_PARTS.map((part) => {
      const chosen = current().colours.findLast((c) => c.part === part && c.series === undefined)?.colour ?? OWN_COLOUR.value
      // (Choosing one replaces any other for every series; one series' own stay.)
      return panel.row(PART_LABELS[part], panel.choice([OWN_COLOUR, ...this.values], chosen, (colour) => {
        const others = current().colours.filter((c) => c.part !== part || c.series !== undefined)
        set({ ...current(), colours: colour === OWN_COLOUR.value ? others : [...others, { part, colour: colour as PlotColour }] })
      }))
    })
  }
}

/** A plot's settings, each declared once: how it's written, what it does and its ⚙ control, in the order they're written back. */
export const PLOT_SETTINGS = new SettingsSpec<PlotSettings>('plot', defaultPlotSettings, [
  new RowsSetting({ label: 'Rows', summary: 'Only these rows: rows 5-20, rows 5- (from 5 on), rows -20 (up to 20), rows 7.' }),
  new ChoiceSetting(SETTING.style, 'style', [
    { value: PLOT_STYLE.points, label: 'Points', means: 'each row a point (as it is by itself)' },
    { value: PLOT_STYLE.lines, label: 'Lines', means: 'a line joining the rows, without their points' },
    { value: PLOT_STYLE.both, label: 'Points and lines', means: 'the points, joined by a line' },
  ], PLOT_STYLE.both, { label: 'Style', summary: 'How its rows are drawn.' }),
  new ChoiceSetting(SETTING.fit, 'fit', [
    { value: PLOT_FIT.none, label: 'None', means: 'no fit (as it is by itself)' },
    { value: PLOT_FIT.linear, label: 'Linear (best-fit line)', means: 'a best-fit line, its equation under the plot, its slope and intercept variables' },
  ], PLOT_FIT.linear, {
    label: 'Fit',
    summary: 'A line fitted to the points.',
    help: 'A linear fit shows the line’s equation under the plot, and makes its slope and intercept variables: x_slope, x_intercept.',
  }),
  new AxisSetting('x', { label: 'X axis', summary: 'The x axis\'s range (either end may be left out, to fit the data) and, with log x, a logarithmic scale.' }),
  new AxisSetting('y', {
    label: 'Y axis',
    summary: 'The y axis\'s range and, with log y, a logarithmic scale.',
    help: 'Leave an axis box empty to fit it to the data. Points outside an axis’s range are left out: of the fit, and of a named plot’s series (p.x).',
  }),
  new TextSetting(SETTING.xlabel, 'xLabel', 'Extension', {
    label: 'X label',
    summary: 'The x axis’s name, in place of its series’ (its unit is still added: Extension [m]).',
  }),
  new TextSetting(SETTING.ylabel, 'yLabel', 'Force', {
    label: 'Y label',
    summary: 'The y axis’s name, in place of its series’ (its unit is still added: Force [N]).',
  }),
  new SwitchSetting(SETTING.uncertainty, 'uncertainty', {
    label: 'Show uncertainty',
    summary: 'Error bars for the points\' uncertainties; uncertainty off hides them.',
    help: 'Error bars for the points’ uncertainties. A fit still weighs each point by its uncertainty when they’re hidden.',
  }),
  new SwitchSetting(SETTING.equation, 'equation', {
    label: 'Show fit equation',
    summary: 'A fit\'s equation and R² under the plot; equation off leaves them out (its slope and intercept are still variables).',
  }),
  new ChoiceSetting(SETTING.legend, 'legend', [
    { value: LEGEND_POSITION.topLeft, label: 'Top left', means: 'in the top left corner' },
    { value: LEGEND_POSITION.topRight, label: 'Top right', means: 'in the top right corner' },
    { value: LEGEND_POSITION.bottomLeft, label: 'Bottom left', means: 'in the bottom left corner' },
    { value: LEGEND_POSITION.bottomRight, label: 'Bottom right', means: 'in the bottom right corner' },
    { value: LEGEND_POSITION.outside, label: 'Beside the plot', means: 'beside the plot' },
    { value: LEGEND_POSITION.off, label: 'None', means: 'none' },
  ], LEGEND_POSITION.topRight, {
    label: 'Legend',
    summary: 'Where its legend goes, listing each series and fit; without it, top left when there are several series.',
    help: 'Auto: a legend top left when there are several series. Each fit has an entry too.',
  }),
  new ColourSetting({
    label: 'Colours',
    summary: 'A colour for every series\' points (with their error bars), line or fit; colour F_2 points green for one series\'.',
    help: 'Auto: each series its own colour. These are every series’; one series’ own is typed: colour F_2 points green.',
  }),
  new TitleSetting({ label: 'Title', summary: 'A title over the plot, quoted so it can hold commas: title "Run 1".' }),
], [
  // (The ⚙ menu's order: what's plotted, its axes, what's written on it, its colours; in each, boxes and menus, then checkboxes.)
  { title: 'Data', labels: ['Rows', 'Style', 'Fit', 'Show uncertainty'] },
  { title: 'Axes', labels: ['X label', 'Y label', 'X axis', 'Y axis'] },
  { title: 'Labels', labels: ['Title', 'Legend', 'Show fit equation'] },
  { title: 'Colours', labels: ['Colours'] },
])

/** A plot's settings from their text, or what's wrong with them (as declared: PLOT_SETTINGS). */
export const parsePlotSettings = (text: string | undefined) => PLOT_SETTINGS.parse(text)

/** Settings as text, leaving out the defaults ('' if there's nothing to say). */
export const formatPlotSettings = (s: PlotSettings): string => PLOT_SETTINGS.format(s)

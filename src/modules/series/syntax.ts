/**
 * The series module's syntax: `@table(…)` and `@plot(…)`, each a line of its own,
 * and a typed table, `@table { … }`. (A series itself is in square brackets: series.ts.)
 */
import {
  BLOCK_ARGS, SERIES_STAT_SUFFIX, SIGIL, builtinFunctionName, builtinOpening, NAMED, optional, regex, src, words, type WordOf,
} from '../../lib/plugin.ts'

/** The series module's functions, each written after @: `@table(t, x)`. */
export const SERIES_CALL = {
  table: 'table',
  plot: 'plot',
} as const

/** A table of series: `@table(t, x, v = x / t)` (1: what's between the brackets). */
export const TABLE_CALL = new RegExp(String.raw`^${builtinOpening(SERIES_CALL.table)}(.*)\)$`)

/**
 * A typed table's opener: `@table {`, or with its settings in brackets,
 * `@table(title "Observations", lines header) {`. Its rows follow, a line each,
 * their cells between `|`s, up to its `}`.
 */
export const TYPED_TABLE_OPENER = regex(src`^${SIGIL}${SERIES_CALL.table}${optional(BLOCK_ARGS)}\s*\{$`)

/**
 * A plot of series: `@plot(t, x, y)`, or a named one, `p = @plot(t, x; fit linear)`,
 * whose fit is p.slope, p.intercept (1: the name, if any; 2: what's between the brackets).
 */
export const PLOT_CALL = new RegExp(String.raw`^${NAMED}?${builtinOpening(SERIES_CALL.plot)}(.*)\)$`)

/** What a named plot's fit holds: p.slope, p.intercept, p.r2, p.chi2 (a weighted fit's). */
export const FIT = words({ slope: 'slope', intercept: 'intercept', r2: 'r2', chi2: 'chi2' })
export type FitMember = WordOf<typeof FIT>

/** mathjs's functions that, given a series on its own, `max(t)`, pick one of its members (extremes.ts). */
export const SERIES_EXTREME = words({ max: 'max', min: 'min' })
export type SeriesExtreme = WordOf<typeof SERIES_EXTREME>

/**
 * The function each stands for once it's picked its member, `max(t)` as
 * builtin__seriesMax(t__3): it gives the member's value, and is written as the
 * call was typed (a name the sheet can't write, so its own functions never clash).
 */
export const PICKED_FUNCTION = {
  [SERIES_EXTREME.max]: builtinFunctionName('seriesMax'),
  [SERIES_EXTREME.min]: builtinFunctionName('seriesMin'),
} as const satisfies Record<SeriesExtreme, string>

/**
 * What a list in a formula can be followed by, `[1, 2, 3].sum` and `.avg`, and the
 * function each stands for around the values added up (listStats.ts): a name
 * the sheet can't write, written as `\sum[1, 2, 3]`.
 */
export const LIST_STAT_FUNCTION = {
  [SERIES_STAT_SUFFIX.sum]: builtinFunctionName('listSum'),
  [SERIES_STAT_SUFFIX.avg]: builtinFunctionName('listAvg'),
} as const
export type ListStat = keyof typeof LIST_STAT_FUNCTION

/** A series' values spread in place, `[...x, 11 s]`, or the rest of them gathered, `[a, ...rest] = x`. */
export const SPREAD = '...'

/** The calls with settings after a semicolon, and their ⚙ in the editor. */
export const CALLS_WITH_SETTINGS = [SERIES_CALL.table, SERIES_CALL.plot] as const
export type CallWithSettings = (typeof CALLS_WITH_SETTINGS)[number]

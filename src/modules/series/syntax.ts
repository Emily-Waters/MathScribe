/** The series module's syntax: `@table(…)`, `@plot(…)` and `@select(…)`, each a line of its own. */
import { builtinOpening, NAME, NAMED, SIGIL } from '../../lib/plugin.ts'

/** The series module's functions, each written after @: `@table(t, x)`. */
export const SERIES_CALL = {
  table: 'table',
  plot: 'plot',
  select: 'select',
} as const

/** A table of series: `@table(t, x, v = x / t)` (1: what's between the brackets). */
export const TABLE_CALL = new RegExp(String.raw`^${builtinOpening(SERIES_CALL.table)}(.*)\)$`)

/**
 * A plot of series: `@plot(t, x, y)`, or a named one, `p = @plot(t, x; fit linear)`,
 * whose fit is p.slope, p.intercept (1: the name, if any; 2: what's between the brackets).
 */
export const PLOT_CALL = new RegExp(String.raw`^${NAMED}?${builtinOpening(SERIES_CALL.plot)}(.*)\)$`)

/** A slice of series: `a = @select(t, x; t from 0.2 to 0.8)` (1: its name, 2: what's between the brackets). */
export const SELECT_CALL = new RegExp(String.raw`^${NAMED}${builtinOpening(SERIES_CALL.select)}(.*)\)$`)

/** The calls with settings after a semicolon, and their ⚙ in the editor. */
export const CALLS_WITH_SETTINGS = [SERIES_CALL.table, SERIES_CALL.plot] as const
export type CallWithSettings = (typeof CALLS_WITH_SETTINGS)[number]

/** A line that opens a call with settings (1: what's before it, a plot's name too; 2: which call). */
export const SETTINGS_CALL_OPENING = new RegExp(String.raw`^(\s*(?:${NAME}\s*=\s*)?)${SIGIL}(${CALLS_WITH_SETTINGS.join('|')})\s*\(`)

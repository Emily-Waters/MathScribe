/** The solve module's syntax: `x = @solve(…)`, and a system, `@tuple(x, y) = @solve(…)`. */
import { builtinOpening, NAMED, regex, src } from '../../lib/plugin.ts'

/** The solve module's function, written after @: `@solve(equation, unknown)`. */
export const SOLVE_FUNCTION = 'solve'

/** `x = @solve(…`, or a bare `@solve(…` (1: the name assigned, if any). */
export const SOLVE_CALL = regex(src`^${NAMED}?${builtinOpening(SOLVE_FUNCTION)}`)

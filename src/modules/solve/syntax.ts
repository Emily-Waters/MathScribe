/** The solve module's syntax: `x = @solve(…)`, and a system, `@tuple(x, y) = @solve(…)`. */
import { builtinOpening, NAMED } from '../../lib/plugin.ts'

/** The solve module's function, written after @: `@solve(equation, unknown)`. */
export const SOLVE_FUNCTION = 'solve'

/** `x = @solve(…`, or a bare `@solve(…` (1: the name assigned, if any). */
export const SOLVE_CALL = new RegExp(String.raw`^${NAMED}?${builtinOpening(SOLVE_FUNCTION)}`)

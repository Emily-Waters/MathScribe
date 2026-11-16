/** The solve module's syntax: `x = @solve(…)`, and a system, `@tuple(x, y) = @solve(…)`. */
import { NAMED, UNPACK_TARGETS, builtinOpening } from '../../../syntax.ts'

/** The solve module's function, written after @: `@solve(equation, unknown)`. */
export const SOLVE_FUNCTION = 'solve'

/** `x = @solve(…`, or a bare `@solve(…` (1: the name assigned, if any). */
export const SOLVE_CALL = new RegExp(String.raw`^${NAMED}?${builtinOpening(SOLVE_FUNCTION)}`)

/**
 * A system of equations solved for the names on the left:
 * `@tuple(v_1, v_2) = @solve(m_1*u = m_1*v_1 + m_2*v_2, u = v_2 - v_1)`
 * (1: the unknowns, 2: the equations).
 */
export const SOLVE_SYSTEM = new RegExp(String.raw`^${UNPACK_TARGETS}\s*${builtinOpening(SOLVE_FUNCTION)}(.*)\)$`)

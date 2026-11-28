/** The formula module's syntax: `@formula { F = m * a }`. */
import { blockOpener } from '../../lib/plugin.ts'

/** The block of formulas, written after @: `@formula { … }`. */
export const FORMULA_BLOCK = 'formula'

/** The opener of an `@formula { }` block. */
export const FORMULA_OPENER = blockOpener(FORMULA_BLOCK)

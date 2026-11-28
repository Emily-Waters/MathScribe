/**
 * The vectors module's syntax: a vector typed `<3.0, 4.0> N` (or `@vector(…)`),
 * the settings on a name that show one with unit vectors (`F:ijk`) or break it
 * into components (`F:xyz`), and how it's drawn.
 */
import {
  SUBSCRIPT_GROUP, TEX_ANGLE, TEX_ESCAPE, TEX_SIZED, builtinFunctionName, lit, named, optional, regex, src,
} from '../../lib/plugin.ts'

/** A vector's brackets, as typed: `<3.0, 4.0> N`. */
export const ANGLE_BRACKETS = { open: '<', close: '>' } as const

/** A vector typed with its function: `@vector(3.0, 4.0) N`, the same as `<3.0, 4.0> N`. */
export const VECTOR_CALL = 'vector'

/** The function a vector is made with, as mathjs holds it (`<3.0, 4.0> N` and `@vector(…)` are read as a call to it). */
export const VECTOR_FUNCTION = builtinFunctionName(VECTOR_CALL)

/** Show a vector with unit vectors, (3.0 î + 4.0 ĵ) N: `F:ijk = …`. */
export const UNIT_VECTOR_SETTING = 'ijk'

/** Break a vector into its components, each a variable of its own (F_x, F_y, F_z): `F:xyz = …`. */
export const COMPONENTS_SETTING = 'xyz'

/** The settings on a name that are the vectors module's. */
export const VECTOR_SETTINGS: readonly string[] = [UNIT_VECTOR_SETTING, COMPONENTS_SETTING]

/** The axes of a vector's components, in order: F_x, F_y, F_z. */
export const AXES = ['x', 'y', 'z'] as const

/**
 * How a vector is shown (its tuple's look; see TupleLook): ⟨3.0, 4.0⟩ N, or with
 * unit vectors, (3.0 î + 4.0 ĵ) N. The more specific look wins when a vector is
 * made from both.
 */
export const VECTOR_LOOK = { angle: 'angle', unitVectors: UNIT_VECTOR_SETTING } as const
export type VectorLook = (typeof VECTOR_LOOK)[keyof typeof VECTOR_LOOK]
export const VECTOR_LOOKS: readonly VectorLook[] = Object.values(VECTOR_LOOK)

/** The unit vectors î, ĵ, k̂, one per axis. */
export const UNIT_VECTOR_TEX = ['\\hat{\\imath}', '\\hat{\\jmath}', '\\hat{k}'] as const

/** The vector products, written as operators: dot(a, b) → a · b, cross(a, b) → a × b. */
export const VECTOR_PRODUCTS = { dot: '\\cdot', cross: '\\times' } as const

/**
 * The arrow over a vector's name, F⃗: one over a letter (F, θ), and one that
 * stretches over a wider name (vel).
 */
export const VECTOR_ARROW = { letter: '\\vec', wide: '\\overrightarrow' } as const

/** A name as LaTeX, split so its arrow goes over the letter and not its subscript: F_{\mathrm{net}} (1: F, 2: _{\mathrm{net}}). */
export const NAME_TEX = regex(src`^${named('base', '.*?')}${optional(named('subscript', SUBSCRIPT_GROUP))}$`)

/** A name as LaTeX that's a single letter, Latin or Greek: F, \theta. */
export const LETTER_TEX = regex(src`^(?:[A-Za-z]|${lit(TEX_ESCAPE)}[A-Za-z]+)$`)

/** A vector's brackets, ⟨ ⟩. */
export const VECTOR_BRACKETS = { open: `${TEX_SIZED.open}${TEX_ANGLE.open} `, close: `${TEX_SIZED.close}${TEX_ANGLE.close}` } as const

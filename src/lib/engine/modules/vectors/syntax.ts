/**
 * The vectors module's syntax: a vector typed `<3.0, 4.0> N` (or `@vector(…)`),
 * the settings on a name that show one with unit vectors (`F:ijk`) or break it
 * into components (`F:xyz`), and how it's drawn.
 */
import { builtinFunctionName } from '../../../names.ts'

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

/** A vector's brackets, ⟨ ⟩. */
export const VECTOR_BRACKETS = { open: '\\left\\langle ', close: '\\right\\rangle' } as const

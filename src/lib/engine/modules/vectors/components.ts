/** A vector's components, as the variables `F:xyz` makes: F → F_x, F_y (and F_z). */
import { SUBSCRIPT } from '../../../syntax.ts'
import { isTuple } from '../../core/math.ts'
import type { DerivedVariable } from '../../core/module.ts'
import { ExplainedError } from '../../core/results.ts'
import { AXES, COMPONENTS_SETTING } from './syntax.ts'

/** The fewest components a vector has. */
const FEWEST_COMPONENTS = 2

export function componentsOf(name: string, value: unknown): DerivedVariable[] {
  const values = isTuple(value) ? value.toArray() as unknown[] : null
  if (!values || values.length < FEWEST_COMPONENTS || values.length > AXES.length) {
    throw new ExplainedError(`${name}:${COMPONENTS_SETTING} needs a vector of ${FEWEST_COMPONENTS} or ${AXES.length} values, like <3.0, 4.0> N.`)
  }
  return values.map((v, i) => ({ name: `${name}${SUBSCRIPT}${AXES[i]}`, value: v, component: i }))
}

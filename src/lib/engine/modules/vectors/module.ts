/**
 * Vectors as an engine module: a vector is a tuple (the core's) with a look of
 * its own. Typed `<3.0, 4.0> N` (or `@vector(…)`), it's shown ⟨3.0, 4.0⟩ N, or with
 * unit vectors, (3.0 î + 4.0 ĵ) N, with `F:ijk`; `F:xyz` makes its components
 * variables (F_x, F_y); dot(a, b) and cross(a, b) are written a · b and a × b.
 * Everything that works on tuples works on vectors: this only adds how they're
 * written and shown.
 */
import type { FunctionNode, MathNode, MathType } from 'mathjs'
import { FunctionMember, type Expansion, type Member } from '../../../builtins.ts'
import { math } from '../../core/math.ts'
import {
  EngineModule, SETTING_PLACE, type DerivedVariable, type ModuleGrammar, type LookSetting, type ModuleHost, type SettingPlace, type TupleLook,
} from '../../core/module.ts'
import { SIDE, needsBrackets } from '../../core/products.ts'
import { attachUnit } from '../../core/tex.ts'
import { componentsOf } from './components.ts'
import { VECTOR_GRAMMAR, VECTOR_WRITERS, hasVector } from './grammar.ts'
import type { PartWriter } from '../../core/writer.ts'
import {
  COMPONENTS_SETTING, UNIT_VECTOR_SETTING, UNIT_VECTOR_TEX, VECTOR_BRACKETS, VECTOR_CALL, VECTOR_FUNCTION, VECTOR_LOOK, VECTOR_LOOKS,
  VECTOR_PRODUCTS, VECTOR_SETTINGS, type VectorLook,
} from './syntax.ts'

/** Whether a look is a vector's. */
const isVectorLook = (look: TupleLook | undefined): look is VectorLook => (VECTOR_LOOKS as readonly (string | undefined)[]).includes(look)

/** Whether a function is a vector product, written as an operator. */
const isProduct = (name: string): name is keyof typeof VECTOR_PRODUCTS => Object.hasOwn(VECTOR_PRODUCTS, name)

/** `@vector(3.0, 4.0) N`: a vector, the same as `<3.0, 4.0> N`. */
class VectorFunction extends FunctionMember {
  readonly parameters = 'x, y, …'

  constructor() {
    super(VECTOR_CALL, 'A vector, the same as <x, y, …>')
  }

  expand(args: string): Expansion {
    return { text: `${VECTOR_FUNCTION}(${args})` }
  }
}

export class VectorModule extends EngineModule {
  // -------------------------------------------------------------------------
  // Shared
  // -------------------------------------------------------------------------

  /** VECTOR_FUNCTION(3.0, 4.0): a tuple like any other (so everything that works on tuples works on it). */
  override install(): void {
    math.import({ [VECTOR_FUNCTION]: (...values: MathType[]) => math.matrix(values as never) })
  }

  /** `@vector(3.0, 4.0)`, the same as `<3.0, 4.0>`. */
  /** Its part of a sheet's tree: a vector, `<3.0, 4.0>`, read as a node. */
  override grammar(): ModuleGrammar {
    return VECTOR_GRAMMAR
  }

  override builtinMembers(): Member[] {
    return [new VectorFunction()]
  }

  /** `<3.0, 4.0>` → `VECTOR_FUNCTION(3.0, 4.0)` (with a unit, it's in a quantity: the core writes that). */
  override writers(): Readonly<Record<string, PartWriter>> {
    return VECTOR_WRITERS
  }

  override bareTupleHint(bare: string): string {
    return `for a vector, write <${bare.slice(1, -1)}>`
  }

  override readonly lineSettings: readonly string[] = VECTOR_SETTINGS

  override settingProblem(name: string, setting: string, place: SettingPlace): string | undefined {
    if (place === SETTING_PLACE.unpacked && VECTOR_SETTINGS.includes(setting)) {
      return `${name}:${setting} is for a vector, but an unpacked name gets a single value.`
    }
    if (place === SETTING_PLACE.functionResult && setting === COMPONENTS_SETTING) {
      return `${name}:${COMPONENTS_SETTING} isn't available on a function; use it on the variable that stores the result.`
    }
    return undefined
  }

  // -------------------------------------------------------------------------
  // Per calculator
  // -------------------------------------------------------------------------

  /** ⟨3.0, 4.0⟩, and dot and cross products as operators, F · d and a × b (unless the sheet has its own dot or cross). */
  override functionTex(n: FunctionNode, tex: (n: MathNode) => string, host: ModuleHost): string | undefined {
    const name = n.fn.name
    if (name === VECTOR_FUNCTION) return `${VECTOR_BRACKETS.open}${n.args.map(tex).join(', ')}${VECTOR_BRACKETS.close}`
    if (!isProduct(name) || n.args.length !== 2 || typeof host.value(name) === 'function') return undefined
    // (Bracketing an argument only where it needs it, such as a sum.)
    const [a, b] = n.args.map((arg, i) => {
      const written = tex(arg)
      return needsBrackets(arg, i === 0 ? SIDE.left : SIDE.right) ? `\\left(${written}\\right)` : written
    })
    return ` ${a} ${VECTOR_PRODUCTS[name]} ${b}`
  }

  override readonly typedTupleFunctions: readonly string[] = [VECTOR_FUNCTION]

  override lookOfFunction(name: string): TupleLook | undefined {
    return name === VECTOR_FUNCTION ? VECTOR_LOOK.angle : undefined
  }

  override lookOfWritten(text: string): TupleLook | undefined {
    return hasVector(text) ? VECTOR_LOOK.angle : undefined
  }

  /** With unit vectors if any vector it's made from is (`F:ijk`), else ⟨…⟩ if it's made from a vector at all. */
  override chooseLook(looks: readonly (TupleLook | undefined)[]): TupleLook | undefined {
    if (looks.includes(VECTOR_LOOK.unitVectors)) return VECTOR_LOOK.unitVectors
    return looks.includes(VECTOR_LOOK.angle) ? VECTOR_LOOK.angle : undefined
  }

  /** ⟨3.0, 4.0⟩ N, or with unit vectors, (3.0 î + 4.0 ĵ) N (a vector of 2 or 3 values; others in ⟨…⟩). */
  override tupleTex(values: readonly string[], sharedUnit: string, look: TupleLook): string | undefined {
    if (!isVectorLook(look)) return undefined
    if (look === VECTOR_LOOK.unitVectors && values.length >= 2 && values.length <= UNIT_VECTOR_TEX.length) {
      // 3.0 î − 4.0 ĵ: each value's sign joins the terms.
      const sum = values.map((tex, i) => {
        const negative = tex.startsWith('-')
        const term = `${negative ? tex.slice(1) : tex}\\,${UNIT_VECTOR_TEX[i]}`
        if (i === 0) return negative ? `-${term}` : term
        return `${negative ? '-' : '+'} ${term}`
      }).join(' ')
      // (Plain brackets: \left( would grow to fit the hats.)
      return sharedUnit ? attachUnit(`(${sum})`, sharedUnit) : sum
    }
    return attachUnit(`${VECTOR_BRACKETS.open}${values.join(', ')}${VECTOR_BRACKETS.close}`, sharedUnit)
  }

  /** `F:ijk`: with unit vectors. */
  override lookSetting(settings: readonly string[]): LookSetting | undefined {
    return settings.includes(UNIT_VECTOR_SETTING)
      ? { look: VECTOR_LOOK.unitVectors, notATuple: `:${UNIT_VECTOR_SETTING} is ignored because the result isn't a vector.` }
      : undefined
  }

  /** `F:xyz`: its components, F_x, F_y (and F_z). */
  override derivedVariables(name: string, value: unknown, settings: readonly string[]): DerivedVariable[] {
    return settings.includes(COMPONENTS_SETTING) ? componentsOf(name, value) : []
  }
}

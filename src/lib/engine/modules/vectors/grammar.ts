/** The vectors module's part of a sheet's tree: a vector typed `<3.0, 4.0> N`, read as a node holding its values. */
import type { ModuleGrammar } from '../../core/module.ts'
import { TOKEN_KIND } from '../../../tree/nodes.ts'
import { node, token, withUnit, type LexRule } from '../../../tree/lexer.ts'
import { vectorEnd } from './literals.ts'

/** The vectors module's kinds of node. */
export const VECTOR_NODE = {
  /** `<3.0, 4.0>`: a vector's values in angle brackets (with a unit after it, it's in a quantity). */
  vector: 'vector',
} as const

/** A vector's brackets, as typed. */
const ANGLE = { open: '<', close: '>' } as const

const VECTOR_RULE: LexRule = {
  describes: 'a vector, <3.0, 4.0>, where a value can start (otherwise < is a comparison); with a unit after it, a quantity',
  read: (pos, state, span) => {
    if (state.text[pos] !== ANGLE.open) return undefined
    const end = vectorEnd(state.text, pos)
    if (end < 0 || end >= state.end) return undefined
    const vector = node(VECTOR_NODE.vector, [
      token(TOKEN_KIND.delimiter, ANGLE.open), ...span(pos + 1, end), token(TOKEN_KIND.delimiter, ANGLE.close),
    ])
    return withUnit(vector, end + 1 - pos, pos, state)
  },
}

export const VECTOR_GRAMMAR: ModuleGrammar = {
  nodeKinds: { [VECTOR_NODE.vector]: 'A vector’s values in angle brackets: <3.0, 4.0>' } satisfies Record<(typeof VECTOR_NODE)[keyof typeof VECTOR_NODE], string>,
  lexRules: [VECTOR_RULE],
}

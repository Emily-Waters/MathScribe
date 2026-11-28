/**
 * The vectors module's part of a sheet's tree: a vector typed `<3.0, 4.0> N`,
 * read as a node holding its values; and how that node is written for mathjs.
 */
import {
  builtinOpening, isToken, lexExpression, type LexRule, type ModuleGrammar, node, type Part, type PartWriter, token,
  TOKEN_KIND, withUnit,
} from '../../lib/plugin.ts'
import { ANGLE_BRACKETS, VECTOR_CALL, VECTOR_FUNCTION } from './syntax.ts'
import { vectorEnd, vectorPending } from './literals.ts'

/** The vectors module's kinds of node. */
export const VECTOR_NODE = {
  /** `<3.0, 4.0>`: a vector's values in angle brackets (with a unit after it, it's in a quantity). */
  vector: 'vector',
} as const

const ANGLE = ANGLE_BRACKETS

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
  // (A `<` that a later line's `>` could still close into a vector.)
  pending: (text, pos) => text[pos] === ANGLE.open && vectorPending(text, pos),
}

/** Whether parts hold a vector `<…>`, at any depth. */
const holdsVector = (parts: readonly Part[]): boolean =>
  parts.some((p) => !isToken(p) && (p.kind === VECTOR_NODE.vector || holdsVector(p.parts)))

/** A call to `@vector`, as typed: `@vector(`. */
const VECTOR_CALL_OPENING = new RegExp(builtinOpening(VECTOR_CALL))

/** Whether some text has a vector written `<…>` or `@vector(…)` in it. */
export const hasVector = (src: string) => holdsVector(lexExpression(src)) || VECTOR_CALL_OPENING.test(src)

/** A vector written as mathjs reads it: `<3.0, 4.0>` → VECTOR_FUNCTION(3.0, 4.0) (core/writer.ts). */
export const VECTOR_WRITERS: Readonly<Record<string, PartWriter>> = {
  [VECTOR_NODE.vector]: ({ part, write }) =>
    (isToken(part) ? undefined : { text: `${VECTOR_FUNCTION}(${write(part.parts.slice(1, -1))})` }),
}

export const VECTOR_GRAMMAR: ModuleGrammar = {
  nodeKinds: { [VECTOR_NODE.vector]: 'A vector’s values in angle brackets: <3.0, 4.0>' } satisfies Record<(typeof VECTOR_NODE)[keyof typeof VECTOR_NODE], string>,
  lexRules: [VECTOR_RULE],
}

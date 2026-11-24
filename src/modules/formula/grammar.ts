/**
 * The formula module's part of a sheet's tree: an `@formula { }` block, and
 * the context of its lines.
 */
import { BODY_END, CONTENT, LINE_CONTEXT, type ModuleGrammar } from '../../lib/plugin.ts'
import { FORMULA_OPENER } from './syntax.ts'

/** The formula module's kinds of node. */
export const FORMULA_NODE = {
  /** `@formula {`. */
  opener: 'formulaOpener',
  /** A formula in one: `F = m * a`. */
  line: 'formulaLine',
  /** An `@formula` block: its opener, its formulas, and its `}`. */
  block: 'formula',
} as const

/** The context of an `@formula { }` block's lines: each a formula, its names symbols. */
const FORMULA_CONTEXT = 'formula'

export const FORMULA_GRAMMAR: ModuleGrammar = {
  nodeKinds: {
    [FORMULA_NODE.opener]: 'An @formula block’s opener: @formula {',
    [FORMULA_NODE.line]: 'A formula in an @formula block: F = m * a',
    [FORMULA_NODE.block]: 'An @formula block: its opener, its formulas, and its }',
  } satisfies Record<(typeof FORMULA_NODE)[keyof typeof FORMULA_NODE], string>,
  contexts: [{ name: FORMULA_CONTEXT, lineKind: FORMULA_NODE.line, content: CONTENT.expression }],
  syntaxes: [
    {
      kind: FORMULA_NODE.opener, contexts: [LINE_CONTEXT.sheet], content: CONTENT.opener,
      matches: (_, split) => FORMULA_OPENER.test(split().body),
      opens: { node: FORMULA_NODE.block, context: FORMULA_CONTEXT, ends: BODY_END.brace },
    },
  ],
}

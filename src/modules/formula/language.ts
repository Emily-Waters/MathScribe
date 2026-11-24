/**
 * The formula module's topics of the language tree (lib/language/tree.ts): what
 * a formula is, and a sheet showing it, which the Reference tab shows live and
 * the tests check.
 */
import type { PlacedTopic } from '../../lib/plugin.ts'

/** Its topics, each placed after the core's topic it follows. */
export const FORMULA_TOPICS: readonly PlacedTopic[] = [
  {
    id: 'formulas',
    title: 'Formulas',
    after: 'functions',
    entries: [
      {
        explain: '@formula { … } is a card of formulas: each line is typeset, not worked out, and every name in it '
          + 'is a symbol.',
        rules: [
          'A name in a formula is never a value, a unit or a constant: in E_k = 1/2 m v^2, m is a mass, not metres.',
          'A formula states a relation; it doesn\'t define anything. Work a value out on a calculation line, '
            + 'or with @solve.',
          'Each = in a line sets its sides apart: p V = n R T, or a = v / t = 2 d / t^2.',
          'Write formulas here, not in @latex: @latex is for what MathScribe can\'t write.',
        ],
        examples: [{
          source: [
            '@formula {',
            '    F = m * a',
            '    E_k = 1/2 m v^2',
            '    p V = n R T',
            '}',
          ].join('\n'),
        }],
      },
    ],
  },
]

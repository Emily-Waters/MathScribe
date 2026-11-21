/**
 * The solve module's topics of the language tree (lib/language/tree.ts): each
 * feature, what's said about it, and whole sheets showing it, which the
 * Reference tab shows live and the tests check.
 */
import type { PlacedTopic } from '../../lib/plugin.ts'

/** Its topics, each placed after the core's topic it follows. */
export const SOLVE_TOPICS: readonly PlacedTopic[] = [
  {
    id: 'solving',
    title: 'Solving',
    after: 'layout',
    entries: [
      {
        explain: '@solve(equation, unknown) rearranges for the unknown and evaluates it.',
        examples: [{
          source: [
            'v = 5.00 m/s',
            'a = 2.00 m/s^2',
            'd = @solve(v^2 = 2*a*d, d)',
          ].join('\n'),
        }],
      },
      {
        explain: 'Several unknowns: name them in @tuple(…) on the left, and give as many equations. They are solved by '
          + 'substitution, and the working shows each unknown in turn.',
        examples: [{
          source: [
            'm_1 = 3.00 kg',
            'm_2 = 5.00 kg',
            '@tuple(T, a) = @solve(T - m_1 * @g = m_1 * a, m_2 * @g - T = m_2 * a)',
          ].join('\n'),
        }],
      },
    ],
  },
]

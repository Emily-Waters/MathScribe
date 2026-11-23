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
        rules: [
          'Give a guess for a hard one: @solve(x = cos(x), x, 0.5).',
          'The result is an ordinary formula: units, sig figs, uncertainty, @layout.sym and @layout.val work.',
          '@solve(…) is the whole right-hand side, with to after it if wanted: theta = @solve(…, theta) to '
            + 'deg. On a line of its own, without =, it shows the answer without keeping it.',
          'The unknown is solved for even if it has a value; assigning the result replaces it.',
          'It rearranges when the unknown appears once, collects terms when it\'s linear, uses the quadratic '
            + 'formula when quadratic, and otherwise works numerically from a guess (which sets the units too: '
            + '@solve(…, T, 300 K)).',
          'With more than one solution (x², √, sin, cos, |x|, a quadratic), the principal or positive one is '
            + 'used and the others are noted; a guess chooses the one nearest it.',
          'to percent isn\'t supported on a solve line yet.',
        ],
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
        rules: [
          'Give as many equations as unknowns: linear ones, or ones easily rearranged.',
          'They\'re solved by substitution, as by hand; the working shows each unknown\'s formula, values and '
            + 'result.',
          'Each unknown is an ordinary variable afterwards; settings go on the names: @tuple(T:3, a:2) = ….',
          'Each step must be one a single equation\'s solve can do; of a quadratic\'s two solutions the first is '
            + 'used. Equations that contradict or repeat each other give an error.',
        ],
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

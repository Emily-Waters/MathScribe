/**
 * The vectors module's topics of the language tree (lib/language/tree.ts): each
 * feature, what's said about it, and whole sheets showing it, which the
 * Reference tab shows live and the tests check.
 */
import type { PlacedTopic } from '../../lib/plugin.ts'

/** Its topics, each placed after the core's topic it follows. */
export const VECTOR_TOPICS: readonly PlacedTopic[] = [
  {
    id: 'vectors',
    title: 'Vectors',
    after: 'functions',
    entries: [
      {
        explain: '<…> is a vector, shown ⟨…⟩. A unit after the > applies to every component. Vectors scale and add, '
          + 'and norm, dot and cross work on them.',
        examples: [{
          source: [
            'F = <3.0, 4.0> N',
            'F_2 = 2 * F + <1.0, -1.0> N',
            'mag = norm(F)',
          ].join('\n'),
        }],
      },
      {
        explain: 'name:ijk shows a vector with unit vectors, î ĵ k̂. Vectors worked out from it are shown that way '
          + 'too.',
        examples: [{
          source: [
            'v:ijk = <2.0, -1.5, 4.0> m/s',
            'w = 2 * v',
          ].join('\n'),
        }],
      },
      {
        explain: 'name:xyz also makes each component a variable of its own, a_x, a_y (and a_z), shown under the '
          + 'vector.',
        examples: [{
          source: [
            'a:xyz = <0.50, -9.81> m/s^2',
            't = 2.0 s',
            'd_y = 1/2 * a_y * t^2',
          ].join('\n'),
        }],
      },
    ],
  },
]

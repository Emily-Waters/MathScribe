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
        rules: [
          'A name holding a vector is shown with an arrow over it, F⃗, wherever it\'s used: over the letter, '
            + 'not its subscript (F⃗_net). Its components and its norm are numbers, so they have none.',
          '@vector(3.0, 4.0) is the same vector as <3.0, 4.0>, written as a call.',
          'A vector is a tuple, so everything that works on tuples works on it: scaling, adding, to, norm, '
            + 'dot, cross and unpacking.',
          'What\'s worked out from a vector is a vector, and so is a function\'s result when its body writes one '
            + '(f(x) = <x, 2*x>); a plain tuple stays a tuple.',
          'Each typed component keeps its own sig figs; what\'s worked out has the fewest of its components\'.',
          '< starts a vector only where a value can start, and with a comma inside, so a < b is still a '
            + 'comparison.',
        ],
        examples: [{
          source: [
            'F = <3.0, 4.0> N',
            'F_2 = 2 * F + <1.0, -1.0> N',
            'mag = norm(F)',
          ].join('\n'),
        }, {
          source: [
            'v = @vector(3.0 m/s, 4.0 m/s)',
            'speed = norm(v)',
          ].join('\n'),
        }],
      },
      {
        explain: 'name:ijk shows a vector with unit vectors, î ĵ k̂. Vectors worked out from it are shown that way '
          + 'too.',
        rules: [
          'It works on a function\'s result: f(x):ijk = ….',
        ],
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
        rules: [
          'It combines with the other settings (F_net:3:ijk:xyz) and works in function bodies. In @layout.sym, '
            + 'the components are made but not shown.',
        ],
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

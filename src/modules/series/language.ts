/**
 * The series module's topics of the language tree (lib/language/tree.ts): each
 * feature, what's said about it, and whole sheets showing it, which the
 * Reference tab shows live and the tests check.
 */
import type { PlacedTopic } from '../../lib/plugin.ts'

/** Its topics, each placed after the core's topic it follows. */
export const SERIES_TOPICS: readonly PlacedTopic[] = [
  {
    id: 'series',
    title: 'Repeated measurements',
    after: 'uncertainty',
    entries: [
      {
        explain: 'Numbered variables form a series: t_avg is the mean ± standard error, t_count the count, t the sum.',
        examples: [{
          source: [
            't_1 = 1.21 s',
            't_2 = 1.17 s',
            't_3 = 1.24 s',
            't_avg',
            't_count',
            't',
          ].join('\n'),
        }],
      },
      {
        explain: '@import() opens a file chooser for a CSV file. Its rows go into the sheet under the line, folded '
          + 'away, and each value becomes a variable named for its column and row: t_1, t_2, …. A unit in a '
          + 'header, t (s), goes with that column.',
        examples: [{
          source: [
            '@import("ramp.csv")',
            '    t (s), d (m)',
            '    1.21, 3.50',
            '    1.17, 3.48',
            '    1.24, 3.52',
            't_avg',
            'v = d_2 / t_2',
          ].join('\n'),
        }],
      },
      {
        explain: '@table(…) shows series side by side, a row per number. name = … works out a column row by row, and '
          + 'makes it a series of its own (v_1, v_2, …), so v_avg works afterwards.',
        examples: [{
          source: [
            't1 = 1.21 s',
            't2 = 1.17 s',
            't3 = 1.24 s',
            'd1 = 3.50 m',
            'd2 = 3.48 m',
            'd3 = 3.52 m',
            '@table(t, d, v = d / t)',
            'v_avg',
          ].join('\n'),
        }],
      },
      {
        explain: '@series(…) makes a series on one line: its values listed (F_1, F_2, F_3), or a rule worked out row '
          + 'by row from other series, with any other name used as it is. Series of different lengths use the '
          + 'rows they all have (with a warning); ; rows 2-5 works out just those.',
        examples: [{
          source: [
            'F = @series(2.00 N, 3.00 N, 10.0 N)',
            'g_0 = 9.81 m/s^2 pm 0.02 m/s^2',
            'm = @series(F / g_0)',
            'm_avg',
          ].join('\n'),
        }],
      },
      {
        explain: '@plot(x axis, y series…) draws one series against another, with error bars for uncertainties. fit '
          + 'linear adds a best-fit line and its equation, and makes its slope and intercept variables: x_slope, '
          + 'x_intercept. Its settings, after a semicolon, are listed under Settings below; the ⚙ after it sets '
          + 'them too.',
        examples: [{
          source: [
            't1 = 0.10 s',
            't2 = 0.20 s',
            't3 = 0.30 s',
            't4 = 0.40 s',
            'x1 = 0.051 m pm 0.004 m',
            'x2 = 0.098 m pm 0.004 m',
            'x3 = 0.152 m pm 0.004 m',
            'x4 = 0.199 m pm 0.004 m',
            '@plot(t, x; fit linear)',
            'v = x_slope',
          ].join('\n'),
        }],
      },
      {
        explain: '@select(…) keeps the rows where its conditions hold, as new series under a name: a.t, a.x, numbered '
          + 'from 1. A named plot keeps its fit the same way: p.slope, p.intercept. Name an import too, run1 = '
          + '@import(…), to keep two files apart.',
        examples: [{
          source: [
            't1 = 0.10 s',
            't2 = 0.20 s',
            't3 = 0.30 s',
            't4 = 0.40 s',
            'x1 = 0.020 m',
            'x2 = 0.098 m',
            'x3 = 0.152 m',
            'x4 = 0.199 m',
            'a = @select(t, x; t from 0.2)',
            'p = @plot(a.t, a.x; fit linear)',
            'v = p.slope',
          ].join('\n'),
        }],
      },
    ],
  },
]

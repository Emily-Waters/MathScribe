/**
 * The series module's topics of the language tree (lib/language/tree.ts): each
 * feature, what's said about it, and whole sheets showing it, which the
 * Reference tab shows live and the tests check.
 */
import { SUBSCRIPT, TERM_KIND, settingsTopic, type PlacedTopic, type SeriesSuffix } from '../../lib/plugin.ts'

/** A series' statistics, as their names' suffixes are written: `t_avg`. (`_mean` works too, but `_avg` is the one suggested.) */
const SERIES_STAT = { avg: 'avg', count: 'count', std: 'std', sem: 'sem' } as const satisfies Record<string, SeriesSuffix>
import { TABLE_SETTINGS } from './tableSettings.ts'
import { PLOT_SETTINGS } from './plotSettings.ts'

/** The series a table's and a plot's settings are shown with, in the reference. */
const SAMPLE_DATA = [
  't = @series(0.10 s, 0.20 s, 0.30 s, 0.40 s, 0.50 s, 0.60 s)',
  'x = @series(0.051 m pm 0.004 m, 0.098 m pm 0.004 m, 0.152 m pm 0.004 m, 0.199 m pm 0.004 m, 0.248 m pm 0.004 m, 0.301 m pm 0.004 m)',
  'salts = @series("KCl", "KBr", "KI", "NaCl", "NaBr", "NaI")',
]

/** Between a sample's lines. */
const LINE = '\n'

/** A table of the sample with these settings. */
const tableSample = (settings: string) => [...SAMPLE_DATA, `@table(t, x; ${settings})`].join(LINE)

/** A plot of the sample with these settings, and a fit, unless they say what fit (so a fit's settings show). */
const plotSample = (settings: string) =>
  [...SAMPLE_DATA.slice(0, 2), `@plot(t, x; ${settings.includes('fit ') ? settings : `fit linear, ${settings}`})`].join(LINE)

/** Its topics, each placed after the core's topic it follows. */
export const SERIES_TOPICS: readonly PlacedTopic[] = [
  {
    id: 'series',
    title: 'Repeated measurements',
    after: 'uncertainty',
    entries: [
      {
        explain: 'Numbered variables form a series: t_avg is the mean ± standard error, t_count the count, t the sum.',
        terms: [
          { kind: TERM_KIND.seriesName, name: '', summary: 'Sum of the series' },
          { kind: TERM_KIND.seriesName, name: `${SUBSCRIPT}${SERIES_STAT.avg}`, summary: 'Mean, ± the standard error' },
          { kind: TERM_KIND.seriesName, name: `${SUBSCRIPT}${SERIES_STAT.count}`, summary: 'Number of values' },
          { kind: TERM_KIND.seriesName, name: `${SUBSCRIPT}${SERIES_STAT.std}`, summary: 'Sample standard deviation' },
          { kind: TERM_KIND.seriesName, name: `${SUBSCRIPT}${SERIES_STAT.sem}`, summary: 'Standard error of the mean' },
        ],
        rules: [
          'T1, T2, … (or T_1, T_2) form a series T: T_avg, T_std, T_sem, T_count and T each show their working '
            + 'on a line of their own.',
          't1 and t_1 are the same name, whichever is written.',
          'Each on its own line shows its working: Σ notation, the members and their values. They\'re worked '
            + 'out each time they\'re used, so a t6 added later counts.',
          'A variable of your own with the name wins: after t = 9.0 s, t is that, though t_avg is still the '
            + 'mean.',
          'The sum carries the members\' pm uncertainties; the mean\'s is σ/√n, from their spread. delta t_avg '
            + 'shows its working. Every use of a mean shares one source, so t_avg twice in a formula is correlated.',
          'Members must have compatible units; results are in the first member\'s unit.',
          'A name matching one numbered variable is a series of one: psi, with psi_200 defined.',
        ],
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
        rules: [
          'The first row names the columns; a unit in brackets, t (s) or t [s], goes with every value in it. '
            + 'Values keep their sig figs as typed; commas, tabs or semicolons separate them, and empty cells are '
            + 'skipped.',
          'A column dx (or δx, σx, delta_x, sigma_x, x_unc, x_err) holds x\'s uncertainties, each row\'s as if '
            + 'typed with pm, in its own unit or x\'s; dx (%) is a percentage. It makes no variables of its own.',
          'Name an import (run1 = @import(…)) to keep two files apart: run1.x_avg.',
          'The data is kept in the sheet, and left out of the exports.',
        ],
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
        rules: [
          'A unit every value shares goes in the header; a value with an uncertainty shows as 3.0 ± 0.1; a row '
            + 'a series doesn\'t have shows —.',
          'An expression without a name (@table(x / t)) is just shown.',
          'A table of more than 60 rows shows its first 50 and last 5, with ⋮ between (all rows shows every '
            + 'one).',
          'Row labels are text, as a sheet\'s text is ($…$, {KCl}); a series of numbers labels with its values; '
            + 'a row it doesn\'t have is blank.',
          'In the exports it\'s a table, its title a numbered caption above it: in LaTeX a table float '
            + '(tabularx), in Word a Word table, its header on each page.',
        ],
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
        rules: [
          'Each value is worked out as if typed on a line of its own, so units, sig figs, pm and settings on '
            + 'the name (m:3 = @series(F / g)) work.',
          'In a rule, a series\' name is that row\'s value, and any other name is used as it is (its uncertainty '
            + 'from one source).',
          'It keeps the rows of the series it\'s from, so @table(d, t, v) lines up; if they have different '
            + 'rows, a warning says so, and ; rows … chooses.',
          'Making a series again replaces it. Its line shows the values (the first three and last two of a '
            + 'long one); #sym the rule, #val the values.',
        ],
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
          + 'x_intercept. Its settings, after a semicolon, are listed under Plot settings; the ⚙ after it sets '
          + 'them too.',
        rules: [
          'A named plot keeps its fit: p = @plot(x, y; fit linear), then p.slope, p.intercept and p.r2.',
          'Each axis is labelled with its name and unit; every y series must be in units that convert to the '
            + 'first one\'s.',
          'When every point has a y uncertainty the fit is weighted (each by 1/δy²), and the reduced χ²_ν is '
            + 'shown: about 1 when the points scatter as their bars say. Otherwise its uncertainties come from the '
            + 'scatter.',
          'In a weighted fit x uncertainties count too, by the effective variance, 1/(δy² + (slope · δx)²); '
            + 'the line under the graph says which were used.',
          'What\'s on the axes is what\'s plotted: a point outside an axis\'s range isn\'t drawn, fitted, or in a '
            + 'named plot\'s series.',
          'With several series, each fit has its own: p.x_slope, p.y_slope. An unnamed plot makes x_slope and '
            + 'x_intercept.',
          'In LaTeX a plot is a pgfplots graph; in Word, a picture.',
        ],
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
        rules: [
          'Its conditions all hold: t from 0.2 to 0.8 (either end can go), x to 0.16, rows 5-20. A bare number '
            + 'is in the series\' unit, or give one: t from 250 ms.',
          'In a condition a name means the selected series of that name first: @select(run1.t, run1.x; t from '
            + '0.2).',
          'A selection doesn\'t copy: a.x_1 is x_2, with its sig figs and uncertainty, so x_2 - a.x_1 is '
            + 'exactly 0. a.x is shown x_a.',
          'Names with a dot work alike wherever they\'re made: a selection, a named import (run1.x_3), a named '
            + 'plot (p.x, p.slope). Typing a name and a dot suggests what it holds.',
        ],
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
  // A table's and a plot's settings, from their declarations (tableSettings.ts, plotSettings.ts).
  settingsTopic(TABLE_SETTINGS.describe(), { id: 'table-settings', title: 'Table settings', after: 'series' }, tableSample),
  settingsTopic(PLOT_SETTINGS.describe(), { id: 'plot-settings', title: 'Plot settings', after: 'table-settings' }, plotSample),
]

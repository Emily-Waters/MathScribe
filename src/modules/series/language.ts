/**
 * The series module's topics of the language tree (lib/language/tree.ts): each
 * feature, what's said about it, and whole sheets showing it, which the
 * Reference tab shows live and the tests check.
 */
import { MEMBER_DOT, MEMBER_INDEX, TERM_KIND, settingsTopic, type PlacedTopic, type SeriesSuffix } from '../../lib/plugin.ts'

/** A series' statistics, as members of it: `t.avg`. (`t.mean` works too, but `.avg` is the one suggested.) */
const SERIES_STAT = { sum: 'sum', avg: 'avg', count: 'count', std: 'std', sem: 'sem' } as const satisfies Record<string, SeriesSuffix>

/** A statistic's term, as it follows the series' name: `.avg`. */
const stat = (name: SeriesSuffix) => `${MEMBER_DOT}${name}`
import { TABLE_SETTINGS } from './tableSettings.ts'
import { PLOT_SETTINGS } from './plotSettings.ts'

/** The series a table's and a plot's settings are shown with, in the reference. */
const SAMPLE_DATA = [
  't = [0.10 s, 0.20 s, 0.30 s, 0.40 s, 0.50 s, 0.60 s]',
  'x = [0.051 m pm 0.004 m, 0.098 m pm 0.004 m, 0.152 m pm 0.004 m, 0.199 m pm 0.004 m, 0.248 m pm 0.004 m, 0.301 m pm 0.004 m]',
  'salts = ["KCl", "KBr", "KI", "NaCl", "NaBr", "NaI"]',
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
        explain: 'A series is measurements under one name, t = [1.21 s, 1.17 s, 1.24 s] (or a column of '
          + '@import or @table). t on its own is the series; t[2] is one of its values, and its statistics '
          + 'are members of it: t.avg is the mean ± standard error, t.count the count, t.sum the sum.',
        terms: [
          { kind: TERM_KIND.seriesName, name: '', summary: 'The series: its values, listed' },
          { kind: TERM_KIND.seriesName, name: `${MEMBER_INDEX.open}1${MEMBER_INDEX.close}`, summary: 'One of its values, by its number' },
          { kind: TERM_KIND.seriesName, name: `${MEMBER_INDEX.open}2:4${MEMBER_INDEX.close}`, summary: 'A slice: from, to and step, any left out' },
          { kind: TERM_KIND.seriesName, name: stat(SERIES_STAT.avg), summary: 'Mean, ± the standard error' },
          { kind: TERM_KIND.seriesName, name: stat(SERIES_STAT.count), summary: 'Number of values' },
          { kind: TERM_KIND.seriesName, name: stat(SERIES_STAT.sum), summary: 'Sum of the series' },
          { kind: TERM_KIND.seriesName, name: stat(SERIES_STAT.std), summary: 'Sample standard deviation' },
          { kind: TERM_KIND.seriesName, name: stat(SERIES_STAT.sem), summary: 'Standard error of the mean' },
        ],
        rules: [
          'A name is only a series if something made it one: v_0, t_1 and t1 are names of their own, and never '
            + 'make or join a series.',
          'On a line of its own, t lists its values, and t.avg, t.std, t.sem, t.count and t.sum each show their '
            + 'working: Σ notation, the members and their values. They\'re worked out from the series as it is then.',
          'In a formula a series isn\'t one value: use one of its values, t[2], or a statistic, t.avg; or work out '
            + 'a new series from it, [2 * t].',
          'The sum carries the members\' pm uncertainties; the mean\'s is σ/√n, from their spread. delta t.avg '
            + 'shows its working. Every use of a mean shares one source, so t.avg twice in a formula is correlated.',
          'Members must have compatible units; results are in the first member\'s unit.',
        ],
        examples: [{
          source: [
            't = [1.21 s, 1.17 s, 1.24 s]',
            't',
            't.avg',
            't.count',
            't.sum',
            't[2]',
          ].join('\n'),
        }],
      },
      {
        explain: '@import() opens a file chooser for a CSV file. Its rows go into the sheet under the line, folded '
          + 'away, and each column becomes a series named for it: t, its values t[1], t[2], …. A unit in a '
          + 'header, t (s), goes with that column.',
        rules: [
          'The first row names the columns; a unit in brackets, t (s) or t [s], goes with every value in it. '
            + 'Values keep their sig figs as typed; commas, tabs or semicolons separate them, and empty cells are '
            + 'skipped.',
          'A column dx (or δx, σx, delta_x, sigma_x, x_unc, x_err) holds x\'s uncertainties, each row\'s as if '
            + 'typed with pm, in its own unit or x\'s; dx (%) is a percentage. It makes no variables of its own.',
          'Name an import (run1 = @import(…)) to keep two files apart: run1.x, run1.x.avg, run1.x[3].',
          'The data is kept in the sheet, and left out of the exports.',
        ],
        examples: [{
          source: [
            '@import("ramp.csv")',
            '    t (s), d (m)',
            '    1.21, 3.50',
            '    1.17, 3.48',
            '    1.24, 3.52',
            't.avg',
            'v = d[2] / t[2]',
          ].join('\n'),
        }],
      },
      {
        explain: '@table(…) shows series side by side, a row per number. name = … works out a column row by row, and '
          + 'makes it a series of its own (v[1], v[2], …), so v.avg works afterwards.',
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
            't = [1.21 s, 1.17 s, 1.24 s]',
            'd = [3.50 m, 3.48 m, 3.52 m]',
            '@table(t, d, v = d / t)',
            'v.avg',
          ].join('\n'),
        }],
      },
      {
        explain: 'Square brackets make a series: its values listed, F = [2.00 N, 3.00 N], or a rule worked out row '
          + 'by row from other series, m = [F / g], with any other name used as it is. Series of different lengths '
          + 'use the rows they all have, with a warning.',
        rules: [
          'Each value is worked out as if typed on a line of its own, so units, sig figs, pm and settings on '
            + 'the name (m:3 = [F / g]) work.',
          'In a rule, a series\' name is that row\'s value, and any other name is used as it is (its uncertainty '
            + 'from one source).',
          'It keeps the rows of the series it\'s from, so @table(d, t, v) lines up; if they have different '
            + 'rows, a warning says so: slice them to choose, [d[1:3] / t[1:3]].',
          'Square brackets are only for series (and their members): there are no matrices.',
          'Making a series again replaces it. Its line shows the values (the first three and last two of a '
            + 'long one); in @layout.sym the rule, in @layout.val the values.',
        ],
        examples: [{
          source: [
            'F = [2.00 N, 3.00 N, 10.0 N]',
            'g_0 = 9.81 m/s^2 pm 0.02 m/s^2',
            'm = [F / g_0]',
            'm.avg',
          ].join('\n'),
        }],
      },
      {
        explain: 'A range makes a series from where it starts to where it ends (both kept), by a step: '
          + 't = [0 s:2.0 s:0.5 s]. Without a step, it counts by 1: n = [1:5].',
        rules: [
          'Its values have as many decimal places as its start, end and step: [0 s:2.0 s:0.1 s] is 0.0 s, 0.1 s, '
            + '…, 2.0 s.',
          'The end and step can be in other units than the start (they\'re converted to it): [0 s:500 ms:100 ms].',
          'A negative step counts down: [10:0:-2]. The start and end must be given.',
        ],
        examples: [{
          source: [
            't = [0 s:2.0 s:0.5 s]',
            'n = [1:5]',
            'k = [10:0:-2]',
          ].join('\n'),
        }],
      },
      {
        explain: 'A slice takes some of a series\' values, by their numbers: m[2:4] is m[2], m[3] and m[4]. Its parts '
          + 'are from, to (both kept) and step, and any can be left out: m[3:] to the end, m[:2] from the start, '
          + 'm[::2] every other one.',
        rules: [
          'A slice is a series of its own, numbered from 1: after z = m[2:4], z[1] is m[2].',
          'It looks its values up rather than copying them, so z[1] - m[2] is exactly 0, and it changes as m does.',
          'It works wherever a series does: m[2:4].avg, @table(m[2:4]), @plot(t[2:], x[2:]), [d[2:3] / t[2:3]].',
        ],
        examples: [{
          source: [
            'm = [1.0 kg, 2.0 kg, 3.0 kg, 4.0 kg, 5.0 kg]',
            'z = m[2:4]',
            'z[1]',
            'm[::2]',
            'm[3:].avg',
          ].join('\n'),
        }],
      },
      {
        explain: 'A condition in a series\' brackets keeps the rows where it holds: x[t > 0.2 s] is x\'s values in the '
          + 'rows where t is over 0.2 s, renumbered from 1. Rows are matched by their numbers, so the condition can '
          + 'be on another series than the one it picks from.',
        rules: [
          'Comparisons (<, <=, >, >=, ==, !=) chain and combine: x[0.2 s <= t <= 0.4 s], x[t > 0.2 s and x < 0.3 m].',
          'A series of true and false is a condition too: keep = [t > 0.2 s], then x[keep] and t[keep] stay paired.',
          'It works wherever a series does: x[t > 0.2 s].avg, @plot(t[t > 0.1 s], x[t > 0.1 s]), [first, ...rest] = '
            + 'x[t > 0.2 s].',
          'Something in the brackets that uses no series is worked out once: a whole number is a member, x[n + 1].',
          'A condition no row meets is an error: the series would have no values.',
        ],
        examples: [{
          source: [
            't = [0.10 s, 0.20 s, 0.30 s, 0.40 s, 0.50 s]',
            'x = [0.05 m, 0.10 m, 0.16 m, 0.20 m, 0.26 m]',
            'b = x[0.2 s <= t <= 0.4 s]',
            'x[t > 0.3 s].avg',
            'keep = [t > 0.25 s]',
            '@plot(t[keep], x[keep]; fit linear)',
          ].join('\n'),
        }],
      },
      {
        explain: '...x spreads a series\' values in place, among values of its own: y = [...x, 11 s] is x\'s values, '
          + 'then 11 s.',
        rules: [
          'A slice spreads too: [...x[2:], 0 s]. Several can go in one series, anywhere in it.',
          'Each spread value is the series\' value itself (its sig figs, its uncertainty from the same source), '
            + 'as a slice\'s is.',
        ],
        examples: [{
          source: [
            'x = [1 s:5 s:1 s]',
            'y = [...x, 11 s]',
            'y.count',
          ].join('\n'),
        }],
      },
      {
        explain: '[a, b, ...rest] = x takes a series apart: a is x[1], b is x[2], and rest the series of the rest, '
          + 'x[3:], renumbered from 1.',
        rules: [
          'Only the last name can gather the rest, with ...; it can be the only one: [...all] = x.',
          'Without a rest, x must have just as many values as there are names.',
          'What\'s taken apart is a series (or a slice of one): name a list first, c = [5 kg, 6 kg], then [a, b] = c.',
        ],
        examples: [{
          source: [
            'x = [1 s:10 s:1 s]',
            '[first, ...rest] = x',
            'rest.count',
          ].join('\n'),
        }],
      },
      {
        explain: '@plot(x axis, y series…) draws one series against another, with error bars for uncertainties. fit '
          + 'linear adds a best-fit line and its equation, and makes its slope and intercept members of the series: x.slope, '
          + 'x.intercept. Its settings, after a semicolon, are listed under Plot settings; the ⚙ after it sets '
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
          'With several series, each fit has its own: p.x.slope, p.y.slope. An unnamed plot makes x.slope and '
            + 'x.intercept.',
          'In LaTeX a plot is a pgfplots graph; in Word, a picture.',
        ],
        examples: [{
          source: [
            't = [0.10 s, 0.20 s, 0.30 s, 0.40 s]',
            'x = [0.051 m pm 0.004 m, 0.098 m pm 0.004 m, 0.152 m pm 0.004 m, 0.199 m pm 0.004 m]',
            '@plot(t, x; fit linear)',
            'v = x.slope',
          ].join('\n'),
        }],
      },
      {
        explain: 'Datasets with x values of their own go on one plot each in brackets, (x, y): @plot((t1, x1), (t2, x2)) '
          + 'draws two runs timed at different moments. Each is its own series, in the legend, with its own fit.',
        rules: [
          'What follows a dataset in brackets, up to the next, is plotted against its x too: @plot((t1, x1, y1), (t2, x2)).',
          '@plot(t, x, y) is still one dataset, x and y against t; it can be followed by others: @plot(t, x, (t2, x2)).',
          'Every x must be in units that convert to the first one\'s, and every y to the first y\'s.',
          'The x axis is named for its x if every dataset has the same one; otherwise by its unit (or xlabel "…").',
          'A named plot keeps each dataset\'s rows: p.t1, p.x1, p.t2, p.x2; and each fit by its series: p.x1.slope.',
          'A bracket that\'s only an expression, (x1 + x2) / 2, is a column worked out row by row as before.',
        ],
        examples: [{
          source: [
            't1 = [0.10 s, 0.20 s, 0.30 s]',
            'x1 = [1.0 m pm 0.1 m, 2.1 m pm 0.1 m, 2.9 m pm 0.1 m]',
            't2 = [0.15 s, 0.25 s, 0.35 s, 0.45 s]',
            'x2 = [1.4 m pm 0.1 m, 2.4 m pm 0.1 m, 3.6 m pm 0.1 m, 4.4 m pm 0.1 m]',
            'p = @plot((t1, x1), (t2, x2); fit linear, legend top left)',
            'p.x1.slope',
            'p.x2.slope',
          ].join('\n'),
        }],
      },
      {
        explain: 'A function of the sheet\'s, by its name alone, is drawn as a curve across the plot, beside the data: '
          + 'a model to compare the measurements with, @plot(L, T, T_model). With no data plotted, @plot(t, f) draws f '
          + 'from t\'s least value to its greatest.',
        rules: [
          'The function takes one value, the x axis\'s, in its unit: T_model(L) = … for an x axis of lengths.',
          'Its values share the y axis with the data, so their units must convert to the data\'s.',
          'It\'s drawn across the x axis the data make (or the settings\' x from … to …), and can be coloured like a '
            + 'series\' line: colour T_model line red. It has no points, error bars or fit.',
          'f(t), with brackets, is a column worked out row by row instead, as in @table: a point for each of t\'s values.',
        ],
        examples: [{
          source: [
            'L = [0.20 m, 0.40 m, 0.60 m, 0.80 m]',
            'T = [0.90 s pm 0.02 s, 1.27 s pm 0.02 s, 1.55 s pm 0.02 s, 1.79 s pm 0.02 s]',
            'T_model(L) = 2 * pi * sqrt(L / @g)',
            '@plot(L, T, T_model)',
          ].join('\n'),
        }],
      },
      {
        explain: 'A named plot keeps what it made under its name: its fit, p.slope, p.intercept, p.r2, and the series '
          + 'it drew, p.t, p.x (the rows on its axes, numbered from 1). A named import keeps its columns the same way, '
          + 'run1.t, so two files stay apart.',
        rules: [
          'A plot\'s series don\'t copy: p.x[1] is the value it drew first itself, with its sig figs and uncertainty. '
            + 'p.x is shown x_p.',
          'Names with a dot work alike wherever they\'re made: a named import (run1.x[3]), a named plot (p.x, '
            + 'p.slope). Typing a name and a dot suggests what it holds.',
        ],
        examples: [{
          source: [
            't = [0.10 s, 0.20 s, 0.30 s, 0.40 s]',
            'x = [0.020 m, 0.098 m, 0.152 m, 0.199 m]',
            'p = @plot(t[t >= 0.2 s], x[t >= 0.2 s]; fit linear)',
            'v = p.slope',
            'p.x.count',
          ].join('\n'),
        }],
      },
    ],
  },
  // A table's and a plot's settings, from their declarations (tableSettings.ts, plotSettings.ts).
  settingsTopic(TABLE_SETTINGS.describe(), { id: 'table-settings', title: 'Table settings', after: 'series' }, tableSample),
  settingsTopic(PLOT_SETTINGS.describe(), { id: 'plot-settings', title: 'Plot settings', after: 'table-settings' }, plotSample),
]

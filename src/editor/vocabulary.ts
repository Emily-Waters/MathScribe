/**
 * Fixed words of the sheet language, with one-line descriptions, for
 * completions and hover information in the editor. (The words themselves
 * come from lib/syntax.ts, which the engine uses too.)
 */
import {
  CALL, COMMAND_NAMES, COMPONENTS_SETTING, EXACT_SETTING, KEYWORD, NOTATIONS, PERCENT, UNCERTAINTY_WORDS, UNIT_VECTOR_SETTING,
  VECTOR_FUNCTION, type CommandName, type Notation, type SeriesSuffix,
} from '../lib/syntax.ts'

/** What each display command does. */
const COMMAND_DESCRIPTIONS: Record<CommandName, string> = {
  full: 'Show everything (the default; overrides a block’s command)',
  sym: 'Show the equation only',
  val: 'Show the result only',
  hide: 'Calculate, but don’t show the line or block',
  multiline: 'Each = on its own row, lined up',
  sci: 'Results in scientific notation (on a line, or every line in a block)',
  dec: 'Results in plain decimal digits, no powers of ten (on a line, or every line in a block)',
  center: 'Center the line, or a : block’s lines',
  list: 'A : block’s lines as a bulleted list',
  numbered: 'A : block’s lines as a numbered list',
  text: 'A : block of prose: lines join into paragraphs, nothing is calculated',
}

/** Every display command, `#` and all, in the order they're suggested. */
export const COMMANDS: { name: string; description: string }[] =
  COMMAND_NAMES.map((name) => ({ name: `#${name}`, description: COMMAND_DESCRIPTIONS[name] }))

/** What each notation setting does. */
const NOTATION_DESCRIPTIONS: Record<Notation, string> = {
  sci: 'always scientific notation',
  dec: 'always decimal notation, no powers of ten',
}

/** Words that can follow a `:` on a name (besides sig figs and units). */
export const SETTING_WORDS: { name: string; description: string }[] = [
  { name: EXACT_SETTING, description: 'full precision; never limits a result' },
  ...NOTATIONS.map((n) => ({ name: n, description: NOTATION_DESCRIPTIONS[n] })),
  { name: PERCENT, description: 'a unitless result ×100, with %' },
  { name: UNIT_VECTOR_SETTING, description: 'a vector with unit vectors: (3.0 î + 4.0 ĵ) N' },
  { name: COMPONENTS_SETTING, description: 'a vector’s components as variables too: F_x, F_y, F_z' },
]

/** Words of the sheet language, with what they do. */
export const KEYWORDS: { name: string; description: string }[] = [
  { name: KEYWORD.def, description: 'Define a function with an indented body' },
  { name: KEYWORD.return, description: 'The value a def function gives back' },
  { name: KEYWORD.if, description: 'In a def: the lines indented under it run if the condition holds (then else if …, else)' },
  { name: KEYWORD.else, description: 'In a def, after an if: the lines under it run otherwise' },
  { name: KEYWORD.to, description: 'Convert to a unit: v to km/h, or to percent' },
  { name: KEYWORD.pm, description: 'An uncertainty: 2.0 kg pm 0.1 kg (also ± or +-)' },
  { name: UNCERTAINTY_WORDS[0], description: 'The uncertainty of a variable: delta F' },
]

/** Built-in functions people use in sheets (mathjs has many more; all of them work). */
export const BUILTIN_FUNCTIONS: { name: string; signature: string; description: string }[] = [
  { name: 'sqrt', signature: 'sqrt(x)', description: 'Square root' },
  { name: 'cbrt', signature: 'cbrt(x)', description: 'Cube root' },
  { name: 'nthRoot', signature: 'nthRoot(x, n)', description: 'The nth root' },
  { name: 'abs', signature: 'abs(x)', description: 'Absolute value' },
  { name: 'exp', signature: 'exp(x)', description: 'e to the power x' },
  { name: 'log', signature: 'log(x)', description: 'Natural logarithm (or log(x, base))' },
  { name: 'log10', signature: 'log10(x)', description: 'Base-10 logarithm' },
  { name: 'log2', signature: 'log2(x)', description: 'Base-2 logarithm' },
  { name: 'sin', signature: 'sin(θ)', description: 'Sine; angles in rad, or with deg' },
  { name: 'cos', signature: 'cos(θ)', description: 'Cosine; angles in rad, or with deg' },
  { name: 'tan', signature: 'tan(θ)', description: 'Tangent; angles in rad, or with deg' },
  { name: 'asin', signature: 'asin(x)', description: 'Inverse sine, in rad (add to deg)' },
  { name: 'acos', signature: 'acos(x)', description: 'Inverse cosine, in rad (add to deg)' },
  { name: 'atan', signature: 'atan(x)', description: 'Inverse tangent, in rad (add to deg)' },
  { name: 'atan2', signature: 'atan2(y, x)', description: 'Angle of the point (x, y), in rad' },
  { name: 'sinh', signature: 'sinh(x)', description: 'Hyperbolic sine' },
  { name: 'cosh', signature: 'cosh(x)', description: 'Hyperbolic cosine' },
  { name: 'tanh', signature: 'tanh(x)', description: 'Hyperbolic tangent' },
  { name: 'round', signature: 'round(x, n)', description: 'Round to n decimal places' },
  { name: 'floor', signature: 'floor(x)', description: 'Round down' },
  { name: 'ceil', signature: 'ceil(x)', description: 'Round up' },
  { name: 'min', signature: 'min(a, b, …)', description: 'Smallest value' },
  { name: 'max', signature: 'max(a, b, …)', description: 'Largest value' },
  { name: 'factorial', signature: 'factorial(n)', description: 'n!' },
  { name: CALL.tuple, signature: 'tuple(x, y, …)', description: 'A tuple of values, such as coordinates; tuple(a, b) = … unpacks one' },
  { name: VECTOR_FUNCTION, signature: 'vector(x, y, …)', description: 'A vector, the same as <x, y, …>' },
  { name: 'norm', signature: 'norm(r)', description: 'Length of a vector or tuple: norm(<3, 4>) = 5' },
  { name: 'dot', signature: 'dot(a, b)', description: 'Dot product of two vectors' },
  { name: 'cross', signature: 'cross(a, b)', description: 'Cross product of two 3D vectors' },
  { name: CALL.import, signature: 'import()', description: 'Import a CSV file: each value becomes a variable, x_1, x_2, …' },
  { name: CALL.table, signature: 'table(t, x, v = x / t)', description: 'Series side by side, one row per number; name = … works out a column row by row' },
  { name: CALL.plot, signature: 'p = plot(t, x; fit linear)', description: 'Graph series against another, with error bars; fit linear adds a best-fit line (p.slope, p.intercept)' },
  { name: CALL.select, signature: 'a = select(t, x; t from 0.2 to 0.8)', description: 'The rows where conditions hold, as new series a.t, a.x numbered from 1' },
  { name: CALL.solve, signature: 'solve(equation, unknown, guess?)', description: 'Rearrange an equation for the unknown and evaluate it; tuple(x, y) = solve(eq, eq) solves a system' },
]

/** Constants that are built into mathjs (no @), shown as symbols. */
export const MATH_CONSTANTS: { name: string; description: string }[] = [
  { name: 'pi', description: 'π ≈ 3.14159' },
  { name: 'e', description: 'Euler’s number ≈ 2.71828' },
  { name: 'tau', description: 'τ = 2π' },
  { name: 'phi', description: 'The golden ratio ≈ 1.61803' },
]

/** What each series name means. (`_mean` works too, but only `_avg` is suggested.) */
const SERIES_DESCRIPTIONS: Record<Exclude<SeriesSuffix, 'mean'>, string> = {
  avg: 'Mean, ± the standard error',
  count: 'Number of values',
  std: 'Sample standard deviation',
  sem: 'Standard error of the mean',
}

/** The names a series makes (t, t_avg, t_count, …), as suffixes of its name. */
export const SERIES_SUFFIXES: { suffix: string; description: string }[] = [
  { suffix: '', description: 'Sum of the series' },
  ...Object.entries(SERIES_DESCRIPTIONS).map(([s, description]) => ({ suffix: `_${s}`, description })),
]

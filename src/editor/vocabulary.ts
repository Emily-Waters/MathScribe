/**
 * Fixed words of the sheet language, with one-line descriptions, for
 * completions and hover information in the editor.
 */

export const COMMANDS: { name: string; description: string }[] = [
  { name: '#full', description: 'Show everything (the default; overrides a block’s command)' },
  { name: '#sym', description: 'Show the equation only' },
  { name: '#val', description: 'Show the result only' },
  { name: '#hide', description: 'Calculate, but don’t show the line or block' },
  { name: '#multiline', description: 'Each = on its own row, lined up' },
  { name: '#center', description: 'Center the line, or a : block’s lines' },
  { name: '#list', description: 'A : block’s lines as a bulleted list' },
  { name: '#numbered', description: 'A : block’s lines as a numbered list' },
  { name: '#text', description: 'A : block of prose: lines join into paragraphs, nothing is calculated' },
]

export const KEYWORDS: { name: string; description: string }[] = [
  { name: 'def', description: 'Define a function with an indented body' },
  { name: 'return', description: 'The value a def function gives back' },
  { name: 'to', description: 'Convert to a unit: v to km/h, or to percent' },
  { name: 'pm', description: 'An uncertainty: 2.0 kg pm 0.1 kg (also ± or +-)' },
  { name: 'delta', description: 'The uncertainty of a variable: delta F' },
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
  { name: 'norm', signature: 'norm(r)', description: 'Length of a tuple: norm((3, 4)) = 5' },
  { name: 'dot', signature: 'dot(a, b)', description: 'Dot product of two tuples' },
  { name: 'cross', signature: 'cross(a, b)', description: 'Cross product of two 3-tuples' },
  { name: 'solve', signature: 'solve(equation, unknown, guess?)', description: 'Rearrange an equation for the unknown and evaluate it' },
]

/** Constants that are built into mathjs (no @), shown as symbols. */
export const MATH_CONSTANTS: { name: string; description: string }[] = [
  { name: 'pi', description: 'π ≈ 3.14159' },
  { name: 'e', description: 'Euler’s number ≈ 2.71828' },
  { name: 'tau', description: 'τ = 2π' },
  { name: 'phi', description: 'The golden ratio ≈ 1.61803' },
]

/** What a series name means: t_avg, t_count, … */
export const SERIES_SUFFIXES: { suffix: string; description: string }[] = [
  { suffix: '', description: 'Sum of the series' },
  { suffix: '_avg', description: 'Mean, ± the standard error' },
  { suffix: '_count', description: 'Number of values' },
  { suffix: '_std', description: 'Sample standard deviation' },
  { suffix: '_sem', description: 'Standard error of the mean' },
]

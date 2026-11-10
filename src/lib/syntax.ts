/**
 * The sheet language's shared vocabulary: the words and patterns that the
 * engine, the sheet's structure (document.ts) and the editor (highlighting,
 * completions) all have to agree on.
 *
 * Every pattern is built from the same few pieces, so a change to what a name
 * or a setting looks like is made once, here, and can't drift between them.
 */

// ---------------------------------------------------------------------------
// Pieces (regular-expression source text, for building the patterns below)
// ---------------------------------------------------------------------------

/** Greek letters (the Greek and Coptic block, U+0370 to U+03FF), which names can contain: `ΔE`, `ω_0`. */
export const GREEK_CHARS = `${String.fromCodePoint(0x370)}-${String.fromCodePoint(0x3ff)}`

/** A character that can continue a name: a letter, digit, underscore or Greek letter. */
export const NAME_CHAR = String.raw`[\w${GREEK_CHARS}]`

/** A name: a letter (Latin or Greek), then letters, digits or underscores (`m`, `v_0`, `E_k`, `ΔE`). */
export const NAME = String.raw`[A-Za-z${GREEK_CHARS}]${NAME_CHAR}*`

/** One display setting after a name, with its colon: `:3`, `:deg`, `:sci`. */
export const SETTING = String.raw`:[^:=\s]+`

/** Any number of settings: `:3:deg`, or none. */
export const SETTINGS = `(?:${SETTING})*`

/** An `=` that assigns (not `==`), with any space before it. */
const ASSIGNS = String.raw`\s*=(?!=)`

/** A bracketed parameter or argument list, without nested brackets (capturing what's inside). */
const PARAMETERS = String.raw`\(([^()]*)\)`

/** A number as typed: `2`, `2.`, `.5`, `2.50`, `6.02e23`. */
export const NUMBER = String.raw`(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?`

// ---------------------------------------------------------------------------
// Greek letters
// ---------------------------------------------------------------------------

/**
 * The Greek letters, by their LaTeX names: written in a name either spelled out
 * (`theta`, `Delta`) or as the character itself (`ΔE`), which the editor types
 * for `\Delta` followed by Tab or a space. Capitals that look like Latin ones
 * (Α, Β, …) have no LaTeX name and are left out.
 */
export const GREEK_LETTERS = [
  ['alpha', 'α'], ['beta', 'β'], ['gamma', 'γ'], ['delta', 'δ'], ['epsilon', 'ϵ'], ['varepsilon', 'ε'],
  ['zeta', 'ζ'], ['eta', 'η'], ['theta', 'θ'], ['vartheta', 'ϑ'], ['iota', 'ι'], ['kappa', 'κ'],
  ['lambda', 'λ'], ['mu', 'μ'], ['nu', 'ν'], ['xi', 'ξ'], ['pi', 'π'], ['rho', 'ρ'], ['varrho', 'ϱ'],
  ['sigma', 'σ'], ['varsigma', 'ς'], ['tau', 'τ'], ['upsilon', 'υ'], ['phi', 'ϕ'], ['varphi', 'φ'],
  ['chi', 'χ'], ['psi', 'ψ'], ['omega', 'ω'],
  ['Gamma', 'Γ'], ['Delta', 'Δ'], ['Theta', 'Θ'], ['Lambda', 'Λ'], ['Xi', 'Ξ'], ['Pi', 'Π'], ['Sigma', 'Σ'],
  ['Upsilon', 'Υ'], ['Phi', 'Φ'], ['Psi', 'Ψ'], ['Omega', 'Ω'],
] as const

/** A Greek letter's character, by its LaTeX name: `Delta` → Δ. */
export const GREEK_BY_NAME: ReadonlyMap<string, string> = new Map(GREEK_LETTERS)

/** A Greek letter's LaTeX name, by its character: Δ → `Delta`. */
export const GREEK_BY_CHAR: ReadonlyMap<string, string> = new Map(GREEK_LETTERS.map(([name, char]) => [char, name]))

// ---------------------------------------------------------------------------
// Names and assignments
// ---------------------------------------------------------------------------

/** Exactly a name. */
export const IS_NAME = new RegExp(`^${NAME}$`)

/** The name at the start of some text. */
export const LEADING_NAME = new RegExp(`^${NAME}`)

/** A name with any settings, and nothing else: `theta:3:deg` (1: the name). */
export const NAME_WITH_SETTINGS = new RegExp(`^(${NAME})${SETTINGS}$`)

/** The start of an assignment: `x =`, `x:3:deg =` (1: the name). */
export const ASSIGNMENT = new RegExp(`^(${NAME})${SETTINGS}${ASSIGNS}`)

/** A whole assignment (1: the name, 2: the right-hand side). */
export const ASSIGNMENT_WITH_VALUE = new RegExp(`${ASSIGNMENT.source}\\s*(.+)$`)

/** An assignment whose name has at least one setting (1: the name, 2: the settings, colons included). */
export const DECLARED = new RegExp(`^(${NAME})((?:${SETTING})+)${ASSIGNS}`)

// ---------------------------------------------------------------------------
// Functions
// ---------------------------------------------------------------------------

/** The start of a one-line function: `f(x, y):3 =` (1: name, 2: parameters, 3: settings). */
export const FUNCTION_HEAD = new RegExp(`^(${NAME})\\s*${PARAMETERS}(${SETTINGS})${ASSIGNS}`)

/** A whole one-line function: `f(x) = x^2` (1–3 as FUNCTION_HEAD, 4: the body). */
export const ONE_LINE_FUNCTION = new RegExp(`${FUNCTION_HEAD.source}\\s*(.+)$`)

/**
 * A `def` line: `def f(a, b)`, `def f(a, b):3:deg`, optionally with a trailing
 * `:` (1: name, 2: parameters, 3: settings for the result).
 */
export const DEF = new RegExp(String.raw`^def\s+(${NAME})\s*\(([^)]*)\)((?::[^:\s]+)*)\s*:?$`)

/** The parameters of a `def` line as written in the sheet, indentation and all (1: name, 2: parameters). */
export const DEF_HEAD = new RegExp(String.raw`^\s*def\s+(${NAME})\s*\(([^)]*)\)`)

/** Unpacking a tuple: `tuple(a, b:3) = …` (1: the names, 2: the right-hand side). */
export const UNPACK = new RegExp(String.raw`^tuple\s*${PARAMETERS}${ASSIGNS}\s*(.+)$`)

/** The start of an unpacking, up to the `=` (1: the names). */
export const UNPACK_HEAD = new RegExp(String.raw`^tuple\s*${PARAMETERS}${ASSIGNS}`)

/** A table of series: `table(t, x, v = x / t)` (1: what's between the brackets). */
export const TABLE_CALL = /^table\s*\((.*)\)$/

/**
 * A plot of series: `plot(t, x, y)`, or a named one, `p = plot(t, x; fit linear)`,
 * whose fit is p.slope, p.intercept (1: the name, if any; 2: what's between the brackets).
 */
export const PLOT_CALL = new RegExp(String.raw`^(?:(${NAME})\s*=\s*)?plot\s*\((.*)\)$`)

/** A slice of series: `a = select(t, x; t from 0.2 to 0.8)` (1: its name, 2: what's between the brackets). */
export const SELECT_CALL = new RegExp(String.raw`^(${NAME})\s*=\s*select\s*\((.*)\)$`)

// ---------------------------------------------------------------------------
// Namespaces: `a.x_1`
//
// A slice, a named import or a named plot holds its values under its name:
// `a.x_1`, `a.x_avg`, `p.slope`. Each is an ordinary variable inside, named
// `a__x_1`, so series, aggregates and uncertainties work as anywhere.
// ---------------------------------------------------------------------------

/** Between a namespace's name and a member's, inside. */
export const NAMESPACE_JOIN = '__'

/** A member as written, `a.x_1` (1: the namespace, 2: the member). Not after a digit, so 2.5 isn't one. */
export const DOT_ACCESS = new RegExp(String.raw`(?<![\w.${GREEK_CHARS}])(${NAME})\.(${NAME})`, 'g')

/** A namespace member's inside name: `a.x_1` → `a__x_1`. */
export const memberName = (namespace: string, member: string) => `${namespace}${NAMESPACE_JOIN}${member}`

/** Words that start other inside names (delta__x, at__c__5, …), so they can't name a namespace. */
export const RESERVED_NAMESPACES = new Set(['delta', 'Delta', 'at', 'solved', 'unpacked'])

/** An inside name's namespace and member: `a__x_1` → a, x_1 (null if it isn't one). */
export function parseMemberName(name: string): { namespace: string; member: string } | null {
  const at = name.indexOf(NAMESPACE_JOIN)
  if (at <= 0) return null
  const namespace = name.slice(0, at)
  const member = name.slice(at + NAMESPACE_JOIN.length)
  if (RESERVED_NAMESPACES.has(namespace) || !IS_NAME.test(namespace) || !IS_NAME.test(member)) return null
  return { namespace, member }
}

/**
 * Text with each `a.x_1` as its inside name, `a__x_1`, leaving quoted text
 * alone. A numbered member is kept as written (`a.x1` → `a__x1`): t1 and
 * t_1 are the same variable, inside a namespace too.
 */
export function expandDots(text: string): string {
  if (!text.includes('.')) return text
  return text.split(/("[^"]*")/).map((part, i) => (i % 2 ? part : part.replace(DOT_ACCESS, (_, ns: string, member: string) =>
    RESERVED_NAMESPACES.has(ns) ? `${ns}.${member}` : memberName(ns, member)))).join('')
}

/** Inside names in a message written back as typed: `a__x_1` → `a.x_1`. */
export function readableMembers(text: string): string {
  return text.replace(new RegExp(String.raw`\b${NAME}`, 'g'), (name) => {
    const m = parseMemberName(name)
    return m ? `${m.namespace}.${m.member}` : name
  })
}

/**
 * An import line: `import()` (no file chosen yet) or `import("run1.csv")`,
 * with the file's rows indented under it; or a named one, `run1 = import(…)`,
 * whose columns are run1.t, run1.x (1: the name, if any; 2: the file's name).
 */
export const IMPORT = new RegExp(String.raw`^(?:(${NAME})\s*=\s*)?import\s*\(\s*(?:"([^"]*)")?\s*\)$`)

// ---------------------------------------------------------------------------
// Words used as settings after a `:` (besides sig figs and units)
// ---------------------------------------------------------------------------

/** Full precision: `x:exact = …`, `@c:exact`. */
export const EXACT_SETTING = 'exact'

/** Precision written as a setting: a number of sig figs, or full precision. */
export type Precision = number | typeof EXACT_SETTING

/** Always scientific (`x:sci`) or always decimal (`x:dec`) notation. */
export const NOTATIONS = ['sci', 'dec'] as const
export type Notation = typeof NOTATIONS[number]

/** Show a unitless result ×100 with a % sign: `f:percent = …`, `… to percent`. */
export const PERCENT = 'percent'

/** Show a vector with unit vectors, (3.0 î + 4.0 ĵ) N: `F:ijk = …`. */
export const UNIT_VECTOR_SETTING = 'ijk'

/** Break a vector into its components, each a variable of its own (F_x, F_y, F_z): `F:xyz = …`. */
export const COMPONENTS_SETTING = 'xyz'

// ---------------------------------------------------------------------------
// Vectors
// ---------------------------------------------------------------------------

/** A vector typed as `<3.0, 4.0> N` is read as a call to this function (which can also be typed). */
export const VECTOR_FUNCTION = 'vector'

/** The axes of a vector's components, in order: F_x, F_y, F_z. */
export const AXES = ['x', 'y', 'z'] as const

/** How a vector is shown: ⟨3.0, 4.0⟩ N, or with unit vectors, (3.0 î + 4.0 ĵ) N. */
export type VectorStyle = 'angle' | typeof UNIT_VECTOR_SETTING

// ---------------------------------------------------------------------------
// Uncertainties and series
// ---------------------------------------------------------------------------

/** `delta F` / `Delta F`: F's uncertainty, shown δF / ΔF as typed. */
export const UNCERTAINTY_WORDS = ['delta', 'Delta'] as const
export type UncertaintyWord = typeof UNCERTAINTY_WORDS[number]

/**
 * Names made from a numbered series (`t_1`, `t_2`, …): `t_avg`, `t_std`, … and
 * what each works out. (`t` on its own is the sum.)
 */
export const SERIES_SUFFIXES = {
  avg: 'mean',
  mean: 'mean',
  std: 'std',
  sem: 'sem',
  count: 'count',
} as const
export type SeriesSuffix = keyof typeof SERIES_SUFFIXES

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** The precision written after a constant: `:4` or `:exact`. */
const CONSTANT_PRECISION = String.raw`(?::(\d+|${EXACT_SETTING})\b)?`

/** Every constant in a line: `@c`, `@c:4`, `@c:exact` (1: the name, 2: the precision). */
export const CONSTANT_REF = new RegExp(`@(${NAME})${CONSTANT_PRECISION}`, 'g')

/** One constant at the current position (for the editor's tokenizer). */
export const CONSTANT_TOKEN = new RegExp(`@${NAME}${CONSTANT_PRECISION}`)

/**
 * A line that only sets a constant sheet-wide: `@c:4`, `@a_0 to angstrom`,
 * `@a_0:3 to angstrom` (1: the name, 2: the precision, 3: the unit).
 */
export const CONSTANT_DECLARATION = new RegExp(String.raw`^@(${NAME})(?::(\d+|${EXACT_SETTING}))?(?:\s+to\s+(\S.*?))?\s*$`)

// ---------------------------------------------------------------------------
// Display commands: `#sym`, `#val`, … after a line or a block's opener
// ---------------------------------------------------------------------------

/**
 * How much of a calculation to show:
 *   full  F = m·a = 2.0 kg · 9.81 m/s² = 19.6 N
 *   sym   F = m·a                       (the equation only)
 *   val   F = 19.6 N                    (the result only)
 */
export const DISPLAY_MODES = ['full', 'sym', 'val'] as const
export type DisplayMode = typeof DISPLAY_MODES[number]

/** The commands on a line: how much to show of it, or hide it. */
export const LINE_COMMANDS = [...DISPLAY_MODES, 'hide'] as const
export type LineCommand = typeof LINE_COMMANDS[number]

/** `#multiline`: one `=` per row; a layout, so it combines with the commands above. */
export const MULTILINE = 'multiline'

/** How a layout block (`Title:` with lines indented under it), or one line, is arranged. */
export const LAYOUT_STYLES = ['center', 'list', 'numbered', 'text'] as const
export type LayoutStyle = typeof LAYOUT_STYLES[number]

/** Every display command, in the order the editor lists them. (`#sci` and `#dec` are the notations, NOTATIONS.) */
export const COMMAND_NAMES = [...LINE_COMMANDS, MULTILINE, ...NOTATIONS, ...LAYOUT_STYLES] as const
export type CommandName = typeof COMMAND_NAMES[number]

/**
 * One of `names` written as a command: `#name` on its own, not inside a word
 * (1: the space or start before it, 2: the name).
 */
export const commandPattern = (names: readonly string[], flags = '') =>
  new RegExp(String.raw`(^|\s)#(${names.join('|')})(?=\s|$)`, flags)

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

/** Spaces per indentation level, in the editor and the sheets it writes. */
export const INDENT_WIDTH = 4

/** One indentation level, as typed by Tab. */
export const INDENT = ' '.repeat(INDENT_WIDTH)

/** How far a line is indented, counting a tab as one level. */
export const indentOf = (line: string) => /^[ \t]*/.exec(line)![0].replace(/\t/g, INDENT).length

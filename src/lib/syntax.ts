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

/**
 * One display setting after a name, with its colon: `:3`, `:deg`, `:sci`, or a
 * display name in quotes, `:"Moles of {Na^+}"` (which can hold spaces and colons).
 */
export const SETTING = String.raw`:(?:"[^"]*"|[^:=\s"]+)`

/** Each setting in a run of them (1: the setting, without its colon). */
export const EACH_SETTING = /:("[^"]*"|[^:=\s"]+)/g

/** Around a display name: `n_Na:"Moles of {Na^+}"`. */
export const LABEL_QUOTE = '"'

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
// The sheet's own words
// ---------------------------------------------------------------------------

/** Words with a meaning of their own in a line. */
export const KEYWORD = {
  /** Starts a multi-line function: `def f(a, b)`. */
  def: 'def',
  /** A function's result: `return E`. */
  return: 'return',
  /** A conversion: `2.0 m to cm`. */
  to: 'to',
  /** An uncertainty: `2.0 kg pm 0.1 kg`. */
  pm: 'pm',
  /** A branch in a function's body: `if v > 0`, `else if v < 0`, `else`. */
  if: 'if',
  else: 'else',
} as const

/** Calls with a meaning of their own, besides mathjs's functions. */
export const CALL = {
  table: 'table',
  plot: 'plot',
  select: 'select',
  import: 'import',
  solve: 'solve',
  tuple: 'tuple',
} as const

/** A call by name, up to its opening bracket: `plot (` (for building patterns). */
const opening = (call: string) => String.raw`${call}\s*\(`

/** `name = ` before a call that can be named: `p = plot(…)` (1: the name). */
const NAMED = String.raw`(?:(${NAME})\s*=\s*)`

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
export const DEF = new RegExp(String.raw`^${KEYWORD.def}\s+(${NAME})\s*\(([^)]*)\)((?::[^:\s]+)*)\s*:?$`)

/** The parameters of a `def` line as written in the sheet, indentation and all (1: name, 2: parameters). */
export const DEF_HEAD = new RegExp(String.raw`^\s*${KEYWORD.def}\s+(${NAME})\s*\(([^)]*)\)`)

/** A `def` line, as it starts (for telling the kind of a line). */
export const DEF_START = new RegExp(String.raw`^${KEYWORD.def}\s`)

/** A function's `return` line (1: what it returns). */
export const RETURN_LINE = new RegExp(String.raw`^${KEYWORD.return}\s+(.+)$`)

/**
 * A branch in a function's body, with the lines it holds indented under it
 * (a trailing `:` is optional, as on `def`):
 *   `if v > 0`        (1: the condition)
 *   `else if v < 0`   (1: the condition)
 *   `else`
 */
export const IF_LINE = new RegExp(String.raw`^${KEYWORD.if}\s+(.+?)\s*:?$`)
export const ELSE_IF_LINE = new RegExp(String.raw`^${KEYWORD.else}\s+${KEYWORD.if}\s+(.+?)\s*:?$`)
export const ELSE_LINE = new RegExp(String.raw`^${KEYWORD.else}\s*:?$`)

/** A line that starts a branch (for the editor: the next line is indented). */
export const BRANCH_START = new RegExp(String.raw`^(?:${KEYWORD.if}|${KEYWORD.else})(?:\s|:|$)`)

/** Unpacking a tuple: `tuple(a, b:3) = …` (1: the names, 2: the right-hand side). */
export const UNPACK = new RegExp(String.raw`^${CALL.tuple}\s*${PARAMETERS}${ASSIGNS}\s*(.+)$`)

/** The start of an unpacking, up to the `=` (1: the names). */
export const UNPACK_HEAD = new RegExp(String.raw`^${CALL.tuple}\s*${PARAMETERS}${ASSIGNS}`)

/**
 * A system of equations solved for the names on the left:
 * `tuple(v_1, v_2) = solve(m_1*u = m_1*v_1 + m_2*v_2, u = v_2 - v_1)`
 * (1: the unknowns, 2: the equations).
 */
export const SOLVE_SYSTEM = new RegExp(String.raw`^${CALL.tuple}\s*${PARAMETERS}${ASSIGNS}\s*${opening(CALL.solve)}(.*)\)$`)

/** An unpacking being typed, before its `=`: `tuple(a, b` (for the editor). */
export const UNPACK_SO_FAR = new RegExp(String.raw`^\s*${opening(CALL.tuple)}[^()=]*$`)

/** A table of series: `table(t, x, v = x / t)` (1: what's between the brackets). */
export const TABLE_CALL = new RegExp(String.raw`^${opening(CALL.table)}(.*)\)$`)

/**
 * A plot of series: `plot(t, x, y)`, or a named one, `p = plot(t, x; fit linear)`,
 * whose fit is p.slope, p.intercept (1: the name, if any; 2: what's between the brackets).
 */
export const PLOT_CALL = new RegExp(String.raw`^${NAMED}?${opening(CALL.plot)}(.*)\)$`)

/** A slice of series: `a = select(t, x; t from 0.2 to 0.8)` (1: its name, 2: what's between the brackets). */
export const SELECT_CALL = new RegExp(String.raw`^${NAMED}${opening(CALL.select)}(.*)\)$`)

/** `x = solve(…`, or a bare `solve(…` (1: the name assigned, if any). */
export const SOLVE_CALL = new RegExp(String.raw`^${NAMED}?${opening(CALL.solve)}`)

/** The calls with settings after a semicolon, and their ⚙ in the editor. */
export const CALLS_WITH_SETTINGS = [CALL.table, CALL.plot] as const
export type CallWithSettings = (typeof CALLS_WITH_SETTINGS)[number]

/** A line that opens a call with settings (1: what's before it, a plot's name too; 2: which call). */
export const SETTINGS_CALL_OPENING = new RegExp(String.raw`^(\s*(?:${NAME}\s*=\s*)?)(${CALLS_WITH_SETTINGS.join('|')})\s*\(`)

/**
 * A name with a dot: a selection's, named import's or named plot's member,
 * `a.x_1` (1: the namespace, 2: the member). Not after a digit, so 2.5 isn't
 * one. (How it's held inside, a__x_1, is in names.ts.)
 */
export const DOT_ACCESS = new RegExp(String.raw`(?<![\w.${GREEK_CHARS}])(${NAME})\.(${NAME})`, 'g')

/** Between a namespace and its member, as typed: a.x_1. */
export const MEMBER_DOT = '.'

/** Between a series' name and a member's number: t_1. */
export const SUBSCRIPT = '_'

// ---------------------------------------------------------------------------
// Comments, and values in text
// ---------------------------------------------------------------------------

/** A comment line starts with this: `// check the units`. It's never shown or worked out. */
export const COMMENT_START = '//'

/** Whether a line (indentation and all) is a comment. */
export const isComment = (line: string) => line.trimStart().startsWith(COMMENT_START)

/** A value in text, `{{c_Na}}`, `{{V:4 to mL}}` (1: what's between the braces). */
export const VALUE_IN_TEXT = /\{\{([^{}]+)\}\}/g

/**
 * An import line: `import()` (no file chosen yet) or `import("run1.csv")`,
 * with the file's rows indented under it; or a named one, `run1 = import(…)`,
 * whose columns are run1.t, run1.x (1: the name, if any; 2: the file's name).
 */
export const IMPORT = new RegExp(String.raw`^${NAMED}?${opening(CALL.import)}\s*(?:"([^"]*)")?\s*\)$`)

// ---------------------------------------------------------------------------
// Words used as settings after a `:` (besides sig figs and units)
// ---------------------------------------------------------------------------

/** Full precision: `x:exact = …`, `@c:exact`. */
export const EXACT_SETTING = 'exact'

/** Precision written as a setting: a number of sig figs, or full precision. */
export type Precision = number | typeof EXACT_SETTING

/** Always scientific (`x:sci`) or always decimal (`x:dec`) notation. */
export const NOTATION = { sci: 'sci', dec: 'dec' } as const
export type Notation = (typeof NOTATION)[keyof typeof NOTATION]
export const NOTATIONS: readonly Notation[] = Object.values(NOTATION)

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

/** Each statistic of a series, as SERIES_SUFFIXES names them: the mean, σ, σ/√n, the count. */
export const SERIES_STAT = { mean: 'mean', std: 'std', sem: 'sem', count: 'count' } as const satisfies
  Record<string, (typeof SERIES_SUFFIXES)[SeriesSuffix]>
export type SeriesSuffix = keyof typeof SERIES_SUFFIXES

// ---------------------------------------------------------------------------
// The @ namespace: built-in constants, namespaces and blocks
// ---------------------------------------------------------------------------

/**
 * What starts everything built in rather than written in the sheet: constants
 * (`@c`), namespaces (`@chem.Na`, `@chem.mm(…)`) and blocks (`@text Title {`).
 */
export const SIGIL = '@'

/** Namespaces under @, whose members are written with a dot: `@chem.Na`. */
export const NAMESPACE = { chem: 'chem' } as const
export type Namespace = (typeof NAMESPACE)[keyof typeof NAMESPACE]

/**
 * The functions in @chem:
 *   `@chem.mm({CuSO4*5H2O})`     the molar mass of a compound, in g/mol
 *   `@chem.total(n_Na, n_Cl)`    the sum of amounts of different species, as plain amounts
 */
export const CHEM_FUNCTION = { molarMass: 'mm', total: 'total' } as const
export type ChemFunction = (typeof CHEM_FUNCTION)[keyof typeof CHEM_FUNCTION]

/**
 * Blocks built in, opened `@name Title {` (the title is optional) and closed by `}`.
 * They arrange lines without scoping them (unlike `Title { }`), except
 * `@constants`, whose lines are constants usable anywhere as `@name`.
 */
export const BUILTIN_BLOCK = {
  text: 'text',
  list: 'list',
  numbered: 'numbered',
  center: 'center',
  constants: 'constants',
} as const
export type BuiltinBlock = (typeof BUILTIN_BLOCK)[keyof typeof BUILTIN_BLOCK]
export const BUILTIN_BLOCKS: readonly BuiltinBlock[] = Object.values(BUILTIN_BLOCK)

/** Words of @ that a constant of your own can't be called: the blocks and namespaces. */
export const RESERVED_CONSTANT_NAMES: ReadonlySet<string> = new Set<string>([...BUILTIN_BLOCKS, ...Object.values(NAMESPACE)])

/** A block's closing brace, at the start of a line. */
export const BLOCK_CLOSE = '}'

/** A block's opening brace, at the end of its opener. */
export const BLOCK_OPEN = '{'

/** A built-in block's opener as written: `@list Steps {`, `@text {`. */
export const builtinOpenerText = (block: BuiltinBlock, title = '') => `${SIGIL}${block}${title ? ` ${title}` : ''} ${BLOCK_OPEN}`

/** The opener of a built-in block: `@list Steps {`, `@text {` (1: the block, 2: the title, if any). */
export const BUILTIN_BLOCK_OPENER = new RegExp(String.raw`^@(${BUILTIN_BLOCKS.join('|')})(?:\s+(.*?))?\s*\{$`)

/** A constant's name, optionally a namespace's member: `c`, `chem.Na` (or chem__Na, once dots are read). */
const CONSTANT_NAME = String.raw`${NAME}(?:\.${NAME})?`

/** The precision written after a constant: `:4` or `:exact`. */
const CONSTANT_PRECISION = String.raw`(?::(\d+|${EXACT_SETTING})\b)?`

/**
 * Every constant in a line: `@c`, `@c:4`, `@c:exact`, `@chem.Na:5`
 * (1: the name, with any namespace; 2: the precision). Not a call, `@chem.mm(…)`.
 */
export const CONSTANT_REF = new RegExp(String.raw`@(${CONSTANT_NAME})(?!${NAME_CHAR}|\.|\s*\()${CONSTANT_PRECISION}`, 'g')

/** One constant at the current position (for the editor's tokenizer). */
export const CONSTANT_TOKEN = new RegExp(`@${CONSTANT_NAME}${CONSTANT_PRECISION}`)

/** A call to a namespace's function at the current position: `@chem.mm(` (for the editor; 1: the namespace, 2: the function). */
export const NAMESPACE_CALL_TOKEN = new RegExp(String.raw`@(${NAME})\.(${NAME})(?=\s*\()`)

/**
 * A line that only sets a constant sheet-wide: `@c:4`, `@a_0 to angstrom`,
 * `@a_0:3 to angstrom`, `@chem.Cl:3` (1: the name, 2: the precision, 3: the unit).
 */
export const CONSTANT_DECLARATION = new RegExp(String.raw`^@(${CONSTANT_NAME})(?::(\d+|${EXACT_SETTING}))?(?:\s+${KEYWORD.to}\s+(\S.*?))?\s*$`)

// ---------------------------------------------------------------------------
// Display commands: `#sym`, `#val`, … after a line or a block's opener
// ---------------------------------------------------------------------------

/**
 * How much of a calculation to show:
 *   full  F = m·a = 2.0 kg · 9.81 m/s² = 19.6 N
 *   sym   F = m·a                       (the equation only)
 *   val   F = 19.6 N                    (the result only)
 */
export const DISPLAY_MODE = { full: 'full', sym: 'sym', val: 'val' } as const
export type DisplayMode = (typeof DISPLAY_MODE)[keyof typeof DISPLAY_MODE]
export const DISPLAY_MODES: readonly DisplayMode[] = Object.values(DISPLAY_MODE)

/** The commands on a line: how much to show of it, or hide it. */
export const LINE_COMMAND = { ...DISPLAY_MODE, hide: 'hide' } as const
export type LineCommand = (typeof LINE_COMMAND)[keyof typeof LINE_COMMAND]
export const LINE_COMMANDS: readonly LineCommand[] = Object.values(LINE_COMMAND)

/** `#multiline`: one `=` per row; a layout, so it combines with the commands above. */
export const MULTILINE = 'multiline'

/** How a layout block (`@list Title { … }`), or one line, is arranged: the built-in blocks besides @constants. */
export const LAYOUT_STYLE = {
  center: BUILTIN_BLOCK.center, list: BUILTIN_BLOCK.list, numbered: BUILTIN_BLOCK.numbered, text: BUILTIN_BLOCK.text,
} as const satisfies Partial<Record<BuiltinBlock, BuiltinBlock>>
export type LayoutStyle = (typeof LAYOUT_STYLE)[keyof typeof LAYOUT_STYLE]
export const LAYOUT_STYLES: readonly LayoutStyle[] = Object.values(LAYOUT_STYLE)

/** The layouts a single line can take as a command: `F = m * a  #center`. (Prose, @text, is a block only.) */
export const LINE_LAYOUTS = [LAYOUT_STYLE.center, LAYOUT_STYLE.list, LAYOUT_STYLE.numbered] as const
export type LineLayout = (typeof LINE_LAYOUTS)[number]

/** Every display command, in the order the editor lists them. (`#sci` and `#dec` are the notations, NOTATIONS.) */
export const COMMAND_NAMES = [...LINE_COMMANDS, MULTILINE, ...NOTATIONS, ...LINE_LAYOUTS] as const
export type CommandName = LineCommand | typeof MULTILINE | Notation | LineLayout

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

/**
 * The sheet's punctuation: the characters its lines are built from, each
 * written out once, here. A name that gives one of them a meaning of its own
 * refers back to it (a block's `BLOCK_OPEN` is `CURLY_BRACKETS.open`, a series
 * member's `MEMBER_INDEX` is `SQUARE_BRACKETS`), so a character is never typed
 * out twice for the same thing.
 *
 * Only the sheet's own: LaTeX's braces, Word's markup and mathjs's printed
 * output are other languages, and keep their characters where they're used.
 */

// ---------------------------------------------------------------------------
// Brackets
// ---------------------------------------------------------------------------

/** Round brackets: a call's arguments, `f(x)`, and a group, `(a + b)`. */
export const ROUND_BRACKETS = { open: '(', close: ')' } as const

/** Square brackets: a list or a matrix, `[1, 2; 3, 4]`, and a series member's number, `t[3]`. */
export const SQUARE_BRACKETS = { open: '[', close: ']' } as const

/** Curly brackets: a block's body, `@latex { … }`, and a module's notation, `{Na^+}`. */
export const CURLY_BRACKETS = { open: '{', close: '}' } as const

/** Every kind of bracket: what's inside any of them is a level deeper. */
const BRACKET_PAIRS = [ROUND_BRACKETS, SQUARE_BRACKETS, CURLY_BRACKETS] as const

/** Whatever opens a bracket of any kind: `(`, `[`, `{`. */
export const OPENING_BRACKETS: ReadonlySet<string> = new Set(BRACKET_PAIRS.map((b) => b.open))

/** Whatever closes a bracket of any kind: `)`, `]`, `}`. */
export const CLOSING_BRACKETS: ReadonlySet<string> = new Set(BRACKET_PAIRS.map((b) => b.close))

// ---------------------------------------------------------------------------
// Marks between a line's parts
// ---------------------------------------------------------------------------

/** The `=` that assigns, `v = d / t` (and between a formula's or an equation's sides). */
export const ASSIGN = '='

/** Before each of a name's settings: `v:3:km/h`. */
export const SETTING_MARK = ':'

/** Between a call's parameters or arguments, a list's values, a call's settings. */
export const SEPARATOR = ','

/** mathjs's `;`: between a matrix's rows (and, in a module's call, between its arguments and its settings: `@table(t, x; rows 2-3)`). */
export const ROW_SEPARATOR = ';'

/** Around quoted text: a label, `"KBr, solid"`, a setting's value, `title "Run 1"`. */
export const QUOTE = '"'

/** mathjs's other quote, which a sheet doesn't use for its labels: `'text'`. */
export const APOSTROPHE = "'"

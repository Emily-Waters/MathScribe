/**
 * The data formats' vocabulary, each written out once, here: CSV, as imported
 * data is read (csv.ts) and its rows are marked in the editor (dataBlocks.ts),
 * and a share link's `#` part (share.ts).
 */
import { ROUND_BRACKETS, SQUARE_BRACKETS, inClass, lit, named, oneOf, regex, src } from '../syntax.ts'

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

/** What separates a row's values, in the order a header is tried for them: a comma, a tab, a semicolon. */
export const CSV_SEPARATORS = [',', '\t', ';'] as const

/** Any of them, in a row. */
export const CSV_SEPARATOR = regex(src`[${inClass(...CSV_SEPARATORS)}]`, 'g')

/** Around a value that holds a separator: `"Run 1, cart"`. */
export const CSV_QUOTE = '"'

/** A value in its quotes (1: what's inside). */
export const QUOTED_VALUE = regex(src`^${CSV_QUOTE}(.*)${CSV_QUOTE}$`)

/**
 * A column holding another's uncertainties: dx, δx, σx, delta_x, sigma_x,
 * x_unc or x_err for column x (1: the other column's name). It only counts
 * as one when there's a column x; otherwise it's a column of its own.
 */
export const UNCERTAINTY_COLUMN_PREFIXES = ['delta_', 'sigma_', 'd', 'δ', 'σ'] as const
export const UNCERTAINTY_COLUMN_SUFFIXES = ['_unc', '_err'] as const
export const UNCERTAINTY_COLUMN = [
  regex(src`^${oneOf(UNCERTAINTY_COLUMN_PREFIXES.map(lit))}(.+)$`),
  regex(src`^(.+)${oneOf(UNCERTAINTY_COLUMN_SUFFIXES.map(lit))}$`),
]

/** The brackets a column's unit can be in: `t (s)`, `t [s]`. */
const UNIT_OPENS = inClass(ROUND_BRACKETS.open, SQUARE_BRACKETS.open)
const UNIT_CLOSES = inClass(ROUND_BRACKETS.close, SQUARE_BRACKETS.close)

/** A header: a name, then optionally a unit in brackets (groups: name and unit, and the spaces and bracket before each, for where they are). */
export const HEADER = regex(
  src`^${named('lead', src`\s*`)}${named('name', src`[^${UNIT_OPENS}\s]+`)}`
  + src`(?:${named('between', src`\s*[${UNIT_OPENS}]\s*`)}${named('unit', src`[^${UNIT_CLOSES}]*?`)}\s*[${UNIT_CLOSES}])?\s*$`,
)

// ---------------------------------------------------------------------------
// File names and paths
// ---------------------------------------------------------------------------

/** Between a path's folders, `modules/series/index.ts`; and before a file name's extension, `run1.csv`. */
export const PATH_SEPARATOR = '/'
export const EXTENSION_MARK = '.'

// ---------------------------------------------------------------------------
// Share links
// ---------------------------------------------------------------------------

/** What starts a link's own part, which a shared sheet is written in: `…/#sheet1=…`. */
export const FRAGMENT_MARK = '#'

/** A link's `#` mark at the start of its part. */
export const LEADING_FRAGMENT_MARK = regex(src`^${lit(FRAGMENT_MARK)}`)

/** Between the parts after the `#`, and between each part's name and value: `sheet1=…&name=…`. */
export const PART_SEPARATOR = '&'
export const PART_ASSIGN = '='

/** base64's characters that links can't carry as they are, and base64url's for them: `+` → `-`, `/` → `_`. */
export const BASE64_URL = { '+': '-', '/': '_' } as const

/** base64's padding character, and the padding at the end, which base64url leaves off. */
const BASE64_PAD = '='
export const BASE64_PADDING = regex(src`${lit(BASE64_PAD)}+$`)

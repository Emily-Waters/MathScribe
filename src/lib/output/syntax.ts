/**
 * The Word export's vocabulary, each written out once, here: XML's (the export
 * is XML: its entities, what it escapes, its tags and attributes as KaTeX's
 * MathML writes them), the characters KaTeX's MathML uses that Word's maths
 * (omml.ts) turns into its own (accents, bars, big operators), and Word's list
 * marks (docx.ts).
 */
import { inClass, lit, regex, src } from '../syntax/patterns.ts'

// ---------------------------------------------------------------------------
// XML
// ---------------------------------------------------------------------------

/** The named entities XML has, and the characters they stand for. */
export const XML_ENTITIES: Readonly<Record<string, string>> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }

/** Around an entity, `&amp;`; and what starts a character's number in one, `&#945;` (in hexadecimal, `&#x3b1;`). */
export const XML_ENTITY_MARK = { open: '&', close: ';' } as const
export const XML_CHARACTER = { number: '#', hex: 'x', hexCapital: 'X' } as const

/** An entity in XML text (1: what's between its marks: a name, or a character's number). */
export const XML_ENTITY = regex(
  src`${lit(XML_ENTITY_MARK.open)}(${lit(XML_CHARACTER.number)}${XML_CHARACTER.hex}[0-9a-f]+|${lit(XML_CHARACTER.number)}\d+|\w+)${lit(XML_ENTITY_MARK.close)}`, 'gi',
)

/** What XML text escapes, and what each is written as. */
const XML_ESCAPES: Readonly<Record<string, string>> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }

/** Any of them. */
const XML_ESCAPED = regex(src`[${inClass(...Object.keys(XML_ESCAPES))}]`, 'g')

/** Characters XML can't hold at all (control characters, but tab and line breaks). */
// eslint-disable-next-line no-control-regex
const XML_FORBIDDEN = regex(src`[\u0000-\u0008\u000B\u000C\u000E-\u001F]`, 'g')

/** Text escaped for XML, without what it can't hold. */
export const xmlEscape = (s: string) => s.replace(XML_ESCAPED, (c) => XML_ESCAPES[c]).replace(XML_FORBIDDEN, '')

/** A tag's marks: `<m:r>`, its end, `</m:r>` or `<m:r/>`. */
const TAG = { open: '<', close: '>', end: '/' } as const

/** What XML says that isn't the document: a declaration, `<?xml …?>`, and a comment, `<!-- … -->`. */
const DECLARATION = { open: '<?', close: '?>' } as const
const COMMENT = { open: '<!--', close: '-->' } as const

/** Between an attribute's name and its value, and around its value: `mathvariant="normal"`. */
const ATTRIBUTE_ASSIGN = '='
const ATTRIBUTE_QUOTE = '"'

/** A tag's or attribute's name: `m:r`, `xml:space`. */
const XML_NAME = src`[\w:.-]+`

/** An attribute's value, in its quotes (1, where it's a group: the value). */
const quoted = (inside: string) => src`${ATTRIBUTE_QUOTE}${inside}${ATTRIBUTE_QUOTE}`
const UNQUOTED = src`[^${inClass(ATTRIBUTE_QUOTE)}]*`

/**
 * Each piece of some XML, in order: a declaration or comment (skipped), a tag
 * (1: its end mark, if it closes; 2: its name; 3: its attributes; 4: its end
 * mark, if it closes itself), or text (5).
 */
export const XML_TOKEN = regex(
  src`${lit(DECLARATION.open)}[^${inClass(TAG.close)}]*${lit(DECLARATION.close)}`
  + src`|${lit(COMMENT.open)}[\s\S]*?${lit(COMMENT.close)}`
  + src`|${lit(TAG.open)}(${lit(TAG.end)}?)(${XML_NAME})((?:\s+${XML_NAME}\s*${ATTRIBUTE_ASSIGN}\s*${quoted(UNQUOTED)})*)\s*(${lit(TAG.end)}?)${lit(TAG.close)}`
  + src`|([^${inClass(TAG.open)}]+)`,
  'g',
)

/** Each attribute in a tag's attributes (1: its name, 2: its value). */
export const XML_ATTRIBUTE = regex(src`(${XML_NAME})\s*${ATTRIBUTE_ASSIGN}\s*${quoted(src`(${UNQUOTED})`)}`, 'g')

// ---------------------------------------------------------------------------
// KaTeX's MathML characters, as Word's maths takes them
// ---------------------------------------------------------------------------

const char = String.fromCodePoint

/** The invisible operator MathML puts between a function's name and its argument (sin x). */
export const FUNCTION_APPLICATION = char(0x2061)
export const THIN_SPACE = char(0x2009)
export const EM_SPACE = char(0x2003)

/** Combining characters: Word draws an accent as one of these over its letter. */
export const COMBINING = {
  grave: char(0x300), acute: char(0x301), circumflex: char(0x302), tilde: char(0x303), overline: char(0x305),
  dot: char(0x307), diaeresis: char(0x308), caron: char(0x30c), rightArrow: char(0x20d7),
} as const

/** Accents on a letter (`\hat x`): KaTeX's character → the combining character Word uses. */
export const ACCENTS: Readonly<Record<string, string>> = {
  '^': COMBINING.circumflex, 'ˆ': COMBINING.circumflex, '~': COMBINING.tilde, '˜': COMBINING.tilde,
  '˙': COMBINING.dot, '¨': COMBINING.diaeresis, 'ˇ': COMBINING.caron, '´': COMBINING.acute, '`': COMBINING.grave,
  '→': COMBINING.rightArrow, [COMBINING.rightArrow]: COMBINING.rightArrow,
}

/** Marks KaTeX uses for a bar over a letter (`\bar t`), which Word draws as a bar, not an accent. */
export const BARS: ReadonlySet<string> = new Set(['ˉ', '¯', '‾', '_', COMBINING.overline])

/** Big operators that take limits and a body: ∑ᵢ tᵢ. */
export const NARY: ReadonlySet<string> = new Set(['∑', '∏', '∐', '∫', '∬', '∭', '∮', '⋃', '⋂', '⋁', '⋀'])

/** Operators set with space on both sides (= + ±), so wider than one character. */
export const WIDE_OPERATORS: ReadonlySet<string> = new Set(['=', '+', '−', '-', '±', '≈', '→', '<', '>', '≤', '≥'])

// ---------------------------------------------------------------------------
// Word's lists
// ---------------------------------------------------------------------------

/** A bulleted list's bullet at each level: •, then ◦, then ▪. */
export const WORD_BULLETS = ['•', '◦', '▪'] as const

/** After a numbered list's number: `1.` at the top level, `a)` in a sub-list. */
export const WORD_NUMBER_MARK = { top: '.', nested: ')' } as const

/**
 * What's written in words rather than worked out: comment lines, and the markup
 * in text (prose, headings, titles, notes, display names): subscripts, values,
 * `{{c_Na}}`, inline maths, `$x^2$`, emphasis, `**bold**`, and links; and the
 * Markdown an `@layout.text` block reads (headings, lists, quotes, rules, `$$…$$`).
 */
import { SUBSCRIPT } from './lexical.ts'
import { inClass, lit, named, regex, src } from './patterns.ts'
import { CURLY_BRACKETS, ROUND_BRACKETS, SQUARE_BRACKETS } from './punctuation.ts'

const { open: BRACE_OPEN, close: BRACE_CLOSE } = CURLY_BRACKETS

/** A character that isn't a brace. */
const NO_BRACES = src`[^${inClass(BRACE_OPEN, BRACE_CLOSE)}]`

/** Before a mark in words that's meant as itself: `\_` a plain underscore, `\*` a plain asterisk. */
export const TEXT_ESCAPE = '\\'

/** Where a mark isn't meant as itself: not straight after the escape. */
const NOT_ESCAPED = src`(?<!${lit(TEXT_ESCAPE)})`

/** A letter or digit, which a subscript in words is attached to. */
const LETTER_OR_DIGIT = src`[A-Za-z0-9]`

/** A comment line starts with this: `// check the units`. It's never shown or worked out. */
export const COMMENT_START = '//'

/**
 * A heading's mark, `#` (`##` a subsection's): only at the start of a line.
 * Anywhere else in a calculation it isn't read (a note is written after `//`).
 */
export const HEADING_MARK = '#'

/** Whether a line (indentation and all) is a comment. */
export const isComment = (line: string) => line.trimStart().startsWith(COMMENT_START)

/**
 * A subscript in words (headings, block titles, notes, display names), as in
 * names: `2p_z`, `m_ball`, `x_{max}`, after a letter or digit. `\_` is a plain
 * underscore. (Its group: subscript, braces and all.)
 */
export const TEXT_SUBSCRIPT = regex(
  src`(?<=${LETTER_OR_DIGIT})${NOT_ESCAPED}${lit(SUBSCRIPT)}${named('subscript', src`${lit(BRACE_OPEN)}${NO_BRACES}*${lit(BRACE_CLOSE)}|${LETTER_OR_DIGIT}+`)}`, 'g',
)

/** The letters or digits a subscript in words is attached to, at the end of the text before it: the `m` of `Mass of m_ball`. */
export const SUBSCRIPT_BASE = regex(src`${LETTER_OR_DIGIT}+$`)

/** A subscript as typed, without any braces: `{max}` → max. */
export const subscriptOf = (typed: string) => typed.replace(SUBSCRIPT_BRACES, '')

/** A subscript's braces, at its ends. */
const SUBSCRIPT_BRACES = regex(src`^${lit(BRACE_OPEN)}|${lit(BRACE_CLOSE)}$`, 'g')

/** `\_`, written for a plain underscore in words. */
const ESCAPED_UNDERSCORE = regex(lit(TEXT_ESCAPE + SUBSCRIPT), 'g')

/** Words with each `\_` as the plain underscore it stands for. */
export const unescapeUnderscores = (text: string) => text.replace(ESCAPED_UNDERSCORE, SUBSCRIPT)

/**
 * Emphasis in text, as Markdown writes it: `*italic*`, `**bold**`, `***both***`.
 * A run of marks opens before something that isn't a space and closes after
 * one, so `2 * 3` is just text; `\*` is a plain asterisk. (Underscores make
 * subscripts in text, so they don't make emphasis.)
 */
export const EMPHASIS_MARK = '*'

/** How many marks each emphasis takes: `*` italic, `**` bold. */
export const EMPHASIS_MARKS = { italic: 1, bold: 2 } as const

/** The most marks a run of them can be and still be emphasis: `***`, bold and italic; a longer run is just text. */
export const MOST_EMPHASIS_MARKS = EMPHASIS_MARKS.bold + EMPHASIS_MARKS.italic

/** A run of emphasis marks, not after a `\`. */
export const EMPHASIS_RUN = regex(src`${NOT_ESCAPED}${lit(EMPHASIS_MARK)}+`, 'g')

/** `\*`, written for a plain asterisk in words. */
const ESCAPED_EMPHASIS_MARK = regex(lit(TEXT_ESCAPE + EMPHASIS_MARK), 'g')

/** Words with each `\*` as the plain asterisk it stands for. */
export const unescapeEmphasisMarks = (text: string) => text.replace(ESCAPED_EMPHASIS_MARK, EMPHASIS_MARK)

/** Around a link's text, and then its address: `[the data](https://example.com/run1)`. */
const LINK_TEXT = SQUARE_BRACKETS
const LINK_ADDRESS = ROUND_BRACKETS

/** What an address that makes a link starts with: the web's, or mail's. */
const LINK_SCHEMES = src`(?:https?:\/\/|mailto:)`

/**
 * A link in text, as Markdown writes it: `[the data](https://example.com/run1)`.
 * Only a web or mail address makes one; anything else is left as typed. (Its
 * groups: text, and url.)
 */
export const TEXT_LINK = regex(
  src`${lit(LINK_TEXT.open)}${named('text', src`[^${inClass(LINK_TEXT.open, LINK_TEXT.close)}]+`)}${lit(LINK_TEXT.close)}`
  + src`${lit(LINK_ADDRESS.open)}${named('url', src`${LINK_SCHEMES}[^\s${inClass(LINK_ADDRESS.open, LINK_ADDRESS.close)}]+`)}${lit(LINK_ADDRESS.close)}`,
  'g',
)

// ---------------------------------------------------------------------------
// Markdown in an @layout.text block: its kinds of paragraph
// ---------------------------------------------------------------------------

/** The most marks a heading can have (Markdown's six levels). */
const MOST_HEADING_MARKS = 6

/**
 * A heading of a text block's own, `# Method` (`##`, `###` smaller): not
 * numbered, unlike a heading line outside one. (Its groups: marks, text.)
 */
export const TEXT_HEADING = regex(src`^${named('marks', src`${lit(HEADING_MARK)}{1,${String(MOST_HEADING_MARKS)}}`)}\s+${named('text', '.*')}$`)

/** The levels a text block's headings come in: `####` and more are drawn as `###`. */
export const TEXT_HEADING_LEVELS = 3

/** What starts each line of a quote in a text block: `> what they said`. */
export const TEXT_QUOTE_MARK = '>'

/** A quote in a text block: `> what they said`, each line of it. (Its group: text.) */
export const TEXT_QUOTE = regex(src`^${lit(TEXT_QUOTE_MARK)}\s?${named('text', '.*')}$`)

/** A rule across the page in a text block: its mark, at least so many times on a line of its own, `---`. */
export const RULE_MARK = '-'
const FEWEST_RULE_MARKS = 3

/** A rule across the page in a text block: `---` on a line of its own (three or more). */
export const TEXT_RULE = regex(src`^${lit(RULE_MARK)}{${String(FEWEST_RULE_MARKS)},}$`)

/** What starts a bulleted list's item in a text block: `- item`. */
export const BULLET_MARK = '-'

/** A bulleted list's item in a text block: `- item`. (Its group: text.) */
export const TEXT_BULLET = regex(src`^${lit(BULLET_MARK)}\s+${named('text', '.*')}$`)

/** After a numbered list's item's number: `1. item`. */
export const NUMBERED_MARK = '.'

/** A numbered list's item in a text block: `1. item` (the first item's number starts the list). (Its groups: number, text.) */
export const TEXT_NUMBERED = regex(src`^${named('number', src`\d+`)}${lit(NUMBERED_MARK)}\s+${named('text', '.*')}$`)

/** Displayed maths in a text block: `$$…$$`, over one line or several, on lines of its own. */
export const DISPLAY_MATHS_MARK = '$$'

/** A value in text's braces, as typed: `{{c_Na}}`. */
export const VALUE_BRACES = { open: BRACE_OPEN.repeat(2), close: BRACE_CLOSE.repeat(2) } as const

/** A value in text, `{{c_Na}}`, `{{V:4 to mL}}` (its group: value, what's between the braces). */
export const VALUE_IN_TEXT = regex(src`${lit(VALUE_BRACES.open)}${named('value', src`${NO_BRACES}+`)}${lit(VALUE_BRACES.close)}`, 'g')

/**
 * Between the cells of a row of text (a typed table's: `1 | 12.3 g | pale blue`);
 * one inside inline maths or a value is theirs (`$|x|$`).
 */
export const CELL_SEPARATOR = '|'

/** What starts a paragraph of prose: `> The block slides down the ramp.` */
export const PARAGRAPH_MARK = '>'

/** What starts and ends inline maths in text. */
export const MATHS_MARK = '$'

/**
 * Inline maths in text, `$x^2$`, with something in it (`$$` is just text). A
 * `{{` in it is the maths's, not a value. The one definition the tree, the
 * outputs and the engine's labels all go by.
 */
export const INLINE_MATHS = regex(src`${lit(MATHS_MARK)}[^${inClass(MATHS_MARK)}]+${lit(MATHS_MARK)}`)

/** Text split at its inline maths, each kept as a piece (for split). */
const AT_INLINE_MATHS = regex(src`(${INLINE_MATHS})`)

/** Text with `fix` made to each part outside its inline maths (the maths left as it is). */
export const outsideMaths = (text: string, fix: (part: string) => string) =>
  text.split(AT_INLINE_MATHS).map((part, i) => (i % 2 ? part : fix(part))).join('')

/** Text split into its inline maths, `$…$` (without the dollars), and the plain text between. */
export function splitInlineMath(text: string): { math: boolean; value: string }[] {
  return text
    .split(AT_INLINE_MATHS)
    .map((value, i) => (i % 2 ? { math: true, value: value.slice(MATHS_MARK.length, -MATHS_MARK.length) } : { math: false, value }))
    .filter((s) => s.value || s.math)
}

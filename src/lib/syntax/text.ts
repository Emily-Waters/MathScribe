/**
 * What's written in words rather than worked out: comment lines, and the markup
 * in text (prose, headings, titles, notes, display names): subscripts, values,
 * `{{c_Na}}`, inline maths, `$x^2$`, emphasis, `**bold**`, and links; and the
 * Markdown an `@layout.text` block reads (headings, lists, quotes, rules, `$$…$$`).
 */
import { SUBSCRIPT } from './lexical.ts'
import { named, regex, src } from './patterns.ts'

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
export const TEXT_SUBSCRIPT = regex(src`(?<=[A-Za-z0-9])(?<!\\)_${named('subscript', src`\{[^{}]*\}|[A-Za-z0-9]+`)}`, 'g')

/** The letters or digits a subscript in words is attached to, at the end of the text before it: the `m` of `Mass of m_ball`. */
export const SUBSCRIPT_BASE = /[A-Za-z0-9]+$/

/** A subscript as typed, without any braces: `{max}` → max. */
export const subscriptOf = (typed: string) => typed.replace(/^\{|\}$/g, '')

/** `\_`, written for a plain underscore in words. */
const ESCAPED_UNDERSCORE = /\\_/g

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
export const EMPHASIS_RUN = /(?<!\\)\*+/g

/** `\*`, written for a plain asterisk in words. */
const ESCAPED_EMPHASIS_MARK = /\\\*/g

/** Words with each `\*` as the plain asterisk it stands for. */
export const unescapeEmphasisMarks = (text: string) => text.replace(ESCAPED_EMPHASIS_MARK, EMPHASIS_MARK)

/**
 * A link in text, as Markdown writes it: `[the data](https://example.com/run1)`.
 * Only a web or mail address makes one; anything else is left as typed. (Its
 * groups: text, and url.)
 */
export const TEXT_LINK = /\[(?<text>[^[\]]+)\]\((?<url>(?:https?:\/\/|mailto:)[^\s()]+)\)/g

// ---------------------------------------------------------------------------
// Markdown in an @layout.text block: its kinds of paragraph
// ---------------------------------------------------------------------------

/**
 * A heading of a text block's own, `# Method` (`##`, `###` smaller): not
 * numbered, unlike a heading line outside one. (Its groups: marks, text.)
 */
export const TEXT_HEADING = /^(?<marks>#{1,6})\s+(?<text>.*)$/

/** The levels a text block's headings come in: `####` and more are drawn as `###`. */
export const TEXT_HEADING_LEVELS = 3

/** A quote in a text block: `> what they said`, each line of it. (Its group: text.) */
export const TEXT_QUOTE = /^>\s?(?<text>.*)$/

/** A rule across the page in a text block: `---` on a line of its own (three or more). */
export const TEXT_RULE = /^-{3,}$/

/** A bulleted list's item in a text block: `- item`. (Its group: text.) */
export const TEXT_BULLET = /^-\s+(?<text>.*)$/

/** A numbered list's item in a text block: `1. item` (the first item's number starts the list). (Its groups: number, text.) */
export const TEXT_NUMBERED = /^(?<number>\d+)\.\s+(?<text>.*)$/

/** Displayed maths in a text block: `$$…$$`, over one line or several, on lines of its own. */
export const DISPLAY_MATHS_MARK = '$$'

/** A value in text's braces, as typed: `{{c_Na}}`. */
export const VALUE_BRACES = { open: '{{', close: '}}' } as const

/** A value in text, `{{c_Na}}`, `{{V:4 to mL}}` (its group: value, what's between the braces). */
export const VALUE_IN_TEXT = regex(src`\{\{${named('value', '[^{}]+')}\}\}`, 'g')

/** What starts a paragraph of prose: `> The block slides down the ramp.` */
export const PARAGRAPH_MARK = '>'

/** What starts and ends inline maths in text. */
export const MATHS_MARK = '$'

/**
 * Inline maths in text, `$x^2$`, with something in it (`$$` is just text). A
 * `{{` in it is the maths's, not a value. The one definition the tree, the
 * outputs and the engine's labels all go by.
 */
export const INLINE_MATHS = /\$[^$]+\$/

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

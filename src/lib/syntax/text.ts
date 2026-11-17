/**
 * What's written in words rather than worked out: comment lines, and the markup
 * in text (prose, headings, titles, notes, display names): subscripts, values,
 * `{{c_Na}}`, and inline maths, `$x^2$`.
 */
import { SUBSCRIPT } from './lexical.ts'
import { named, regex, src } from './patterns.ts'

/** A comment line starts with this: `// check the units`. It's never shown or worked out. */
export const COMMENT_START = '//'

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

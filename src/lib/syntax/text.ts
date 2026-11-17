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

/** Inline maths in text, `$x^2$` (a `{{` in it is the maths's, not a value). */
export const INLINE_MATHS = /\$[^$]*\$/

/** Inline maths with something in it, kept as a piece when text is split at it. */
const INLINE_MATHS_PIECE = /(\$[^$]+\$)/

/** Text split into its inline maths, `$…$` (without the dollars), and the plain text between. */
export function splitInlineMath(text: string): { math: boolean; value: string }[] {
  return text
    .split(INLINE_MATHS_PIECE)
    .filter(Boolean)
    .map((s) => (s.length > 2 && s.startsWith('$') && s.endsWith('$')
      ? { math: true, value: s.slice(1, -1) }
      : { math: false, value: s }))
}

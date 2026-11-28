/**
 * LaTeX's own vocabulary: the characters and commands that MathScribe reads
 * back out of LaTeX it has written (an equation's brackets, a name's subscript,
 * a group's braces) and escapes in text, each written out once, here.
 *
 * LaTeX is a language of its own, not the sheet's: its `{` is a group, where a
 * sheet's is a block (syntax/punctuation.ts), so the two are named apart even
 * where the character is the same. LaTeX that's written out stays as it reads
 * (`\\frac{${a}}{${b}}`); what's here is what code looks for in it.
 */
import { GREEK_BY_CHAR } from '../syntax/greek.ts'
import { inClass, lit, regex, src } from '../syntax/patterns.ts'

// ---------------------------------------------------------------------------
// Characters
// ---------------------------------------------------------------------------

/** What starts a command, `\frac`, or escapes a character, `\{`. */
export const TEX_ESCAPE = '\\'

/** Around a group: a command's argument, `\frac{a}{b}`, or a subscript of more than one character, `x_{max}`. */
export const TEX_GROUP = { open: '{', close: '}' } as const

/** Before a subscript, `v_0`. */
export const TEX_SUBSCRIPT = '_'

/** Before a superscript, `m^2`. */
export const TEX_SUPERSCRIPT = '^'

/** Between a subscript's parts, `F_{\mathrm{net},x}`, and a list's items (pgfplots' `xtick={1,2}`). */
export const TEX_LIST = ','

/** A space that doesn't break (between a unit and its label, `mol~EDTA`). */
export const TEX_TIE = '~'

/** A thin space, between a number and its unit. */
export const TEX_THIN_SPACE = '\\,'

/** Between an aligned row's columns, `&= b`. */
export const TEX_ALIGN = '&'

/** Brackets as LaTeX writes them (after `\left`/`\right` when they grow): a group's or a call's, and square ones. */
export const TEX_ROUND = { open: '(', close: ')' } as const
export const TEX_SQUARE = { open: '[', close: ']' } as const

/** The characters LaTeX treats specially in text, and what each is written as there. */
const TEXT_ESCAPES: Readonly<Record<string, string>> = {
  '\\': '\\textbackslash{}', '{': '\\{', '}': '\\}', $: '\\$', '&': '\\&', '#': '\\#', '%': '\\%', _: '\\_', '^': '\\^{}', '~': '\\~{}',
}

/** Any of them. */
const TEXT_SPECIAL = regex(src`[${inClass(...Object.keys(TEXT_ESCAPES))}]`, 'g')

/** Text with the characters LaTeX treats specially escaped: `50% of a_b` → `50\% of a\_b`. */
export const escapeTexChars = (text: string) => text.replace(TEXT_SPECIAL, (c) => TEXT_ESCAPES[c])

/** What an address in `\href{…}` needs the escape before. */
export const HREF_SPECIAL = regex(src`[${inClass('%', '#')}]`, 'g')

/**
 * Characters past Latin-1 that a sheet's text uses (Greek letters, √, ≈, ≤, …),
 * which pdflatex can't set as text, as the maths that draws them. (±, ×, °, µ
 * and the like are Latin-1, which it sets as they are.)
 */
export const TEXT_AS_MATHS: ReadonlyMap<string, string> = new Map<string, string>([
  ...[...GREEK_BY_CHAR].map(([char, name]): [string, string] => [char, `${TEX_ESCAPE}${name}`]),
  ['√', '\\surd'], ['≈', '\\approx'], ['≤', '\\le'], ['≥', '\\ge'], ['≠', '\\ne'], ['∞', '\\infty'],
  ['→', '\\to'], ['←', '\\leftarrow'], ['⇌', '\\rightleftharpoons'], ['−', '-'], ['∑', '\\sum'],
  ['∆', '\\Delta'], ['′', '\\prime'], ['∝', '\\propto'], ['∂', '\\partial'],
])

/** Any of TEXT_AS_MATHS's characters. */
export const TEXT_AS_MATHS_CHAR = regex(src`[${inClass(...TEXT_AS_MATHS.keys())}]`, 'gu')

/** The signs between terms, as the engine writes them: `a+ b`, `a- b`. */
export const TEX_SIGN = { plus: '+', minus: '-' } as const

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

/** A command's name: letters. */
const COMMAND_NAME = '[a-zA-Z]+'

/** A command by name, as written: texCommand('frac') → `\frac`. */
export const texCommand = (name: string) => `${TEX_ESCAPE}${name}`

/** Any command, in a pattern: `\times`, `\pi`. */
export const ANY_COMMAND = src`${lit(TEX_ESCAPE)}${COMMAND_NAME}`

/** Some commands by name, in a pattern, each whole (`\left`, not the start of `\leftarrow`). */
export const commands = (...names: readonly string[]) => src`${lit(TEX_ESCAPE)}(?:${names.join('|')})(?![a-zA-Z])`

/** Brackets that grow with what they hold: `\left( … \right)`. */
export const TEX_SIZED = { open: texCommand('left'), close: texCommand('right') } as const

/** An environment: `\begin{aligned} … \end{aligned}`. */
export const TEX_ENVIRONMENT = { open: texCommand('begin'), close: texCommand('end') } as const

/** Angle brackets, ⟨ ⟩ (a vector's). */
export const TEX_ANGLE = { open: texCommand('langle'), close: texCommand('rangle') } as const

/** A bar, | | (an absolute value's). */
export const TEX_BAR = '|'

/** Double bars, ‖ ‖ (a norm's). */
export const TEX_NORM = `${TEX_ESCAPE}${TEX_BAR}`

/** After `\left` or `\right`, no bracket at all: `\left. … \right|`. */
export const TEX_NO_DELIMITER = '.'

/** An escaped brace, drawn as one: `\{`, `\}` (a set's). */
export const TEX_BRACE = { open: `${TEX_ESCAPE}${TEX_GROUP.open}`, close: `${TEX_ESCAPE}${TEX_GROUP.close}` } as const

/** Upright text in maths: `\mathrm{kg}`, `\text{Mass}`. */
export const TEX_UPRIGHT = [texCommand('mathrm'), texCommand('text')] as const

/** The relations a result's steps are joined with: `=`, and `≈` before a rounded one. */
export const TEX_RELATION = { equals: '=', approx: texCommand('approx') } as const

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

/** Whether there's an escaped brace at a position, `\{` or `\}` (one that's drawn, not a group's). */
export const escapedBraceAt = (tex: string, i: number) =>
  tex[i] === TEX_ESCAPE && (tex[i + 1] === TEX_GROUP.open || tex[i + 1] === TEX_GROUP.close)

/** What's in a group with groups inside it, one level deep: `\mathrm{net},x`, `a_{1}`. */
const GROUP_INSIDE = src`[^${inClass(TEX_GROUP.open, TEX_GROUP.close)}]*(?:${lit(TEX_GROUP.open)}[^${inClass(TEX_GROUP.open, TEX_GROUP.close)}]*${lit(TEX_GROUP.close)}[^${inClass(TEX_GROUP.open, TEX_GROUP.close)}]*)*`

/** A name as LaTeX that ends in its subscript's group: `F_{\mathrm{net}}` (1: F, 2: what's in the subscript). */
export const ENDS_IN_SUBSCRIPT = regex(src`^(.*?)${lit(TEX_SUBSCRIPT)}${lit(TEX_GROUP.open)}(${GROUP_INSIDE})${lit(TEX_GROUP.close)}$`)

/** A name as LaTeX with a subscript's group after it, whatever's in it (1: the name, 2: the subscript, `_{…}`). */
export const SUBSCRIPT_TAIL = regex(src`^(.*?)(${lit(TEX_SUBSCRIPT)}${lit(TEX_GROUP.open)}.*${lit(TEX_GROUP.close)})$`)

/** A subscript in a group, as a pattern piece: `_{…}`, whatever's in it. */
export const SUBSCRIPT_GROUP = src`${lit(TEX_SUBSCRIPT)}${lit(TEX_GROUP.open)}.*${lit(TEX_GROUP.close)}`

/**
 * What can follow a name or a value after a `:` (`x:3:deg`, `n:"Moles of {Na^+}"`,
 * `@c:exact`, `f:percent`), and the words that make names of their own from a
 * name: its uncertainty (`delta F`) and a series' statistics (`t_avg`).
 */
import { NAME } from './lexical.ts'
import { named, regex, src, words, type WordOf } from './patterns.ts'

// ---------------------------------------------------------------------------
// Settings after a `:`
// ---------------------------------------------------------------------------

/**
 * What a display setting can be: a display name in quotes, `"Moles of {Na^+}"`
 * (which can hold spaces and colons); a display-name template's use, `massName(H2O)`
 * (whose brackets can hold spaces); or a word, `3`, `deg`, `sci`.
 */
const SETTING_VALUE = src`"[^"]*"|${NAME}\([^()]*\)|[^:=\s"]+`

/** One display setting after a name, with its colon: `:3`, `:deg`, `:"Moles"`, `:massName(H2O)`. */
const SETTING = src`:(?:${SETTING_VALUE})`

/** Any number of settings: `:3:deg`, or none. */
export const SETTINGS = src`(?:${SETTING})*`

/** Full precision: `x:exact = …`, `@c:exact`. */
export const EXACT_SETTING = 'exact'

/** Precision written as a setting: a number of sig figs, or full precision. */
export type Precision = number | typeof EXACT_SETTING

/** Always scientific (`x:sci`) or always decimal (`x:dec`) notation. */
export const NOTATION = words({ sci: 'sci', dec: 'dec' })
export type Notation = WordOf<typeof NOTATION>

/** Show a unitless result ×100 with a % sign: `f:percent = …`, `… to percent`. */
export const PERCENT = 'percent'

// ---------------------------------------------------------------------------
// Display names: `n_Na:"Moles of {Na^+}"`, and templates for them
// ---------------------------------------------------------------------------

/** Around a display name: `n_Na:"Moles of {Na^+}"`. */
export const LABEL_QUOTE = '"'

/**
 * A display-name template's words: a one-line function whose body is words in
 * quotes, with `{{x}}` where each argument's text goes: `massName(x) = "m_{{x}}"`
 * (its group: words).
 */
export const LABEL_WORDS = regex(src`^${LABEL_QUOTE}${named('words', '[^"]*')}${LABEL_QUOTE}$`)

/** A display name made with a template, as a setting: `massName(H2O)` (its groups: template, and its arguments). */
export const TEMPLATE_USE = regex(src`^${named('template', NAME)}\(${named('arguments', '[^()]*')}\)$`)

// ---------------------------------------------------------------------------
// Names made from a name
// ---------------------------------------------------------------------------

/** `delta F` / `Delta F`: F's uncertainty, shown δF / ΔF as typed. */
export const UNCERTAINTY_WORDS = ['delta', 'Delta'] as const
export type UncertaintyWord = typeof UNCERTAINTY_WORDS[number]

/**
 * A series' statistics, each a member of it: `t.avg`, `t.std`, … and what each
 * works out. (`t` on its own is the series.)
 */
export const SERIES_SUFFIXES = {
  sum: 'sum',
  avg: 'mean',
  mean: 'mean',
  std: 'std',
  sem: 'sem',
  count: 'count',
} as const
export type SeriesSuffix = keyof typeof SERIES_SUFFIXES

/** Each statistic's name, as code writes it: SERIES_STAT_SUFFIX.avg. */
export const SERIES_STAT_SUFFIX = Object.fromEntries(Object.keys(SERIES_SUFFIXES).map((k) => [k, k])) as
  { readonly [K in SeriesSuffix]: K }

/** Each statistic of a series, as SERIES_SUFFIXES names them: the mean, σ, σ/√n, the count. */
export const SERIES_STAT = { mean: 'mean', std: 'std', sem: 'sem', count: 'count' } as const satisfies
  Record<string, (typeof SERIES_SUFFIXES)[SeriesSuffix]>

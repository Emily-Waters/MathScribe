/**
 * Fixed words of the sheet language, with what each does, for completions and
 * hover information in the editor: the language tree's terms (lib/language:
 * each entry says the words it brings, so the Reference, the AI primer and the
 * editor say the same of them), and the modules' settings after a name. (What's
 * built in under `@` describes itself: lib/builtins.ts.)
 */
import { languageTopics, moduleSettingWords } from '../lib/engine/index.ts'
import { TERM_KIND, treeTerms, type TermKind } from '../lib/language/tree.ts'

/** A word and what it does. */
interface Described {
  name: string
  description: string
}

/** The tree's terms of a kind, as the editor lists them. */
const described = (kind: TermKind): Described[] =>
  treeTerms(languageTopics(), kind).map((t) => ({ name: t.name, description: t.summary }))

/** Words that can follow a `:` on a name (besides sig figs and units), the modules' too (a vector's `:ijk`, chemistry's `:formula`). */
export const SETTING_WORDS: Described[] = [...described(TERM_KIND.setting), ...moduleSettingWords()]

/** Words of the sheet language, with what they do. */
export const KEYWORDS: Described[] = described(TERM_KIND.keyword)

/** Built-in functions people use in sheets (mathjs has many more; all of them work). */
export const BUILTIN_FUNCTIONS: { name: string; signature: string; description: string }[] =
  treeTerms(languageTopics(), TERM_KIND.function).map((t) => ({ name: t.name, signature: t.signature ?? `${t.name}(…)`, description: t.summary }))

/** Constants that are built into mathjs (no @), shown as symbols. */
export const MATH_CONSTANTS: Described[] = described(TERM_KIND.constant)

/** What a series has (t, t[1], t.avg, t.count, …), as what follows its name. */
export const SERIES_SUFFIXES: { suffix: string; description: string }[] =
  treeTerms(languageTopics(), TERM_KIND.seriesName).map((t) => ({ suffix: t.name, description: t.summary }))

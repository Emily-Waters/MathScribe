/**
 * How the sheet language's patterns and word lists are written, so every one of
 * them is written the same way.
 *
 * Patterns: `src` writes regular-expression source as it reads (no doubled
 * backslashes), taking other pieces in as they are; `named` gives a piece a
 * name, read back as `m.groups.name` rather than by its position; `regex` makes
 * the finished source a RegExp.
 *
 *   const OPENER = regex(src`^${LAYOUT_NAME}(?:\s+${named('title', '.*?')})?\s*\{$`)
 *   OPENER.exec(line)?.groups?.title
 *
 * Word lists: `words` makes the object of a set of words (`DISPLAY_MODE.sym`)
 * that also knows its words in order (`.words`), whether a string is one of them
 * (`.has`), and its alternation for patterns (`.alternation`), so none of those is
 * written out again beside it.
 */

/** A piece of a pattern: source text, or another pattern (its source). */
export type Piece = string | RegExp

/** A piece's source text. */
const sourceOf = (p: Piece) => (typeof p === 'string' ? p : p.source)

/** Regular-expression source, written as it reads, with other pieces in it: src`^${NAME}\s*=`. */
export const src = (strings: TemplateStringsArray, ...pieces: Piece[]): string =>
  String.raw({ raw: strings.raw }, ...pieces.map(sourceOf))

/** A piece as a named group: named('title', '.*?') → `(?<title>.*?)`. */
export const named = (name: string, piece: Piece) => `(?<${name}>${sourceOf(piece)})`

/** A piece that may be left out: optional(':\\d+') → `(?::\d+)?`. */
export const optional = (piece: Piece) => `(?:${sourceOf(piece)})?`

/** One of some pieces: oneOf(['a', 'b']) → `(?:a|b)`. */
export const oneOf = (pieces: readonly Piece[]) => `(?:${pieces.map(sourceOf).join('|')})`

/** Finished source as a pattern. */
export const regex = (piece: Piece, flags = '') => new RegExp(sourceOf(piece), flags)

/** A set of words, by name: `{ sym: 'sym', val: 'val' }`. */
type WordSet = Readonly<Record<string, string>>

/** What a word list knows besides its words (not enumerable, so `Object.values` and spreading see only the words). */
interface WordListInfo<W extends string> {
  /** Its words, in order. */
  readonly words: readonly W[]
  /** Whether a string is one of its words. */
  has(text: unknown): text is W
  /** Its words as alternatives, for a pattern: `full|sym|val`. */
  readonly alternation: string
}

/** A word list: its words by name (`DISPLAY_MODE.sym`), and what it knows of them. */
export type Words<T extends WordSet> = T & WordListInfo<T[keyof T]>

/** One of a word list's words, as a type: `WordOf<typeof DISPLAY_MODE>` is 'full' | 'sym' | 'val'. */
export type WordOf<W> = W extends WordListInfo<infer V> ? V : never

/** A word list from its words: words({ full: 'full', sym: 'sym', val: 'val' }). */
export function words<const T extends WordSet>(set: T): Words<T> {
  const list = Object.values(set) as T[keyof T][]
  const known: ReadonlySet<string> = new Set(list)
  const info: WordListInfo<T[keyof T]> = {
    words: list,
    has: (text: unknown): text is T[keyof T] => typeof text === 'string' && known.has(text),
    alternation: list.join('|'),
  }
  // (A word can't be named as one of these: `LAYOUT_STYLE.list` is a word, so they're named apart from any.)
  const clash = Object.keys(info).find((k) => k in set)
  if (clash) throw new Error(`A word list can't have a word named ${clash}.`)
  const out = { ...set }
  for (const [key, value] of Object.entries(info)) Object.defineProperty(out, key, { value, enumerable: false })
  return Object.freeze(out) as Words<T>
}

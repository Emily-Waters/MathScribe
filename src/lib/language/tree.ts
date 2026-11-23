/**
 * MathScribe's language as one tree: its topics (Basics, Units, Plots, …),
 * each a list of entries, each entry one feature: how it's written, what it
 * does, the rules for writing it, and whole sheets showing it. The core
 * declares its topics (lib/language/topics.ts), and each module its own
 * (EngineModule.languageTopics), placed after the topic they follow (the
 * core's, or one a module gave before).
 *
 * What MathScribe says about itself is made from this tree: the Reference tab,
 * the AI primer, the editor's hovers and the docs (see "One source for the
 * language" in CHANGELOG.md); and the tests walk it, so every example is checked
 * (it works, it's formatted, its output is as it was: lib/language/tree.test.ts,
 * golden.test.ts), and none can go out of date.
 */
import { matchesWords } from '../search.ts'

/** A whole sheet showing an entry, evaluated (live in the Reference, and by the tests). */
export interface LanguageExample {
  /** Sheet source, exactly as it's typed. */
  readonly source: string
  /** Whether it shows a warning on purpose (what's warned of is its point): otherwise it must have none. */
  readonly warns?: boolean
}

/** The kinds of word the editor suggests and describes, each a term of an entry. */
export const TERM_KIND = {
  /** A display command, `#sym`. */
  command: 'command',
  /** A word with a meaning of its own in an expression, `to`, `pm`, `delta`. */
  keyword: 'keyword',
  /** A setting after a name's `:`, `exact`, `sci`, `percent`. */
  setting: 'setting',
  /** One of mathjs's functions people use, `sqrt(x)`. */
  function: 'function',
  /** One of mathjs's constants, `pi`. */
  constant: 'constant',
  /** What a series has, as what follows its name: `.avg`, `[1]` (and the series itself, its name alone: ``). */
  seriesName: 'seriesName',
} as const
export type TermKind = (typeof TERM_KIND)[keyof typeof TERM_KIND]

/** A word the editor suggests and describes (its completion's detail, its hover), as an entry says it. */
export interface LanguageTerm {
  readonly kind: TermKind
  /** As it's written: `#sym`, `to`, `sqrt`, `.avg`. */
  readonly name: string
  /** What it does, in a phrase. */
  readonly summary: string
  /** How a function is called: `nthRoot(x, n)`. */
  readonly signature?: string
}

/** A term as it's shown: a function by how it's called (`nthRoot(x, n)`), a series' with a series' name (`t.avg`), anything else as written. */
export const termShown = (t: LanguageTerm): string =>
  t.signature ?? (t.kind === TERM_KIND.seriesName ? `${SAMPLE_SERIES}${t.name}` : t.name)

/** The series what a series has is shown on: `t.avg`. */
const SAMPLE_SERIES = 't'

/** A display command as a term: `#sym`. */
export const commandTerm = (name: string, summary: string): LanguageTerm => ({ kind: TERM_KIND.command, name: `#${name}`, summary })

/** One feature: how it's written, what's said about it, the rules for writing it, and examples of it. */
export interface LanguageEntry {
  /** How it's written, if it's one thing to write (a setting: `legend top right`, `log x`). */
  readonly syntax?: readonly string[]
  /** What it is and does, as the Reference says it. */
  readonly explain: string
  /** The words it brings, which the editor suggests and describes: `#sym`, `to`, `sqrt`. */
  readonly terms?: readonly LanguageTerm[]
  /** Do and don't for whoever writes it, people or AI models: shown in the Reference and in the AI primer. */
  readonly rules?: readonly string[]
  /** Whole sheets showing it. */
  readonly examples: readonly LanguageExample[]
}

/** A topic: its entries, under a title. */
export interface LanguageTopic {
  readonly id: string
  readonly title: string
  readonly entries: readonly LanguageEntry[]
}

/** A module's topic, and the topic it follows (by id), so the tree reads in order whatever's installed. */
export interface PlacedTopic extends LanguageTopic {
  /** The topic it comes after; if that one isn't there, it goes at the end. */
  readonly after?: string
}

/**
 * The whole tree, in order: the core's topics, with each module's placed after
 * the topic it follows (in the order the modules give them).
 */
export function languageTree(core: readonly LanguageTopic[], modules: readonly PlacedTopic[]): LanguageTopic[] {
  const tree: LanguageTopic[] = [...core]
  for (const topic of modules) {
    // (After the topic it follows, and after any placed after that one already, so they keep their order.)
    let at = tree.findIndex((t) => t.id === topic.after)
    if (at < 0) at = tree.length - 1
    while (at + 1 < tree.length && modules.some((m) => m.id === tree[at + 1].id && m.after === topic.after)) at++
    const { after: _after, ...own } = topic
    tree.splice(at + 1, 0, own)
  }
  return tree
}

/** Every example in the tree, with where it is (its topic, and the entry's number in it, from 1). */
export const treeExamples = (tree: readonly LanguageTopic[]) =>
  tree.flatMap((topic) => topic.entries.flatMap((entry, i) => entry.examples.map((example) => ({ topic, entry: i + 1, example }))))

/** Every term of a kind in the tree, in its order. */
export const treeTerms = (tree: readonly LanguageTopic[], kind: TermKind): LanguageTerm[] =>
  tree.flatMap((topic) => topic.entries.flatMap((entry) => (entry.terms ?? []).filter((t) => t.kind === kind)))

/**
 * Whether an entry matches a search (the Reference tab's): every word is in its
 * topic's title, how it's written, what it does, its terms, its rules or its
 * examples' source.
 */
export const entryMatches = (topic: LanguageTopic, entry: LanguageEntry, words: readonly string[]): boolean =>
  matchesWords([
    topic.title, ...(entry.syntax ?? []), entry.explain,
    ...(entry.terms ?? []).flatMap((t) => [termShown(t), t.summary]),
    ...(entry.rules ?? []), ...entry.examples.map((e) => e.source),
  ], words)

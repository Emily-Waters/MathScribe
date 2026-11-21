/**
 * MathScribe's language as one tree: its topics (Basics, Units, Plots, …),
 * each a list of entries, each entry one feature: how it's written, what it
 * does, the rules for writing it, and whole sheets showing it. The core
 * declares its topics (lib/language/topics.ts), and each module its own
 * (EngineModule.languageTopics), placed after the topic they follow.
 *
 * What MathScribe says about itself is made from this tree: the Reference tab,
 * the AI primer, the editor's hovers and the docs (see "One source for the
 * language" in TODO.md); and the tests walk it, so every example is checked
 * (it works, it's formatted, its output is as it was: lib/language/tree.test.ts,
 * golden.test.ts), and none can go out of date.
 */

/** A whole sheet showing an entry, evaluated (live in the Reference, and by the tests). */
export interface LanguageExample {
  /** Sheet source, exactly as it's typed. */
  readonly source: string
  /** Whether it shows a warning on purpose (what's warned of is its point): otherwise it must have none. */
  readonly warns?: boolean
}

/** One feature: what's said about it, the rules for writing it, and examples of it. */
export interface LanguageEntry {
  /** What it is and does, as the Reference says it. */
  readonly explain: string
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

/**
 * The language, described from its declarations: what the Reference, the AI
 * primer and (to come) docs/REFERENCE.md say about it is made here, from the
 * language tree and the declarations the core and the modules make, so none
 * of it is written by hand or can be out of date with what's read. (See "One source for the language" in TODO.md.)
 */
import { SIGIL } from '../syntax.ts'
import type { SettingDescription, SettingsDescription } from './settings.ts'
import { termShown, type LanguageEntry, type LanguageTopic, type PlacedTopic } from './tree.ts'

/** Code, in Markdown. */
const md = (text: string) => `\`${text}\``

/** A call's settings as written in it, after a semicolon: `@plot(…; fit linear, legend top right)`. */
export const settingsCallExample = (d: SettingsDescription): string =>
  `${SIGIL}${d.call}(…; ${d.settings.slice(1, 3).map((s) => s.examples[0]).join(', ')})`

/**
 * A choice's values, each with what it means: `points`: each row a point;
 * `lines`: …. Values that say what they mean themselves (colours) are listed:
 * one of `black`, `grey`, ….
 */
export function valuesText(s: SettingDescription, code: (text: string) => string = md): string {
  const values = s.values ?? []
  if (values.every((v) => v.means === v.value)) return `One of ${values.map((v) => code(v.value)).join(', ')}`
  return values.map((v) => `${code(v.value)}: ${v.means}`).join('; ')
}

/** A topic of the tree for a call's settings: which it is, its title, and the topic it follows. */
export interface SettingsTopicPlace {
  readonly id: string
  readonly title: string
  readonly after: string
}

/**
 * A call's settings as a topic of the language tree, made from their
 * declarations: first how settings are written in the call, then an entry for
 * each setting (how it's written, what it does and its values), each with a
 * whole sheet using it, `sample(settings)` (the call's sheet with those
 * settings in its brackets), so the tests run every setting in a real sheet.
 */
export function settingsTopic(d: SettingsDescription, place: SettingsTopicPlace, sample: (settings: string) => string): PlacedTopic {
  const call = `${SIGIL}${d.call}(…)`
  const written = settingsCallExample(d)
  const intro: LanguageEntry = {
    explain: `${call}'s settings go after a semicolon in its brackets, separated by commas: ${written}. `
      + 'Leave out any as it is by itself. Its ⚙ in the editor sets them too.',
    examples: [{ source: sample(d.settings.slice(1, 3).map((s) => s.examples[0]).join(', ')) }],
  }
  const entries = d.settings.map((s): LanguageEntry => ({
    syntax: s.examples,
    explain: s.values ? `${s.summary} ${valuesText(s, (v) => v)}.` : s.summary,
    examples: [{ source: sample(s.examples.join(', ')) }],
  }))
  return { ...place, entries: [intro, ...entries] }
}

/** Code, in a fenced block. */
const fenced = (text: string) => ['```', text, '```'].join('\n')

/**
 * The language tree as the AI primer says it, in Markdown: each topic under
 * its title, each entry as how it's written (if it's one thing) and what it
 * does, its terms (the words it brings) and rules under it, and its first
 * example (an entry with a syntax, a setting, is said in a line, without one).
 * `extras`: more to say after a topic, by its id (the constants' names, after Constants).
 */
export function primerMarkdown(tree: readonly LanguageTopic[], extras: Readonly<Record<string, string>> = {}): string {
  return tree.map((topic) => {
    const entries = topic.entries.map((entry) => {
      const written = entry.syntax ? `${entry.syntax.map(md).join(', ')}: ` : ''
      const terms = (entry.terms ?? []).map((t) => `  - ${md(termShown(t))}: ${t.summary}`)
      const rules = (entry.rules ?? []).map((rule) => `  - ${rule}`)
      const example = entry.syntax ? [] : [fenced(entry.examples[0].source)]
      return [`- ${written}${entry.explain}`, ...terms, ...rules, ...example].join('\n')
    })
    return [`## ${topic.title}`, ...entries, ...(extras[topic.id] ? [extras[topic.id]] : [])].join('\n')
  }).join('\n\n')
}

/** A heading's anchor, as GitHub makes it: `Significant figures` → `significant-figures`. */
const anchor = (title: string) => title.toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, '').trim().replace(/\s+/g, '-')

/** A table row, in Markdown (its cells written as they're to show: plain text through `plain`, code through `md`). */
const row = (cells: readonly string[]) => `| ${cells.join(' | ')} |`

/** What Markdown reads as markup in plain text: emphasis, headings, maths, tags, links, code. */
const MARKUP = /[\\`*_{}[\]<>#$|~]/g

/** Plain text as Markdown shows it as it is: `1/2 * m * v^2` not in italics, `#sym` not a heading, `$…$` not maths. */
const plain = (text: string) => text.replace(MARKUP, (c) => `\\${c}`)

/** What docs/REFERENCE.md says first: what it is, and that it's made, not written. */
const REFERENCE_HEAD = [
  '# MathScribe reference',
  '',
  'Everything a sheet can say, by topic: how each thing is written, what it does, the rules for',
  'writing it, and examples, each a whole sheet you can paste in. The Reference tab in the app',
  'shows the same, with each example worked out beside it.',
  '',
  '<!-- Made from the language tree (src/lib/language/), as the Reference tab and the AI primer are:',
  'don\'t edit it by hand. `npx vitest run -u` writes it again after the tree changes. -->',
].join('\n')

/**
 * The whole language tree as docs/REFERENCE.md: a list of its topics, then each
 * topic, each entry with how it's written, what it does, its terms, its rules and
 * every example; and the built-in constants. (A test checks the file is this.)
 */
export function referenceMarkdown(tree: readonly LanguageTopic[], constants: readonly { name: string; description: string }[]): string {
  const constantsTitle = 'Built-in constants'
  const contents = [...tree.map((t) => t.title), constantsTitle].map((title) => `[${title}](#${anchor(title)})`).join(' · ')
  const topics = tree.map((topic) => [
    `## ${topic.title}`,
    ...topic.entries.map((entry) => {
      const written = entry.syntax ? `${entry.syntax.map(md).join(', ')}: ` : ''
      const terms = entry.terms?.length
        ? ['', row(['Written', 'Does']), row(['---', '---']), ...entry.terms.map((t) => row([md(termShown(t)), plain(t.summary)]))]
        : []
      const rules = entry.rules?.length ? ['', ...entry.rules.map((rule) => `- ${plain(rule)}`)] : []
      const examples = entry.examples.flatMap((e) => ['', fenced(e.source)])
      return [`${written}${plain(entry.explain)}`, ...terms, ...rules, ...examples].join('\n')
    }),
  ].join('\n\n'))
  const constantsTable = [
    `## ${constantsTitle}`,
    '',
    'Write `@name` (3 sig figs), `@name:n`, or `@name:exact`.',
    '',
    row(['Constant', 'What it is']),
    row(['---', '---']),
    ...constants.map((c) => row([md(`${SIGIL}${c.name}`), plain(c.description)])),
  ].join('\n')
  return [REFERENCE_HEAD, `**Topics:** ${contents}`, ...topics, constantsTable].join('\n\n') + '\n'
}

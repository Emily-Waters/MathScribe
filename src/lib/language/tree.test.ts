/**
 * The language tree, checked whole: every example in it works (no errors, and
 * no warnings unless warning is its point) and is written as the formatter
 * writes it; and the tree is put together in order, whatever's installed. (Each
 * example's output is pinned too, in golden.test.ts, and its tree round-trips
 * in tree/tree.test.ts.)
 */
import { describe, expect, it } from 'vitest'
import { sheet } from '../../test/helpers.ts'
import { collectDiagnostics } from '../sheet/sheetIndex.ts'
import { formatSheet } from '../tree/format.ts'
import { languageTopics, moduleLanguageTopics, moduleSettingWords } from '../engine/index.ts'
import { BUILTINS, ConstantMember, Namespace } from '../builtins.ts'
import {
  EXACT_SETTING, KEYWORD, NOTATION, PERCENT, SERIES_SUFFIXES, SIGIL, MEMBER_DOT, MEMBER_INDEX, UNCERTAINTY_WORDS,
} from '../syntax.ts'
import { TERM_KIND, entryMatches, languageTree, treeExamples, treeTerms, type LanguageTopic, type TermKind } from './tree.ts'
import { searchWords } from '../search.ts'
import { CORE_TOPICS } from './topics.ts'

const TREE = languageTopics()

/** Where an example is, for a failure's message: `Units 3: x = 2 m`. */
const where = (topic: LanguageTopic, entry: number, source: string) => `${topic.title} ${entry}: ${source.split('\n')[0]}`

describe('every example in the language tree', () => {
  it.each(treeExamples(TREE).map((e) => [where(e.topic, e.entry, e.example.source), e.example] as const))('%s works', (_, example) => {
    const problems = [...collectDiagnostics(sheet(example.source).blocks).values()]
    expect(problems.filter((p) => p.kind === 'error').map((p) => p.message)).toEqual([])
    if (!example.warns) expect(problems.map((p) => p.message)).toEqual([])
  })

  it.each(treeExamples(TREE).map((e) => [where(e.topic, e.entry, e.example.source), e.example.source] as const))('%s is written as it’s formatted', (_, source) => {
    expect(formatSheet(source)).toBe(source)
  })
})

describe('what the language has, each in the tree (so nothing’s left undescribed)', () => {
  const names = (kind: TermKind) => treeTerms(TREE, kind).map((t) => t.name)
  /** Every example's text, to find what's written in one. */
  const written = treeExamples(TREE).map((e) => e.example.source).join('\n')

  it('every keyword and setting word is a term of an entry', () => {
    expect(names(TERM_KIND.keyword)).toEqual(expect.arrayContaining([...KEYWORD.words, UNCERTAINTY_WORDS[0]]))
    expect(names(TERM_KIND.setting)).toEqual(expect.arrayContaining([EXACT_SETTING, ...NOTATION.words, PERCENT]))
  })

  it('every statistic of a series is a term, and the series and its members', () => {
    const suffixes = Object.keys(SERIES_SUFFIXES).map((s) => `${MEMBER_DOT}${s}`)
    expect(names(TERM_KIND.seriesName)).toEqual(expect.arrayContaining(['', `${MEMBER_INDEX.open}1${MEMBER_INDEX.close}`, ...suffixes]))
  })

  // (Each lists what's missing, not every example's text.)
  it('every module’s setting after a name is written in an example', () => {
    expect(moduleSettingWords().map((s) => `:${s.name}`).filter((s) => !written.includes(s))).toEqual([])
  })

  it('everything built in under @ that a sheet can type is written in an example', () => {
    const missing: string[] = []
    for (const member of BUILTINS.walk()) {
      if (member.internal !== undefined || member instanceof ConstantMember || member instanceof Namespace) continue
      // (A chained namespace's members are written after any others of it: @layout.list(1).val.)
      const path = member.path
      const chain = new RegExp(String.raw`${SIGIL}${path[0]}(\.\w+(\(\d+\))?)*\.${path.at(-1)}\b`)
      if (!(path.length > 1 ? chain.test(written) : written.includes(`${SIGIL}${path[0]}`))) missing.push(`${SIGIL}${path.join('.')}`)
    }
    expect(missing).toEqual([])
  })
})

describe('the language tree', () => {
  it('has the core’s topics and every module’s, each with its entries and their examples, each topic once', () => {
    const ids = TREE.map((t) => t.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of [...CORE_TOPICS, ...moduleLanguageTopics()].map((t) => t.id)) expect(ids).toContain(id)
    for (const topic of TREE) {
      expect(topic.entries.length, topic.title).toBeGreaterThan(0)
      for (const entry of topic.entries) expect(entry.examples.length, `${topic.title}: ${entry.explain}`).toBeGreaterThan(0)
    }
  })

  it('places a module’s topic after the one it follows (in the order given), or at the end', () => {
    const core = [{ id: 'a', title: 'A', entries: [] }, { id: 'b', title: 'B', entries: [] }]
    const placed = languageTree(core, [
      { id: 'm1', title: 'M1', after: 'a', entries: [] },
      { id: 'm2', title: 'M2', after: 'a', entries: [] },
      { id: 'm3', title: 'M3', after: 'nowhere', entries: [] },
    ])
    expect(placed.map((t) => t.id)).toEqual(['a', 'm1', 'm2', 'b', 'm3'])
    expect(placed[1]).not.toHaveProperty('after')
  })

  it('places each module’s topic after the topic it says, the core’s or another of a module’s', () => {
    const ids = TREE.map((t) => t.id)
    for (const m of moduleLanguageTopics()) {
      if (!m.after) continue
      expect(ids, m.id).toContain(m.after)
      expect(ids.indexOf(m.id), m.id).toBeGreaterThan(ids.indexOf(m.after))
    }
  })
})

describe('searching the tree (the Reference tab)', () => {
  const found = (query: string) => languageTopics().flatMap((topic) =>
    topic.entries.filter((entry) => entryMatches(topic, entry, searchWords(query))).map(() => topic.id))

  it('finds an entry by any of its words, whatever the case and order', () => {
    expect(found('LEGEND')).toContain('plot-settings')
    expect(found('pm uncertainty').length).toBeGreaterThan(0)
  })

  it('finds every entry for a blank search, and none for a word nowhere in the tree', () => {
    expect(found('  ').length).toBe(languageTopics().flatMap((t) => t.entries).length)
    expect(found('zzqx')).toEqual([])
  })
})

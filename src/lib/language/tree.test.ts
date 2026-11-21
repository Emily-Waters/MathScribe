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
import { languageTopics, moduleLanguageTopics } from '../engine/index.ts'
import { languageTree, treeExamples, type LanguageTopic } from './tree.ts'
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

  it('follows each module’s topic after the core topic it says', () => {
    for (const m of moduleLanguageTopics()) {
      if (!m.after) continue
      expect(CORE_TOPICS.map((t) => t.id), m.id).toContain(m.after)
    }
  })
})

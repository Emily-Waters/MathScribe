/** Create: the prompt says the whole language tree, its example test holds, and an answer reads back as a sheet. */
import { describe, expect, it } from 'vitest'
import { lines, sheet } from '../../test/helpers.ts'
import { collectDiagnostics } from '../sheet/sheetIndex.ts'
import { languageTopics } from '../engine/index.ts'
import {
  CREATE_KINDS, CREATE_KIND_INFO, EXAMPLE_SHEET, buildPrompt, defaultChoices, primer, sheetFromAnswer, sheetName,
} from './aiPrompt.ts'

/** A sheet's errors and warnings, as "line: message". */
const problems = (source: string) =>
  [...collectDiagnostics(sheet(source).blocks)].map(([line, d]) => `${line}: ${d.message}`)

describe('the rules in the prompt', () => {
  // (Its other examples are the language tree's, which lib/language/tree.test.ts runs.)
  it('show an example test MathScribe accepts', () => {
    expect(problems(EXAMPLE_SHEET)).toEqual([])
  })

  it('lay the example test out as they ask: questions, then solutions in blocks', () => {
    const solutions = EXAMPLE_SHEET.indexOf('# Solutions')
    expect(solutions).toBeGreaterThan(EXAMPLE_SHEET.lastIndexOf('## Question'))
    expect(lines(EXAMPLE_SHEET).map((l) => l.source)).toContain('v = sqrt(2 * a * d)')
  })

})

describe('buildPrompt', () => {
  it('puts the rules first, then the task, the request and the ticked choices', () => {
    const prompt = buildPrompt('test', 'A midterm on momentum', defaultChoices('test'))
    expect(prompt.indexOf('# Writing MathScribe sheets')).toBeLessThan(prompt.indexOf('# Your task'))
    expect(prompt).toContain('Request: A midterm on momentum')
    expect(prompt).toContain('Include a worked solution to every question')
    expect(prompt).toContain('mark value')
    expect(prompt).not.toContain('solution blocks inside `@layout.hidden') // not ticked
    expect(prompt.trimEnd()).toMatch(/Reply with only the sheet, in a single code block\.$/)
  })

  it('asks to hide the solutions only if there are some', () => {
    expect(buildPrompt('test', 'x', { ...defaultChoices('test'), hide: true })).toContain('solution blocks inside `@layout.hidden')
    expect(buildPrompt('test', 'x', { solutions: false, hide: true })).not.toContain('solution blocks inside `@layout.hidden')
  })

  it('uses the example request when none is written', () => {
    expect(buildPrompt('lab', '  ', {})).toContain(`Request: ${CREATE_KIND_INFO.lab.placeholder}`)
  })

  it('has choices for every kind, solutions shown by default', () => {
    for (const kind of CREATE_KINDS) expect(CREATE_KIND_INFO[kind].options.length).toBeGreaterThan(0)
    expect(defaultChoices('test')).toMatchObject({ solutions: true, hide: false })
  })
})

describe('reading an answer back', () => {
  it('takes the sheet out of its code block', () => {
    expect(sheetFromAnswer('Here it is:\n```text\n# Test\nx = 1\n```\nGood luck!')).toBe('# Test\nx = 1\n')
    expect(sheetFromAnswer('# Test\r\nx = 1')).toBe('# Test\nx = 1\n')
  })

  it('names the sheet from its first heading', () => {
    expect(sheetName('> intro\n# Kinematics: practice test!\n', 'created')).toBe('kinematics-practice-test.txt')
    expect(sheetName('x = 1', 'created')).toBe('created.txt')
  })
})

describe('the primer from the language tree', () => {
  it('says every topic, entry, rule and setting the tree has, with an example of each entry that isn’t one thing to write', () => {
    const said = primer()
    for (const topic of languageTopics()) {
      expect(said).toContain(`## ${topic.title}`)
      for (const entry of topic.entries) {
        expect(said, entry.explain).toContain(entry.explain)
        for (const rule of entry.rules ?? []) expect(said, rule).toContain(rule)
        for (const written of entry.syntax ?? []) expect(said, written).toContain(`\`${written}\``)
        if (!entry.syntax) expect(said, entry.explain).toContain(entry.examples[0].source)
      }
    }
    expect(said).toContain('@k_B')
    expect(said).toContain(EXAMPLE_SHEET)
  })
})

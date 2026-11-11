/** Create: the prompt's rules hold (their examples evaluate), and an answer reads back as a sheet. */
import { describe, expect, it } from 'vitest'
import { lines, sheet } from '../test/helpers.ts'
import { collectDiagnostics } from './document.ts'
import {
  CREATE_KINDS, CREATE_KIND_INFO, EXAMPLE_SHEET, PRIMER, SNIPPETS, buildPrompt, defaultChoices, sheetFromAnswer, sheetName,
} from './aiPrompt.ts'

/** A sheet's errors and warnings, as "line: message". */
const problems = (source: string) =>
  [...collectDiagnostics(sheet(source).blocks)].map(([line, d]) => `${line}: ${d.message}`)

describe('the rules in the prompt', () => {
  it('only show examples that MathScribe accepts', () => {
    for (const [name, source] of Object.entries(SNIPPETS)) expect(problems(source), name).toEqual([])
    expect(problems(EXAMPLE_SHEET)).toEqual([])
  })

  it('lay the example test out as they ask: questions, then solutions in blocks', () => {
    const solutions = EXAMPLE_SHEET.indexOf('# Solutions')
    expect(solutions).toBeGreaterThan(EXAMPLE_SHEET.lastIndexOf('## Question'))
    expect(lines(EXAMPLE_SHEET).map((l) => l.source)).toContain('v = sqrt(2 * a * d)')
  })

  it('include every example and the constants', () => {
    for (const source of Object.values(SNIPPETS)) expect(PRIMER).toContain(source)
    expect(PRIMER).toContain('@k_B')
  })
})

describe('buildPrompt', () => {
  it('puts the rules first, then the task, the request and the ticked choices', () => {
    const prompt = buildPrompt('test', 'A midterm on momentum', defaultChoices('test'))
    expect(prompt.indexOf('# Writing MathScribe sheets')).toBeLessThan(prompt.indexOf('# Your task'))
    expect(prompt).toContain('Request: A midterm on momentum')
    expect(prompt).toContain('Include a worked solution to every question')
    expect(prompt).toContain('mark value')
    expect(prompt).not.toContain('#hide` on each solution') // not ticked
    expect(prompt.trimEnd()).toMatch(/Reply with only the sheet, in a single code block\.$/)
  })

  it('asks to hide the solutions only if there are some', () => {
    expect(buildPrompt('test', 'x', { ...defaultChoices('test'), hide: true })).toContain('#hide` on each solution')
    expect(buildPrompt('test', 'x', { solutions: false, hide: true })).not.toContain('#hide` on each solution')
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

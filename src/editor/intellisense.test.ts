/**
 * Suggestions as you type: what's offered depends on what's being typed and
 * on scope, the same scope rules as the engine.
 */
import { describe, expect, it } from 'vitest'
import { EditorState } from '@codemirror/state'
import { CompletionContext } from '@codemirror/autocomplete'
import { complete, intellisense, setSymbols } from './intellisense.ts'
import { collectSymbols } from '../lib/document.ts'
import { sheet } from '../test/helpers.ts'

const SOURCE = [
  'a_0 = 0.530 angstrom', // 1
  'psi_prob(r, psi) = 4 * pi * r^2 * psi^2', // 2
  'def KE(mass to kg, speed)', // 3
  '    E = 1/2 * mass * sp', // 4
  '    return E', // 5
  'Hydrogen 1s {', // 6
  '    psi_100 = 2', // 7
  '    p = psi_', // 8
  '}', // 9
  'x = ps', // 10
  'y = 2.5 ang', // 11
  'z = y to per', // 12
  'w = 3 * @h', // 13
  'v = 2 * KE(1 kg, 2 m/s)   #mu', // 14
  't_1 = 1.2 s', // 15
  't_2 = 1.3 s', // 16
  'q = t_', // 17
  '# Heading ps', // 18
  '> prose ps', // 19
  'n = 1e5', // 20
  'k = 2.0 kg   # mass in kil', // 21
  'm = @chem.mm.N', // 22
  '@layout.nu', // 23
  'phi:3:de', // 24
  'Steps:', // 25
  'tuple(r:3, theta:de', // 26
  'ang(y, x):3:de', // 27
  'def polar(x, y):de', // 28
  '@layout.text Notes {', // 29
  '    the mass ps', // 30
  '}', // 31
  'h = @n', // 32
  '@layout.val.', // 33
  'M = @chem.m', // 34
].join('\n')

/** The labels suggested at the end of line `n`, filtered by what's typed. */
function suggestions(n: number): string[] | null {
  let state = EditorState.create({ doc: SOURCE, extensions: [intellisense] })
  state = state.update({ effects: setSymbols.of(collectSymbols(sheet(SOURCE), SOURCE)) }).state
  const pos = state.doc.line(n).to
  const result = complete(new CompletionContext(state, pos, false))
  if (!result) return null
  const typed = state.sliceDoc(result.from, pos).toLowerCase()
  return result.options.map((o) => o.label).filter((l) => l.toLowerCase().startsWith(typed))
}

describe('suggestions', () => {
  it('offer a function’s parameters inside its body', () => {
    expect(suggestions(4)).toEqual(['speed'])
  })

  it('follow block scope', () => {
    expect(suggestions(8)).toEqual(['psi_prob', 'psi_100'])
    expect(suggestions(10)).toEqual(['psi_prob']) // psi_100 is local to the block
  })

  it('offer units after a number, and percent after to', () => {
    expect(suggestions(11)).toEqual(['angstrom'])
    expect(suggestions(12)).toEqual(['percent'])
  })

  it('offer constants after @', () => {
    expect(suggestions(13)).toEqual(['@h', '@hbar'])
  })

  it('offer the layouts and display settings after @layout. at the start of a line (not ones already chosen), and not @layout after it', () => {
    expect(suggestions(23)).toEqual(['numbered'])
    expect(suggestions(33)).toEqual(['text', 'list', 'numbered', 'center', 'titlepage', 'hidden', 'full', 'sym', 'multiline', 'sci', 'dec'])
    expect(suggestions(32)).toEqual(['@N_A'])
  })

  it('offer @chem’s functions, and mm. for an element, whose molar masses come after it', () => {
    expect(suggestions(34)).toEqual(['mm', 'mm.'])
    expect(suggestions(22)).toEqual(['N', 'Ne', 'Na', 'Ni', 'Nb', 'Nd', 'Np', 'No', 'Nh'])
  })

  it('offer display units after a : on the assigned name, but not after a block opener', () => {
    expect(suggestions(24)).toEqual(expect.arrayContaining(['deg', 'degC']))
    expect(suggestions(25)).toBeNull()
    expect(suggestions(26)).toEqual(expect.arrayContaining(['deg'])) // on a name being unpacked
    expect(suggestions(27)).toEqual(expect.arrayContaining(['deg'])) // on a function's result
    expect(suggestions(28)).toEqual(expect.arrayContaining(['deg']))
  })

  it('offer display commands after #', () => {
    expect(suggestions(14)).toEqual(['#multiline'])
  })

  it('offer series names once there are two members, and tₙ for its values rather than each one', () => {
    expect(suggestions(17)).toEqual(['t_avg', 't_count', 't_std', 't_sem'])
    const doc = 't_1 = 1.2 s\nt_2 = 1.3 s\nt_3 = 1.1 s\nq = t'
    let state = EditorState.create({ doc, extensions: [intellisense] })
    state = state.update({ effects: setSymbols.of(collectSymbols(sheet(doc), doc)) }).state
    const options = complete(new CompletionContext(state, doc.length, false))!.options
    const labels = options.map((o) => o.label)
    expect(labels).toEqual(expect.arrayContaining(['t', 'tₙ', 't_avg']))
    expect(labels).not.toContain('t_1')
    expect(options.find((o) => o.label === 'tₙ')?.detail).toBe('series (3)')
  })

  it('stay quiet in headings, prose, numbers and notes', () => {
    expect(suggestions(18)).toBeNull()
    expect(suggestions(19)).toBeNull()
    expect(suggestions(20)).toBeNull()
    expect(suggestions(21)).toBeNull()
    expect(suggestions(30)).toBeNull() // prose in an @layout.text block
  })
})

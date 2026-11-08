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

  it('offer display commands after #', () => {
    expect(suggestions(14)).toEqual(['#multiline'])
  })

  it('offer series names once there are two members', () => {
    expect(suggestions(17)).toEqual(['t_1', 't_2', 't_avg', 't_count', 't_std', 't_sem'])
  })

  it('stay quiet in headings, prose, numbers and notes', () => {
    expect(suggestions(18)).toBeNull()
    expect(suggestions(19)).toBeNull()
    expect(suggestions(20)).toBeNull()
    expect(suggestions(21)).toBeNull()
  })
})

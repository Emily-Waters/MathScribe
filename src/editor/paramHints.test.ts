/** Parameter hints: which call the cursor is in, which parameter it's at, and what the function takes. */
import { describe, expect, it } from 'vitest'
import { EditorState } from '@codemirror/state'
import { mathscribeLanguage } from './language.ts'
import { intellisense, setSymbols } from './intellisense.ts'
import { callPlace, signatureOf, splitParameters } from './paramHints.ts'
import { collectSymbols } from '../lib/sheet/sheetIndex.ts'
import { sheet } from '../test/helpers.ts'

describe('where the cursor is in a call', () => {
  it('is the innermost call still open, at the parameter its commas say', () => {
    expect(callPlace('F = E_k(1, ')).toEqual({ callee: 'E_k', argument: 1, inSettings: false })
    expect(callPlace('y = max(1, sqrt(2')).toEqual({ callee: 'sqrt', argument: 0, inSettings: false })
    // (Commas in a bracket inside the call, or in a closed call inside it, aren't its own.)
    expect(callPlace('y = max(1, (2, 3')).toEqual({ callee: 'max', argument: 1, inSettings: false })
    expect(callPlace('y = max(f(1, 2), ')).toEqual({ callee: 'max', argument: 1, inSettings: false })
  })

  it('is in a module’s settings after a `;`, and in no call once its bracket closes', () => {
    expect(callPlace('@table(t, x; ro')).toEqual({ callee: '@table', argument: 1, inSettings: true })
    expect(callPlace('y = max(1, 2)')).toBeUndefined()
    expect(callPlace('y = (1 + ')).toBeUndefined()
  })
})

describe('what a function takes', () => {
  it('splits its parameters, and its settings after a `;`', () => {
    expect(splitParameters('t, x, v = x / t')).toEqual({ params: ['t', 'x', 'v = x / t'], settings: undefined })
    expect(splitParameters('t, x; fit linear')).toEqual({ params: ['t', 'x'], settings: 'fit linear' })
  })

  it('is a sheet’s function’s parameters as written, one of MathScribe’s or one of mathjs’s', () => {
    const doc = 'E_k(n, m to kg) = n * m\nF = E_k(1, '
    let state = EditorState.create({ doc, extensions: [mathscribeLanguage, intellisense] })
    state = state.update({ effects: setSymbols.of(collectSymbols(sheet(doc), doc)) }).state
    expect(signatureOf(state, 2, 'E_k')).toEqual({ name: 'E_k', params: ['n', 'm to kg'], settings: undefined })
    expect(signatureOf(state, 2, '@table')?.name).toBe('@table')
    expect(signatureOf(state, 2, 'nthRoot')).toEqual({ name: 'nthRoot', params: ['x', 'n'], settings: undefined })
    expect(signatureOf(state, 2, 'nothing')).toBeUndefined()
  })
})

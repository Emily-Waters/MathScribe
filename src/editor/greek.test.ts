/**
 * Typing Greek letters: `\Delta` then Tab (or a space) becomes Δ, but only
 * where names are typed.
 */
import { describe, expect, it } from 'vitest'
import { EditorState, type TransactionSpec } from '@codemirror/state'
import type { EditorView } from '@codemirror/view'
import { greekCompletions, typeGreek } from './greek.ts'

/** Press Tab (with no suggestion list open) at the end of `doc`'s last line; the text after. */
function tabAtEnd(doc: string): string {
  let state = EditorState.create({ doc, selection: { anchor: doc.length } })
  const view = {
    get state() { return state },
    dispatch(spec: TransactionSpec) { state = state.update(spec).state },
  } as unknown as EditorView
  typeGreek(view)
  return state.doc.toString()
}

describe('typing Greek letters', () => {
  it('turns a letter’s name into the letter', () => {
    expect(tabAtEnd('\\Delta')).toBe('Δ')
    expect(tabAtEnd('E_f = 2.0 J\n\\omega')).toBe('E_f = 2.0 J\nω')
    expect(tabAtEnd('x = 2 * \\theta')).toBe('x = 2 * θ')
  })

  it('leaves names that aren’t letters, and places that aren’t names', () => {
    expect(tabAtEnd('\\Deltas')).toBe('\\Deltas')
    expect(tabAtEnd('# Heading \\Delta')).toBe('# Heading \\Delta')
    expect(tabAtEnd('$ \\Delta')).toBe('$ \\Delta')
    expect(tabAtEnd('x = 2   # note \\Delta')).toBe('x = 2   # note \\Delta')
    expect(tabAtEnd('Energy $\\Delta')).toBe('Energy $\\Delta') // inline maths in a title
  })

  it('suggests letters while one is typed, each typing its character', () => {
    const result = greekCompletions('x = \\De', 7)!
    expect(result.from).toBe(4)
    const delta = result.options.find((o) => o.label === '\\Delta')
    expect(delta?.apply).toBe('Δ')
    expect(greekCompletions('x = De', 6)).toBeNull()
  })
})

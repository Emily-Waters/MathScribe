/**
 * Settling a value (what App works out the sheet from): App's own renders,
 * replayed, so a sheet that's slow to work out and one that's quick can't flip
 * it between waiting and not without end (React's "too many re-renders").
 */
import { describe, expect, it } from 'vitest'
import { settle, type Settled } from './useSettled.ts'
import { EVALUATION } from './config.ts'

/** How long each sheet's text takes to work out (ms). */
const COST: Record<string, number> = { quick: 5, slow: 60, slower: 80 }

/** The settling rule before the fix: with no delay the value, else the last settled, with no key. */
const oldSettle = <T,>(settled: Settled<T>, value: T, delayMs: number) =>
  ({ shown: delayMs > 0 ? settled.value : value, next: settled })

type Rule = (settled: Settled<string>, value: string, delayMs: number, key: unknown) => { shown: string; next: Settled<string> }

/**
 * App's renders for one change (a sheet switched to, or typed in), as React
 * runs them: each state set while rendering renders again at once, before any
 * effect (so no timer fires). What's shown when it's steady, and how many
 * renders it took; Infinity if it never is.
 */
function render(rule: Rule, state: { slow: boolean; settled: Settled<string> }, text: string, key: string) {
  for (let renders = 1; renders <= 25; renders++) {
    const { shown, next } = rule(state.settled, text, state.slow ? EVALUATION.pauseMs : 0, key)
    let changed = next !== state.settled
    state.settled = next
    const nowSlow = COST[shown] >= EVALUATION.instantBelowMs
    if (nowSlow !== state.slow) {
      state.slow = nowSlow
      changed = true
    }
    if (!changed) return { shown, renders }
  }
  return { shown: undefined, renders: Infinity }
}

describe('settling the sheet App works out', () => {
  it('used to flip without end on switching from a quick sheet to a slow one', () => {
    const state = { slow: false, settled: { value: 'quick', key: 'a' } }
    expect(render(oldSettle, state, 'slow', 'b').renders).toBe(Infinity)
  })

  it('is steady at once on switching sheets, either way, and shows the sheet switched to', () => {
    const state = { slow: false, settled: { value: 'quick', key: 'a' } }
    expect(render(settle, state, 'slow', 'b')).toEqual({ shown: 'slow', renders: 2 })
    expect(state.slow).toBe(true)
    // (Waiting, and switched back: the quick sheet is shown at once, not the slow one for a while.)
    expect(render(settle, state, 'quick', 'a')).toEqual({ shown: 'quick', renders: 2 })
    expect(state.slow).toBe(false)
  })

  it('is steady when typing makes a quick sheet slow', () => {
    const state = { slow: false, settled: { value: 'quick', key: 'a' } }
    expect(render(settle, state, 'slow', 'a')).toEqual({ shown: 'slow', renders: 2 })
  })

  it('waits while typing in a slow sheet, showing the last settled text', () => {
    const state = { slow: true, settled: { value: 'slow', key: 'a' } }
    expect(render(settle, state, 'slower', 'a')).toEqual({ shown: 'slow', renders: 1 })
  })
})

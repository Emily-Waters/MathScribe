import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadDrafts, saveDrafts, uniqueName } from './files.ts'

describe('uniqueName', () => {
  it('keeps a name nobody has', () => {
    expect(uniqueName('sheet.txt', ['lab.txt'])).toBe('sheet.txt')
  })

  it('numbers a name that’s taken', () => {
    expect(uniqueName('sheet.txt', ['sheet.txt'])).toBe('sheet-2.txt')
    expect(uniqueName('sheet.txt', ['sheet.txt', 'sheet-2.txt'])).toBe('sheet-3.txt')
    expect(uniqueName('notes', ['notes'])).toBe('notes-2')
  })
})

describe('the browser’s copy of open sheets', () => {
  let store: Map<string, string>
  beforeEach(() => {
    store = new Map()
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    })
  })
  afterEach(() => vi.unstubAllGlobals())

  it('saves and restores every open sheet, and which is active', () => {
    const drafts = {
      sheets: [{ id: 'a', name: 'one.txt', text: 'x = 1' }, { id: 'b', name: 'two.txt', text: 'y = 2' }],
      active: 'b',
    }
    expect(saveDrafts(drafts)).toBe(true)
    expect(loadDrafts()).toEqual(drafts)
  })

  it('carries over the single sheet kept before tabs', () => {
    store.set('mathscribe:draft', JSON.stringify({ text: 'm = 2 kg', name: 'old.txt' }))
    expect(loadDrafts()).toEqual({ sheets: [{ id: 'sheet-1', name: 'old.txt', text: 'm = 2 kg' }], active: 'sheet-1' })
  })

  it('starts fresh when there’s nothing kept, or it can’t be read', () => {
    expect(loadDrafts()).toBeNull()
    store.set('mathscribe:drafts', '{not json')
    expect(loadDrafts()).toBeNull()
  })

  it('reports when the browser won’t keep a copy', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError')
      },
    })
    expect(saveDrafts({ sheets: [], active: '' })).toBe(false)
  })
})

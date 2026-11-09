import { describe, expect, it } from 'vitest'
import { APP_THEMES } from './appTheme.ts'
import { STORAGE_KEYS } from './config.ts'
// The page as written (Vite's ?raw import gives a file's text).
import html from '../index.html?raw'

describe('index.html’s early theme script', () => {
  // It runs before the app loads, so it can't import these; it repeats them.
  it('reads the theme from the same storage key as the app', () => {
    expect(html).toContain(`localStorage.getItem('${STORAGE_KEYS.appTheme}')`)
  })

  it('knows every app theme', () => {
    const list = /\[((?:'[a-z]+',?\s*)+)\]\.indexOf\(id\)/.exec(html)?.[1]
    const names = list?.match(/[a-z]+/g)
    expect(names?.sort()).toEqual(APP_THEMES.map((t) => t.id).sort())
  })
})

describe('storage keys', () => {
  it('are all different', () => {
    const keys = Object.values(STORAGE_KEYS)
    expect(new Set(keys).size).toBe(keys.length)
  })
})

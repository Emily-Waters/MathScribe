/** The keyboard shortcuts' list: each key as a person reads it, on a Mac and elsewhere, and the keys as they're bound. */
import { describe, expect, it } from 'vitest'
import { EDITOR_KEY, SHORTCUTS, keyLabel } from './shortcuts.ts'
import { FORMAT_KEY } from './format.ts'
import { dataBlockKeys } from './dataBlockLines.ts'

describe('a shortcut’s keys', () => {
  it('read as Ctrl+Shift+F, or ⌘⇧F on a Mac', () => {
    expect(keyLabel('Mod-Shift-f', false)).toBe('Ctrl+Shift+F')
    expect(keyLabel('Mod-Shift-f', true)).toBe('⌘⇧F')
    expect(keyLabel('Mod-/', false)).toBe('Ctrl+/')
    expect(keyLabel('Alt-ArrowUp', false)).toBe('Alt+↑')
    expect(keyLabel('F2', true)).toBe('F2')
  })

  it('are the keys as they’re bound', () => {
    expect(EDITOR_KEY.format).toBe(FORMAT_KEY)
    const bound = dataBlockKeys.map((b) => b.key)
    for (const key of [EDITOR_KEY.moveUp, EDITOR_KEY.moveDown, EDITOR_KEY.deleteLine]) expect(bound).toContain(key)
    expect(SHORTCUTS.flatMap((s) => s.keys)).toContain(EDITOR_KEY.format)
  })
})

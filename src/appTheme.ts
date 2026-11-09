import { useSyncExternalStore } from 'react'
import { STORAGE_KEYS } from './config.ts'
import { readStored, writeStored } from './lib/storage.ts'

/**
 * App colour themes. The chosen theme is applied as data-theme on <html> (its
 * colours are in App.css), with data-mode = light or dark for the syntax
 * colours. "System" follows the operating system's light/dark setting.
 *
 * index.html applies the saved theme before the page first draws (so there's no
 * flash of the wrong colours); keep its small script in step with applyAppTheme.
 * (A test checks it uses the same storage key and theme names.)
 */

/** Every app theme, with what the Theme menu shows for it (swatch: background, surface, accent). */
export const APP_THEMES = [
  { id: 'system', name: 'System', description: 'Light or Dark, following your computer’s setting', swatch: null },
  { id: 'light', name: 'Light', description: 'Light grey and white', swatch: ['#f6f7f9', '#ffffff', '#3a5bd9'] },
  { id: 'dark', name: 'Dark', description: 'Blue-grey slate', swatch: ['#12151b', '#1a1e26', '#7c96ff'] },
  { id: 'charcoal', name: 'Charcoal', description: 'Neutral greys, like a code editor’s dark theme', swatch: ['#111111', '#171717', '#3794ff'] },
  { id: 'black', name: 'Black', description: 'True black, for OLED screens and dark rooms', swatch: ['#000000', '#141414', '#5b8cff'] },
] as const

export type AppThemeId = (typeof APP_THEMES)[number]['id']

/** The themes with light text on a dark background. */
const DARK = new Set<AppThemeId>(['dark', 'charcoal', 'black'])
/** Whether the operating system is set to dark mode. */
const systemDark = () => window.matchMedia('(prefers-color-scheme: dark)').matches

/** The theme chosen last time in this browser ("system" if none). */
export function loadAppTheme(): AppThemeId {
  const saved = readStored(STORAGE_KEYS.appTheme)
  return APP_THEMES.some((t) => t.id === saved) ? saved as AppThemeId : 'system'
}

/** Remember the theme (if storage is blocked, the choice lasts until reload). */
export function saveAppTheme(id: AppThemeId): void {
  writeStored(STORAGE_KEYS.appTheme, id)
}

/** Set the theme on <html>; "system" resolves to Light or Dark now. */
export function applyAppTheme(id: AppThemeId): void {
  const theme = id === 'system' ? (systemDark() ? 'dark' : 'light') : id
  document.documentElement.dataset.theme = theme
  document.documentElement.dataset.mode = DARK.has(theme) ? 'dark' : 'light'
}

/** While "system" is chosen, follow the operating system switching light/dark. */
export function watchSystemTheme(id: AppThemeId): () => void {
  if (id !== 'system') return () => {}
  const query = window.matchMedia('(prefers-color-scheme: dark)')
  const onChange = () => applyAppTheme('system')
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}

/** Re-render when the theme on <html> changes (a new choice, or the system switching). */
function subscribe(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange)
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-mode'] })
  return () => observer.disconnect()
}

/** The theme in effect now (System resolved), and whether it's light or dark. */
export function useAppearance(): { theme: string; mode: 'light' | 'dark' } {
  const theme = useSyncExternalStore(subscribe, () => document.documentElement.dataset.theme ?? 'light')
  const mode = useSyncExternalStore(subscribe, () => (document.documentElement.dataset.mode === 'dark' ? 'dark' : 'light'))
  return { theme, mode }
}

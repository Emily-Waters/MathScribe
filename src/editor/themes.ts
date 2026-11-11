/**
 * Syntax colours. One highlight style maps each kind of token to a CSS variable
 * (--syn-number, --syn-unit, …); a theme is just a set of values for those
 * variables, in light and dark versions (see "Syntax themes" in App.css). The
 * editor picks a theme with its data-syntax-theme attribute.
 *
 * The Custom theme sets the variables inline instead, from colours the user
 * picks. Until they change one, it shows the preset they had chosen before.
 */
import { HighlightStyle } from '@codemirror/language'
import { tags } from '@lezer/highlight'
import { STORAGE_KEYS } from '../config.ts'
import { readStored, readStoredJson, writeStored, writeStoredJson } from '../lib/storage.ts'

/** The built-in syntax colour themes. */
export const PRESET_THEMES = [
  { id: 'default', name: 'Default', description: 'Muted colours that match the app' },
  { id: 'vivid', name: 'Vivid', description: 'Stronger colours; units and variables stand out' },
  { id: 'classic', name: 'Classic', description: 'Familiar code-editor colours; pairs well with the Charcoal theme' },
  { id: 'contrast', name: 'High contrast', description: 'Maximum legibility, e.g. on a projector' },
  { id: 'minimal', name: 'Minimal', description: 'Only notes, commands and headings are coloured' },
] as const

/** Every choice in the syntax theme menu: the presets, then Custom. */
export const SYNTAX_THEMES = [
  ...PRESET_THEMES,
  { id: 'custom', name: 'Custom', description: 'Your own colour for each kind of text' },
] as const

export type PresetThemeId = (typeof PRESET_THEMES)[number]['id']
export type SyntaxThemeId = (typeof SYNTAX_THEMES)[number]['id']

/** The syntax theme until another is chosen. */
export const DEFAULT_SYNTAX_THEME: PresetThemeId = 'default'

/** Whether a stored value is a syntax theme this version knows. */
export const isSyntaxTheme = (id: unknown): id is SyntaxThemeId =>
  SYNTAX_THEMES.some((t) => t.id === id)

/** Whether a stored value is one of the preset themes. */
const isPreset = (id: unknown): id is PresetThemeId =>
  PRESET_THEMES.some((t) => t.id === id)

/** The kinds of text that can be coloured, with a sample of each for the picker. */
export const SYNTAX_TOKENS = [
  { id: 'number', name: 'Numbers', sample: '9.81' },
  { id: 'unit', name: 'Units', sample: 'm/s^2' },
  { id: 'variable', name: 'Variables', sample: 'v_f' },
  { id: 'function', name: 'Functions', sample: 'sin' },
  { id: 'constant', name: 'Constants', sample: '@h' },
  { id: 'keyword', name: 'Keywords', sample: 'to' },
  { id: 'command', name: 'Commands', sample: '#val' },
  { id: 'note', name: 'Notes', sample: '# note' },
  { id: 'heading', name: 'Headings', sample: '## Forces' },
  { id: 'text', name: 'Text', sample: '> prose' },
  { id: 'latex', name: 'LaTeX', sample: '$x^2$' },
  { id: 'title', name: 'Block titles', sample: 'Steps:' },
  { id: 'operator', name: 'Operators', sample: '= * /' },
] as const

export type SyntaxToken = (typeof SYNTAX_TOKENS)[number]['id']
export type Palette = Record<SyntaxToken, string>
export type ColorMode = 'light' | 'dark'

/** A syntax colour, as the CSS variable a theme sets. */
const v = (name: string) => `var(--syn-${name})`

/** Which colour each kind of token gets. */
export const mathscribeHighlight = HighlightStyle.define([
  { tag: tags.number, color: v('number') },
  { tag: tags.unit, color: v('unit') },
  { tag: tags.variableName, color: v('variable') },
  { tag: tags.function(tags.variableName), color: v('function') },
  { tag: tags.definition(tags.function(tags.variableName)), color: v('function'), fontWeight: '600' },
  { tag: tags.constant(tags.variableName), color: v('constant') },
  { tag: tags.keyword, color: v('keyword'), fontWeight: '600' },
  { tag: tags.processingInstruction, color: v('command'), fontWeight: '600' },
  { tag: tags.lineComment, color: v('note'), fontStyle: 'italic' },
  // A `//` comment line, in the note's colour; a `{{value}}` in prose, as a variable.
  { tag: tags.comment, color: v('note'), fontStyle: 'italic' },
  { tag: tags.special(tags.variableName), color: v('variable') },
  { tag: tags.heading, color: v('heading'), fontWeight: '700' },
  { tag: tags.content, color: v('text') },
  { tag: tags.quote, color: v('note') },
  { tag: tags.special(tags.string), color: v('latex') },
  { tag: tags.labelName, color: v('title'), fontWeight: '600' },
  { tag: tags.brace, color: v('title'), fontWeight: '600' },
  { tag: tags.paren, color: v('operator') },
  { tag: tags.operator, color: v('operator') },
])

// ---------------------------------------------------------------------------
// The chosen theme
// ---------------------------------------------------------------------------

/** The theme chosen last time in this browser. */
export function loadSyntaxTheme(): SyntaxThemeId {
  const saved = readStored(STORAGE_KEYS.syntaxTheme)
  return isSyntaxTheme(saved) ? saved : DEFAULT_SYNTAX_THEME
}

/** Remember the theme (if storage is blocked, the choice lasts until reload). */
export function saveSyntaxTheme(id: SyntaxThemeId): void {
  writeStored(STORAGE_KEYS.syntaxTheme, id)
}

// ---------------------------------------------------------------------------
// The Custom theme
// ---------------------------------------------------------------------------

/**
 * The Custom theme: the preset it starts from, and the colours the user has set,
 * kept separately for light and dark app themes. A mode with no colours yet
 * shows the base preset's.
 */
export interface CustomSyntax {
  base: PresetThemeId
  light?: Partial<Palette>
  dark?: Partial<Palette>
}

/** The Custom theme's colours, as set last time in this browser. */
export function loadCustomSyntax(): CustomSyntax | null {
  const saved = readStoredJson<CustomSyntax>(STORAGE_KEYS.syntaxCustom)
  return saved && isPreset(saved.base) ? saved : null
}

/** Remember the Custom theme's colours (if storage is blocked, they last until reload). */
export function saveCustomSyntax(custom: CustomSyntax): void {
  writeStoredJson(STORAGE_KEYS.syntaxCustom, custom)
}

/** `rgb(…)`, `#abc` or a colour name as #rrggbb, for the colour picker. */
function toHex(color: string): string {
  const c = color.trim()
  if (/^#[0-9a-f]{6}$/i.test(c)) return c.toLowerCase()
  if (/^#[0-9a-f]{3}$/i.test(c)) return `#${[...c.slice(1)].map((d) => d + d).join('')}`.toLowerCase()
  const ctx = document.createElement('canvas').getContext('2d')
  if (!ctx) return '#000000'
  ctx.fillStyle = c
  return /^#[0-9a-f]{6}$/i.test(ctx.fillStyle) ? ctx.fillStyle : '#000000'
}

/**
 * A preset's colours as they look right now (in the current app theme), read
 * from the stylesheet with a hidden element using that preset.
 */
export function presetPalette(preset: PresetThemeId): Palette {
  const probe = document.createElement('div')
  probe.dataset.syntaxTheme = preset
  probe.style.display = 'none'
  document.body.append(probe)
  const style = getComputedStyle(probe)
  const palette = Object.fromEntries(SYNTAX_TOKENS.map((t) =>
    [t.id, toHex(style.getPropertyValue(`--syn-${t.id}`))])) as Palette
  probe.remove()
  return palette
}

/** The Custom theme's colours for `mode`: the user's, over the base preset's. */
export function customPalette(custom: CustomSyntax, mode: ColorMode): Palette {
  return { ...presetPalette(custom.base), ...custom[mode] }
}

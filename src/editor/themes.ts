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

export const PRESET_THEMES = [
  { id: 'default', name: 'Default', description: 'Muted colours that match the app' },
  { id: 'vivid', name: 'Vivid', description: 'Stronger colours; units and variables stand out' },
  { id: 'classic', name: 'Classic', description: 'Familiar code-editor colours; pairs well with the Charcoal theme' },
  { id: 'contrast', name: 'High contrast', description: 'Maximum legibility, e.g. on a projector' },
  { id: 'minimal', name: 'Minimal', description: 'Only notes, commands and headings are coloured' },
] as const

export const SYNTAX_THEMES = [
  ...PRESET_THEMES,
  { id: 'custom', name: 'Custom', description: 'Your own colour for each kind of text' },
] as const

export type PresetThemeId = (typeof PRESET_THEMES)[number]['id']
export type SyntaxThemeId = (typeof SYNTAX_THEMES)[number]['id']

export const DEFAULT_SYNTAX_THEME: PresetThemeId = 'default'

export const isSyntaxTheme = (id: unknown): id is SyntaxThemeId =>
  SYNTAX_THEMES.some((t) => t.id === id)

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

const v = (name: string) => `var(--syn-${name})`

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

const THEME_KEY = 'mathscribe:syntax-theme'

/** The theme chosen last time in this browser. */
export function loadSyntaxTheme(): SyntaxThemeId {
  try {
    const saved = localStorage.getItem(THEME_KEY)
    return isSyntaxTheme(saved) ? saved : DEFAULT_SYNTAX_THEME
  } catch {
    return DEFAULT_SYNTAX_THEME
  }
}

export function saveSyntaxTheme(id: SyntaxThemeId): void {
  try {
    localStorage.setItem(THEME_KEY, id)
  } catch {
    /* storage blocked: the choice lasts until reload */
  }
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

const CUSTOM_KEY = 'mathscribe:syntax-custom'

export function loadCustomSyntax(): CustomSyntax | null {
  try {
    const saved = JSON.parse(localStorage.getItem(CUSTOM_KEY) ?? 'null') as CustomSyntax | null
    return saved && isPreset(saved.base) ? saved : null
  } catch {
    return null
  }
}

export function saveCustomSyntax(custom: CustomSyntax): void {
  try {
    localStorage.setItem(CUSTOM_KEY, JSON.stringify(custom))
  } catch {
    /* storage blocked: the colours last until reload */
  }
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

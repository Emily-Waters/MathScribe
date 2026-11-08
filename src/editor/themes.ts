/**
 * Syntax colours. One highlight style maps each kind of token to a CSS variable
 * (--syn-number, --syn-unit, …); a theme is just a set of values for those
 * variables, in light and dark versions (see "Syntax themes" in App.css). The
 * editor picks a theme with its data-syntax-theme attribute.
 */
import { HighlightStyle } from '@codemirror/language'
import { tags } from '@lezer/highlight'

export const SYNTAX_THEMES = [
  { id: 'default', name: 'Default', description: 'Muted colours that match the app' },
  { id: 'vivid', name: 'Vivid', description: 'Stronger colours; units and variables stand out' },
  { id: 'contrast', name: 'High contrast', description: 'Maximum legibility, e.g. on a projector' },
  { id: 'minimal', name: 'Minimal', description: 'Only notes, commands and headings are coloured' },
] as const

export type SyntaxThemeId = (typeof SYNTAX_THEMES)[number]['id']

export const DEFAULT_SYNTAX_THEME: SyntaxThemeId = 'default'

export const isSyntaxTheme = (id: unknown): id is SyntaxThemeId =>
  SYNTAX_THEMES.some((t) => t.id === id)

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

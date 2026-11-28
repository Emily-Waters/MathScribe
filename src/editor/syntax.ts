/**
 * The editor's own vocabulary, each written out once, here: how a key is named
 * and shown, the glyphs the editor draws (its buttons, a folded block's mark),
 * a Greek letter typed by its name after a backslash (`\delta`), a colour as the
 * colour picker takes it, and what's been typed so far of a word.
 */
import { lit, regex, src } from '../lib/syntax.ts'

// ---------------------------------------------------------------------------
// Keys
// ---------------------------------------------------------------------------

/** How each part of a key's name is shown: on a Mac, and elsewhere. */
export const KEY_LABEL: Readonly<Record<string, { mac: string; other: string }>> = {
  Mod: { mac: '⌘', other: 'Ctrl' },
  Alt: { mac: '⌥', other: 'Alt' },
  Shift: { mac: '⇧', other: 'Shift' },
  ArrowUp: { mac: '↑', other: '↑' },
  ArrowDown: { mac: '↓', other: '↓' },
  Space: { mac: 'Space', other: 'Space' },
}

/** Between a key's parts as CodeMirror names it: `Mod-Shift-f`. */
export const KEY_PART_SEPARATOR = '-'

/** Each `-` between a key's parts: not the last character (`Mod-/`'s last part is `/`, and a `-` key's is `-`). */
export const BETWEEN_KEY_PARTS = regex(src`${lit(KEY_PART_SEPARATOR)}(?!$)`)

/** Between a key's parts, as shown: `Ctrl+Shift+F`; on a Mac, none: `⌘⇧F`. */
export const KEY_JOIN = { mac: '', other: '+' } as const

/** CodeMirror's name, in a theme, for the editor itself: `{ '&': { height: '100%' } }`. */
export const THEME_ROOT = '&'

/** The platforms whose keys are a Mac's (⌘ for Ctrl). */
export const MAC_PLATFORM = regex(src`Mac|iPhone|iPad`)

// ---------------------------------------------------------------------------
// Glyphs the editor draws
// ---------------------------------------------------------------------------

export const GLYPH = {
  /** A button that takes something out: an import and its data. */
  remove: '×',
  /** A block's data, hidden (shown when pressed), and shown (hidden when pressed). */
  folded: '▼',
  unfolded: '▲',
  /** What's left out: a folded block, a parameter that takes any number of values (`max(a, b, …)`). */
  more: '…',
  /** A data block's header row, in its row numbers. */
  header: '–',
} as const

// ---------------------------------------------------------------------------
// A Greek letter typed by its name: `\delta`, then Space, gives δ
// ---------------------------------------------------------------------------

/** Before a Greek letter's name, typed. */
export const GREEK_ESCAPE = '\\'

/** A Greek letter's name being typed (`\Del`), at the end of some text. */
export const GREEK_BEING_TYPED = regex(src`${lit(GREEK_ESCAPE)}[A-Za-z]*$`)

/** A whole Greek letter's name just typed, at the end of some text (1: the name). */
export const GREEK_TYPED = regex(src`${lit(GREEK_ESCAPE)}([A-Za-z]+)$`)

/** Every Greek letter's name typed in some text (1: the name). */
export const EVERY_GREEK_TYPED = regex(src`${lit(GREEK_ESCAPE)}([A-Za-z]+)`, 'g')

/** What may follow `\` while the Greek letters stay suggested. */
export const GREEK_SO_FAR = regex(src`^${lit(GREEK_ESCAPE)}[A-Za-z]*$`)

// ---------------------------------------------------------------------------
// Colours, and what's been typed so far
// ---------------------------------------------------------------------------

/** A colour as the colour picker takes it, `#rrggbb`, and its short form, `#rgb`. */
export const COLOUR_MARK = '#'
export const HEX_COLOUR = regex(src`^${lit(COLOUR_MARK)}[0-9a-f]{6}$`, 'i')
export const SHORT_HEX_COLOUR = regex(src`^${lit(COLOUR_MARK)}[0-9a-f]{3}$`, 'i')

/** What may follow a word being typed while its suggestions stay open: letters, digits, underscores. */
export const WORD_CHARS_SO_FAR = regex(src`^\w*$`)

/** What's typed of a setting or a unit: letters only. */
export const LETTERS_SO_FAR = regex(src`^[A-Za-z]*$`)

/** Letters at the end of some text: the `s` of `m/s`, the `m` of `N*m`. */
export const LETTERS_AT_END = regex(src`[A-Za-z]+$`)

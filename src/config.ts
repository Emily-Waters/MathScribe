/**
 * App-wide settings: the values that several parts of the app share, or that
 * you might want to tune, in one place.
 *
 * (Values that belong to a single format or calculation stay named at the top
 * of the module that uses them: a Word document's measurements in docx.ts, the
 * engine's rounding in engine.ts, the sheet language's words and patterns in
 * lib/syntax.ts.)
 */
import type { CalcOptions } from './lib/engine.ts'

// ---------------------------------------------------------------------------
// What the browser keeps (localStorage)
// ---------------------------------------------------------------------------

/**
 * Keys MathScribe keeps its data under in the browser. (index.html reads
 * `appTheme` before the app loads, so it repeats that key; a test checks they match.)
 */
export const STORAGE_KEYS = {
  /** Every open sheet (tab): name and text. */
  drafts: 'mathscribe:drafts',
  /** The single sheet kept before there were tabs; read once, to carry it over. */
  legacyDraft: 'mathscribe:draft',
  appTheme: 'mathscribe:app-theme',
  syntaxTheme: 'mathscribe:syntax-theme',
  syntaxCustom: 'mathscribe:syntax-custom',
  latexOptions: 'mathscribe:latex-options',
  /** Where the divider between Input and Output sits. */
  split: 'mathscribe:split',
} as const

// ---------------------------------------------------------------------------
// Calculation settings
// ---------------------------------------------------------------------------

/** The Output options a session starts with. */
export const DEFAULT_CALC_OPTIONS: CalcOptions = { precision: 'auto', showSubstitution: true, approxRounded: false }

/**
 * Fixed settings for the examples in the Reference and Library tabs, so they
 * look the same whatever the Output options say. (The tests use them too.)
 */
export const EXAMPLE_CALC_OPTIONS: CalcOptions = { precision: 'auto', showSubstitution: true }

// ---------------------------------------------------------------------------
// Sheets as files
// ---------------------------------------------------------------------------

/** Sheets are plain-text files. */
export const SHEET_FILE = {
  /** A new sheet's name. */
  defaultName: 'sheet.txt',
  extension: '.txt',
  mimeType: 'text/plain',
  /** How the file type is described in the browser's Open and Save dialogs. */
  description: 'MathScribe sheet',
} as const

// ---------------------------------------------------------------------------
// Timing (milliseconds)
// ---------------------------------------------------------------------------

/** Delays and durations. */
export const TIMING = {
  /** How long "Copied" / "Inserted" shows after a click. */
  feedbackMs: 1500,
  /** How long after the last edit a linked file is written. */
  autosaveMs: 1000,
  /** How long after the last edit the browser's copy of the sheets is updated. */
  draftSaveMs: 300,
  /** How long a download's temporary link is kept, so the browser can start it. */
  downloadLinkMs: 1000,
} as const

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

/** The divider between Input and Output, as the Input pane's share of the width (%). */
export const SPLIT = {
  min: 15,
  max: 85,
  default: 50,
  /** How far one arrow-key press moves it, and with Shift held. */
  keyStep: 2,
  bigKeyStep: 10,
} as const

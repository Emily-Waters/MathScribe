/**
 * App-wide settings: the values that several parts of the app share, or that
 * you might want to tune, in one place.
 *
 * (Values that belong to a single format or calculation stay named at the top
 * of the module that uses them: a Word document's measurements in docx.ts, the
 * engine's rounding in engine.ts, the sheet language's words and patterns in
 * lib/syntax.ts.)
 */
import { AUTO_PRECISION, UNCERTAINTY_WORKING, type CalcOptions } from './lib/engine/index.ts'
import { readStoredJson, writeStoredJson } from './lib/data/storage.ts'

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
  /** The Export dialog's format: Word or LaTeX. */
  exportFormat: 'mathscribe:export-format',
  /** Where the divider between Input and Output sits. */
  split: 'mathscribe:split',
  /** Which keys accept a suggestion in the editor. */
  acceptKeys: 'mathscribe:accept-keys',
  /** The Create dialog's last choices: what to make, the request, the tickboxes. */
  create: 'mathscribe:create',
  /** The output options: sig figs, substitution, ≈, product dots. */
  calcOptions: 'mathscribe:calc-options',
  /** Whether each line's result is shown at its end in the editor. */
  inlineResults: 'mathscribe:inline-results',
  /** The Reference tab's chosen topic. */
  referenceTopic: 'mathscribe:reference-topic',
  /** The Library tab's chosen topic. */
  libraryTopic: 'mathscribe:library-topic',
} as const

// ---------------------------------------------------------------------------
// Calculation settings
// ---------------------------------------------------------------------------

/** The Output options a session starts with. */
export const DEFAULT_CALC_OPTIONS: CalcOptions = {
  precision: AUTO_PRECISION, showSubstitution: true, approxRounded: false, productDots: false,
  uncertaintyWorking: UNCERTAINTY_WORKING.derivatives,
}

/** The output options set last time in this browser (any missing ones at their defaults). */
export const loadCalcOptions = (): CalcOptions =>
  ({ ...DEFAULT_CALC_OPTIONS, ...readStoredJson<Partial<CalcOptions>>(STORAGE_KEYS.calcOptions) })

/** Remember the output options (if storage is blocked, they last until reload). */
export const saveCalcOptions = (options: CalcOptions): void => {
  writeStoredJson(STORAGE_KEYS.calcOptions, options)
}

/**
 * When a sheet is worked out while typing. A sheet that's quick to work out is
 * worked out on every keystroke; a slow one (thousands of rows of data), once
 * typing pauses, so the editor never waits for it.
 */
export const EVALUATION = {
  /** Worked out on every keystroke if the last time took less than this (ms). */
  instantBelowMs: 25,
  /** Otherwise, worked out once typing has paused this long (ms). */
  pauseMs: 150,
} as const

/**
 * Fixed settings for the examples in the Reference and Library tabs, so they
 * look the same whatever the Output options say. (The tests use them too.)
 */
export const EXAMPLE_CALC_OPTIONS: CalcOptions = { precision: AUTO_PRECISION, showSubstitution: true }

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

/** Data files that `@import()` reads: CSV (or tab-separated) text. */
export const DATA_FILE = {
  accept: '.csv,.tsv,.txt,text/csv,text/tab-separated-values',
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

/**
 * A narrow screen (a phone, or a narrow window): Input and Output one at a
 * time, with a switch between them, and the top bar's buttons in a menu.
 * (App.css's `@media (max-width: 800px)` is the same width: keep them alike.)
 */
export const NARROW_SCREEN = '(max-width: 800px)'

/** The two panes, as a narrow screen shows one of them. */
export const PANE = { input: 'input', output: 'output' } as const
export type Pane = (typeof PANE)[keyof typeof PANE]

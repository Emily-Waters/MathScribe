/**
 * The settings button of a table or plot: a ⚙ after `@table(…)` or `@plot(…)` in
 * the editor, which opens a small panel of its settings. Changing one rewrites
 * the settings after the semicolon in the brackets (see tableSettings.ts and
 * plotSettings.ts), so the sheet's text is always what's shown. The series module
 * adds it to the editor (SeriesModule.editorExtensions).
 *
 * - A table: which rows, how the lines are drawn, the n column, showing every row.
 * - A plot: which rows, points or lines, a best-fit line, each axis's range and
 *   log scale, and a title.
 */
import { type EditorState, type Extension } from '@codemirror/state'
import { Decoration, EditorView, WidgetType } from '@codemirror/view'
import {
  CALLS_WITH_SETTINGS, PLOT_FITS, PLOT_STYLES, SERIES_CALL, TABLE_LINES, formatPlotSettings, formatTableSettings,
  parsePlotSettings, parseTableSettings, splitCallArgs, withSettingsText,
  type AxisSettings, type CallWithSettings as CallKind, type PlotFit, type PlotSettings, type PlotStyle, type TableLines, type TableSettings,
} from './public.ts'
import { ASSIGN, ROUND_BRACKETS, SIGIL, TOKEN_KIND, encode, placeFixedPanel, sheetStatements, type SheetStatement } from '../../lib/plugin.ts'

/** How each choice reads in the panels. */
const LINE_NAMES: Record<TableLines, string> = { header: 'Under the header', grid: 'Grid', none: 'None' }
const STYLE_NAMES: Record<PlotStyle, string> = { points: 'Points', lines: 'Lines', both: 'Points and lines' }
const FIT_NAMES: Record<PlotFit, string> = { none: 'None', linear: 'Linear (best-fit line)' }

/** ⚙, drawn as text rather than an emoji. */
const COG = String.fromCodePoint(0x2699, 0xfe0e)

/** A table's or plot's call: which, and where what's between its brackets is (offsets in the sheet's text). */
interface SettingsCall {
  readonly kind: CallKind
  readonly from: number
  readonly to: number
}

/** A token of a statement, and where it starts in the sheet's text. */
interface Placed {
  readonly t: string
  readonly text: string
  readonly at: number
}

/** A statement's tokens (the tree's: sheetStatements), each where it is in the sheet's text. */
const placedTokens = ({ statement, starts }: SheetStatement): Placed[] =>
  statement.tokens.map(({ token, line, at }) => ({ t: token.t, text: token.text, at: starts[line] + at }))

/** The calls with a ⚙, as written (`@table`), and which each is. */
const CALLED: ReadonlyMap<string, CallKind> = new Map(CALLS_WITH_SETTINGS.map((kind) => [`${SIGIL}${kind}`, kind]))

const isDelimiter = (p: Placed | undefined, text: string) => p?.t === TOKEN_KIND.delimiter && p.text === text
const isSpace = (p: Placed | undefined) => p?.t === TOKEN_KIND.space

/** Whether the token at `i` is the first thing said on its line, or after the name it's given (`p = @plot(…)`). */
function startsLine(tokens: readonly Placed[], i: number): boolean {
  let j = i - 1
  while (isSpace(tokens[j])) j--
  if (isDelimiter(tokens[j], ASSIGN)) {
    j--
    while (isSpace(tokens[j])) j--
    if (tokens[j]?.t !== TOKEN_KIND.symbol) return false
    j--
  }
  return j < 0 || tokens[j].t === TOKEN_KIND.indent || tokens[j].t === TOKEN_KIND.eol
}

/** The index of the `)` closing the `(` at `open` (on a later line, for a call over several), or -1. */
function closingAt(tokens: readonly Placed[], open: number): number {
  let depth = 0
  for (let i = open; i < tokens.length; i++) {
    if (isDelimiter(tokens[i], ROUND_BRACKETS.open)) depth++
    else if (isDelimiter(tokens[i], ROUND_BRACKETS.close) && --depth === 0) return i
  }
  return -1
}

/**
 * Every table and plot written as a line of its own (or a line carried on over
 * several), from the sheet's statements: a call to one, at the start of its line
 * or after the name it's given, and the bracket closing it, in the same statement.
 */
export function settingsCalls(text: string): SettingsCall[] {
  const calls: SettingsCall[] = []
  for (const statement of sheetStatements(encode(text).body)) {
    const tokens = placedTokens(statement)
    tokens.forEach((token, i) => {
      const kind = token.t === TOKEN_KIND.builtin ? CALLED.get(token.text) : undefined
      if (!kind || !startsLine(tokens, i)) return
      let open = i + 1
      while (isSpace(tokens[open])) open++
      if (!isDelimiter(tokens[open], ROUND_BRACKETS.open)) return
      const close = closingAt(tokens, open)
      if (close >= 0) calls.push({ kind, from: tokens[open].at + ROUND_BRACKETS.open.length, to: tokens[close].at })
    })
  }
  return calls
}

// ---------------------------------------------------------------------------
// Panel controls
// ---------------------------------------------------------------------------

/** A labelled row of the panel. */
function row(label: string, ...controls: (HTMLElement | string)[]): HTMLElement {
  const el = document.createElement('label')
  el.className = 'options__row'
  const span = document.createElement('span')
  span.textContent = label
  const box = document.createElement('span')
  box.className = 'cm-ms-table-menu__rows'
  box.append(...controls)
  el.append(span, controls.length === 1 && typeof controls[0] !== 'string' ? controls[0] : box)
  return el
}

/** A number box; `whole` for row numbers (1 or more), otherwise any number. Empty means "not set". */
function numberBox(value: number | undefined, placeholder: string, whole: boolean, set: (v: number | undefined) => void) {
  const input = document.createElement('input')
  input.type = 'number'
  if (whole) input.min = '1'
  else input.step = 'any'
  input.placeholder = placeholder
  input.value = value === undefined ? '' : String(value)
  input.addEventListener('change', () => {
    if (!input.value || !Number.isFinite(Number(input.value))) return set(undefined)
    set(whole ? Math.max(1, Math.round(Number(input.value))) : Number(input.value))
  })
  return input
}

function checkBox(value: boolean, set: (v: boolean) => void) {
  const input = document.createElement('input')
  input.type = 'checkbox'
  input.checked = value
  input.addEventListener('change', () => set(input.checked))
  return input
}

function choice<T extends string>(ids: readonly T[], names: Record<T, string>, value: T, set: (v: T) => void) {
  const select = document.createElement('select')
  for (const id of ids) select.add(new Option(names[id], id, false, value === id))
  select.addEventListener('change', () => set(select.value as T))
  return select
}

function help(text: string) {
  const p = document.createElement('p')
  p.className = 'options__help'
  p.textContent = text
  return p
}

/**
 * The rows boxes: from and to. Each saves only its own end, which the panel
 * merges into its current settings (so setting one keeps the other).
 */
const rowsRow = (s: { from?: number; to?: number }, save: (r: { from?: number } | { to?: number }) => void) =>
  row('Rows',
    numberBox(s.from, 'first', true, (from) => save({ from })), 'to',
    numberBox(s.to, 'last', true, (to) => save({ to })))

// ---------------------------------------------------------------------------
// The panels
// ---------------------------------------------------------------------------

/** A table's panel. `save` writes the settings into its line. */
function tablePanel(text: string | undefined, save: (settingsText: string) => void): HTMLElement[] {
  let s = parseTableSettings(text).settings
  const set = (next: TableSettings) => {
    s = next
    save(formatTableSettings(s))
  }
  return [
    rowsRow(s, (r) => set({ ...s, ...r })),
    help('Leave a row box empty for the first or last row. These are kept in the table’s brackets, after a semicolon.'),
    row('Lines', choice(TABLE_LINES, LINE_NAMES, s.lines, (lines) => set({ ...s, lines }))),
    row('Row numbers', checkBox(s.numbers, (numbers) => set({ ...s, numbers }))),
    row('Row labels', textBox(s.labels, 'a series, e.g. salts', (labels) => set({ ...s, labels }))),
    help('A series whose values go down the side in place of the row numbers: salts = @series("KCl", "KBr").'),
    row('Show every row', checkBox(s.allRows, (allRows) => set({ ...s, allRows }))),
    row('Show uncertainty', checkBox(s.uncertainty, (uncertainty) => set({ ...s, uncertainty }))),
    titleRow(s.title, (title) => set({ ...s, title })),
  ]
}

/** A text box (empty for none). */
function textBox(value: string | undefined, placeholder: string, set: (text: string | undefined) => void): HTMLInputElement {
  const box = document.createElement('input')
  box.type = 'text'
  box.className = 'cm-ms-table-menu__title'
  box.placeholder = placeholder
  box.value = value ?? ''
  box.addEventListener('change', () => set(box.value.trim() || undefined))
  return box
}

/** A title box: a table's caption, a plot's title (empty for none). */
const titleRow = (value: string | undefined, set: (title: string | undefined) => void): HTMLElement =>
  row('Title', textBox(value, 'none', set))

/** A plot's panel. */
function plotPanel(text: string | undefined, save: (settingsText: string) => void): HTMLElement[] {
  let s = parsePlotSettings(text).settings
  const set = (next: PlotSettings) => {
    s = next
    save(formatPlotSettings(s))
  }
  const axis = (name: 'x' | 'y') => {
    const update = (patch: Partial<AxisSettings>) => set({ ...s, [name]: { ...s[name], ...patch } })
    return row(`${name.toUpperCase()} axis`,
      numberBox(s[name].from, 'auto', false, (from) => update({ from })), 'to',
      numberBox(s[name].to, 'auto', false, (to) => update({ to })),
      checkBox(s[name].log, (log) => update({ log })), 'log')
  }
  return [
    rowsRow(s, (r) => set({ ...s, ...r })),
    row('Style', choice(PLOT_STYLES, STYLE_NAMES, s.style, (style) => set({ ...s, style }))),
    row('Fit', choice(PLOT_FITS, FIT_NAMES, s.fit, (fit) => set({ ...s, fit }))),
    help('A linear fit shows the line’s equation under the plot, and makes its slope and intercept variables: x_slope, x_intercept.'),
    row('Show fit equation', checkBox(s.equation, (equation) => set({ ...s, equation }))),
    axis('x'),
    axis('y'),
    help('Leave an axis box empty to fit it to the data. Points outside an axis’s range are left out: of the fit, and of a named plot’s series (p.x).'),
    row('Show uncertainty', checkBox(s.uncertainty, (uncertainty) => set({ ...s, uncertainty }))),
    help('Error bars for the points’ uncertainties. A fit still weighs each point by its uncertainty when they’re hidden.'),
    titleRow(s.title, (title) => set({ ...s, title })),
  ]
}

// ---------------------------------------------------------------------------
// Opening and closing
// ---------------------------------------------------------------------------

/** The open panel, if any (one at a time), and how to close it. */
let openPanel: { element: HTMLElement; close: () => void } | null = null

/** Open the settings panel for the table or plot whose ⚙ is at `place` (just after its closing bracket), under `button`. */
function openSettings(view: EditorView, button: HTMLElement, place: number): void {
  openPanel?.close()
  const call = settingsCalls(view.state.doc.toString()).find((c) => c.to + ROUND_BRACKETS.close.length === place)
  if (!call) return
  const settingsText = splitCallArgs(view.state.doc.sliceString(call.from, call.to)).settings

  /** Write settings text between the call's brackets (the call is the one starting where it did). */
  const save = (text: string) => {
    const now = settingsCalls(view.state.doc.toString()).find((c) => c.from === call.from)
    if (!now) return
    const inside = view.state.doc.sliceString(now.from, now.to)
    const next = withSettingsText(inside, { from: 0, to: inside.length }, text)
    if (next !== inside) view.dispatch({ changes: { from: now.from, to: now.to, insert: next }, userEvent: 'input.settings' })
  }

  const panel = document.createElement('div')
  panel.className = 'options__panel cm-ms-table-menu'
  panel.setAttribute('role', 'group')
  panel.setAttribute('aria-label', call.kind === SERIES_CALL.table ? 'Table settings' : 'Plot settings')
  panel.append(...(call.kind === SERIES_CALL.table ? tablePanel : plotPanel)(settingsText, save))

  // Beside the button, kept fully on screen.
  const at = button.getBoundingClientRect()
  document.body.append(panel)
  const keepPlaced = placeFixedPanel(panel, at)

  const onDown = (e: MouseEvent) => {
    if (!panel.contains(e.target as Node) && e.target !== button) close()
  }
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      close()
      view.focus()
    }
  }
  const close = () => {
    keepPlaced()
    panel.remove()
    document.removeEventListener('mousedown', onDown, true)
    document.removeEventListener('keydown', onKey, true)
    if (openPanel?.element === panel) openPanel = null
  }
  document.addEventListener('mousedown', onDown, true)
  document.addEventListener('keydown', onKey, true)
  openPanel = { element: panel, close }
}

/** The ⚙ after a table's or plot's closing bracket. */
class SettingsButton extends WidgetType {
  readonly kind: CallKind
  constructor(kind: CallKind) {
    super()
    this.kind = kind
  }
  eq(other: SettingsButton) {
    return other.kind === this.kind
  }
  toDOM(view: EditorView) {
    const button = document.createElement('button')
    button.className = 'cm-ms-import-button cm-ms-table-settings'
    button.textContent = COG
    button.title = this.kind === SERIES_CALL.table ? 'Table settings: rows, lines, row numbers' : 'Plot settings: rows, style, fit, axes, title'
    button.setAttribute('aria-label', this.kind === SERIES_CALL.table ? 'Table settings' : 'Plot settings')
    button.addEventListener('mousedown', (e) => e.preventDefault())
    button.addEventListener('click', (e) => {
      e.preventDefault()
      // A second click on the button closes its panel.
      if (openPanel) {
        openPanel.close()
        return
      }
      openSettings(view, button, view.posAtDOM(button))
    })
    return button
  }
  ignoreEvent() {
    return true
  }
}

const buttons: Record<CallKind, Decoration> = {
  [SERIES_CALL.table]: Decoration.widget({ widget: new SettingsButton(SERIES_CALL.table), side: 1 }),
  [SERIES_CALL.plot]: Decoration.widget({ widget: new SettingsButton(SERIES_CALL.plot), side: 1 }),
}

/** A ⚙ after each table's and plot's closing bracket (on its last line, for one over several). */
function settingsButtons(state: EditorState) {
  return Decoration.set(settingsCalls(state.doc.toString()).map((c) => buttons[c.kind].range(c.to + ROUND_BRACKETS.close.length)))
}

/** Tables' and plots' settings buttons and their panels. */
export const tableMenu: Extension = [
  EditorView.decorations.compute(['doc'], settingsButtons),
  EditorView.baseTheme({
    '.cm-ms-table-settings': { marginLeft: '10px', minWidth: '24px', padding: '0 6px', fontSize: '15px', lineHeight: '1.25' },
  }),
]

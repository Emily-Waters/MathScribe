/**
 * The settings button of a table or plot: a ⚙ after `table(…)` or `plot(…)` in
 * the editor, which opens a small panel of its settings. Changing one rewrites
 * the settings after the semicolon in the brackets (see lib/tableSettings.ts and
 * lib/plotSettings.ts), so the sheet's text is always what's shown.
 *
 * - A table: which rows, how the lines are drawn, the n column, showing every row.
 * - A plot: which rows, points or lines, a best-fit line, each axis's range and
 *   log scale, and a title.
 */
import { type EditorState, type Extension } from '@codemirror/state'
import { Decoration, EditorView, WidgetType } from '@codemirror/view'
import {
  TABLE_LINES, formatTableSettings, parseTableSettings, splitCallArgs, withSettingsText,
  type TableLines, type TableSettings,
} from '../lib/tableSettings.ts'
import {
  PLOT_FITS, PLOT_STYLES, formatPlotSettings, parsePlotSettings,
  type AxisSettings, type PlotFit, type PlotSettings, type PlotStyle,
} from '../lib/plotSettings.ts'
import { CALL, SETTINGS_CALL_OPENING as CALL_OPENING, type CallWithSettings as CallKind } from '../lib/syntax.ts'

/** How each choice reads in the panels. */
const LINE_NAMES: Record<TableLines, string> = { header: 'Under the header', grid: 'Grid', none: 'None' }
const STYLE_NAMES: Record<PlotStyle, string> = { points: 'Points', lines: 'Lines', both: 'Points and lines' }
const FIT_NAMES: Record<PlotFit, string> = { none: 'None', linear: 'Linear (best-fit line)' }

/** ⚙, drawn as text rather than an emoji. */
const COG = String.fromCodePoint(0x2699, 0xfe0e)

/** A table or plot line: which, and where what's between its brackets is (offsets in the line). */
function callBrackets(text: string): { kind: CallKind; from: number; to: number } | null {
  const m = CALL_OPENING.exec(text)
  if (!m) return null
  const from = m[0].length
  let depth = 1
  let quoted = false
  for (let i = from; i < text.length; i++) {
    if (text[i] === '"') quoted = !quoted
    else if (quoted) continue
    else if (text[i] === '(') depth++
    else if (text[i] === ')' && --depth === 0) return { kind: m[2] as CallKind, from, to: i }
  }
  return null
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
    row('Row numbers (n)', checkBox(s.numbers, (numbers) => set({ ...s, numbers }))),
    row('Show every row', checkBox(s.allRows, (allRows) => set({ ...s, allRows }))),
  ]
}

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
  const title = document.createElement('input')
  title.type = 'text'
  title.className = 'cm-ms-table-menu__title'
  title.placeholder = 'none'
  title.value = s.title ?? ''
  title.addEventListener('change', () => set({ ...s, title: title.value.trim() || undefined }))
  return [
    rowsRow(s, (r) => set({ ...s, ...r })),
    row('Style', choice(PLOT_STYLES, STYLE_NAMES, s.style, (style) => set({ ...s, style }))),
    row('Fit', choice(PLOT_FITS, FIT_NAMES, s.fit, (fit) => set({ ...s, fit }))),
    help('A linear fit shows the line’s equation under the plot, and makes its slope and intercept variables: x_slope, x_intercept.'),
    axis('x'),
    axis('y'),
    help('Leave an axis box empty to fit it to the data. Points outside an axis’s range are left out: of the fit, and of a named plot’s series (p.x).'),
    row('Title', title),
  ]
}

// ---------------------------------------------------------------------------
// Opening and closing
// ---------------------------------------------------------------------------

/** The open panel, if any (one at a time), and how to close it. */
let openPanel: { element: HTMLElement; close: () => void } | null = null

/** Open the settings panel for the table or plot on line `n`, under `button`. */
function openSettings(view: EditorView, button: HTMLElement, n: number): void {
  openPanel?.close()
  const call = callBrackets(view.state.doc.line(n).text)
  if (!call) return
  const settingsText = splitCallArgs(view.state.doc.line(n).text.slice(call.from, call.to)).settings

  /** Write settings text into the line. */
  const save = (text: string) => {
    const line = view.state.doc.line(n)
    const brackets = callBrackets(line.text)
    if (!brackets) return
    const next = withSettingsText(line.text, brackets, text)
    if (next !== line.text) view.dispatch({ changes: { from: line.from, to: line.to, insert: next }, userEvent: 'input.settings' })
  }

  const panel = document.createElement('div')
  panel.className = 'options__panel cm-ms-table-menu'
  panel.setAttribute('role', 'group')
  panel.setAttribute('aria-label', call.kind === CALL.table ? 'Table settings' : 'Plot settings')
  panel.append(...(call.kind === CALL.table ? tablePanel : plotPanel)(settingsText, save))

  // Under the button, kept on screen.
  const at = button.getBoundingClientRect()
  panel.style.position = 'fixed'
  panel.style.top = `${at.bottom + 6}px`
  panel.style.left = `${Math.max(8, Math.min(at.left, window.innerWidth - 340))}px`
  panel.style.right = 'auto'
  document.body.append(panel)

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
    button.title = this.kind === CALL.table ? 'Table settings: rows, lines, row numbers' : 'Plot settings: rows, style, fit, axes, title'
    button.setAttribute('aria-label', this.kind === CALL.table ? 'Table settings' : 'Plot settings')
    button.addEventListener('mousedown', (e) => e.preventDefault())
    button.addEventListener('click', (e) => {
      e.preventDefault()
      // A second click on the button closes its panel.
      if (openPanel) {
        openPanel.close()
        return
      }
      openSettings(view, button, view.state.doc.lineAt(view.posAtDOM(button)).number)
    })
    return button
  }
  ignoreEvent() {
    return true
  }
}

const buttons: Record<CallKind, Decoration> = {
  [CALL.table]: Decoration.widget({ widget: new SettingsButton(CALL.table), side: 1 }),
  [CALL.plot]: Decoration.widget({ widget: new SettingsButton(CALL.plot), side: 1 }),
}

/** A ⚙ after each table's and plot's closing bracket. */
function settingsButtons(state: EditorState) {
  const marks = []
  for (let n = 1; n <= state.doc.lines; n++) {
    const line = state.doc.line(n)
    const call = callBrackets(line.text)
    if (call) marks.push(buttons[call.kind].range(line.from + call.to + 1))
  }
  return Decoration.set(marks)
}

/** Tables' and plots' settings buttons and their panels. */
export const tableMenu: Extension = [
  EditorView.decorations.compute(['doc'], settingsButtons),
  EditorView.baseTheme({
    '.cm-ms-table-settings': { marginLeft: '10px', minWidth: '24px', padding: '0 6px', fontSize: '15px', lineHeight: '1.25' },
  }),
]

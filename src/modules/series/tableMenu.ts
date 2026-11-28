/**
 * The ⚙ of a table or plot in the editor: after `@table(…)` or `@plot(…)`, and
 * after a typed table's `@table {`. The series module adds it to the editor
 * (SeriesModule.editorExtensions).
 *
 * - A table's opens its grid editor in the Output pane's place (tableEditor.tsx):
 *   a typed table's cells, rows and columns, or a table of series' columns, and
 *   either's settings. A second click closes it.
 * - A plot's opens a small panel of its settings beside it. Changing one
 *   rewrites the settings after the semicolon in its brackets (plotSettings.ts),
 *   so the sheet's text is always what's shown. Its controls are the settings'
 *   own, as declared (PLOT_SETTINGS: each kind of setting says what its control
 *   is: settingsPanel.ts), so a setting added there is in its menu too.
 */
import { type EditorState, type Extension } from '@codemirror/state'
import { Decoration, EditorView, WidgetType } from '@codemirror/view'
import { PLOT_SETTINGS, SERIES_CALL, splitCallArgs, withSettingsText } from './public.ts'
import { ROUND_BRACKETS, closeOnPressOutside, outputPanel, placeFixedPanel, showOutputPanel } from '../../lib/plugin.ts'
import { DOM_PANEL } from './settingsPanel.ts'
import { settingsCalls, sheetTables } from './tableText.ts'
import { tableEditorPanel, tablePanelKey } from './tableEditor.tsx'

/** ⚙, drawn as text rather than an emoji. */
const COG = String.fromCodePoint(0x2699, 0xfe0e)

/** What a ⚙ opens: a table's grid editor, or a plot's settings. */
const COG_FOR = { table: SERIES_CALL.table, plot: SERIES_CALL.plot } as const
type CogFor = (typeof COG_FOR)[keyof typeof COG_FOR]

/** Each ⚙'s tooltip and name. */
const COG_TEXT: Record<CogFor, { title: string; label: string }> = {
  [COG_FOR.table]: { title: 'Edit the table: its cells, columns and settings, in the Output pane', label: 'Edit the table' },
  [COG_FOR.plot]: { title: 'Plot settings: rows, style, fit, axes, title', label: 'Plot settings' },
}

// ---------------------------------------------------------------------------
// A plot's settings panel
// ---------------------------------------------------------------------------

/** The open panel, if any (one at a time), and how to close it. */
let openPanel: { element: HTMLElement; close: () => void } | null = null

/** Open the settings panel for the plot whose ⚙ is at `place` (just after its closing bracket), under `button`. */
function openPlotSettings(view: EditorView, button: HTMLElement, place: number): void {
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
  panel.setAttribute('aria-label', COG_TEXT[COG_FOR.plot].label)
  panel.append(...PLOT_SETTINGS.controls(DOM_PANEL, settingsText, save))

  // Beside the button, kept fully on screen.
  const at = button.getBoundingClientRect()
  document.body.append(panel)
  const keepPlaced = placeFixedPanel(panel, at)

  // (A press outside only closes it: it doesn't go through to the editor or what's under it.)
  const stopOutside = closeOnPressOutside((t) => panel.contains(t) || button.contains(t), () => close())
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      close()
      view.focus()
    }
  }
  const close = () => {
    keepPlaced()
    panel.remove()
    stopOutside()
    document.removeEventListener('keydown', onKey, true)
    if (openPanel?.element === panel) openPanel = null
  }
  document.addEventListener('keydown', onKey, true)
  openPanel = { element: panel, close }
}

// ---------------------------------------------------------------------------
// A table's grid editor
// ---------------------------------------------------------------------------

/** Open the grid editor of the table whose ⚙ is at `place`, or close it if it's open already. */
function toggleTableEditor(view: EditorView, place: number): void {
  const index = sheetTables(view.state.doc.toString()).findIndex((t) => t.button === place)
  if (index < 0) return
  showOutputPanel(outputPanel()?.key === tablePanelKey(index) ? null : tableEditorPanel(index))
}

// ---------------------------------------------------------------------------
// The buttons
// ---------------------------------------------------------------------------

/** The ⚙ after a table's or plot's closing bracket, or a typed table's `{`. */
class CogButton extends WidgetType {
  readonly kind: CogFor
  constructor(kind: CogFor) {
    super()
    this.kind = kind
  }
  eq(other: CogButton) {
    return other.kind === this.kind
  }
  toDOM(view: EditorView) {
    const button = document.createElement('button')
    button.className = 'cm-ms-import-button cm-ms-table-settings'
    button.textContent = COG
    button.title = COG_TEXT[this.kind].title
    button.setAttribute('aria-label', COG_TEXT[this.kind].label)
    button.addEventListener('mousedown', (e) => e.preventDefault())
    button.addEventListener('click', (e) => {
      e.preventDefault()
      const place = view.posAtDOM(button)
      if (this.kind === COG_FOR.table) return toggleTableEditor(view, place)
      // A second click on the button closes its panel.
      if (openPanel) {
        openPanel.close()
        return
      }
      openPlotSettings(view, button, place)
    })
    return button
  }
  ignoreEvent() {
    return true
  }
}

const buttons: Record<CogFor, Decoration> = {
  [COG_FOR.table]: Decoration.widget({ widget: new CogButton(COG_FOR.table), side: 1 }),
  [COG_FOR.plot]: Decoration.widget({ widget: new CogButton(COG_FOR.plot), side: 1 }),
}

/** A ⚙ after each table (typed, or of series) and each plot: after its closing bracket (on its last line, for one over several), or its `{`. */
function cogButtons(state: EditorState) {
  const text = state.doc.toString()
  const plots = settingsCalls(text).filter((c) => c.kind === SERIES_CALL.plot).map((c) => buttons[COG_FOR.plot].range(c.to + ROUND_BRACKETS.close.length))
  const tables = sheetTables(text).map((t) => buttons[COG_FOR.table].range(t.button))
  return Decoration.set([...plots, ...tables], true)
}

/** Tables' and plots' ⚙ buttons, and plots' panels. */
export const tableMenu: Extension = [
  EditorView.decorations.compute(['doc'], cogButtons),
  EditorView.baseTheme({
    '.cm-ms-table-settings': { marginLeft: '10px', minWidth: '24px', padding: '0 6px', fontSize: '15px', lineHeight: '1.25' },
  }),
]

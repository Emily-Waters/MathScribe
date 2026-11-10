/**
 * A table's settings button: a ⚙ after `table(…)` in the editor, which opens
 * a small panel of settings: which rows, how the lines are drawn, the n column,
 * and showing every row of a long table. Changing one rewrites the settings
 * after the semicolon in the table's brackets (see lib/tableSettings.ts), so the
 * sheet's text is always what's shown.
 */
import { type EditorState, type Extension } from '@codemirror/state'
import { Decoration, EditorView, WidgetType } from '@codemirror/view'
import { TABLE_LINES, parseTableSettings, splitTableArgs, withTableSettings, type TableLines, type TableSettings } from '../lib/tableSettings.ts'

/** A table line's opening: `table(` (1: what's before it). */
const TABLE_OPENING = /^(\s*)table\s*\(/

/** How each kind of lines reads in the panel. */
const LINE_NAMES: Record<TableLines, string> = {
  header: 'Under the header',
  grid: 'Grid',
  none: 'None',
}

/** ⚙, drawn as text rather than an emoji. */
const COG = String.fromCodePoint(0x2699, 0xfe0e)

/** Where a table line's brackets are: what's between them, as offsets in the line (or null if it isn't one). */
function tableBrackets(text: string): { from: number; to: number } | null {
  const m = TABLE_OPENING.exec(text)
  if (!m) return null
  const from = m[0].length
  let depth = 1
  for (let i = from; i < text.length; i++) {
    if (text[i] === '(') depth++
    else if (text[i] === ')' && --depth === 0) return { from, to: i }
  }
  return null
}

/** The open panel, if any (one at a time), and how to close it. */
let openPanel: { element: HTMLElement; close: () => void } | null = null

/** Open the settings panel for the table on line `n`, under `button`. */
function openSettings(view: EditorView, button: HTMLElement, n: number): void {
  openPanel?.close()
  const lineText = () => view.state.doc.line(n).text
  const inner = tableBrackets(lineText())
  if (!inner) return
  let settings = parseTableSettings(splitTableArgs(lineText().slice(inner.from, inner.to)).settings).settings

  /** Write the settings into the table's line. */
  const save = (next: TableSettings) => {
    settings = next
    const line = view.state.doc.line(n)
    const brackets = tableBrackets(line.text)
    if (!brackets) return
    const text = withTableSettings(line.text, brackets, next)
    if (text !== line.text) view.dispatch({ changes: { from: line.from, to: line.to, insert: text }, userEvent: 'input.settings' })
  }

  const panel = document.createElement('div')
  panel.className = 'options__panel cm-ms-table-menu'
  panel.setAttribute('role', 'group')
  panel.setAttribute('aria-label', 'Table settings')

  const row = (label: string, control: HTMLElement) => {
    const el = document.createElement('label')
    el.className = 'options__row'
    const span = document.createElement('span')
    span.textContent = label
    el.append(span, control)
    return el
  }
  const number = (value: number | undefined, placeholder: string, set: (v: number | undefined) => void) => {
    const input = document.createElement('input')
    input.type = 'number'
    input.min = '1'
    input.placeholder = placeholder
    input.value = value === undefined ? '' : String(value)
    input.addEventListener('change', () => set(input.value ? Math.max(1, Math.round(Number(input.value))) : undefined))
    return input
  }
  const check = (value: boolean, set: (v: boolean) => void) => {
    const input = document.createElement('input')
    input.type = 'checkbox'
    input.checked = value
    input.addEventListener('change', () => set(input.checked))
    return input
  }

  const rows = document.createElement('span')
  rows.className = 'cm-ms-table-menu__rows'
  rows.append(
    number(settings.from, 'first', (from) => save({ ...settings, from })),
    document.createTextNode('to'),
    number(settings.to, 'last', (to) => save({ ...settings, to })),
  )
  const lines = document.createElement('select')
  for (const id of TABLE_LINES) lines.add(new Option(LINE_NAMES[id], id, false, settings.lines === id))
  lines.addEventListener('change', () => save({ ...settings, lines: lines.value as TableLines }))

  const help = document.createElement('p')
  help.className = 'options__help'
  help.textContent = 'Leave a row box empty for the first or last row. These are kept in the table’s brackets, after a semicolon.'
  panel.append(
    row('Rows', rows),
    help,
    row('Lines', lines),
    row('Row numbers (n)', check(settings.numbers, (numbers) => save({ ...settings, numbers }))),
    row('Show every row', check(settings.allRows, (allRows) => save({ ...settings, allRows }))),
  )

  // Under the button, kept on screen.
  const at = button.getBoundingClientRect()
  panel.style.position = 'fixed'
  panel.style.top = `${at.bottom + 6}px`
  panel.style.left = `${Math.max(8, Math.min(at.left, window.innerWidth - 320))}px`
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

/** The ⚙ after a table's closing bracket. */
class TableSettingsButton extends WidgetType {
  eq() {
    return true
  }
  toDOM(view: EditorView) {
    const button = document.createElement('button')
    button.className = 'cm-ms-import-button cm-ms-table-settings'
    button.textContent = COG
    button.title = 'Table settings: rows, lines, row numbers'
    button.setAttribute('aria-label', 'Table settings')
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

const settingsButton = Decoration.widget({ widget: new TableSettingsButton(), side: 1 })

/** A ⚙ after each table's closing bracket. */
function tableButtons(state: EditorState) {
  const marks = []
  for (let n = 1; n <= state.doc.lines; n++) {
    const line = state.doc.line(n)
    const brackets = tableBrackets(line.text)
    if (brackets) marks.push(settingsButton.range(line.from + brackets.to + 1))
  }
  return Decoration.set(marks)
}

/** Tables' settings buttons and their panel. */
export const tableMenu: Extension = [
  EditorView.decorations.compute(['doc'], tableButtons),
  EditorView.baseTheme({
    '.cm-ms-table-settings': { marginLeft: '10px', minWidth: '24px', padding: '0 6px', fontSize: '15px', lineHeight: '1.25' },
  }),
]

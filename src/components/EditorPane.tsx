import { useEffect, useRef } from 'react'
import { EditorSelection, EditorState, StateEffect, StateField, type Extension } from '@codemirror/state'
import {
  EditorView, GutterMarker, drawSelection, gutter, highlightActiveLine, highlightActiveLineGutter,
  keymap, lineNumbers, placeholder, type Command,
} from '@codemirror/view'
import { defaultKeymap, history, historyKeymap, indentLess, indentMore } from '@codemirror/commands'
import {
  bracketMatching, codeFolding, foldGutter, foldKeymap, indentOnInput, indentUnit, syntaxHighlighting,
} from '@codemirror/language'
import { highlightSelectionMatches, search, searchKeymap } from '@codemirror/search'
import type { Diagnostic } from '../lib/document.ts'
import { mathscribeFolding, mathscribeIndent, mathscribeLanguage } from '../editor/language.ts'
import { SYNTAX_THEMES, mathscribeHighlight, type SyntaxThemeId } from '../editor/themes.ts'
import { Dropdown } from './Dropdown.tsx'
import { gotoDefinition, setDefinitions } from '../editor/gotoDefinition.ts'

interface EditorPaneProps {
  value: string
  onChange: (value: string) => void
  /** A request to put the cursor on a line (from clicking the output); `n` makes repeats distinct. */
  jump: { line: number; n: number } | null
  onCursorLine: (line: number) => void
  /** Errors and warnings by line, marked in the gutter. */
  diagnostics: Map<number, Diagnostic>
  /** Where each function is defined (for Ctrl+Click / F12). */
  definitions: Map<string, number[]>
  /** Syntax colour theme. */
  theme: SyntaxThemeId
  onThemeChange: (id: SyntaxThemeId) => void
}

const INDENT = '    '

// ---------------------------------------------------------------------------
// Error and warning markers in the gutter
// ---------------------------------------------------------------------------

const setDiagnostics = StateEffect.define<Map<number, Diagnostic>>()

const diagnosticsField = StateField.define<Map<number, Diagnostic>>({
  create: () => new Map(),
  update: (value, tr) => {
    for (const e of tr.effects) if (e.is(setDiagnostics)) return e.value
    return value
  },
})

class DiagnosticMarker extends GutterMarker {
  readonly line: number
  readonly d: Diagnostic
  constructor(line: number, d: Diagnostic) {
    super()
    this.line = line
    this.d = d
  }
  eq(other: DiagnosticMarker) {
    return other.line === this.line && other.d.kind === this.d.kind && other.d.message === this.d.message
  }
  toDOM() {
    const el = document.createElement('div')
    el.className = `cm-diagnostic cm-diagnostic--${this.d.kind}`
    el.title = `Line ${this.line}: ${this.d.message}`
    return el
  }
}

const diagnosticsGutter = gutter({
  class: 'cm-diagnostic-gutter',
  lineMarker: (view, line) => {
    const n = view.state.doc.lineAt(line.from).number
    const d = view.state.field(diagnosticsField).get(n)
    return d ? new DiagnosticMarker(n, d) : null
  },
  lineMarkerChange: (update) => update.transactions.some((t) => t.effects.some((e) => e.is(setDiagnostics))),
})

// ---------------------------------------------------------------------------
// Keys
// ---------------------------------------------------------------------------

/** Tab: with nothing selected, spaces to the next 4-space stop; otherwise indent the lines. */
const tabToStop: Command = (view) => {
  const { state } = view
  if (state.selection.ranges.some((r) => !r.empty)) return indentMore(view)
  view.dispatch(state.changeByRange((range) => {
    const column = range.head - state.doc.lineAt(range.head).from
    const spaces = ' '.repeat(INDENT.length - (column % INDENT.length))
    return {
      changes: { from: range.head, insert: spaces },
      range: EditorSelection.cursor(range.head + spaces.length),
    }
  }))
  return true
}

/** The editor's look, from the app's colour variables (so it follows light/dark). */
const baseTheme = EditorView.theme({
  '&': { height: '100%', fontSize: '14px', color: 'var(--text)', backgroundColor: 'var(--surface)' },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': { fontFamily: 'var(--mono)', lineHeight: '24px' },
  '.cm-content': { padding: '16px 0 50vh', caretColor: 'var(--text)' },
  '.cm-line': { padding: '0 16px 0 10px' },
  '.cm-cursor': { borderLeftColor: 'var(--text)' },
  '.cm-gutters': { backgroundColor: 'var(--surface-2)', color: 'var(--muted)', borderRight: '1px solid var(--border)' },
  '.cm-gutter.cm-lineNumbers .cm-gutterElement': { padding: '0 8px 0 10px', fontSize: '12px' },
  '.cm-activeLineGutter': { backgroundColor: 'transparent', color: 'var(--text)', fontWeight: '600' },
  '.cm-activeLine': { backgroundColor: 'color-mix(in srgb, var(--accent) 6%, transparent)' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
    backgroundColor: 'color-mix(in srgb, var(--accent) 22%, transparent)',
  },
  '.cm-selectionMatch': { backgroundColor: 'color-mix(in srgb, var(--accent) 12%, transparent)' },
  '&.cm-focused .cm-matchingBracket': { backgroundColor: 'color-mix(in srgb, var(--accent) 18%, transparent)' },
  '.cm-foldPlaceholder': { backgroundColor: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--muted)' },
  '.cm-placeholder': { color: 'var(--muted)' },
  '.cm-panels': { backgroundColor: 'var(--surface-2)', color: 'var(--text)' },
})

function extensions(handlers: { change: (v: string) => void; cursor: (line: number) => void }): Extension[] {
  return [
    lineNumbers(),
    diagnosticsGutter,
    foldGutter(),
    codeFolding(),
    history(),
    drawSelection(),
    highlightActiveLine(),
    highlightActiveLineGutter(),
    highlightSelectionMatches(),
    bracketMatching(),
    indentOnInput(),
    search({ top: true }),
    indentUnit.of(INDENT),
    EditorState.tabSize.of(4),
    mathscribeLanguage,
    mathscribeIndent,
    mathscribeFolding,
    syntaxHighlighting(mathscribeHighlight),
    diagnosticsField,
    gotoDefinition,
    baseTheme,
    placeholder('m = 2.0 kg'),
    EditorView.contentAttributes.of({ 'aria-label': 'Math input', spellcheck: 'false' }),
    keymap.of([
      { key: 'Tab', run: tabToStop, shift: indentLess },
      ...defaultKeymap,
      ...historyKeymap,
      ...foldKeymap,
      ...searchKeymap,
    ]),
    EditorView.updateListener.of((u) => {
      if (u.docChanged) handlers.change(u.state.doc.toString())
      if (u.docChanged || u.selectionSet) handlers.cursor(u.state.doc.lineAt(u.state.selection.main.head).number)
    }),
  ]
}

/**
 * The sheet editor (CodeMirror), with MathScribe highlighting and the usual
 * code-editor keys: Tab / Shift+Tab indent, Backspace removes a whole indent,
 * Alt+↑/↓ move lines, Ctrl+X / Ctrl+C with nothing selected take the whole
 * line, Ctrl+F finds, Ctrl+Click (or F12) on a function goes to its
 * definition, and blocks fold from the gutter.
 */
export function EditorPane({
  value, onChange, jump, onCursorLine, diagnostics, definitions, theme, onThemeChange,
}: EditorPaneProps) {
  const host = useRef<HTMLDivElement>(null)
  const view = useRef<EditorView | null>(null)
  /** The text the editor starts with; later changes arrive through the effect below. */
  const initialValue = useRef(value)
  // The editor is created once; these keep its callbacks current.
  const handlers = useRef({ change: onChange, cursor: onCursorLine })
  useEffect(() => {
    handlers.current = { change: onChange, cursor: onCursorLine }
  }, [onChange, onCursorLine])

  useEffect(() => {
    const v = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: initialValue.current,
        extensions: extensions({
          change: (s) => handlers.current.change(s),
          cursor: (l) => handlers.current.cursor(l),
        }),
      }),
    })
    view.current = v
    return () => {
      v.destroy()
      view.current = null
    }
  }, [])

  // A new sheet or an opened file replaces the text.
  useEffect(() => {
    const v = view.current
    if (v && v.state.doc.toString() !== value) {
      v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: value } })
    }
  }, [value])

  useEffect(() => {
    view.current?.dispatch({ effects: setDiagnostics.of(diagnostics) })
  }, [diagnostics])

  useEffect(() => {
    view.current?.dispatch({ effects: setDefinitions.of(definitions) })
  }, [definitions])

  // Jump requests from clicking the output: select that line and scroll to it.
  useEffect(() => {
    const v = view.current
    if (!jump || !v) return
    const line = v.state.doc.line(Math.min(Math.max(jump.line, 1), v.state.doc.lines))
    v.dispatch({ selection: { anchor: line.from, head: line.to }, scrollIntoView: true })
    v.focus()
  }, [jump])

  return (
    <section className="pane">
      <header className="pane__header">
        <h2>Input</h2>
        <Dropdown label="Options" panelLabel="Editor options">
          <label className="options__row">
            <span>Colours</span>
            <select value={theme} onChange={(e) => onThemeChange(e.target.value as SyntaxThemeId)}>
              {SYNTAX_THEMES.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </label>
          <p className="options__help">{SYNTAX_THEMES.find((t) => t.id === theme)?.description}.</p>
        </Dropdown>
      </header>
      <div className="editor-wrap" data-syntax-theme={theme} ref={host} />
    </section>
  )
}

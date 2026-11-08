import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react'
import { Compartment, EditorSelection, EditorState, StateEffect, StateField, type Extension } from '@codemirror/state'
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
import { SYNTAX_TOKENS, mathscribeHighlight, type Palette, type SyntaxThemeId } from '../editor/themes.ts'
import { Dropdown } from './Dropdown.tsx'
import { gotoDefinition, setDefinitions } from '../editor/gotoDefinition.ts'
import { acceptOnTab, intellisense, setSymbols } from '../editor/intellisense.ts'
import type { SheetSymbol } from '../lib/document.ts'

interface EditorPaneProps {
  value: string
  onChange: (value: string) => void
  /** Which sheet (tab) is shown; each keeps its own undo history, cursor and scroll. */
  docId: string
  /** The sheets still open, so closed ones' editor states can be let go. */
  openIds: string[]
  /** A request to put the cursor on a line (from clicking the output); `n` makes repeats distinct. */
  jump: { line: number; n: number } | null
  onCursorLine: (line: number) => void
  /** Errors and warnings by line, marked in the gutter. */
  diagnostics: Map<number, Diagnostic>
  /** Where each function is defined (for Ctrl+Click / F12). */
  definitions: Map<string, number[]>
  /** What the sheet defines, for completions and hover information. */
  symbols: SheetSymbol[]
  /** Syntax colour theme, and for Custom, its colours. */
  theme: SyntaxThemeId
  /** Whether the app theme is dark, so CodeMirror's own parts (tooltips, find panel) match. */
  dark: boolean
  customPalette: Palette | null
  /** The contents of the editor's Options menu. */
  options: ReactNode
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
  // Highlight colours come from the app theme (App.css), tuned to each background.
  '.cm-activeLine': { backgroundColor: 'var(--active-line)' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
    backgroundColor: 'var(--selection)',
  },
  '.cm-selectionMatch': { backgroundColor: 'var(--selection-match)' },
  '&.cm-focused .cm-matchingBracket': { backgroundColor: 'var(--selection-match)', outline: '1px solid var(--border)' },
  '.cm-foldPlaceholder': { backgroundColor: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--muted)' },
  '.cm-placeholder': { color: 'var(--muted)' },
  '.cm-panels': { backgroundColor: 'var(--surface-2)', color: 'var(--text)' },
  '.cm-panels.cm-panels-top': { borderBottom: '1px solid var(--border)' },
  // The find panel's fields and buttons (Ctrl+F)
  '.cm-textfield': {
    backgroundColor: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: '4px',
  },
  '.cm-button': {
    backgroundImage: 'none', backgroundColor: 'var(--surface)', color: 'var(--text)',
    border: '1px solid var(--border)', borderRadius: '4px',
  },
  '.cm-button:active': { backgroundImage: 'none', backgroundColor: 'var(--selection)' },
  '.cm-search label': { color: 'var(--muted)' },
  '.cm-panel button[name=close]': { color: 'var(--muted)' },
  '.cm-searchMatch': { backgroundColor: 'var(--selection-match)', outline: '1px solid var(--border)' },
  '.cm-searchMatch.cm-searchMatch-selected': { backgroundColor: 'var(--selection)' },
})

/** Light or dark, for CodeMirror's built-in styles; changed when the app theme changes. */
const darkness = new Compartment()

function extensions(handlers: { change: (v: string) => void; cursor: (line: number) => void }, dark: boolean): Extension[] {
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
    intellisense,
    baseTheme,
    darkness.of(EditorView.darkTheme.of(dark)),
    placeholder('m = 2.0 kg'),
    EditorView.contentAttributes.of({ 'aria-label': 'Math input', spellcheck: 'false' }),
    keymap.of([
      // Tab accepts a suggestion if the list is open, otherwise indents.
      { key: 'Tab', run: (v) => acceptOnTab(v) || tabToStop(v), shift: indentLess },
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
  value, onChange, docId, openIds, jump, onCursorLine, diagnostics, definitions, symbols, theme, dark, customPalette,
  options,
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

  const darkNow = useRef(dark)
  /** A fresh editor state for a sheet's text. */
  const makeState = useRef((text: string) => EditorState.create({
    doc: text,
    extensions: extensions({
      change: (s) => handlers.current.change(s),
      cursor: (l) => handlers.current.cursor(l),
    }, darkNow.current),
  }))

  useEffect(() => {
    const v = new EditorView({ parent: host.current!, state: makeState.current(initialValue.current) })
    view.current = v
    return () => {
      v.destroy()
      view.current = null
    }
  }, [])

  // Each sheet's editor state (text, undo history, cursor) and scroll position,
  // kept while another tab is shown.
  const saved = useRef(new Map<string, { state: EditorState; scroll: number }>())
  const shownId = useRef(docId)
  useEffect(() => {
    const v = view.current
    if (!v || shownId.current === docId) return
    saved.current.set(shownId.current, { state: v.state, scroll: v.scrollDOM.scrollTop })
    shownId.current = docId
    const next = saved.current.get(docId)
    v.setState(next?.state ?? makeState.current(value))
    const scroll = next?.scroll ?? 0
    requestAnimationFrame(() => {
      v.scrollDOM.scrollTop = scroll
    })
    handlers.current.cursor(v.state.doc.lineAt(v.state.selection.main.head).number)
    // Only on switching sheets; `value` is the new sheet's text at that moment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docId])

  // Let go of closed sheets' editor states.
  useEffect(() => {
    for (const id of saved.current.keys()) if (!openIds.includes(id)) saved.current.delete(id)
  }, [openIds])

  // Text that changed outside the editor replaces it.
  useEffect(() => {
    const v = view.current
    if (v && v.state.doc.toString() !== value) {
      v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: value } })
    }
  }, [value])

  // What the evaluated sheet says (also after switching tabs, since a kept state
  // may hold an older copy).
  useEffect(() => {
    view.current?.dispatch({ effects: setDiagnostics.of(diagnostics) })
  }, [diagnostics, docId])

  useEffect(() => {
    view.current?.dispatch({ effects: setDefinitions.of(definitions) })
  }, [definitions, docId])

  useEffect(() => {
    view.current?.dispatch({ effects: setSymbols.of(symbols) })
  }, [symbols, docId])

  useEffect(() => {
    darkNow.current = dark
    view.current?.dispatch({ effects: darkness.reconfigure(EditorView.darkTheme.of(dark)) })
  }, [dark, docId])

  // Jump requests from clicking the output: put the cursor at the start of that
  // line's text (not a selection, so typing doesn't replace the line) and scroll
  // to it; the current-line highlight marks it.
  useEffect(() => {
    const v = view.current
    if (!jump || !v) return
    const line = v.state.doc.line(Math.min(Math.max(jump.line, 1), v.state.doc.lines))
    const at = line.from + /^\s*/.exec(line.text)![0].length
    v.dispatch({ selection: { anchor: at }, effects: EditorView.scrollIntoView(at, { y: 'nearest' }) })
    v.focus()
  }, [jump])

  return (
    <section className="pane">
      <header className="pane__header">
        <h2>Input</h2>
        <Dropdown label="Options" panelLabel="Editor options">{options}</Dropdown>
      </header>
      <div
        className="editor-wrap"
        data-syntax-theme={theme}
        // Custom colours are set right here, in place of a preset's stylesheet rules.
        style={customPalette
          ? Object.fromEntries(SYNTAX_TOKENS.map((t) => [`--syn-${t.id}`, customPalette[t.id]])) as CSSProperties
          : undefined}
        ref={host}
      />
    </section>
  )
}

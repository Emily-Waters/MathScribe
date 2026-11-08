/**
 * Go to definition, as in VS Code: Ctrl+Click (⌘+Click on a Mac) a function's
 * name, or put the cursor on it and press F12, to jump to where it's defined.
 * While Ctrl is held, names you can jump from are underlined under the mouse.
 *
 * The definitions come from the evaluated sheet (collectDefinitions), so only
 * functions you've defined count, not built-ins like sin.
 */
import { StateEffect, StateField, type EditorState, type Extension } from '@codemirror/state'
import { Decoration, EditorView, ViewPlugin, keymap, type DecorationSet, type ViewUpdate } from '@codemirror/view'

/** Function name → the lines it's defined on, in order. */
type Definitions = Map<string, number[]>

export const setDefinitions = StateEffect.define<Definitions>()

const definitionsField = StateField.define<Definitions>({
  create: () => new Map(),
  update: (value, tr) => {
    for (const e of tr.effects) if (e.is(setDefinitions)) return e.value
    return value
  },
})

/** The name at `pos`, with its range, if it's a defined function. */
function definedNameAt(state: EditorState, pos: number): { from: number; to: number; name: string } | null {
  const word = state.wordAt(pos)
  if (!word) return null
  const name = state.sliceDoc(word.from, word.to)
  // Only as a call or definition, `f(`: a variable can share a function's name.
  const after = state.sliceDoc(word.to, state.doc.lineAt(word.to).to)
  if (!/^\s*\(/.test(after)) return null
  return state.field(definitionsField).has(name) ? { ...word, name } : null
}

/**
 * Jump to the definition of the name at `pos`: the nearest one above that line
 * (a later redefinition doesn't apply yet), or else the first one.
 */
function goToDefinition(view: EditorView, pos: number): boolean {
  const target = definedNameAt(view.state, pos)
  if (!target) return false
  const lines = view.state.field(definitionsField).get(target.name)!
  const here = view.state.doc.lineAt(pos).number
  const above = lines.filter((l) => l <= here)
  let lineNo = above.length ? above[above.length - 1] : lines[0]
  // On the definition itself: go to the previous one, if any.
  if (lineNo === here && above.length > 1) lineNo = above[above.length - 2]
  const line = view.state.doc.line(lineNo)
  const at = new RegExp(`\\b${target.name}\\b`).exec(line.text)
  const from = line.from + (at?.index ?? 0)
  view.dispatch({
    selection: { anchor: from, head: from + (at ? target.name.length : 0) },
    effects: EditorView.scrollIntoView(from, { y: 'center' }),
  })
  view.focus()
  return true
}

const setHover = StateEffect.define<{ from: number; to: number } | null>()

/** The underlined name under the mouse while Ctrl is held. */
const hoverField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update: (deco, tr) => {
    for (const e of tr.effects) {
      if (e.is(setHover)) {
        return e.value ? Decoration.set([Decoration.mark({ class: 'cm-goto-link' }).range(e.value.from, e.value.to)]) : Decoration.none
      }
    }
    return tr.docChanged ? Decoration.none : deco
  },
  provide: (f) => EditorView.decorations.from(f),
})

const isModifier = (e: MouseEvent | KeyboardEvent) => e.ctrlKey || e.metaKey

/** Tracks the mouse and the Ctrl key to underline the name under the pointer. */
const hoverPlugin = ViewPlugin.fromClass(class {
  view: EditorView
  mouse: { x: number; y: number } | null = null
  /** The range underlined now, if any. */
  current: { from: number; to: number } | null = null

  constructor(view: EditorView) {
    this.view = view
    window.addEventListener('keydown', this.onKey)
    window.addEventListener('keyup', this.onKey)
  }

  update(u: ViewUpdate) {
    if (u.docChanged) this.current = null
  }

  destroy() {
    window.removeEventListener('keydown', this.onKey)
    window.removeEventListener('keyup', this.onKey)
  }

  onKey = (e: KeyboardEvent) => this.refresh(isModifier(e))

  refresh(held: boolean) {
    const pos = held && this.mouse ? this.view.posAtCoords(this.mouse) : null
    const target = pos === null ? null : definedNameAt(this.view.state, pos)
    const next = target && { from: target.from, to: target.to }
    if (next?.from === this.current?.from && next?.to === this.current?.to) return
    this.current = next
    // Never from inside an editor update: dispatch just after.
    queueMicrotask(() => this.view.dispatch({ effects: setHover.of(next) }))
  }
}, {
  eventHandlers: {
    mousemove(e) {
      this.mouse = { x: e.clientX, y: e.clientY }
      this.refresh(isModifier(e))
    },
    mouseleave() {
      this.mouse = null
      this.refresh(false)
    },
  },
})

export const gotoDefinition: Extension = [
  definitionsField,
  hoverField,
  hoverPlugin,
  EditorView.domEventHandlers({
    mousedown(e, view) {
      if (!isModifier(e) || e.button !== 0 || e.altKey || e.shiftKey) return false
      const pos = view.posAtCoords({ x: e.clientX, y: e.clientY })
      if (pos === null || !goToDefinition(view, pos)) return false
      e.preventDefault()
      return true
    },
  }),
  keymap.of([{ key: 'F12', run: (view) => goToDefinition(view, view.state.selection.main.head) }]),
  EditorView.baseTheme({
    '.cm-goto-link': { textDecoration: 'underline', cursor: 'pointer' },
  }),
]

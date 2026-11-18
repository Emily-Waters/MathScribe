/**
 * Go to definition and rename names, as in VS Code: Ctrl+Click (⌘+Click on a
 * Mac) or F12 jumps to a sheet definition; F2 renames every in-scope use.
 *
 * Names and ranges come from the evaluated sheet and the editor's tree of the
 * document, so navigation and replacement follow the same syntax as the engine.
 */
import { StateEffect, StateField, type EditorState, type Extension } from '@codemirror/state'
import { Decoration, EditorView, ViewPlugin, keymap, type DecorationSet, type ViewUpdate } from '@codemirror/view'
import { SYMBOL_KIND, type SheetSymbol } from '../lib/sheet/sheetIndex.ts'
import { sheetLine } from './sheetLines.ts'
import { isToken, TOKEN_KIND, type Part, type SyntaxNode } from '../lib/tree/index.ts'
import { placeFixedPanel } from './popover.ts'

/** Function name → the lines it's defined on, in order. */
type Definitions = Map<string, number[]>

/** Replaces where each function is defined (after each evaluation of the sheet). */
export const setDefinitions = StateEffect.define<Definitions>()
/** Replaces the names and scopes the sheet evaluated (for variables and constants). */
export const setNavigationSymbols = StateEffect.define<SheetSymbol[]>()

/** Where each function is defined, for Ctrl+Click and F12. */
const definitionsField = StateField.define<Definitions>({
  create: () => new Map(),
  update: (value, tr) => {
    for (const e of tr.effects) if (e.is(setDefinitions)) return e.value
    return value
  },
})

const symbolsField = StateField.define<SheetSymbol[]>({
  create: () => [],
  update: (value, tr) => {
    for (const e of tr.effects) if (e.is(setNavigationSymbols)) return e.value
    return value
  },
})

/** A name token on a line, with its document range. */
interface NameAt {
  from: number
  to: number
  name: string
  symbol?: SheetSymbol
}

/** Every token and its text range on one line, following the tree recursively. */
function nameTokens(state: EditorState, lineNumber: number): NameAt[] {
  const line = state.doc.line(lineNumber)
  const out: NameAt[] = []
  const textLength = (part: Part): number =>
    isToken(part) ? part.text.length : part.parts.reduce((n, p) => n + textLength(p), 0)
  const walk = (parts: readonly Part[], offset: number) => {
    let at = offset
    for (const part of parts) {
      if (isToken(part)) {
        if (part.t === TOKEN_KIND.symbol || part.t === TOKEN_KIND.builtin) {
          out.push({ from: line.from + at, to: line.from + at + part.text.length, name: part.text })
        }
        at += part.text.length
      } else {
        const node = part as SyntaxNode
        walk(node.parts, at)
        at += textLength(node)
      }
    }
  }
  walk(sheetLine(state.doc, lineNumber).step.node.parts, 0)
  return out
}

/** The symbol usable for a name on this line (the latest definition in scope). */
function symbolAt(state: EditorState, n: number, name: string): SheetSymbol | undefined {
  const matches = state.field(symbolsField)
    .filter((s) => s.name === name && s.line <= n && n <= s.to && (n >= s.from || s.line === n))
    .sort((a, b) => b.line - a.line)
  return matches[0]
}

/** The name at `pos`, with its range and evaluated symbol, if it has one. */
function nameAt(state: EditorState, pos: number): NameAt | null {
  const lineNumber = state.doc.lineAt(pos).number
  const token = nameTokens(state, lineNumber).find((t) => t.from <= pos && pos <= t.to)
  if (!token) return null
  const symbol = symbolAt(state, lineNumber, token.name)
  const isFunction = symbol?.kind === SYMBOL_KIND.function
    || state.field(definitionsField).has(token.name)
  if (!symbol && !isFunction) return null
  return { ...token, symbol }
}

/**
 * Jump to the definition of the name at `pos`: the nearest one above that line
 * (a later redefinition doesn't apply yet), or else the first one.
 */
function goToDefinition(view: EditorView, pos: number): boolean {
  const target = nameAt(view.state, pos)
  if (!target) return false
  const here = view.state.doc.lineAt(pos).number
  let lineNo: number | undefined
  if (target.symbol) {
    if (target.symbol.kind === SYMBOL_KIND.variable || target.symbol.kind === SYMBOL_KIND.constant) {
      const sameName = view.state.field(symbolsField).filter((s) =>
        s.name === target.name
        && s.kind === target.symbol!.kind
        && s.to === target.symbol!.to
        && s.from <= here
      )
      lineNo = sameName.length ? Math.min(...sameName.map((s) => s.line)) : target.symbol.line
    } else {
      lineNo = target.symbol.line
    }
  }
  const functionLines = view.state.field(definitionsField).get(target.name)
  if (!lineNo && functionLines?.length) {
    const above = functionLines.filter((l) => l <= here)
    lineNo = above.length ? above[above.length - 1] : functionLines[0]
    if (lineNo === here && above.length > 1) lineNo = above[above.length - 2]
  }
  if (!lineNo) return false
  const line = view.state.doc.line(lineNo)
  const escaped = target.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const at = new RegExp(escaped).exec(line.text)
  const from = line.from + (at?.index ?? 0)
  view.dispatch({
    selection: { anchor: from, head: from + (at ? target.name.length : 0) },
    effects: EditorView.scrollIntoView(from, { y: 'center' }),
  })
  view.focus()
  return true
}

/** Rename a name at the cursor and all uses that resolve to the same symbol. */
function renameSymbol(view: EditorView): boolean {
  const target = nameAt(view.state, view.state.selection.main.head)
  if (!target) return false
  const promptName = target.name.startsWith('@') ? target.name.slice(1) : target.name
  const promptRect = view.coordsAtPos(target.from)
  if (!promptRect) return true

  const old = document.querySelector('.cm-rename-popover')
  old?.remove()
  const panel = document.createElement('div')
  panel.className = 'cm-rename-popover'
  panel.setAttribute('role', 'dialog')
  panel.setAttribute('aria-label', `Rename ${promptName}`)

  const label = document.createElement('label')
  label.textContent = 'Rename'
  const input = document.createElement('input')
  input.type = 'text'
  input.value = promptName
  input.setAttribute('aria-label', `New name for ${promptName}`)
  panel.append(label, input)
  document.body.append(panel)

  const keepPlaced = placeFixedPanel(panel, {
    top: promptRect.top,
    bottom: promptRect.bottom,
    left: promptRect.left,
    right: promptRect.right,
  })
  input.select()
  input.focus()

  const close = (restoreFocus = true) => {
    keepPlaced()
    panel.remove()
    document.removeEventListener('mousedown', outside, true)
    document.removeEventListener('keydown', escape, true)
    if (restoreFocus) view.focus()
  }
  const outside = (event: MouseEvent) => {
    if (!panel.contains(event.target as Node)) close()
  }
  const escape = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      close()
    }
  }
  document.addEventListener('mousedown', outside, true)
  document.addEventListener('keydown', escape, true)

  const commit = () => {
    const replacement = input.value.trim()
    if (!replacement || !/^[A-Za-z\u0370-\u03ff][\w\u0370-\u03ff]*$/.test(replacement)) {
      input.select()
      return
    }
    if (replacement !== promptName) applyRename(view, target, promptName, replacement)
    close()
  }
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      commit()
    }
  })
  return true
}

/** Apply a rename after the small in-editor panel validates its text. */
function applyRename(view: EditorView, target: NameAt, promptName: string, replacement: string): void {
  const here = view.state.doc.lineAt(view.state.selection.main.head).number
  const nextName = replacement
  if (nextName === promptName) return

  const ranges: { from: number; to: number }[] = []
  for (let lineNumber = 1; lineNumber <= view.state.doc.lines; lineNumber++) {
    for (const token of nameTokens(view.state, lineNumber)) {
      if (token.name !== target.name) continue
      if (target.symbol) {
        const resolved = symbolAt(view.state, lineNumber, target.name)
        if (!resolved || resolved.kind !== target.symbol.kind || resolved.to !== target.symbol.to) continue
      } else {
        const lines = view.state.field(definitionsField).get(target.name) ?? []
        const above = lines.filter((l) => l <= lineNumber)
        const nearest = above.at(-1) ?? lines[0]
        if (nearest === undefined) continue
        const targetLine = lines.filter((l) => l <= here).at(-1) ?? lines[0]
        if (nearest !== targetLine) continue
      }
      ranges.push({ from: token.from, to: token.to })
    }
  }
  if (!ranges.length) return
  ranges.sort((a, b) => b.from - a.from)
  view.dispatch({
    changes: ranges.map((range) => ({ from: range.from, to: range.to, insert: target.name.startsWith('@') ? `@${nextName.replace(/^@/, '')}` : nextName })),
  })
  view.focus()
}

/** Underlines a name (or nothing), as the link Ctrl+Click would follow. */
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

/** Ctrl, or ⌘ on a Mac: held to make names into links. */
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
    const target = pos === null ? null : nameAt(this.view.state, pos)
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

/** Go to definition: Ctrl+Click or F12 on a function call jumps to its definition. */
export const gotoDefinition: Extension = [
  definitionsField,
  symbolsField,
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
  keymap.of([
    { key: 'F12', run: (view) => goToDefinition(view, view.state.selection.main.head) },
    { key: 'F2', run: renameSymbol },
  ]),
  EditorView.baseTheme({
    '.cm-goto-link': { textDecoration: 'underline', cursor: 'pointer' },
  }),
]

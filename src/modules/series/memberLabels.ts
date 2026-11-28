/**
 * A series' members' names in the editor: in a series written over several
 * lines, each value has its member's name before it, faint, as a line's result
 * is after it (inline results), so which value is x₃ can be seen without
 * counting:
 *
 *   x = [
 *       x₁:  1.52 s,
 *       x₂:  1.48 s,
 *   ]
 *
 * The names are found from the sheet's statements (the tree's: sheetStatements),
 * as the ⚙ menus' calls are: a `name = [` whose bracket closes on a later
 * line, and the values directly in it, between its top-level commas. They show
 * while the editor shows its inline results (`inlineHintsShown`).
 */
import katex from 'katex'
import { Decoration, EditorView, WidgetType, type DecorationSet } from '@codemirror/view'
import type { EditorState, Extension, Range } from '@codemirror/state'
import {
  ASSIGN, MEMBER_DOT, MEMBER_INDEX, SEPARATOR, TOKEN_KIND, closingIndex, encode, inlineHintsShown, seriesMemberName,
  sheetStatements, splitWithin, symbolTex, type SheetStatement,
} from '../../lib/plugin.ts'

/** A token of a statement, and where it starts in the sheet's text. */
interface Placed {
  readonly t: string
  readonly text: string
  readonly at: number
}

/** A statement's tokens (the tree's), each where it is in the sheet's text. */
const placedTokens = ({ statement, starts }: SheetStatement): Placed[] =>
  statement.tokens.map(({ token, line, at }) => ({ t: token.t, text: token.text, at: starts[line] + at }))

/** Tokens that say nothing: a value starts at the first token after its comma that isn't one. */
const QUIET: ReadonlySet<string> = new Set([TOKEN_KIND.space, TOKEN_KIND.indent, TOKEN_KIND.eol, TOKEN_KIND.note, TOKEN_KIND.comment])

const isDelimiter = (p: Placed | undefined, text: string) => p?.t === TOKEN_KIND.delimiter && p.text === text

/** A member's name before its value: where the value starts, and the member's name (`x_3`). */
export interface MemberLabel {
  readonly at: number
  readonly name: string
}

/**
 * Each value's member in every series written over several lines (`x = [`
 * with its `]` on a later line): where the value starts, and its member's name,
 * numbered from 1 in order.
 */
export function memberLabels(text: string): MemberLabel[] {
  const labels: MemberLabel[] = []
  for (const statement of sheetStatements(encode(text).body)) {
    const tokens = placedTokens(statement)
    // `name = [`: the name, then `=`, then the bracket (spaces between them).
    const said = tokens.map((t, i) => ({ t, i })).filter(({ t }) => !QUIET.has(t.t))
    if (said.length < 3 || !isDelimiter(said[1].t, ASSIGN) || said[0].t.t !== TOKEN_KIND.symbol) continue
    if (!isDelimiter(said[2].t, MEMBER_INDEX.open)) continue
    const name = said[0].t.text
    const open = said[2].i
    // The values directly in the brackets (to the end, if they aren't closed): each starts at the first token said after `[` or a top-level comma.
    const closing = closingIndex(tokens, open)
    const close = closing < 0 ? tokens.length : closing
    const multiline = tokens.slice(open + 1, close).some((t) => t.t === TOKEN_KIND.eol)
    const starts = splitWithin(tokens, open, close, (t) => t.t === TOKEN_KIND.delimiter && t.text === SEPARATOR)
      .map((value) => value.find((t) => !QUIET.has(t.t))?.at)
      .filter((at): at is number => at !== undefined)
    // (A list added up or averaged where it is, `x = [ … ].sum`, makes no series.)
    if (!multiline || isDelimiter(tokens.slice(close + 1).find((t) => !QUIET.has(t.t)), MEMBER_DOT)) continue
    starts.forEach((at, k) => labels.push({ at, name: seriesMemberName(name, k + 1) }))
  }
  return labels
}

/** A member's name, typeset and faint, before its value. */
class MemberWidget extends WidgetType {
  readonly name: string
  constructor(name: string) {
    super()
    this.name = name
  }
  eq(other: MemberWidget) {
    return other.name === this.name
  }
  toDOM() {
    // (No width of its own: the name sits in the indentation before the value, which stays where it was.)
    const el = document.createElement('span')
    el.className = 'cm-ms-member-label'
    el.setAttribute('aria-hidden', 'true')
    const name = document.createElement('span')
    name.className = 'cm-ms-member-label__name'
    name.innerHTML = katex.renderToString(`${symbolTex(this.name)}{:}`, { throwOnError: false, strict: 'ignore' })
    el.append(name)
    return el
  }
  ignoreEvent() {
    return true
  }
}

/** The names before the values, while the editor shows its inline results. */
function labelDecorations(state: EditorState): DecorationSet {
  if (!state.facet(inlineHintsShown)) return Decoration.none
  const marks: Range<Decoration>[] = memberLabels(state.doc.toString())
    .map((l) => Decoration.widget({ widget: new MemberWidget(l.name), side: -1 }).range(l.at))
  return Decoration.set(marks, true)
}

/** Series' members' names in the editor. */
export const memberLabelsExtension: Extension = [
  EditorView.decorations.compute(['doc', inlineHintsShown], labelDecorations),
  EditorView.baseTheme({
    // A box with no width at the value's start, and the name in it set to its left, over the indentation:
    // so the value isn't moved, and the cursor before it is where it would be without the name.
    '.cm-ms-member-label': {
      display: 'inline-block',
      position: 'relative',
      width: '0',
      pointerEvents: 'none',
      userSelect: 'none',
    },
    '.cm-ms-member-label__name': {
      position: 'absolute',
      right: '0.5em',
      bottom: '-0.2em',
      whiteSpace: 'nowrap',
      color: 'var(--muted)',
      opacity: '0.75',
      fontSize: '0.85em',
    },
    '.cm-ms-member-label .katex': { fontSize: '1em' },
  }),
]

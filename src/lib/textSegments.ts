/**
 * Text as each output draws it: headings, block titles, notes and prose split
 * into plain text, subscripts and inline maths, so the app, LaTeX and Word draw
 * the same text the same way. (The markup itself is in syntax/text.ts; this adds
 * the engine's modules, whose notation in a subscript is drawn as maths.)
 */
import { moduleSubscriptTex } from './engine/index.ts'
import { TEXT_SUBSCRIPT, splitInlineMath, subscriptOf, unescapeUnderscores, words, type WordOf } from './syntax.ts'

/** Each kind of piece of text: plain text, a subscript, or inline maths. */
export const TITLE_SEGMENT = words({ text: 'text', sub: 'sub', math: 'math' })
export type TitleSegmentKind = WordOf<typeof TITLE_SEGMENT>

/** A piece of text, of one kind. */
export type TitleSegment = { kind: TitleSegmentKind; value: string }

/** In maths, nothing to put a subscript on: the text before it is its base. */
const EMPTY_BASE = '{}'

/**
 * Headings, block titles, notes and prose: `2p_z` shows its subscript (as
 * variable names do), `m_{H2O}` a formula as its subscript, and `$…$` is inline maths.
 */
export function titleSegments(text: string): TitleSegment[] {
  const out: TitleSegment[] = []
  const plain = (s: string) => {
    if (s) out.push({ kind: TITLE_SEGMENT.text, value: unescapeUnderscores(s) })
  }
  for (const seg of splitInlineMath(text)) {
    if (seg.math) {
      out.push({ kind: TITLE_SEGMENT.math, value: seg.value })
      continue
    }
    let last = 0
    for (const m of seg.value.matchAll(TEXT_SUBSCRIPT)) {
      plain(seg.value.slice(last, m.index))
      const sub = subscriptOf(m.groups!.subscript)
      // A subscript in a module's notation (`m_{H2O}`, chemistry) is drawn as it says, in maths; anything else is a subscript of text.
      const tex = moduleSubscriptTex(sub)
      out.push(tex !== undefined
        ? { kind: TITLE_SEGMENT.math, value: `${EMPTY_BASE}_{${tex}}` }
        : { kind: TITLE_SEGMENT.sub, value: sub })
      last = m.index + m[0].length
    }
    plain(seg.value.slice(last))
  }
  return out
}

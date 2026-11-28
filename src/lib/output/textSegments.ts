/**
 * Text as each output draws it: headings, block titles, notes and prose split
 * into plain text, subscripts and inline maths, each bold or italic or neither,
 * so the app, LaTeX and Word draw the same text the same way. (The markup itself
 * is in syntax/text.ts; this adds the engine's modules, whose notation in a
 * subscript is drawn as maths.)
 */
import { moduleSubscriptTex } from '../engine/index.ts'
import {
  EMPHASIS_MARK, EMPHASIS_MARKS, EMPHASIS_RUN, MATHS_MARK, MOST_EMPHASIS_MARKS, TEXT_LINK, TEXT_SUBSCRIPT, regex, splitInlineMath, src, subscriptOf,
  unescapeEmphasisMarks, unescapeUnderscores, words, type WordOf,
} from '../syntax.ts'
import { TEX_EMPTY_GROUP } from '../latex/syntax.ts'

/** Each kind of piece of text: plain text, a subscript, or inline maths. */
export const TITLE_SEGMENT = words({ text: 'text', sub: 'sub', math: 'math' })
export type TitleSegmentKind = WordOf<typeof TITLE_SEGMENT>

/** The emphasis a piece of text is in (`**bold**`, `*italic*`), and the address it links to (`[text](https://…)`). */
export interface Emphasis {
  bold?: boolean
  italic?: boolean
  href?: string
}

/** A piece of text, of one kind, in its emphasis. */
export interface TitleSegment extends Emphasis {
  kind: TitleSegmentKind
  value: string
}

/** In maths, nothing to put a subscript on: the text before it is its base. */
const EMPTY_BASE = TEX_EMPTY_GROUP

/**
 * Headings, block titles, notes and prose: `2p_z` shows its subscript (as
 * variable names do), `m_{H2O}` a formula as its subscript, `$…$` is inline
 * maths, `**…**` and `*…*` are bold and italic, and `[text](https://…)` a link.
 */
export function titleSegments(text: string): TitleSegment[] {
  const out: TitleSegment[] = []
  for (const piece of emphasised(text)) {
    const emphasis = emphasisOf(piece)
    const plain = (s: string) => {
      if (s) out.push({ kind: TITLE_SEGMENT.text, value: unescapeEmphasisMarks(unescapeUnderscores(s)), ...emphasis })
    }
    if (piece.math) {
      out.push({ kind: TITLE_SEGMENT.math, value: piece.value, ...emphasis })
      continue
    }
    let last = 0
    for (const m of piece.value.matchAll(TEXT_SUBSCRIPT)) {
      plain(piece.value.slice(last, m.index))
      const sub = subscriptOf(m.groups!.subscript)
      // A subscript in a module's notation (`m_{H2O}`, chemistry) is drawn as it says, in maths; anything else is a subscript of text.
      const tex = moduleSubscriptTex(sub)
      out.push(tex !== undefined
        ? { kind: TITLE_SEGMENT.math, value: `${EMPTY_BASE}_{${tex}}`, ...emphasis }
        : { kind: TITLE_SEGMENT.sub, value: sub, ...emphasis })
      last = m.index + m[0].length
    }
    plain(piece.value.slice(last))
  }
  return out
}

/** Only the emphasis that's on, and a link if it's one (so text without any is as it always was). */
const emphasisOf = ({ bold, italic, href }: Emphasis): Emphasis =>
  ({ ...(bold && { bold }), ...(italic && { italic }), ...(href !== undefined && { href }) })

// ---------------------------------------------------------------------------
// Emphasis
// ---------------------------------------------------------------------------

/** Text or inline maths, in its emphasis. */
interface Emphasised extends Emphasis {
  math: boolean
  value: string
}

/** What a mark (`*` or `**`) turned out to do: open emphasis, close it, or nothing (it's just text). */
const MARK_ROLE = words({ open: 'open', close: 'close', text: 'text' })
type MarkRole = WordOf<typeof MARK_ROLE>

/** One emphasis's marks in a run of them: `*` (1) or `**` (2), and what they do. */
interface Mark {
  size: number
  role: MarkRole
}

/** Text, inline maths, a run of marks (each of its emphases' marks, in order), or where a link starts (its address) or ends. */
type Piece = { math: boolean; value: string } | { marks: Mark[] } | { link: string | undefined }

/** Whether a character is one emphasis can open before, or close after (not a space; maths counts). */
const touches = (c: string | undefined) => c !== undefined && !WHITESPACE.test(c)

/** A space, or other whitespace. */
const WHITESPACE = regex(src`\s`)

/**
 * Text split into its emphasis and links: each run of marks closes the nearest
 * emphasis still open that it can (the same kind first: `**a *b**` is bold,
 * with a plain `*`), then opens what's left of it; marks nothing matches are
 * plain text. A link's text has emphasis as any text does.
 */
function emphasised(text: string): Emphasised[] {
  const pieces: Piece[] = []
  /** Marks that may yet open emphasis, nearest last. */
  const open: Mark[] = []
  const segments = splitInlineMath(text)
  segments.forEach((seg, i) => {
    if (seg.math) {
      pieces.push(seg)
      return
    }
    const s = seg.value
    // (Maths before or after the text is something the marks touch.)
    const before = i > 0 ? MARKS_TOUCH_MATHS : undefined
    const after = i < segments.length - 1 ? MARKS_TOUCH_MATHS : undefined
    /** The text from `from` to `to`, split at its runs of marks (what they touch is the whole text's). */
    const scan = (from: number, to: number) => {
      let last = from
      for (const m of s.slice(from, to).matchAll(EMPHASIS_RUN)) {
        const at = from + m.index
        if (at > last) pieces.push({ math: false, value: s.slice(last, at) })
        const end = at + m[0].length
        const marks = runMarks(open, m[0].length, touches(at ? s[at - 1] : before), touches(end < s.length ? s[end] : after))
        pieces.push({ marks })
        last = end
      }
      if (last < to) pieces.push({ math: false, value: s.slice(last, to) })
    }
    // Links, `[text](https://…)`: their text, between where they start and end.
    let last = 0
    for (const link of s.matchAll(TEXT_LINK)) {
      const { text: linked, url } = link.groups!
      scan(last, link.index)
      pieces.push({ link: url })
      // (Past the `[`.)
      scan(link.index + 1, link.index + 1 + linked.length)
      pieces.push({ link: undefined })
      last = link.index + link[0].length
    }
    scan(last, s.length)
  })
  return styled(pieces)
}

/** What maths next to a run of marks counts as, for whether they touch it: something that isn't a space. */
const MARKS_TOUCH_MATHS = MATHS_MARK

/**
 * A run of `length` marks: what it closes of the marks still `open` (if it
 * comes after something) and what it opens (if it comes before something),
 * added to `open`.
 */
function runMarks(open: Mark[], length: number, canClose: boolean, canOpen: boolean): Mark[] {
  if (length > MOST_EMPHASIS_MARKS) return [{ size: length, role: MARK_ROLE.text }]
  const marks: Mark[] = []
  let left = length
  while (canClose && left > 0) {
    // The nearest open emphasis of just this many marks, else the nearest that fits.
    const at = lastIndex(open, (o) => o.size === left) ?? lastIndex(open, (o) => o.size <= left)
    if (at === undefined) break
    const opener = open[at]
    // (Marks opened after it, inside it, close nothing: they stay plain text.)
    open.splice(at)
    opener.role = MARK_ROLE.open
    marks.push({ size: opener.size, role: MARK_ROLE.close })
    left -= opener.size
  }
  if (left > 0 && canOpen) {
    // `***` opens bold, then italic inside it (so `***both***` closes them in the right order).
    const sizes = left === MOST_EMPHASIS_MARKS ? [EMPHASIS_MARKS.bold, EMPHASIS_MARKS.italic] : [left]
    for (const size of sizes) {
      const mark: Mark = { size, role: MARK_ROLE.text }
      open.push(mark)
      marks.push(mark)
    }
  } else if (left > 0) {
    marks.push({ size: left, role: MARK_ROLE.text })
  }
  return marks
}

/** The last index of an item that passes `test` (undefined if none does). */
function lastIndex<T>(items: readonly T[], test: (item: T) => boolean): number | undefined {
  for (let i = items.length - 1; i >= 0; i--) if (test(items[i])) return i
  return undefined
}

/** The pieces in their emphasis: marks that open or close change it, others are text; text next to text is joined. */
function styled(pieces: Piece[]): Emphasised[] {
  const out: Emphasised[] = []
  let bold = 0
  let italic = 0
  let href: string | undefined
  const add = (math: boolean, value: string) => {
    const emphasis = { bold: bold > 0, italic: italic > 0, href }
    const prev = out.at(-1)
    if (!math && prev && !prev.math && prev.bold === emphasis.bold && prev.italic === emphasis.italic && prev.href === href) prev.value += value
    else out.push({ math, value, ...emphasis })
  }
  for (const p of pieces) {
    if ('link' in p) {
      href = p.link
      continue
    }
    if (!('marks' in p)) {
      add(p.math, p.value)
      continue
    }
    for (const mark of p.marks) {
      const step = mark.role === MARK_ROLE.open ? 1 : mark.role === MARK_ROLE.close ? -1 : 0
      if (!step) add(false, EMPHASIS_MARK.repeat(mark.size))
      else if (mark.size === EMPHASIS_MARKS.bold) bold += step
      else italic += step
    }
  }
  return out
}

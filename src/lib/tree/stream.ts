/**
 * Reading a sheet one line at a time: given what the line is inside (the blocks
 * open above it) and the line, what it is, and what it's inside after it. The
 * tree (codec.ts) is built from these steps, and the editor's highlighting reads
 * a line the same way, one line at a time, so the two can't disagree.
 *
 * What's carried from line to line (LineState) is small and never changed, only
 * replaced: the editor keeps one per line, and a line's read is cached by its
 * text and context (lines.ts), so reading again after an edit is cheap.
 */
import { BLOCK_CLOSE, CARRIED_JOIN, closesLatex, indentOf } from '../syntax.ts'
import { BODY_END, CONTINUED, contextInfo, type Body, type BodyEnd } from './grammar.ts'
import { LINE_CONTEXT, NODE_KIND, type SyntaxNode } from './nodes.ts'
import { endsExpecting, notedOf, parseCloser, readLine, standsAlone, type SourceLine } from './lines.ts'
import { startsByClosing } from './lexer.ts'

/** A body being read: the node holding it, its context, how it ends, and the indentation of the line that opened it. */
export interface Frame {
  readonly node: string
  readonly context: string
  readonly ends: BodyEnd
  readonly indent: number
  /** For a continued line (BODY_END.brackets): how many of its brackets are still open. */
  readonly open?: number
  /** For a continued line: what it's said so far, its lines' bodies joined (the next is read as the rest of it). */
  readonly said?: string
  /** For a continued line: whether what it's said so far ends expecting more (`[`, `1234,`). */
  readonly expects?: boolean
}

/** What a continued line has said, with what a line of it says: their bodies joined, as the reader joins them. */
const saying = (said: string | undefined, node: SyntaxNode): string | undefined => {
  const body = notedOf(node)?.body
  return !body ? said : said === undefined ? body : said + CARRIED_JOIN + body
}

/** The bodies a line is inside, innermost last (none: the sheet's top). */
export type LineState = readonly Frame[]

/** At the top of the sheet. */
export const TOP: LineState = []

/** What a line is to the blocks around it. */
export const LINE_ROLE = {
  /** A line in its body (or the sheet). */
  line: 'line',
  /** It opens a body: the lines after it are in it. */
  opener: 'opener',
  /** It closes the innermost body (it's that body's last line). */
  closer: 'closer',
  /** A row of a body kept as rows (imported data's). */
  row: 'row',
} as const
export type LineRole = (typeof LINE_ROLE)[keyof typeof LINE_ROLE]

/** A line, read in its place. */
export interface Step {
  readonly node: SyntaxNode
  readonly role: LineRole
  /** The context it was read in. */
  readonly context: string
  /** The bodies that ended before it, innermost first (where the indentation does). */
  readonly ended: readonly Frame[]
  /** What it opens, if it opens a body. */
  readonly body?: Body
  /** The bodies the next line is inside. */
  readonly state: LineState
}

/** Whether a line ends a body before it (it isn't indented further, for a body that ends so); `around`: the context the body is in. */
function endsBefore(line: SourceLine, frame: Frame, around: string): boolean {
  const blank = !line.text.trim()
  if (frame.ends === BODY_END.indent) return blank || indentOf(line.text) <= frame.indent
  if (frame.ends === BODY_END.brackets) {
    if (blank) return true
    if (indentOf(line.text) > frame.indent || startsByClosing(line.text)) return false
    // A line not indented further still carries it on if it ends expecting more and the line couldn't be
    // a line of its own (a value at the wrong indentation, `0.231 N,`); one that could (`y = 2` after
    // `x = sin(`, half typed) ends it, so a bracket never closed doesn't take in the rest of the sheet.
    return !frame.expects || standsAlone(line.text, around)
  }
  return false
}

/** Whether a line closes a body by how it's written (`}` for prose and the like; `}` alone for raw LaTeX). */
function closesByText(line: SourceLine, frame: Frame): boolean {
  if (frame.ends === BODY_END.brace) return line.text.trimStart().startsWith(BLOCK_CLOSE)
  if (frame.ends === BODY_END.braceAlone) return closesLatex(line.text)
  return false
}

/** A line, read in its place: after the blocks open above it (`state`). */
export function stepLine(state: LineState, line: SourceLine): Step {
  const stack = [...state]
  const ended: Frame[] = []
  while (stack.length && endsBefore(line, stack.at(-1)!, stack.at(-2)?.context ?? LINE_CONTEXT.sheet)) ended.push(stack.pop()!)
  const top = stack.at(-1)
  const context = top?.context ?? LINE_CONTEXT.sheet
  if (top && closesByText(line, top)) {
    stack.pop()
    return { node: parseCloser(line), role: LINE_ROLE.closer, context, ended, state: stack }
  }
  const { node, body, brackets = 0 } = readLine(line, context, top?.said)
  if (contextInfo(context).raw) return { node, role: LINE_ROLE.row, context, ended, state: stack }
  // A `}` of its own closes the block it's in (one at the top, with none open, is just a line).
  if (top?.ends === BODY_END.closer && node.kind === NODE_KIND.blockCloser) {
    stack.pop()
    return { node: parseCloser(line), role: LINE_ROLE.closer, context, ended, state: stack }
  }
  // A line carrying on a continued line: the one that closes the last of its brackets closes it.
  if (top?.ends === BODY_END.brackets) {
    const open = (top.open ?? 0) + brackets
    stack.pop()
    if (open <= 0) return { node, role: LINE_ROLE.closer, context, ended, state: stack }
    stack.push({ ...top, open, said: saying(top.said, node), expects: endsExpecting(node) ?? top.expects })
    return { node, role: LINE_ROLE.line, context, ended, state: stack }
  }
  // (A line that opens a body of its own, `@import(…)`, isn't carried on by its brackets.)
  const opens = body ?? (brackets > 0 ? CONTINUED : undefined)
  if (opens) {
    const open = opens === CONTINUED ? { open: brackets, said: saying(undefined, node), expects: endsExpecting(node) } : {}
    stack.push({ node: opens.node, context: opens.context, ends: opens.ends, indent: indentOf(line.text), ...open })
    return { node, role: LINE_ROLE.opener, context, ended, body: opens, state: stack }
  }
  return { node, role: LINE_ROLE.line, context, ended, state: stack }
}

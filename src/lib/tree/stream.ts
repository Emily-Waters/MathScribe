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
import { BLOCK_CLOSE, closesLatex, indentOf } from '../syntax.ts'
import { BODY_END, contextInfo, type Body, type BodyEnd } from './grammar.ts'
import { LINE_CONTEXT, NODE_KIND, type SyntaxNode } from './nodes.ts'
import { parseCloser, readLine, type SourceLine } from './lines.ts'

/** A body being read: the node holding it, its context, how it ends, and the indentation of the line that opened it. */
export interface Frame {
  readonly node: string
  readonly context: string
  readonly ends: BodyEnd
  readonly indent: number
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

/** Whether a line ends a body before it (it isn't indented further, for a body that ends so). */
function endsBefore(line: SourceLine, frame: Frame): boolean {
  const blank = !line.text.trim()
  if (frame.ends === BODY_END.indent) return blank || indentOf(line.text) <= frame.indent
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
  while (stack.length && endsBefore(line, stack.at(-1)!)) ended.push(stack.pop()!)
  const top = stack.at(-1)
  const context = top?.context ?? LINE_CONTEXT.sheet
  if (top && closesByText(line, top)) {
    stack.pop()
    return { node: parseCloser(line), role: LINE_ROLE.closer, context, ended, state: stack }
  }
  const { node, body } = readLine(line, context)
  if (contextInfo(context).raw) return { node, role: LINE_ROLE.row, context, ended, state: stack }
  // A `}` of its own closes the block it's in (one at the top, with none open, is just a line).
  if (top?.ends === BODY_END.closer && node.kind === NODE_KIND.blockCloser) {
    stack.pop()
    return { node: parseCloser(line), role: LINE_ROLE.closer, context, ended, state: stack }
  }
  if (body) {
    stack.push({ node: body.node, context: body.context, ends: body.ends, indent: indentOf(line.text) })
    return { node, role: LINE_ROLE.opener, context, ended, body, state: stack }
  }
  return { node, role: LINE_ROLE.line, context, ended, state: stack }
}

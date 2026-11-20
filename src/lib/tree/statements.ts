/**
 * A sheet's statements: each thing it says, as one line, whatever lines it's
 * written over. Most are a line; a call carried on over several lines while its
 * brackets are open (a `continued` node, stream.ts) is one statement of all of
 * them. A statement is read once, from its lines' nodes, and kept with its node
 * (a WeakMap, as a line's text is), so the reader, the formatter, the editor and
 * anything else reading a sheet take a statement as the tree has it, rather than
 * each joining its lines, or laying out its tokens, again:
 *
 *   val = @series(       its lines        the four lines' nodes
 *       1234,            its tokens       every token, at any depth, each where it is
 *       5678,            its text         `val = @series( 1234, 5678 )  # the readings`
 *   )  # the readings    what it says     its body, #commands and note, as one line's
 *
 * Each line keeps its own tokens (the editor reads a sheet a line at a time), and
 * those are the ones the line has as part of the statement (lexer.ts lexTail):
 * so a statement's tokens are its lines' tokens, in order.
 */
import { CARRIED_JOIN, joinSplit, splitNote, type SplitLine } from '../syntax.ts'
import { NODE_KIND, TOKEN_KIND, isToken, type Part, type SyntaxNode, type Token } from './nodes.ts'
import { notedOf, trailingSeparatorAt } from './lines.ts'
import { startsByClosing } from './lexer.ts'
import { textOf } from './codec.ts'
import { isBlockKind } from './grammar.ts'

/** A token of a statement, and where it is: which of its lines (from 0), and where in that line's text. */
export interface PlacedToken {
  readonly token: Token
  readonly line: number
  readonly at: number
}

/** One thing a sheet says, as one line, over however many lines it's written (see the top of this file). */
export interface Statement {
  /** The kind of line it's read as: its first line's (a calculation, a constant). */
  readonly kind: string
  /** Its lines' nodes, in order: one, or a continued line's (comments among them too). */
  readonly lines: readonly SyntaxNode[]
  /** Every token of its lines, at any depth, in order, each where it is. */
  readonly tokens: readonly PlacedToken[]
  /**
   * Its text as one line: a line's as written (without what ends it); a
   * continued line's lines' text joined by a space, at its first line's
   * indentation, comments left out, and a trailing comma before a closing
   * bracket (`5678,` then `)`) left out, as a call on one line can't have one.
   * (A note stays where it's written, `@series(  # readings 1234, …`: what the
   * engine works out is `noted`'s body.)
   */
  readonly text: string
  /** Its body, #commands and note, as one line's: what it says, worked out; undefined for a line not read for them (the reader reads them from its text). */
  readonly noted?: SplitLine
}

/** A line node's text, as written, without what ends it (nor the part at `leaving`, if given). */
export const rawOf = (node: SyntaxNode, leaving = -1): string =>
  node.parts.map((p, i) => (i === leaving || (isToken(p) && p.t === TOKEN_KIND.eol) ? '' : textOf(p))).join('')

/** Each statement read, by its node (nodes are frozen and shared, so a statement read once is read for every sheet with it). */
const statements = new WeakMap<SyntaxNode, Statement>()

/** The statement a node is: a line's, or a continued line's (its lines as one). */
export function statementOf(node: SyntaxNode): Statement {
  let statement = statements.get(node)
  if (!statement) {
    statement = node.kind === NODE_KIND.continued ? continued(node) : line(node)
    if (Object.isFrozen(node)) statements.set(node, statement)
  }
  return statement
}

/** A line's statement: the line as it is. */
function line(node: SyntaxNode): Statement {
  return { kind: node.kind, lines: [node], tokens: placed([node]), text: rawOf(node), noted: notedOf(node) }
}

/** A continued line's statement: its lines as one (see Statement.text). */
const continued = (node: SyntaxNode): Statement => statementOfLines(node.parts.filter((p): p is SyntaxNode => !isToken(p)))

/**
 * The statement some lines are, as one (a continued line's, see Statement.text),
 * for lines read one at a time (stream.ts: the formatter's), not yet a node.
 */
export function statementOfLines(lines: readonly SyntaxNode[]): Statement {
  const said = lines.filter((l) => l.kind !== NODE_KIND.comment)
  const texts = said.map((l, i) => {
    const comma = trailingSeparatorAt(l)
    const next = said[i + 1]
    const trailing = comma >= 0 && next !== undefined && startsByClosing(rawOf(next))
    return trailing ? rawOf(l, comma).trim() : rawOf(l).trim()
  })
  // (A line with its comma left out is split again: the tree's split of it has the comma.)
  const splits = said.map((l, i) => (texts[i] === rawOf(l).trim() ? notedOf(l) : undefined) ?? splitNote(texts[i]))
  const [first] = lines[0].parts
  const indent = isToken(first) && first.t === TOKEN_KIND.indent ? first.text : ''
  return { kind: lines[0].kind, lines, tokens: placed(lines), text: indent + texts.join(CARRIED_JOIN), noted: joinSplit(splits) }
}

/** A statement where it is in a sheet: where each of its lines starts in the sheet's text. */
export interface SheetStatement {
  readonly statement: Statement
  readonly starts: readonly number[]
}

/**
 * Every statement of a sheet's tree, in order, a block's (its opener, its lines'
 * and its closing line's) too, each where it is. (Imported data's rows aren't
 * statements: they're data.)
 */
export function sheetStatements(body: readonly SyntaxNode[]): SheetStatement[] {
  const out: SheetStatement[] = []
  let at = 0
  const visit = (nodes: readonly SyntaxNode[]) => {
    for (const node of nodes) {
      if (node.kind !== NODE_KIND.continued && isBlockKind(node.kind)) {
        visit(node.parts.filter((p): p is SyntaxNode => !isToken(p)))
        continue
      }
      if (node.parts.some((p) => isToken(p) && p.t === TOKEN_KIND.rows)) {
        at += textOf(node).length
        continue
      }
      const statement = statementOf(node)
      const starts = statement.lines.map((l) => {
        const start = at
        at += textOf(l).length
        return start
      })
      out.push({ statement, starts })
    }
  }
  visit(body)
  return out
}

/** Lines' tokens, at any depth, in order, each where it is in its line. */
function placed(lines: readonly SyntaxNode[]): PlacedToken[] {
  const out: PlacedToken[] = []
  lines.forEach((node, line) => {
    let at = 0
    const visit = (parts: readonly Part[]) => {
      for (const p of parts) {
        if (!isToken(p)) visit(p.parts)
        else {
          out.push({ token: p, line, at })
          at += p.text.length
        }
      }
    }
    visit(node.parts)
  })
  return out
}

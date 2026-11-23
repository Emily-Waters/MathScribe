/**
 * The core's grammar: its contexts and its kinds of line, in the order a line
 * is offered them (after any module's), as the reading layer reads them.
 */
import {
  BLOCK_CLOSE, BLOCK_OPEN, CONSTANTS_OPENER, IMPORT, LATEX_OPENER, PARAGRAPH_MARK, PROSE_LAYOUTS,
} from '../syntax.ts'
import { LAYOUT_SYNTAX, splitNote } from '../syntax.ts'
import { BODY_END, CONTENT, GRAMMAR_CORE, declareContexts, declareLineSyntaxes, type LineSyntax } from './grammar.ts'
import { LINE_CONTEXT, NODE_KIND } from './nodes.ts'

/** A heading's `#`s, at the start of a line. */
export const HEADING_MARKS = /^#+/

/** A line in the sheet (or a block in it). */
const SHEET = [LINE_CONTEXT.sheet] as const

/** Whether a line ends with a block's `{` (before its note). */
const opensBlock = (body: string) => body.endsWith(BLOCK_OPEN)

const SYNTAXES: LineSyntax[] = [
  {
    kind: NODE_KIND.constantsOpener, contexts: SHEET, content: CONTENT.opener,
    matches: (_, split) => CONSTANTS_OPENER.test(split().body),
    opens: { node: NODE_KIND.constants, context: LINE_CONTEXT.constants, ends: BODY_END.brace },
  },
  {
    // `# Kinematics {`: a block titled as a section.
    kind: NODE_KIND.blockOpener, contexts: SHEET, content: CONTENT.headedOpener,
    matches: (trimmed) => HEADING_MARKS.test(trimmed) && opensBlock(splitHeaded(trimmed)),
    opens: { node: NODE_KIND.block, context: LINE_CONTEXT.sheet, ends: BODY_END.closer },
  },
  { kind: NODE_KIND.heading, contexts: SHEET, content: CONTENT.heading, matches: (trimmed) => HEADING_MARKS.test(trimmed) },
  { kind: NODE_KIND.paragraph, contexts: SHEET, content: CONTENT.paragraph, matches: (trimmed) => trimmed.startsWith(PARAGRAPH_MARK) },
  {
    kind: NODE_KIND.latexOpener, contexts: SHEET, content: CONTENT.rawOpener,
    matches: (trimmed) => LATEX_OPENER.exec(trimmed)?.groups?.rest.trim() === '',
    opens: { node: NODE_KIND.latexBlock, context: LINE_CONTEXT.latex, ends: BODY_END.braceAlone },
  },
  { kind: NODE_KIND.latex, contexts: SHEET, content: CONTENT.rawOpener, matches: (trimmed) => LATEX_OPENER.test(trimmed) },
  {
    kind: NODE_KIND.importLine, contexts: SHEET, content: CONTENT.expression,
    matches: (_, split) => IMPORT.test(split().body),
    opens: { node: NODE_KIND.import, context: LINE_CONTEXT.data, ends: BODY_END.indent },
  },
  { kind: NODE_KIND.blockCloser, contexts: SHEET, content: CONTENT.noted, matches: (_, split) => split().body === BLOCK_CLOSE },
  {
    kind: NODE_KIND.proseOpener, contexts: SHEET, content: CONTENT.opener,
    matches: (_, split) => {
      const style = LAYOUT_SYNTAX.read(split().body)?.style
      return style !== undefined && PROSE_LAYOUTS.has(style)
    },
    opens: { node: NODE_KIND.prose, context: LINE_CONTEXT.prose, ends: BODY_END.brace },
  },
  {
    kind: NODE_KIND.layoutOpener, contexts: SHEET, content: CONTENT.opener,
    matches: (_, split) => LAYOUT_SYNTAX.read(split().body) !== null,
    opens: { node: NODE_KIND.layout, context: LINE_CONTEXT.sheet, ends: BODY_END.closer },
  },
  {
    kind: NODE_KIND.blockOpener, contexts: SHEET, content: CONTENT.opener,
    matches: (_, split) => opensBlock(split().body),
    opens: { node: NODE_KIND.block, context: LINE_CONTEXT.sheet, ends: BODY_END.closer },
  },
]

/** A heading line's body, after its `#`s and before its note: `# Kinematics {  // part 1` → `Kinematics {`. */
export const splitHeaded = (trimmed: string) => splitNote(trimmed.replace(HEADING_MARKS, '').trim()).body

declareContexts([
  // (A line in the sheet that's no other kind is a calculation.)
  { name: LINE_CONTEXT.sheet, lineKind: NODE_KIND.calc, content: CONTENT.expression },
  { name: LINE_CONTEXT.prose, lineKind: NODE_KIND.proseLine, content: CONTENT.text },
  { name: LINE_CONTEXT.latex, lineKind: NODE_KIND.latexLine, content: CONTENT.whole },
  { name: LINE_CONTEXT.constants, lineKind: NODE_KIND.constantLine, content: CONTENT.expression },
  { name: LINE_CONTEXT.data, lineKind: NODE_KIND.data, content: CONTENT.whole, raw: true },
  { name: LINE_CONTEXT.continued, lineKind: NODE_KIND.continuation, content: CONTENT.continuation },
])
declareLineSyntaxes(GRAMMAR_CORE, SYNTAXES)

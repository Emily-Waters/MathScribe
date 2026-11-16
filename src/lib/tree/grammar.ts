/**
 * How a sheet's lines are read into nodes: the grammar, declared as data the
 * core and each module add to (as kinds are, in registry.ts).
 *
 *   LineSyntax   a kind of line: where it can be (its contexts), how to tell
 *                one (matches), and what it opens, if anything (a body)
 *   Context      what a line is inside (the sheet, prose, raw LaTeX, a
 *                function's body, imported data), and the kind its lines are
 *
 * A line is offered to the syntaxes of its context in order (a module's first,
 * as a module's readers are), and the first that matches is its kind; a line
 * that opens a body (`Title {`, `def f(x)`, `@import(…)`) makes a node holding
 * itself and the lines of its body, up to where the body ends.
 */
/** A line split into what it says and its #commands and note (as splitNote splits it): what a syntax needs of it. */
export interface NotedLine {
  readonly body: string
}

/** How a body ends: at its `}`; at a `}` on its own (raw LaTeX); at the first line not indented further (a blank one too, or not). */
export const BODY_END = {
  /** The first `}` line of its own (a block in the sheet: blocks inside it end at theirs first). */
  closer: 'closer',
  /** The first line starting with `}` (it's the block's: prose and the like hold no blocks). */
  brace: 'brace',
  /** The first line that's `}` and nothing else (raw LaTeX has braces of its own). */
  braceAlone: 'braceAlone',
  /** The first line that's blank or not indented further (imported data's rows). */
  indent: 'indent',
  /** The first non-blank line not indented further (a function's body: blank lines are in it). */
  indentOrBlank: 'indentOrBlank',
} as const
export type BodyEnd = (typeof BODY_END)[keyof typeof BODY_END]

/** How a line's content is read into tokens. */
export const CONTENT = {
  /** Its text, then its #commands and note (`m = 2.0 kg  #val  # mass`). */
  noted: 'noted',
  /** All one token: prose, raw LaTeX (a `#` in it is the text's). */
  whole: 'whole',
  /** A heading's `#`s, then its title (all of it: a `#` in a title is the title's). */
  heading: 'heading',
  /** A heading's `#`s, then its title, `{`, #commands and note (`# Kinematics {  #val`). */
  headedOpener: 'headedOpener',
} as const
export type Content = (typeof CONTENT)[keyof typeof CONTENT]

/** What a line opens: the node that holds it and its body, the body's context, and how the body ends. */
export interface Body {
  /** The kind of node holding the line and its body. */
  readonly node: string
  /** What the body's lines are inside. */
  readonly context: string
  readonly ends: BodyEnd
}

/** A kind of line. */
export interface LineSyntax {
  /** The kind of node the line is. */
  readonly kind: string
  /** The contexts it can be in. */
  readonly contexts: readonly string[]
  /** How its content is read into tokens. */
  readonly content: Content
  /** Whether a line (trimmed, and split into its body, #commands and note) is one of these. */
  matches(trimmed: string, split: () => NotedLine): boolean
  /** What it opens, if anything: the lines after it are its body. (Declared, so the schema can list it.) */
  readonly opens?: Body
}

/** A context: what a line is inside, and what its lines are when no syntax of it matches. */
export interface ContextInfo {
  readonly name: string
  /** The kind of a line in it that no syntax matches. */
  readonly lineKind: string
  readonly content: Content
  /** Whether its lines are kept as one block of text rather than a node each (imported data's rows). */
  readonly raw?: boolean
}

/** The syntaxes declared, in the order a line is offered them, by who declared them (the core's last). */
const syntaxes: { owner: string; syntax: LineSyntax }[] = []
const contexts = new Map<string, ContextInfo>()

/** The core's name as an owner, whose syntaxes come after every module's. */
export const GRAMMAR_CORE = 'core'

/** Declare kinds of line (a module's are offered a line before the core's, in the order they're declared). */
export function declareLineSyntaxes(owner: string, declared: readonly LineSyntax[]): void {
  const at = owner === GRAMMAR_CORE ? syntaxes.length : syntaxes.findIndex((s) => s.owner === GRAMMAR_CORE)
  syntaxes.splice(at < 0 ? syntaxes.length : at, 0, ...declared.map((syntax) => ({ owner, syntax })))
}

/** Declare contexts. */
export function declareContexts(declared: readonly ContextInfo[]): void {
  for (const c of declared) {
    if (contexts.has(c.name)) throw new Error(`The context "${c.name}" is declared already.`)
    contexts.set(c.name, c)
  }
}

/** The syntaxes a line in a context is offered, in order. */
export const syntaxesIn = (context: string): LineSyntax[] =>
  syntaxes.filter((s) => s.syntax.contexts.includes(context)).map((s) => s.syntax)

/** A context, by name. */
export function contextInfo(name: string): ContextInfo {
  const c = contexts.get(name)
  if (!c) throw new Error(`There's no context "${name}".`)
  return c
}

/** Every syntax declared, with its owner, in the order a line is offered them (for the schema's listing). */
export const declaredLineSyntaxes = () => syntaxes.map(({ owner, syntax }) => ({
  owner, kind: syntax.kind, contexts: syntax.contexts, content: syntax.content, opens: syntax.opens,
}))

/** Every context declared (for the schema's listing). */
export const declaredContexts = (): readonly ContextInfo[] => [...contexts.values()]

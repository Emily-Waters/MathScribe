import { type CalcOptions, moduleSubscriptTex, unexpectedError } from './engine/index.ts'
import type { VariableSummary } from './values.ts'
import { DEF_HEAD, LEADING_NAME, LINE_COMMAND, TEXT_SUBSCRIPT, subscriptOf, unescapeUnderscores } from './syntax.ts'
import { NODE_KIND } from './tree/nodes.ts'
import { assignedOf, lineShape } from './tree/shapes.ts'
import { formulaTex } from './engine/modules/chemistry/chemistry.ts'
import { BLOCK_KIND, isContainer, type Block } from './blocks.ts'
import { SheetReader, type Sheet } from './reading/sheetReader.ts'
import { PLOT_CALL, SELECT_CALL } from './engine/modules/series/syntax.ts'

export type { Sheet }

/**
 * Line-based document model. Each non-empty line becomes one block:
 *   # / ## / ###     → numbered \section, numbered \subsection, \textbf heading (### or more)
 *   > Some prose       → paragraph (inline $latex$ allowed)
 *   @latex { \frac{a}{b} } → displayed LaTeX, not evaluated (or over several lines, up to a `}` alone)
 *   Title {            → opens a scoped block (title optional); `}` closes it
 *   m = 2.0 kg  # note → calculation; the text after # is shown as its description
 *   @constants {       → constants, usable anywhere as @name; `}` closes it
 *   def f(a, b)        → function; its body is the following, more-indented lines
 *       c = a * b        (local assignments)
 *       return c + 1
 *
 * Display commands can go anywhere after a calculation or block opener:
 *   #sym   show the equation only        F = m·a
 *   #val   show the result only          F = 19.6 N
 *   #full  show everything (the default; overrides a block's command)
 *   #hide  calculate, but don't show the line (or the whole block)
 *   #multiline  put each = on its own row, lined up (combines with the above)
 *   #sci, #dec  show results in scientific notation, or plain digits (combine too)
 * On a block opener, the command applies to every line inside unless a line
 * has its own.
 *
 * Layout blocks are in @layout, and hold the lines up to their `}`:
 *   @layout.numbered Steps {   → numbered list (list: bullets, center: centered)
 *       a = …                     each line is an item; indent further for a sub-list
 *   }
 *   @layout.text Discussion {  → prose: lines run into paragraphs, nothing is worked out
 *   @layout.titlepage Lab 3 {  → a title page: the title, with the lines inside centered under it
 * They only arrange lines: variables assigned inside stay available afterwards.
 * `#center` (or #list/#numbered) on a single calculation lays out just that line.
 *
 * Blocks scope variables like a programming language: inside a block you can
 * read everything defined above it, but anything assigned inside is local and
 * disappears at the closing `}`, leaving outer variables of the same name untouched.
 *
 * (What each kind of block holds is in blocks.ts.)
 */

/** A sheet evaluated, and how long that took (ms), to decide when to evaluate it next. */
export function evaluateSheetTimed(source: string, options: CalcOptions): { sheet: Sheet; ms: number } {
  const started = performance.now()
  return { sheet: evaluateSheetSafely(source, options), ms: performance.now() - started }
}

/**
 * A sheet evaluated, whatever happens: if reading it fails in a way nothing
 * expected, the sheet is one error saying so, rather than the app going blank.
 */
export function evaluateSheetSafely(source: string, options: CalcOptions): Sheet {
  try {
    return evaluateSheet(source, options)
  } catch (e) {
    return { blocks: [{ kind: BLOCK_KIND.calc, line: 1, source: '', tex: '', error: unexpectedError(e) }], variables: [] }
  }
}

/** Read and evaluate a whole sheet, line by line, into blocks (see reading/). */
export function evaluateSheet(source: string, options: CalcOptions): Sheet {
  return new SheetReader(source, options).read()
}

export function splitInlineMath(text: string): { math: boolean; value: string }[] {
  return text
    .split(/(\$[^$]+\$)/)
    .filter(Boolean)
    .map((s) => (s.length > 2 && s.startsWith('$') && s.endsWith('$')
      ? { math: true, value: s.slice(1, -1) }
      : { math: false, value: s }))
}

/** A piece of a title: plain text, a subscript, or inline maths. */
/** Each kind of piece of a title. */
export const TITLE_SEGMENT = { text: 'text', sub: 'sub', math: 'math' } as const
export type TitleSegmentKind = (typeof TITLE_SEGMENT)[keyof typeof TITLE_SEGMENT]

export type TitleSegment = { kind: TitleSegmentKind; value: string }

/** In maths, nothing to put a subscript on: the text before it is its base. */
const EMPTY_BASE = '{}'

/**
 * Headings and block titles: `2p_z` shows its subscript (as variable names do),
 * `m_{H2O}` a formula as its subscript, and `$…$` is inline maths, as in `>` text.
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
      const sub = subscriptOf(m[1])
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

/** Whether a block is left out of the output (and so isn't a list item). */
export function isOmitted(b: Block): boolean {
  // Spacers, and imported data, which only defines variables.
  if (b.kind === BLOCK_KIND.spacer || b.kind === BLOCK_KIND.import) return true
  if (b.kind === BLOCK_KIND.calc || b.kind === BLOCK_KIND.function || b.kind === BLOCK_KIND.constants || b.kind === BLOCK_KIND.species) {
    return !!b.hidden && !b.error
  }
  if (isContainer(b)) return b.command === LINE_COMMAND.hide && !b.error
  return false
}

/** A list block's items, each with the sub-lists indented under it. */
export function listItems(children: Block[]): { item: Block; subs: Block[] }[] {
  const items: { item: Block; subs: Block[] }[] = []
  for (const c of children) {
    if (isOmitted(c)) continue
    if (c.kind === BLOCK_KIND.layout && c.nested && items.length) items.at(-1)!.subs.push(c)
    else items.push({ item: c, subs: [] })
  }
  return items
}

/**
 * Where each function is defined, by name: `def f(…)` lines and one-line
 * `f(…) = …` lines, in order. (For go-to-definition in the editor.)
 */
export function collectDefinitions(blocks: Block[]): Map<string, number[]> {
  const out = new Map<string, number[]>()
  const put = (name: string, line: number) => out.set(name, [...(out.get(name) ?? []), line])
  const visit = (b: Block) => {
    if (b.kind === BLOCK_KIND.function) put(b.name, b.line)
    else if (b.kind === BLOCK_KIND.calc) {
      const { target } = lineShape(b.source)
      if (target?.kind === NODE_KIND.functionHead) put(target.name, b.line)
    } else if (isContainer(b)) b.children.forEach(visit)
  }
  blocks.forEach(visit)
  for (const lines of out.values()) lines.sort((a, b) => a - b)
  return out
}

/** Each kind of name the editor knows. */
export const SYMBOL_KIND = { variable: 'variable', parameter: 'parameter', function: 'function', constant: 'constant', species: 'species' } as const
export type SymbolKind = (typeof SYMBOL_KIND)[keyof typeof SYMBOL_KIND]

/** A name the editor can suggest or describe, and where it's visible. */
export interface SheetSymbol {
  name: string
  kind: SymbolKind
  /** Line it's defined on. */
  line: number
  /** Lines it can be used on (a `{ }` block or function body scopes it). */
  from: number
  to: number
  /** TeX for its value (`m = 2.00 kg`) or signature, if known. */
  tex?: string
  /** Plain-text parameters of a function, e.g. "n, m to kg, L to m". */
  params?: string
  /**
   * How many numbered members of a series this name stands for (1 if not
   * given). An imported column lists only its first and last values, which
   * between them stand for all of its values.
   */
  members?: number
  /**
   * TeX for any variable defined where this one is, by name: for a series'
   * members between its first and last, which aren't listed one by one.
   */
  texOf?: (name: string) => string | undefined
}

/**
 * Everything defined in the sheet, for completions and hover information:
 * variables (with their value), function parameters, functions (with their
 * signature) and `@constants`, each with the lines it's visible on.
 */
export function collectSymbols(sheet: Sheet, source: string): SheetSymbol[] {
  const lines = source.split(/\r?\n/)
  const out: SheetSymbol[] = []
  // Each scope's variables by name (a sheet can have thousands, from imported data).
  const byName = new WeakMap<() => VariableSummary[], Map<string, VariableSummary>>()
  const lookup = (scope: () => VariableSummary[]) => {
    let map = byName.get(scope)
    if (!map) byName.set(scope, map = new Map(scope().map((v) => [v.name, v])))
    return map
  }
  /** A variable's symbol, with its value's TeX worked out only when it's shown. */
  const variable = (name: string, line: number, from: number, to: number, scope: () => VariableSummary[], members?: number): SheetSymbol =>
    Object.defineProperties({ name, kind: SYMBOL_KIND.variable, line, from, to, members }, {
      tex: { get: () => lookup(scope).get(name)?.tex, enumerable: false },
      texOf: { value: (other: string) => lookup(scope).get(other)?.tex, enumerable: false },
    }) as SheetSymbol

  /** `to`: the last line of the innermost `{ }` block (or the sheet), where its names stop being visible;
   * `scope`: that block's variables (worked out when first needed), for their values. */
  const visit = (blocks: Block[], to: number, scope: () => VariableSummary[]) => {
    for (const b of blocks) {
      switch (b.kind) {
        case BLOCK_KIND.calc: {
          // What the line assigns to, read from its tokens (tree/shapes.ts).
          const { target } = lineShape(b.source)
          // `@tuple(a, b) = …`: each name is a variable.
          if (target?.kind === NODE_KIND.unpack) {
            for (const entry of target.entries ?? []) {
              // The name without its display settings (`theta:deg` → theta).
              const name = assignedOf(entry)?.name
              if (name) out.push(variable(name, b.line, b.line + 1, to, scope))
            }
            break
          }
          if (target?.kind === NODE_KIND.functionHead) {
            out.push({
              name: target.name, kind: SYMBOL_KIND.function, line: b.line, from: b.line, to,
              tex: b.tex.split(' = ')[0], params: (target.entries ?? []).filter(Boolean).join(', '),
            })
            break
          }
          // A select or named plot: the variables it made, a.x_1, p.slope (not a variable a).
          if (b.defines || SELECT_CALL.test(b.source) || PLOT_CALL.test(b.source)) {
            for (const d of b.defines ?? []) out.push(variable(d.name, b.line, b.line + 1, to, scope, d.members))
            break
          }
          if (target?.kind === NODE_KIND.assigned) out.push(variable(target.name, b.line, b.line + 1, to, scope))
          break
        }
        case BLOCK_KIND.function: {
          const params = DEF_HEAD.exec(lines[b.line - 1] ?? '')?.[2].trim() ?? ''
          out.push({ name: b.name, kind: SYMBOL_KIND.function, line: b.line, from: b.line, to, tex: b.signature, params })
          // Inside the body, its parameters are names too.
          for (const p of params.split(',')) {
            const name = LEADING_NAME.exec(p.trim())?.[0]
            if (name) out.push({ name, kind: SYMBOL_KIND.parameter, line: b.line, from: b.line + 1, to: b.endLine })
          }
          break
        }
        case BLOCK_KIND.constants:
          for (const e of b.entries) {
            const { target } = lineShape(e.source)
            const name = target?.kind === NODE_KIND.assigned ? target.name : undefined
            if (name) out.push({ name: `@${name}`, kind: SYMBOL_KIND.constant, line: e.line, from: 1, to: lines.length, tex: e.tex })
          }
          break
        case BLOCK_KIND.species:
          // A species' name is usable everywhere: in braces, `{dietzeite}`.
          for (const e of b.entries) if (!e.error) out.push({ name: e.name, kind: SYMBOL_KIND.species, line: e.line, from: 1, to: lines.length, tex: formulaTex(e.formula) })
          break
        case BLOCK_KIND.import:
          // Each value is a variable, t_1, t_2, …: listed by the first and last (a
          // column can have thousands), which stand for all of them in a series.
          for (const c of b.columns) {
            if (!c.count) continue
            out.push(variable(`${c.name}_${c.first}`, b.line, b.endLine + 1, to, scope, c.count > 1 ? c.count - 1 : 1))
            if (c.count > 1) out.push(variable(`${c.name}_${c.last}`, b.line, b.endLine + 1, to, scope, 1))
          }
          break
        case BLOCK_KIND.group:
          visit(b.children, b.endLine ?? lines.length, () => b.locals)
          break
        case BLOCK_KIND.layout:
          // Layout blocks don't scope their variables.
          visit(b.children, to, scope)
          break
      }
    }
  }
  visit(sheet.blocks, lines.length, () => sheet.variables)
  return out
}

/**
 * Line numbers as the sheet shows them: an import's data rows count as part of
 * its line (they're folded under it), so the line after a 27-row import on
 * line 1 is line 2. Takes a line of the file (1-based) and gives its number.
 * (The editor numbers its gutter the same way; see dataBlocks.ts.)
 */
export function lineNumbering(blocks: Block[]): (line: number) => number {
  const hidden: { after: number; count: number }[] = []
  const visit = (b: Block) => {
    if (b.kind === BLOCK_KIND.import && b.endLine > b.line) hidden.push({ after: b.endLine, count: b.endLine - b.line })
    else if (isContainer(b)) b.children.forEach(visit)
  }
  blocks.forEach(visit)
  return (line) => line - hidden.reduce((sum, h) => sum + (h.after < line ? h.count : 0), 0)
}

/** How serious a line's message is. */
export const DIAGNOSTIC_KIND = { error: 'error', warning: 'warning' } as const
export type DiagnosticKind = (typeof DIAGNOSTIC_KIND)[keyof typeof DIAGNOSTIC_KIND]

/** An error or warning on a line, for the editor’s gutter. */
export interface Diagnostic {
  kind: DiagnosticKind
  message: string
}

/** Errors and warnings by source line, for marking lines in the editor. */
export function collectDiagnostics(blocks: Block[]): Map<number, Diagnostic> {
  const out = new Map<number, Diagnostic>()
  const put = (line: number, kind: Diagnostic['kind'], message?: string) => {
    if (!message) return
    const existing = out.get(line)
    if (!existing || (existing.kind === DIAGNOSTIC_KIND.warning && kind === DIAGNOSTIC_KIND.error)) out.set(line, { kind, message })
  }
  const visit = (b: Block) => {
    switch (b.kind) {
      case BLOCK_KIND.calc:
        put(b.line, DIAGNOSTIC_KIND.warning, b.warning)
        put(b.line, DIAGNOSTIC_KIND.error, b.error)
        break
      case BLOCK_KIND.function: {
        // "Line 12: …" errors point at a body line.
        const at = /^Line (\d+): (.*)$/.exec(b.error ?? '')
        put(at ? Number(at[1]) : b.line, DIAGNOSTIC_KIND.error, at ? at[2] : b.error)
        break
      }
      case BLOCK_KIND.import:
      case BLOCK_KIND.heading:
      case BLOCK_KIND.text:
      case BLOCK_KIND.latex:
        put(b.line, DIAGNOSTIC_KIND.error, b.error)
        break
      case BLOCK_KIND.constants:
        put(b.line, DIAGNOSTIC_KIND.error, b.error)
        for (const e of b.entries) {
          put(e.line, DIAGNOSTIC_KIND.warning, e.warning)
          put(e.line, DIAGNOSTIC_KIND.error, e.error)
        }
        break
      case BLOCK_KIND.species:
        put(b.line, DIAGNOSTIC_KIND.error, b.error)
        for (const e of b.entries) put(e.line, DIAGNOSTIC_KIND.error, e.error)
        break
      case BLOCK_KIND.layout:
        put(b.line, DIAGNOSTIC_KIND.warning, b.warning)
        put(b.line, DIAGNOSTIC_KIND.error, b.error)
        b.children.forEach(visit)
        break
      case BLOCK_KIND.group:
        put(b.line, DIAGNOSTIC_KIND.error, b.error)
        b.children.forEach(visit)
        break
    }
  }
  blocks.forEach(visit)
  return out
}

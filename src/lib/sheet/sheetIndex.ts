/**
 * What the editor is told about a sheet once it's evaluated: the names defined
 * in it and where they're visible (completions, hovers), where each function is
 * defined (go-to-definition), each line's error or warning (the gutter), each
 * line's result (inline results), and line numbers as the sheet shows them.
 */
import type { VariableSummary } from './values.ts'
import type { LineValue } from '../engine/index.ts'
import { NODE_KIND } from '../tree/nodes.ts'
import { assignedOf, lineShape } from '../tree/shapes.ts'
import { BLOCK_KIND, SYMBOL_KIND, isContainer, type Block, type CalcBlock, type SymbolKind } from './blocks.ts'
import type { Sheet } from '../reading/sheetReader.ts'
import { MEMBER_DOT, NAME, SETTING_MARK, inClass, regex, src, words, type WordOf } from '../syntax.ts'
import { parseMemberName, parseNumberedName } from './names.ts'

/**
 * Each line's result, by line, for the editor's inline results: the result of
 * each calculation that works one out (not a value typed as it is, nor one that
 * went wrong), from inside blocks too.
 */
export function collectResults(blocks: readonly Block[]): Map<number, LineValue> {
  const out = new Map<number, LineValue>()
  const visit = (b: Block) => {
    if (b.kind === BLOCK_KIND.calc && b.result && !b.error) out.set(b.line, b.result)
    else if (isContainer(b)) b.children.forEach(visit)
  }
  blocks.forEach(visit)
  return out
}

/** Where each function is defined, by name: its `f(…) = …` lines, in order. (For go-to-definition in the editor.) */
export function collectDefinitions(blocks: Block[]): Map<string, number[]> {
  const out = new Map<string, number[]>()
  const put = (name: string, line: number) => out.set(name, [...(out.get(name) ?? []), line])
  const visit = (b: Block) => {
    if (b.kind === BLOCK_KIND.calc) {
      const { target } = lineShape(b.source)
      if (target?.kind === NODE_KIND.functionHead) put(target.name, b.line)
    } else if (isContainer(b)) b.children.forEach(visit)
  }
  blocks.forEach(visit)
  for (const lines of out.values()) lines.sort((a, b) => a - b)
  return out
}

export { SYMBOL_KIND, type SymbolKind }

/** A name the editor can suggest or describe, and where it's visible. */
export interface SheetSymbol {
  name: string
  kind: SymbolKind
  /** Line it's defined on. */
  line: number
  /** Lines it can be used on (a `{ }` block or function body scopes it). */
  from: number
  to: number
  /** What it is, in a sentence and in a word or two, if what defined it says (DefinedName). */
  about?: string
  detail?: string
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
  /**
   * A variable's symbol, with its value's TeX worked out only when it's shown:
   * as its line left it (`at`, CalcResult.assigned), so a hover after it shows
   * its value there; or, for one its line doesn't say, its scope's.
   */
  const variable = (name: string, line: number, from: number, to: number, scope: () => VariableSummary[], members?: number, at?: VariableSummary): SheetSymbol =>
    Object.defineProperties({ name, kind: SYMBOL_KIND.variable, line, from, to, members }, {
      tex: { get: () => at?.tex ?? lookup(scope).get(name)?.tex, enumerable: false },
      texOf: { value: (other: string) => lookup(scope).get(other)?.tex, enumerable: false },
    }) as SheetSymbol
  /** A variable as a line left it, if the line says (CalcResult.assigned). */
  const assignedAt = (b: CalcBlock, name: string) => b.assigned?.find((v) => v.name === name)

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
              if (name) out.push(variable(name, b.line, b.line + 1, to, scope, undefined, assignedAt(b, name)))
            }
            break
          }
          if (target?.kind === NODE_KIND.functionHead) {
            out.push({
              name: target.name, kind: SYMBOL_KIND.function, line: b.line, from: b.line, to,
              tex: b.tex.split(' = ')[0], params: (target.entries ?? []).filter(Boolean).join(', '),
            })
            const parameterName = regex(src`^(${NAME})(?=$|[${inClass(SETTING_MARK)}\s])`)
            for (const entry of target.entries ?? []) {
              const name = parameterName.exec(entry)?.[1]
              if (name) out.push({ name, kind: SYMBOL_KIND.parameter, line: b.line, from: b.line, to: b.line })
            }
            break
          }
          // A line that says what it defines (a series, a selection, a named plot, a reaction): those, t_1, a.x_1,
          // p.slope; and the name it assigns, so it can be gone to and renamed (seriesSymbol, namespaceSymbol).
          if (b.defines) {
            for (const d of b.defines ?? []) out.push(variable(d.name, b.line, b.line + 1, to, scope, d.members))
            if (target?.kind === NODE_KIND.assigned && !b.defines.some((d) => d.name === target.name)) {
              const namespace = b.defines.every((d) => parseMemberName(d.name)?.namespace === target.name)
              out.push(namespace
                ? namespaceSymbol(target.name, b.line, to, b.defines)
                : seriesSymbol(target.name, b.line, to, b.defines, (name) => lookup(scope).get(name)?.tex))
            }
            break
          }
          if (target?.kind === NODE_KIND.assigned) {
            // (Its value as the line left it, `F = 19.6 N`; or, if the line doesn't say, the line's equation.)
            const at = assignedAt(b, target.name)
            out.push(Object.defineProperties(
              { name: target.name, kind: SYMBOL_KIND.variable, line: b.line, from: b.line + 1, to, members: undefined },
              { tex: { get: () => at?.tex ?? b.tex, enumerable: false } },
            ) as SheetSymbol)
          }
          break
        }
        case BLOCK_KIND.card:
        case BLOCK_KIND.custom:
          // What a card (or a module's block) defines is usable anywhere in the sheet: `@g`, a species' `{dietzeite}`.
          for (const d of b.defines ?? []) out.push({ ...d, from: 1, to: lines.length })
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

/** What a line that defines names says it defines (a series' members, a namespace's). */
type Defined = readonly { name: string; members?: number }[]

/**
 * A series' own name, `t` of `t = […]`, for going to and renaming: its
 * hover is how many values it has and its first and last (`texOf`: a member's
 * value), not the whole line, which can be long.
 */
function seriesSymbol(name: string, line: number, to: number, defines: Defined, texOf: (name: string) => string | undefined): SheetSymbol {
  const count = defines.reduce((n, d) => n + (d.members ?? 1), 0)
  const [first, last] = [defines[0]?.name, defines.at(-1)?.name]
  return Object.defineProperties(
    { name, kind: SYMBOL_KIND.variable, line, from: line + 1, to, about: `A series of ${count} value${count === 1 ? '' : 's'}` },
    {
      tex: {
        get: () => [first, last === first ? undefined : last].map((m) => m && texOf(m)).filter(Boolean).join(SERIES_ENDS_TEX) || undefined,
        enumerable: false,
      },
    },
  ) as SheetSymbol
}

/** Between a series' first and last values, in its hover. */
const SERIES_ENDS_TEX = String.raw`,\;\ldots,\;`

/** A namespace, `p` of `p = @plot(…)`, for going to and renaming: its hover names its members (a series among them once). */
function namespaceSymbol(name: string, line: number, to: number, defines: Defined): SheetSymbol {
  const members = new Set(defines.map((d) => {
    const member = parseMemberName(d.name)!.member
    return parseNumberedName(member)?.base ?? member
  }))
  const about = `Its members: ${[...members].map((m) => `${name}${MEMBER_DOT}${m}`).join(', ')}`
  return { name, kind: SYMBOL_KIND.namespace, line, from: line + 1, to, about }
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
export const DIAGNOSTIC_KIND = words({ error: 'error', warning: 'warning' })
export type DiagnosticKind = WordOf<typeof DIAGNOSTIC_KIND>

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
      case BLOCK_KIND.custom:
        put(b.line, DIAGNOSTIC_KIND.warning, b.warning)
        put(b.line, DIAGNOSTIC_KIND.error, b.error)
        break
      case BLOCK_KIND.import:
      case BLOCK_KIND.heading:
      case BLOCK_KIND.text:
      case BLOCK_KIND.latex:
        put(b.line, DIAGNOSTIC_KIND.error, b.error)
        break
      case BLOCK_KIND.card:
        put(b.line, DIAGNOSTIC_KIND.error, b.error)
        for (const e of b.entries) {
          put(e.line, DIAGNOSTIC_KIND.warning, e.warning)
          put(e.line, DIAGNOSTIC_KIND.error, e.error)
        }
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

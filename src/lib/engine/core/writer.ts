/**
 * An expression as mathjs reads it, written from its parts: the tree's tokens
 * and nodes (tree/lexer.ts), so what a line says is read once, by rules, and
 * the engine writes from what was read rather than searching the text again.
 *
 * Each kind of part has a writer. The core's: a quantity as its value times its
 * unit, `9.81 m/s^2` → `(9.81 * unit("m/s^2"))` (a unit written after a number
 * is always a unit, even where a variable has its name); a unit after `to` as a
 * unit; a number not written as its plain value kept as typed, `lit("2.0")`. A
 * module writes its own kinds (EngineModule.writers: a vector, a species), and
 * can make an exception to the core's (a quantity of a species), tried first.
 * A part no one writes is written as it's typed; a node, as its parts.
 */
import { CALL, KEYWORD, SIGIL } from '../../syntax.ts'
import { FN } from '../../mathjsNames.ts'
import { lexExpression } from '../../tree/lexer.ts'
import { textOf } from '../../tree/codec.ts'
import { NODE_KIND, TOKEN_KIND, isToken, type Part } from '../../tree/nodes.ts'
import { MORE_TERMS, readUnit } from './literals.ts'
import { bareTupleHints, moduleWriters } from './module.ts'
import { bareTuple } from './tuples.ts'

/** What's noticed while writing: units that are also variables' names, followed by more terms (`1/2 m v^2`: m is metres). */
export interface WriteNotes {
  readonly isVariable: (id: string) => boolean
  readonly shadowed: Set<string>
}

/** Where a part is being written: the parts around it, and what's written of those before it. */
export interface WriteAt {
  readonly part: Part
  /** The parts being written (the expression's, or a node's), and which one this is. */
  readonly parts: readonly Part[]
  readonly index: number
  /** What each part before it was written as ('' for one an earlier part took). */
  readonly written: readonly string[]
  /** Write other parts (a node's) as an expression. */
  readonly write: (parts: readonly Part[]) => string
  readonly notes: WriteNotes
}

/** A part as written; `from`: the first part before it that it's written in place of (a species takes what it follows). */
export interface Written {
  readonly text: string
  readonly from?: number
}

/** How a kind of part is written, if this writer writes it (undefined leaves it to the next). */
export type PartWriter = (at: WriteAt) => Written | undefined

// ---------------------------------------------------------------------------
// For writers (a module's too)
// ---------------------------------------------------------------------------

/** The kind of a part: a token's, or a node's. */
export const kindOf = (part: Part) => (isToken(part) ? part.t : part.kind)

/** The index of the last part before `index` that isn't a space (-1 if none). */
export function partBefore(parts: readonly Part[], index: number): number {
  for (let i = index - 1; i >= 0; i--) {
    const p = parts[i]
    if (!(isToken(p) && p.t === TOKEN_KIND.space)) return i
  }
  return -1
}

/** Whether a part is a token of this kind (with this text, if given). */
export const isTokenOf = (part: Part | undefined, t: string, text?: string) =>
  !!part && isToken(part) && part.t === t && (text === undefined || part.text === text)

/** A unit, as typed, as mathjs reads it: `µm/s^(2)` → `um/s^2`. */
export const unitSource = (typed: string) => readUnit(typed, 0)?.text ?? typed

/** A value with a unit, as mathjs reads it: `(9.81 * unit("m/s^2"))`. */
export const quantitySource = (value: string, unit: string) => `(${value} * ${FN.unit}("${unit}"))`

/** A unit on its own (after `to`), as mathjs reads it: `unit("km/h")`. */
export const unitCallSource = (unit: string) => `${FN.unit}("${unit}")`

/** Whether the unit at `index` is a conversion's, after `to`. */
export const isConversionUnit = (parts: readonly Part[], index: number) =>
  isTokenOf(parts[partBefore(parts, index)], TOKEN_KIND.keyword, KEYWORD.to)

// ---------------------------------------------------------------------------
// The core's writers
// ---------------------------------------------------------------------------

const CORE_WRITERS: Readonly<Record<string, PartWriter>> = {
  /** `2.0` → `lit("2.0")` (kept as typed: its significant figures), `2` → `2`. */
  [TOKEN_KIND.number]: ({ part }) => {
    const typed = textOf(part)
    return { text: String(Number(typed)) === typed ? typed : `${FN.literal}("${typed}")` }
  },
  /** `9.81 m/s^2` → `(9.81 * unit("m/s^2"))`. */
  [NODE_KIND.quantity]: ({ part, parts, index, write, notes }) => {
    if (isToken(part)) return undefined
    const unit = part.parts.find((p) => isTokenOf(p, TOKEN_KIND.unit))!
    const source = unitSource(textOf(unit))
    // (`5 m v` reads m as metres: worth a word, if m is a variable too.)
    const rest = parts.slice(index + 1).map(textOf).join('')
    if (SINGLE_UNIT.test(source) && notes.isVariable(source) && MORE_TERMS.test(rest)) notes.shadowed.add(source)
    return { text: quantitySource(write([part.parts[0]]), source) }
  },
  /** `to km/h` → `to unit("km/h")`. */
  [TOKEN_KIND.unit]: ({ part, parts, index }) =>
    (isConversionUnit(parts, index) ? { text: unitCallSource(unitSource(textOf(part))) } : undefined),
}

/** A unit that's one word, which could be a variable's name. */
const SINGLE_UNIT = /^[A-Za-z]+$/

/** Parts as mathjs reads them, each by its kind's writers: a module's, then the core's, else as typed. */
export function writeParts(parts: readonly Part[], notes: WriteNotes): string {
  const written: string[] = []
  const write = (inner: readonly Part[]) => writeParts(inner, notes)
  parts.forEach((part, index) => {
    const kind = kindOf(part)
    const at: WriteAt = { part, parts, index, written, write, notes }
    let done: Written | undefined
    for (const writer of moduleWriters(kind)) if ((done = writer(at))) break
    done ??= CORE_WRITERS[kind]?.(at) ?? { text: isToken(part) ? part.text : write(part.parts) }
    if (done.from !== undefined) written.fill('', done.from, index)
    written[index] = done.text
  })
  return written.join('')
}

/**
 * An expression's text as mathjs reads it, read into parts (lexer.ts) and
 * written by their kinds' writers; and the units in it that are also variables'
 * names, followed by more terms (`1/2 m v^2`: m is read as metres).
 */
export function preprocess(src: string, isVariable: (id: string) => boolean): { text: string; shadowed: string[] } {
  const bare = bareTuple(src)
  if (bare) {
    // (A module may have a way to write it: a vector, <a, b>.)
    const hints = bareTupleHints(bare)
    const written = `${SIGIL}${CALL.tuple}${bare}`
    const tuple = hints.length ? `for other coordinates, ${written}` : `write ${written}`
    throw new Error(`A bracketed list with commas, ${bare}, isn't a value: ${[...hints, tuple].join('; ')}.`)
  }
  const notes: WriteNotes = { isVariable, shadowed: new Set() }
  return { text: writeParts(lexExpression(src), notes), shadowed: [...notes.shadowed] }
}


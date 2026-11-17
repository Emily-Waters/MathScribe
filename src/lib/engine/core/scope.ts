/** Scopes: the variables visible on a line, as the engine and mathjs see them. */
import { EXACT } from '../../maths/sigfigs.ts'
import { Variable } from '../../sheet/values.ts'
import { GREEK_CHARS, SUBSCRIPT } from '../../syntax.ts'
import { JOIN, parseMemberName, parseNumberedName, seriesMemberName } from '../../sheet/names.ts'

// ---------------------------------------------------------------------------
// Evaluation
// ---------------------------------------------------------------------------

/**
 * Lexical scope: lookups fall through to the enclosing scope, assignments are
 * always local. Assigning a name that exists outside shadows it until the block
 * ends, as with `let` in a nested block. Extends Map so mathjs accepts it as a
 * scope, and functions defined with `f(x) = ...` close over the scope they were
 * defined in.
 *
 * A numbered name answers to either spelling: when `t1` isn't defined, `t1`
 * finds `t_1`, and the other way round. So a series typed `t1, t2, …` and an
 * imported column (`t_1, t_2, …`) are written the same way. A name defined in
 * both spellings keeps each.
 */
export class Scope<T = unknown> extends Map<string, T> {
  readonly parent: Scope<T> | undefined
  /** Selections' series, looked up rather than copied (shared by every scope of a Calculator). */
  readonly views: Views | undefined

  constructor(parent?: Scope<T>, views?: Views) {
    super()
    this.parent = parent
    this.views = views ?? parent?.views
  }

  get(key: string): T | undefined {
    return this.getExactly(this.spelling(key))
  }

  has(key: string): boolean {
    return this.hasExactly(this.spelling(key))
  }

  /**
   * The name as defined: `key` itself, or its other spelling (t1 ↔ t_1) if only
   * that is; or, for a selection's member (a.x_3), the variable it is.
   */
  private spelling(key: string): string {
    if (this.hasExactly(key)) return key
    const other = otherSpelling(key)
    if (other !== undefined && this.hasExactly(other)) return other
    const target = this.views?.resolve(key)
    return target !== undefined ? this.spelling(target) : key
  }

  private getExactly(key: string): T | undefined {
    return super.has(key) ? super.get(key) : this.parent?.getExactly(key)
  }

  private hasExactly(key: string): boolean {
    return super.has(key) || (this.parent?.hasExactly(key) ?? false)
  }

  // -------------------------------------------------------------------------
  // Series index: each series' members at this level (t → t_1, t2, …), so
  // finding a series doesn't mean going through every name (imported data can
  // make tens of thousands). Made when first asked for, then kept up to date.
  // -------------------------------------------------------------------------

  private series: Map<string, Set<string>> | undefined

  /** Series `base`'s members defined at this level (not its parents'). */
  membersHere(base: string): ReadonlySet<string> | undefined {
    if (!this.series) {
      this.series = new Map()
      for (const name of super.keys()) this.indexName(name)
    }
    return this.series.get(base)
  }

  set(key: string, value: T): this {
    if (this.series && !super.has(key)) this.indexName(key)
    return super.set(key, value)
  }

  delete(key: string): boolean {
    const had = super.delete(key)
    if (had && this.series) {
      const numbered = parseNumberedName(key)
      if (numbered) this.series.get(numbered.base)?.delete(key)
    }
    return had
  }

  private indexName(name: string): void {
    const numbered = parseNumberedName(name)
    if (!numbered) return
    let members = this.series!.get(numbered.base)
    if (!members) this.series!.set(numbered.base, members = new Set())
    members.add(name)
  }
}

/**
 * The series of selections and named plots (`a = @select(t, x; …)`), as lookups:
 * a.x is the list of variables it picks, [x_2, x_5, …], so a.x_1 is x_2 itself,
 * with its sig figs and uncertainty, and nothing is copied (a selection of
 * thousands of rows is redone on every edit). Scoped by `{ }` blocks, as
 * variables are.
 */
export class Views {
  private readonly levels: Map<string, (string | undefined)[]>[] = [new Map()]

  push(): void {
    this.levels.push(new Map())
  }

  pop(): void {
    if (this.levels.length > 1) this.levels.pop()
  }

  /** Make series `base` (a__x) the variables `names` picks, numbered from 1 (a gap: no member there). */
  set(base: string, names: (string | undefined)[]): void {
    this.levels.at(-1)!.set(base, names)
  }

  /** Each member of the series set at this level, and the variable it is: a__x_1 → x_2, …. */
  *membersHere(): Generator<[member: string, variable: string]> {
    for (const [base, names] of this.levels.at(-1)!) {
      for (const [i, name] of names.entries()) if (name) yield [seriesMemberName(base, i + 1), name]
    }
  }

  /** Forget the series under namespace `ns` set at this level (a selection being redone). */
  clear(ns: string): void {
    const level = this.levels.at(-1)!
    for (const base of [...level.keys()]) if (parseMemberName(base)?.namespace === ns) level.delete(base)
  }

  /** The variables series `base` picks, if it's a selection's. */
  get(base: string): (string | undefined)[] | undefined {
    for (let i = this.levels.length - 1; i >= 0; i--) {
      const names = this.levels[i].get(base)
      if (names) return names
    }
    return undefined
  }

  /** The variable a selection's member is: a__x_3 → x_7 (undefined if it isn't one). */
  resolve(key: string): string | undefined {
    if (!key.includes(JOIN) || this.levels.every((l) => !l.size)) return undefined
    const m = parseNumberedName(key)
    return m ? this.get(m.base)?.[m.n - 1] : undefined
  }
}

/** A numbered name written without an underscore, `t1`, `ω2` (1: the letters, 2: the number). */
export const NUMBERED = new RegExp(String.raw`^([A-Za-z${GREEK_CHARS}]+)(\d+)$`)
/** …and with one, `t_1` (1: the letters, 2: the number). */
export const NUMBERED_SUBSCRIPT = new RegExp(String.raw`^([A-Za-z${GREEK_CHARS}]+)_(\d+)$`)

/** A numbered name's other spelling: t1 → t_1, t_1 → t1 (undefined for other names). */
export function otherSpelling(name: string): string | undefined {
  // Inside a namespace too: a.t1 ↔ a.t_1. (Split at the join directly: this runs
  // for every name looked up, so it skips parseMemberName's checks.)
  const join = name.indexOf(JOIN)
  if (join > 0) {
    const other = otherSpelling(name.slice(join + JOIN.length))
    return other === undefined ? undefined : name.slice(0, join + JOIN.length) + other
  }
  const plain = NUMBERED.exec(name)
  if (plain) return `${plain[1]}${SUBSCRIPT}${plain[2]}`
  const sub = NUMBERED_SUBSCRIPT.exec(name)
  return sub ? `${sub[1]}${sub[2]}` : undefined
}

/**
 * The sheet's variables, each with everything kept about it (a Variable, values.ts),
 * by name: one scope per `{ }` block or function call, looking outward.
 */
export type Variables = Scope<Variable>

/**
 * Variables as mathjs evaluates with them: just their values. Setting one
 * (a function's parameter, a nudged input while propagating uncertainty) makes
 * a plain, exact variable in the scope it views.
 */
export class Values {
  readonly vars: Variables

  constructor(vars: Variables) {
    this.vars = vars
  }

  get(key: string): unknown {
    return this.vars.get(key)?.value
  }

  has(key: string): boolean {
    return this.vars.has(key)
  }

  set(key: string, value: unknown): this {
    this.vars.set(key, new Variable({ value, sf: EXACT }))
    return this
  }

  delete(key: string): boolean {
    return this.vars.delete(key)
  }

  /** This scope's own names (not the scopes around it). */
  keys(): IterableIterator<string> {
    return this.vars.keys()
  }
}

/** A new scope inside `vars`, as mathjs sees it: what's set in it stays there. */
export const innerValues = (vars: Variables) => new Values(new Scope(vars))

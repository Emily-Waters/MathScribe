/** Scopes: the variables visible on a line, as the engine and mathjs see them. */
import { EXACT } from '../../maths/sigfigs.ts'
import { Variable } from '../../sheet/values.ts'
import { JOIN, mayBeSlice, parseMemberName, parseNumberedName, parseSliceName, seriesMemberName, sliceOf } from '../../sheet/names.ts'

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
 * Every name is itself: t1, t_1 and t[1] (a series' member, t__1) are three.
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

  /** The name as defined: `key` itself; or, for a lookup's member (p.x[3], m[2:4][1]), the variable it is. */
  private spelling(key: string): string {
    if (this.hasExactly(key)) return key
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
  // Series index: each series' members at this level (t → t__1, t__2, …), so
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
 * The series of named plots (`p = @plot(t, x; …)`) and conditions (`x[t > 0.2 s]`), and of
 * series made from another (`z = m[2:4]`), as lookups: a.x is the list of
 * variables it picks, [x__2, x__5, …], so p.x[1] is x[2] itself, with its sig
 * figs and uncertainty, and nothing is copied (a lookup of thousands of rows
 * is redone on every edit). Scoped by `{ }` blocks, as variables are. A slice,
 * `m[2:4]` (m__slice_f2_t4), is one too, worked out when it's asked for from
 * its series' members as they are then (`rowsOf`).
 */
export class Views {
  private readonly levels: Map<string, (string | undefined)[]>[] = [new Map()]
  /** A series' members by number, for slices of it (the Calculator's: its aggregates' rows). */
  private readonly rowsOf: (base: string) => ReadonlyMap<number, string>

  constructor(rowsOf: (base: string) => ReadonlyMap<number, string> = () => new Map()) {
    this.rowsOf = rowsOf
  }

  push(): void {
    this.levels.push(new Map())
  }

  pop(): void {
    if (this.levels.length > 1) this.levels.pop()
  }

  /** Make series `base` (a__x) the variables `names` picks, numbered from 1 (a gap: no member there); none: forget it. */
  set(base: string, names: (string | undefined)[]): void {
    if (names.length) this.levels.at(-1)!.set(base, names)
    else for (const level of this.levels) level.delete(base)
  }

  /** Each member of the series set at this level, and the variable it is: a__x__1 → x__2, …. */
  *membersHere(): Generator<[member: string, variable: string]> {
    for (const [base, names] of this.levels.at(-1)!) {
      for (const [i, name] of names.entries()) if (name) yield [seriesMemberName(base, i + 1), name]
    }
  }

  /** Forget the series under namespace `ns` set at this level (a named plot being redone). */
  clear(ns: string): void {
    const level = this.levels.at(-1)!
    for (const base of [...level.keys()]) if (parseMemberName(base)?.namespace === ns) level.delete(base)
  }

  /** The variables series `base` picks, if it's a lookup's (a named plot's, a condition's, a slice's). */
  get(base: string): (string | undefined)[] | undefined {
    for (let i = this.levels.length - 1; i >= 0; i--) {
      const names = this.levels[i].get(base)
      if (names) return names
    }
    const slice = mayBeSlice(base) ? parseSliceName(base) : null
    if (!slice) return undefined
    const of = [...this.rowsOf(slice.of)].sort((a, b) => a[0] - b[0])
    return sliceOf(of, slice.spec)
  }

  /** The variable a lookup's member is: a__x_3 → x_7 (undefined if it isn't one). */
  resolve(key: string): string | undefined {
    if (!key.includes(JOIN) || (this.levels.every((l) => !l.size) && !mayBeSlice(key))) return undefined
    const m = parseNumberedName(key)
    return m ? this.get(m.base)?.[m.n - 1] : undefined
  }
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

/**
 * Everything built in under `@`, as one tree: constants, functions, blocks and
 * namespaces, each a member with a name, a description and a place in the tree.
 *
 *   @                     the root
 *   ├─ c, h, e, …         physics constants (constants.ts)
 *   ├─ tuple              values in order, @tuple(1.0, 2.0) m; and unpacked, @tuple(a, b) = …
 *   ├─ import             imported data, @import("run1.csv"), a line of its own
 *   ├─ layout             layout blocks, @layout.list { }, whose members chain: @layout.numbered.val
 *   │  ├─ text, list, …   the layouts
 *   │  └─ hidden, sym, …  the display settings
 *   ├─ constants          the @constants { } block
 *   ├─ latex              the @latex { } block
 *   └─ chem, vector, …    an engine module's own members, added when it's installed
 *                         (EngineModule.builtinMembers: @chem, @vector, @table, @solve)
 *
 * The engine (constants and calls), the sheet (reserved names) and the editor
 * (suggestions and hovers after any dot) all read this tree, so a new member is
 * added once, and each of them knows about it.
 */
import { BUILTIN_CONSTANTS, type BuiltinConstant, type NamespaceConstant } from './constants.ts'
import { INV_FUNCTION, JOIN, TUPLE_FUNCTION } from './names.ts'
import {
  CALL, CONSTANTS_BLOCK, LATEX_BLOCK, LAYOUT_ARRANGEMENT, LAYOUT_MODIFIER, LAYOUT_STYLE, MEMBER_DOT, NAMESPACE, SIGIL,
  type LayoutArrangement, type LayoutModifier, type LayoutStyle,
} from './syntax.ts'

/** Each kind of member of the tree. */
export const MEMBER_KIND = {
  namespace: 'namespace',
  constant: 'constant',
  function: 'function',
  block: 'block',
  layout: 'layout',
  arrangement: 'arrangement',
  modifier: 'modifier',
} as const
export type MemberKind = (typeof MEMBER_KIND)[keyof typeof MEMBER_KIND]

// ---------------------------------------------------------------------------
// Members
// ---------------------------------------------------------------------------

/** What every member has: a name, what it is, and its place in the tree. */
export abstract class Member {
  abstract readonly kind: MemberKind
  /** The namespace it's in (none for the root). */
  parent: Namespace | undefined
  readonly name: string
  readonly description: string

  constructor(name: string, description: string) {
    this.name = name
    this.description = description
  }

  /** Its names from the root down: chem, mm, Na. */
  get path(): string[] {
    return this.parent ? [...this.parent.path, this.name] : []
  }

  /** As it's typed: @chem.mm.Na. */
  get typed(): string {
    return `${SIGIL}${this.path.join(MEMBER_DOT)}`
  }

  /** Its inside name, as the engine holds it: chem__mm__Na. */
  get key(): string {
    return this.path.join(JOIN)
  }

  /** Whether it's only written at the start of a line, where blocks open (a block, or anything in @layout). */
  get atLineStart(): boolean {
    return this.parent?.atLineStart ?? false
  }

  /**
   * If it's a module's own, not typed in a sheet (it, or the namespace it's
   * in): what to write instead, said when it's typed. A module still uses it
   * in what it writes for the engine (a substance's molar mass, from @chem.mm.Na).
   */
  get internal(): string | undefined {
    return this.parent?.internal
  }
}

/** A value: `@c`, `@chem.mm.Na`. */
export class ConstantMember extends Member {
  readonly kind = MEMBER_KIND.constant
  readonly constant: BuiltinConstant | NamespaceConstant

  constructor(name: string, constant: BuiltinConstant | NamespaceConstant) {
    super(name, constant.description)
    this.constant = constant
  }
}

/** What a call to a built-in function stands for, for the engine to work out; or what's wrong with the call. */
export type Expansion = { text: string } | { error: string }

/** A function: `@chem.total(n_Na, n_Cl)`. It's written out as an expression before the line is worked out. */
export abstract class FunctionMember extends Member {
  readonly kind = MEMBER_KIND.function

  /** What goes in its brackets, for its description: `{formula}`. */
  abstract readonly parameters: string

  /** The namespace it's the call of, if it's one (`@chem.mm` is both): its path is the namespace's. */
  callOf: Namespace | undefined

  /**
   * Whether it's a line of its own (or the whole right-hand side), worked out by
   * a module's line form, rather than written out in an expression: `@table(…)`,
   * `x = @solve(…)`. A call to one is left as it is.
   */
  readonly standsAlone: boolean = false

  override get path(): string[] {
    return this.callOf ? this.callOf.path : super.path
  }

  /** The call, as text, written out as what it stands for (its arguments already written out). */
  abstract expand(args: string): Expansion

  /** How it's called, for its description: @chem.mm({formula}). */
  get signature(): string {
    return `${this.typed}(${this.parameters})`
  }
}

/** A block opened `@name {` and closed by `}`: `@constants { }`, `@latex { }`. */
export class BlockMember extends Member {
  readonly kind = MEMBER_KIND.block

  override get atLineStart(): boolean {
    return true
  }
}

/** A layout in @layout: `@layout.list`. */
export class LayoutMember extends Member {
  readonly kind = MEMBER_KIND.layout
  readonly style: LayoutStyle

  constructor(style: LayoutStyle, description: string) {
    super(style, description)
    this.style = style
  }
}

/** How lines are arranged on the page in @layout: `@layout.column`. */
export class ArrangementMember extends Member {
  readonly kind = MEMBER_KIND.arrangement
  readonly arrangement: LayoutArrangement

  constructor(arrangement: LayoutArrangement, description: string) {
    super(arrangement, description)
    this.arrangement = arrangement
  }
}

/** A display setting in @layout: `@layout.val`. */
export class ModifierMember extends Member {
  readonly kind = MEMBER_KIND.modifier
  readonly modifier: LayoutModifier

  constructor(modifier: LayoutModifier, description: string) {
    super(modifier, description)
    this.modifier = modifier
  }
}

/** How a namespace behaves, besides holding its members. */
interface NamespaceOptions {
  /** It can be called too, as a function: `@chem.mm({H2O})` as well as `@chem.mm.Na`. */
  call?: FunctionMember
  /** Its members are only written at the start of a line (they open blocks). */
  atLineStart?: boolean
  /** Its members chain, each after another dot, in any order: `@layout.numbered.val`. */
  chained?: boolean
  /** It's a module's own (see Member.internal): what to write instead, said when it's typed. */
  internal?: string
}

/** A namespace: members under a name, each written after its dot. */
export class Namespace extends Member {
  readonly kind = MEMBER_KIND.namespace
  private readonly byName = new Map<string, Member>()
  readonly call: FunctionMember | undefined
  readonly chained: boolean
  private readonly ownAtLineStart: boolean
  private readonly ownInternal: string | undefined

  constructor(name: string, description: string, members: Member[], options: NamespaceOptions = {}) {
    super(name, description)
    this.chained = options.chained ?? false
    this.ownAtLineStart = options.atLineStart ?? false
    this.ownInternal = options.internal
    for (const m of members) this.add(m)
    // A namespace that's also a function: the function's place is the namespace's.
    this.call = options.call
    if (this.call) this.call.callOf = this
  }

  /** Put a member in the namespace (an engine module's own namespace goes in @ this way). */
  add(member: Member): void {
    if (this.byName.has(member.name)) throw new Error(`${this.typed}${this.parent ? MEMBER_DOT : ''}${member.name} is built in already.`)
    member.parent = this
    this.byName.set(member.name, member)
  }

  override get atLineStart(): boolean {
    return this.ownAtLineStart || super.atLineStart
  }

  override get internal(): string | undefined {
    return this.ownInternal ?? super.internal
  }

  /** Its members, in the order they were given, that a sheet can type (not a module's own: Member.internal). */
  get members(): Member[] {
    return [...this.byName.values()].filter((m) => m.internal === undefined)
  }

  /** A member by its name. */
  member(name: string): Member | undefined {
    return this.byName.get(name)
  }

  /**
   * The member a path of names leads to: chem, mm, Na → @chem.mm.Na. In a
   * chained namespace, the members after the first are its members too
   * (layout, val, multiline → @layout.multiline).
   */
  resolve(path: readonly string[]): Member | undefined {
    if (!path.length) return this
    if (this.chained) return path.every((p) => this.byName.has(p)) ? this.byName.get(path.at(-1)!) : undefined
    const next = this.byName.get(path[0])
    if (!next) return undefined
    if (path.length === 1) return next
    return next instanceof Namespace ? next.resolve(path.slice(1)) : undefined
  }

  /** The functions it holds: its members that are, and the namespaces that can be called. */
  get functions(): FunctionMember[] {
    return this.members.flatMap((m) => (m instanceof FunctionMember ? [m] : m instanceof Namespace && m.call ? [m.call] : []))
  }

  /** Every member under it, at any depth. */
  *walk(): Generator<Member> {
    for (const m of this.byName.values()) {
      yield m
      if (m instanceof Namespace) yield* m.walk()
    }
  }
}

/**
 * A function that's a line of its own (or the whole right-hand side), worked out
 * by a module's line form: `@table(t, x)`, `x = @solve(…)`. Anywhere else in an
 * expression, it's explained.
 */
export class LineFormMember extends FunctionMember {
  override readonly standsAlone = true
  readonly parameters: string
  /** How it's written, for the explanation: `x = @solve(equation, x)`. */
  private readonly usage: string

  constructor(name: string, parameters: string, description: string, usage: string) {
    super(name, description)
    this.parameters = parameters
    this.usage = usage
  }

  expand(): Expansion {
    return { error: `${this.typed}(…) is written on a line of its own: ${this.usage}.` }
  }
}

// ---------------------------------------------------------------------------
// The core's functions
// ---------------------------------------------------------------------------

/** `@tuple(1.0, 2.0) m`: values in order, such as coordinates. (`@tuple(a, b) = …` unpacks one: a line form of the core's.) */
class TupleFunction extends FunctionMember {
  readonly parameters = 'x, y, …'

  constructor() {
    super(CALL.tuple, 'A tuple of values, such as coordinates; @tuple(a, b) = … unpacks one')
  }

  expand(args: string): Expansion {
    return { text: `${TUPLE_FUNCTION}(${args})` }
  }
}

/** `@inv(x)`: 1/x, written as its fraction flipped (m/V as V/m), so a conversion factor reads turned over. */
class InvFunction extends FunctionMember {
  readonly parameters = 'x'

  constructor() {
    super(CALL.inv, 'One over a value, written as its fraction flipped: @inv(m/V) is V/m, @inv(r) is 1/r')
  }

  expand(args: string): Expansion {
    if (!args.trim()) return { error: `${this.typed} needs the value to flip: ${this.typed}(m/V).` }
    return { text: `${INV_FUNCTION}(${args})` }
  }
}

// ---------------------------------------------------------------------------
// @layout's members
// ---------------------------------------------------------------------------

/** What each layout does, `@layout.list Title { … }`. */
const LAYOUT_DESCRIPTIONS: Record<LayoutStyle, string> = {
  text: 'Prose: lines join into paragraphs, nothing is calculated',
  list: 'The lines inside as a bulleted list (indent further for a sub-list)',
  numbered: 'The lines inside as a numbered list (indent further for a sub-list)',
  center: 'The lines inside, centered',
  titlepage: 'A title page of prose: the first line is the title, bold and larger; each line after it centered, then a new page',
}

/** What `@layout.column` does. */
const COLUMN_DESCRIPTION = 'The lines inside side by side in columns: a blank line starts the next, and each block inside is one; '
  + 'column(n) for n a row (2 to 4), or the lines shared out evenly if there are no breaks'

/** What each display setting does, `@layout.val.multiline { … }`. */
const LAYOUT_MODIFIER_DESCRIPTIONS: Record<LayoutModifier, string> = {
  hidden: 'Work the lines inside out, but don’t show them (as #hide)',
  full: 'Show every line inside in full (as #full)',
  sym: 'Show every line inside as its equation only (as #sym)',
  val: 'Show every line inside as its result only (as #val)',
  multiline: 'Each = of every line inside on its own row (as #multiline)',
  sci: 'Results inside in scientific notation (as #sci)',
  dec: 'Results inside in plain decimal digits (as #dec)',
}

// ---------------------------------------------------------------------------
// The tree
// ---------------------------------------------------------------------------

/** `@`: everything built in. */
export const BUILTINS = new Namespace('', 'Built in', [
  ...Object.entries(BUILTIN_CONSTANTS).map(([name, c]) => new ConstantMember(name, c)),
  new TupleFunction(),
  new InvFunction(),
  new LineFormMember(CALL.import, '"file.csv"', 'Import a CSV file: each value becomes a variable, x_1, x_2, …',
    '@import("run1.csv"), or run1 = @import("run1.csv"), with the file’s rows indented under it'),
  new Namespace(NAMESPACE.layout, 'Blocks that arrange lines (text, list, numbered, center, titlepage) or set how they’re shown (hidden, sym, val, multiline, …)', [
    ...Object.values(LAYOUT_STYLE).map((style) => new LayoutMember(style, LAYOUT_DESCRIPTIONS[style])),
    new ArrangementMember(LAYOUT_ARRANGEMENT.column, COLUMN_DESCRIPTION),
    ...Object.values(LAYOUT_MODIFIER).map((modifier) => new ModifierMember(modifier, LAYOUT_MODIFIER_DESCRIPTIONS[modifier])),
  ], { atLineStart: true, chained: true }),
  new BlockMember(CONSTANTS_BLOCK, 'Constants usable anywhere in the sheet as @name'),
  new BlockMember(LATEX_BLOCK, 'Raw LaTeX, displayed but not worked out: the lines up to a } on its own, or @latex { … } on one line'),
])

/** The member at an inside name, chem__mm__Na, or a path of names. */
export const builtinAt = (key: string | readonly string[]): Member | undefined =>
  BUILTINS.resolve(typeof key === 'string' ? key.split(JOIN) : key)

/** A built-in constant by its inside name (`c`, `chem__mm__Na`), or undefined if there's none. */
export const builtinConstant = (key: string): BuiltinConstant | NamespaceConstant | undefined => {
  const member = builtinAt(key)
  return member instanceof ConstantMember ? member.constant : undefined
}

/** Every built-in constant's inside name, the namespaces' too (the modules' included, so asked for when needed). */
export const builtinConstantKeys = (): string[] => [...BUILTINS.walk()].filter((m) => m instanceof ConstantMember).map((m) => m.key)

/** Whether a constant of your own can't have this name: it's at the top of @ and isn't a constant (a namespace, a block). */
export const isReservedConstantName = (name: string): boolean => {
  const member = BUILTINS.member(name)
  return member !== undefined && !(member instanceof ConstantMember)
}

/**
 * The function a call's path names: chem, total → @chem.total; chem, mm →
 * @chem.mm (a namespace that can be called). Or what's wrong: the namespace
 * has no such function (with the ones it has).
 */
export function builtinFunction(path: readonly string[]): FunctionMember | { error: string } {
  const member = builtinAt(path)
  if (member instanceof FunctionMember) return member
  if (member instanceof Namespace && member.call) return member.call
  const parent = builtinAt(path.slice(0, -1))
  const where = parent instanceof Namespace && parent !== BUILTINS ? parent : undefined
  const names = where?.functions.map((f) => f.typed) ?? []
  const known = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names[0]
  return {
    error: where
      ? `${where.typed} has no function ${path.at(-1)}${known ? `; it has ${known}` : ''}.`
      : `${SIGIL}${path.join(MEMBER_DOT)} isn't a built-in function.`,
  }
}

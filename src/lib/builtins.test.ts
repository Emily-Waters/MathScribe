/** The tree of everything built in under `@`: where each member is, what it's called, and what it does. */
import { describe, expect, it } from 'vitest'
import {
  BUILTINS, BUILTIN_CONSTANT_KEYS, BlockMember, ConstantMember, FunctionMember, LayoutMember, MEMBER_KIND, ModifierMember, Namespace,
  RESERVED_CONSTANT_NAMES, builtinAt, builtinConstant, builtinFunction,
} from './builtins.ts'
import { BUILTIN_CONSTANTS } from './constants.ts'
import { ELEMENTS } from './elements.ts'

describe('the tree', () => {
  it('names each member by its path: as typed, and inside', () => {
    const na = builtinAt(['chem', 'mm', 'Na'])!
    expect(na).toBeInstanceOf(ConstantMember)
    expect(na.typed).toBe('@chem.mm.Na')
    expect(na.key).toBe('chem__mm__Na')
    expect(builtinAt('chem__mm__Na')).toBe(na)
    expect(builtinAt(['c'])!.typed).toBe('@c')
  })

  it('holds every physics constant at the top, and every element under @chem.mm', () => {
    for (const name of Object.keys(BUILTIN_CONSTANTS)) expect(builtinConstant(name)).toBe(BUILTIN_CONSTANTS[name])
    for (const symbol of Object.keys(ELEMENTS)) expect(builtinConstant(`chem__mm__${symbol}`)).toHaveProperty('written')
    expect(BUILTIN_CONSTANT_KEYS).toHaveLength(Object.keys(BUILTIN_CONSTANTS).length + Object.keys(ELEMENTS).length)
  })

  it('gives each member its kind', () => {
    expect(builtinAt(['chem'])).toBeInstanceOf(Namespace)
    expect(builtinAt(['chem', 'total'])).toBeInstanceOf(FunctionMember)
    expect(builtinAt(['latex'])).toBeInstanceOf(BlockMember)
    expect(builtinAt(['layout', 'list'])).toBeInstanceOf(LayoutMember)
    expect(builtinAt(['layout', 'val'])?.kind).toBe(MEMBER_KIND.modifier)
    expect(builtinAt(['layout', 'val'])).toBeInstanceOf(ModifierMember)
  })

  it('reads a chained namespace’s members in any order', () => {
    expect(builtinAt(['layout', 'numbered', 'val'])?.name).toBe('val')
    expect(builtinAt(['layout', 'val', 'nope'])).toBeUndefined()
  })

  it('knows what’s only written at the start of a line: blocks, and @layout', () => {
    expect(builtinAt(['latex'])!.atLineStart).toBe(true)
    expect(builtinAt(['layout'])!.atLineStart).toBe(true)
    expect(builtinAt(['layout', 'val'])!.atLineStart).toBe(true)
    expect(builtinAt(['chem'])!.atLineStart).toBe(false)
    expect(builtinAt(['c'])!.atLineStart).toBe(false)
  })

  it('reserves the names at the top that aren’t constants', () => {
    expect([...RESERVED_CONSTANT_NAMES].sort()).toEqual(['chem', 'constants', 'latex', 'layout'])
  })

  it('walks every member, at any depth', () => {
    expect([...BUILTINS.walk()].some((m) => m.typed === '@chem.mm.Og')).toBe(true)
  })
})

describe('built-in functions', () => {
  it('are found by their path, a namespace that can be called too', () => {
    const mm = builtinFunction(['chem', 'mm'])
    expect(mm).toBeInstanceOf(FunctionMember)
    expect((mm as FunctionMember).typed).toBe('@chem.mm')
    expect((mm as FunctionMember).signature).toBe('@chem.mm({formula})')
    expect((builtinFunction(['chem', 'total']) as FunctionMember).typed).toBe('@chem.total')
  })

  it('say which functions a namespace has, when it hasn’t the one asked for', () => {
    expect(builtinFunction(['chem', 'foo'])).toEqual({ error: '@chem has no function foo; it has @chem.mm and @chem.total.' })
    expect(builtinFunction(['nope', 'foo'])).toEqual({ error: '@nope.foo isn\'t a built-in function.' })
  })

  it('write their call out as what it stands for', () => {
    const mm = builtinFunction(['chem', 'mm']) as FunctionMember
    expect(mm.expand('{H2O}')).toEqual({ text: '(2 * @chem.mm.H + @chem.mm.O)' })
    expect(mm.expand('H2O')).toEqual({ error: '@chem.mm takes one formula, in braces: @chem.mm({CuSO4*5H2O}).' })
  })
})

/** A line's shape: what it assigns to, before its `=`, as a node of its kind, and read. */
import { describe, expect, it } from 'vitest'
import { NODE_KIND, isToken } from './nodes.ts'
import { assignedOf, lexLine, lineShape, soleCall } from './shapes.ts'
import { textOf } from './codec.ts'
// (Installs the modules, whose rules the lexer reads by.)
import '../engine/index.ts'

/** The kind of node a line's left side is read as, and its text; undefined if none. */
const targetOf = (text: string) => {
  const target = lexLine(text).find((p) => !isToken(p))
  return target && !isToken(target) && [NODE_KIND.assigned, NODE_KIND.functionHead, NODE_KIND.unpack].includes(target.kind as never)
    ? `${target.kind}:${textOf(target)}`
    : undefined
}

describe('a line’s shape', () => {
  it('reads a name with its settings', () => {
    expect(targetOf('v:3:km/h = d / t')).toBe(`${NODE_KIND.assigned}:v:3:km/h`)
    expect(lineShape('n_Na:"Moles of {Na^+}" = 2.0 mol')).toMatchObject({
      target: { kind: NODE_KIND.assigned, name: 'n_Na', settings: ['"Moles of {Na^+}"'] }, head: 'n_Na:"Moles of {Na^+}" =', value: '2.0 mol',
    })
    expect(lineShape('m_w:massName(H2O) = 2.0 g').target?.settings).toEqual(['massName(H2O)'])
  })

  it('reads a one-line function’s head, with settings for what it gives back', () => {
    expect(lineShape('f(x, y):3:deg = x + y')).toMatchObject({
      target: { kind: NODE_KIND.functionHead, name: 'f', settings: ['3', 'deg'], entries: ['x', 'y'] }, value: 'x + y',
    })
    // (No parameters: one entry, empty.)
    expect(lineShape('h() = 3').target?.entries).toEqual([''])
  })

  it('reads the names a tuple is unpacked into', () => {
    expect(lineShape('@tuple(r:3, theta:deg) = p')).toMatchObject({
      target: { kind: NODE_KIND.unpack, name: '@tuple', entries: ['r:3', 'theta:deg'] }, value: 'p',
    })
  })

  it('leaves a line whose left side is none of these as its tokens', () => {
    for (const text of ['x + 1 = 2', 'delta F =', 'x == 3', 'x::: = 3', 'x:"open = 3', 'x :3 = 2', 'f(g(x)) = 2']) {
      expect(targetOf(text)).toBeUndefined()
    }
  })

  it('reads one name with its settings, alone (an unpacked name)', () => {
    expect(assignedOf('theta:3:deg')).toMatchObject({ name: 'theta', settings: ['3', 'deg'] })
    expect(assignedOf('2x')).toBeUndefined()
  })

  it('reads a value that’s one call', () => {
    expect(soleCall(lineShape('@tuple(x, y) = @solve(x + y = 2, x - y = 0)').valueParts)).toEqual({ callee: '@solve', args: 'x + y = 2, x - y = 0' })
    expect(soleCall(lineShape('x = @solve(x = 2, x) + 1').valueParts)).toBeUndefined()
  })
})

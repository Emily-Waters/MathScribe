/** A sheet as a tree: text → tree → text exactly, through JSON too; its kinds declared; its lines cached. */
import { describe, expect, it } from 'vitest'
import { SAMPLE } from '../sample.ts'
import { REFERENCE } from '../reference.ts'
import { LIBRARY } from '../library.ts'
import {
  NODE_KIND, SCHEMA, TOKEN_KIND, declareNodeKinds, declaredNodeKinds, decode, encode, isSheetTree, schemaId, splitLines,
  textOf, treeProblems, type SheetTree,
} from './index.ts'
import { clearLineCache } from './lines.ts'

/** Text → tree → text, and text → tree → JSON → tree → text. */
const roundTrips = (source: string) => {
  const tree = encode(source)
  expect(decode(tree)).toBe(source)
  expect(decode(JSON.parse(JSON.stringify(tree)) as SheetTree)).toBe(source)
}

/** Sheets as written: the sample, every Reference example and every Library entry. */
const SHEETS: [string, string][] = [
  ['the sample sheet', SAMPLE],
  ...REFERENCE.flatMap((s) => s.examples.map((e, i): [string, string] => [`${s.title} ${i + 1}`, e.source])),
  ...LIBRARY.flatMap((t) => t.entries.map((e): [string, string] => [`${t.title}: ${e.source.slice(0, 30)}`, e.source])),
]

/**
 * Text of every kind, as it is in the repository: the source files and docs.
 * (Any text is a sheet to the tree: one that doesn't read as anything still round-trips.)
 */
const FILES = import.meta.glob<string>(['../../**/*.{ts,tsx,css}', '../../../*.md'], { query: '?raw', import: 'default', eager: true })

/** Characters that tend to break things: every line ending, tabs, braces, `#`, `//`, non-ASCII. */
const TRICKY = ['\n', '\r\n', '\r', '\t', ' ', '  ', '{', '}', '#', '//', '@', 'x', '=', '2.0 m', 'é', 'ψ', '→', '{Na^+}', '<3, 4>', '\u0000', '😀']

/** A small seeded random number generator (mulberry32), so a failing case can be found again. */
function random(seed: number): () => number {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 2 ** 32
  }
}

describe('a sheet as a tree', () => {
  it('gives back every sheet exactly, through JSON too', () => {
    for (const [, source] of SHEETS) roundTrips(source)
  })

  it('gives back any text exactly: every file in the repository', () => {
    const files = Object.values(FILES)
    expect(files.length).toBeGreaterThan(50)
    for (const text of files) roundTrips(text)
  })

  it('keeps every kind of line ending, blank lines, tabs and trailing spaces', () => {
    for (const source of ['', '\n', '\r\n', '\r', '\n\n', 'a', 'a\n', 'a\r\nb\rc\nd', '\tx = 1  \t', '   \n\t\n', '  // a comment  \r\n']) {
      roundTrips(source)
    }
  })

  it('gives back random text exactly', () => {
    const next = random(20261115)
    for (let n = 0; n < 500; n++) {
      const length = Math.floor(next() * 40)
      roundTrips(Array.from({ length }, () => TRICKY[Math.floor(next() * TRICKY.length)]).join(''))
    }
  })

  it('reads a line into its parts', () => {
    const [line, blank, comment] = encode('  m = 2.0 kg  \r\n\t\n// note').body
    expect(line).toEqual({
      kind: NODE_KIND.line,
      parts: [
        { t: TOKEN_KIND.indent, text: '  ' }, { t: TOKEN_KIND.text, text: 'm = 2.0 kg' }, { t: TOKEN_KIND.space, text: '  ' },
        { t: TOKEN_KIND.eol, text: '\r\n' },
      ],
    })
    expect(blank).toEqual({ kind: NODE_KIND.blank, parts: [{ t: TOKEN_KIND.indent, text: '\t' }, { t: TOKEN_KIND.eol, text: '\n' }] })
    expect(comment.kind).toBe(NODE_KIND.comment)
  })

  it('splits text into lines that join back into it', () => {
    expect(splitLines('a\r\nb\n')).toEqual([{ text: 'a', eol: '\r\n' }, { text: 'b', eol: '\n' }, { text: '', eol: '' }])
  })
})

describe('caching', () => {
  it('reads a line once: the same line is the same node, in this tree and the next', () => {
    clearLineCache()
    const before = encode('a = 1\nb = 2\nc = 3')
    // An edit to one line: every other line's node is the one from before.
    const after = encode('a = 1\nb = 20\nc = 3')
    expect(after.body[0]).toBe(before.body[0])
    expect(after.body[1]).not.toBe(before.body[1])
    expect(after.body[2]).toBe(before.body[2])
    // (The same text twice in one sheet is one node.)
    const twice = encode('x\nx\n')
    expect(twice.body[0]).toBe(twice.body[1])
  })

  it('keeps nodes from changing, so sharing them is safe', () => {
    const node = encode('a = 1').body[0]
    expect(Object.isFrozen(node)).toBe(true)
    expect(Object.isFrozen(node.parts)).toBe(true)
    expect(Object.isFrozen(node.parts[0])).toBe(true)
  })

  it('joins a node’s text once, and a node from JSON as often as it’s asked', () => {
    const node = encode('a = 1\n').body[0]
    expect(textOf(node)).toBe('a = 1\n')
    const parsed = JSON.parse(JSON.stringify(node))
    expect(textOf(parsed)).toBe('a = 1\n')
  })
})

describe('the schema', () => {
  it('is versioned, and only a tree in a schema it knows is read', () => {
    expect(encode('x').schema).toBe(schemaId(SCHEMA.version))
    expect(() => decode({ schema: 'mathscribe/999', body: [] })).toThrow(/can't be read/)
    expect(() => decode({ schema: 'other/1', body: [] })).toThrow(/can't be read/)
  })

  it('declares every kind a tree uses, with what it is and whose it is', () => {
    const kinds = new Set(declaredNodeKinds().map((k) => k.kind))
    for (const [, source] of SHEETS) for (const line of encode(source).body) expect(kinds.has(line.kind)).toBe(true)
    expect(declaredNodeKinds().every((k) => k.description && k.owner)).toBe(true)
  })

  it('lets a module declare kinds of its own, but not one that’s someone else’s', () => {
    declareNodeKinds('a test module', { testOnlyNode: 'A node only this test declares' })
    expect(declaredNodeKinds().find((k) => k.kind === 'testOnlyNode')?.owner).toBe('a test module')
    expect(() => declareNodeKinds('another module', { testOnlyNode: 'Again' })).toThrow(/a test module's already/)
    expect(() => declareNodeKinds('another module', { [NODE_KIND.line]: 'Mine' })).toThrow(/core's already/)
  })

  it('checks a tree from elsewhere: its shape, and that its kinds are declared', () => {
    expect(isSheetTree(JSON.parse(JSON.stringify(encode(SAMPLE))))).toBe(true)
    expect(treeProblems({ schema: 'mathscribe/1', body: [{ kind: 'nope', parts: [{ t: TOKEN_KIND.text }] }] })).toEqual([
      'body[0]: "nope" isn\'t a declared kind of node',
      'body[0].parts[0]: a token without its text',
    ])
    expect(treeProblems([])).toEqual(['the tree: not an object'])
  })
})

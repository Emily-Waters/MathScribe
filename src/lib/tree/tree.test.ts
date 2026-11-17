/** A sheet as a tree: text → tree → text exactly, through JSON too; its kinds declared; its lines cached. */
import { describe, expect, it } from 'vitest'
import { SAMPLE } from '../sample.ts'
import { REFERENCE } from '../reference.ts'
import { LIBRARY } from '../library.ts'
import {
  NODE_KIND, SCHEMA, TOKEN_KIND, declareNodeKinds, isBlockKind, declaredNodeKinds, decode, encode, isSheetTree, isToken, schemaId, splitLines,
  textOf, treeProblems, type SheetTree, type SyntaxNode,
} from './index.ts'
import { clearLineCache, notedOf } from './lines.ts'
import { splitNote } from '../syntax.ts'
import { CHEM_NODE } from '../engine/modules/chemistry/grammar.ts'
// (The engine installs its modules as it loads: chemistry's kinds of line are then the tree's.)
import '../engine/index.ts'

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
    // (Every file in the repository takes a while: past 5 s on a slower machine running the whole suite.)
  }, 30_000)

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
      kind: NODE_KIND.calc,
      parts: [
        { t: TOKEN_KIND.indent, text: '  ' },
        // (What it says, as an expression: lexer.test.ts.)
        // (What it assigns to, before its `=`: shapes.ts.)
        { kind: NODE_KIND.assigned, parts: [{ t: TOKEN_KIND.symbol, text: 'm' }] },
        { t: TOKEN_KIND.space, text: ' ' }, { t: TOKEN_KIND.delimiter, text: '=' },
        { t: TOKEN_KIND.space, text: ' ' },
        { kind: NODE_KIND.quantity, parts: [{ t: TOKEN_KIND.number, text: '2.0' }, { t: TOKEN_KIND.space, text: ' ' }, { t: TOKEN_KIND.unit, text: 'kg' }] },
        { t: TOKEN_KIND.space, text: '  ' }, { t: TOKEN_KIND.eol, text: '\r\n' },
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
    const walk = (nodes: readonly SyntaxNode[]): string[] =>
      nodes.flatMap((n) => [n.kind, ...walk(n.parts.filter((p): p is SyntaxNode => !isToken(p)))])
    for (const [, source] of SHEETS) for (const kind of walk(encode(source).body)) expect(kinds.has(kind)).toBe(true)
    expect(declaredNodeKinds().every((k) => k.description && k.owner)).toBe(true)
  })

  it('lets a module declare kinds of its own, but not one that’s someone else’s', () => {
    declareNodeKinds('a test module', { testOnlyNode: 'A node only this test declares' })
    expect(declaredNodeKinds().find((k) => k.kind === 'testOnlyNode')?.owner).toBe('a test module')
    expect(() => declareNodeKinds('another module', { testOnlyNode: 'Again' })).toThrow(/a test module's already/)
    expect(() => declareNodeKinds('another module', { [NODE_KIND.calc]: 'Mine' })).toThrow(/core's already/)
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

/** A tree's shape: each node's kind, indented by depth, its lines' first token's text after it (for the lines). */
function shape(nodes: readonly SyntaxNode[], depth = 0): string[] {
  return nodes.flatMap((n) => {
    const own = `${'  '.repeat(depth)}${n.kind}`
    // (A block's lines; a line's own nodes, its expression's, aren't part of the sheet's shape.)
    const children = isBlockKind(n.kind) ? n.parts.filter((p): p is SyntaxNode => !isToken(p)) : []
    return children.length ? [own, ...shape(children, depth + 1)] : [own]
  })
}

describe('the kinds of line, and the blocks they open', () => {
  it('reads each kind of line in the sheet', () => {
    const source = [
      '# Setup', '> Prose', '@latex { \frac{a}{b} }', 'm = 2.0 kg  #val  # mass', '}', 'r = @tuple(1, 2)',
    ].join('\n')
    expect(shape(encode(source).body)).toEqual([
      NODE_KIND.heading, NODE_KIND.paragraph, NODE_KIND.latex, NODE_KIND.calc, NODE_KIND.blockCloser, NODE_KIND.calc,
    ])
  })

  it('holds a block’s lines in it, blocks inside it too, with its }', () => {
    const source = 'Outer {\n  a = 1\n  # Inner {  #val\n    b = 2\n  }\n}\nc = 3'
    expect(shape(encode(source).body)).toEqual([
      NODE_KIND.block,
      `  ${NODE_KIND.blockOpener}`, `  ${NODE_KIND.calc}`,
      `  ${NODE_KIND.block}`, `    ${NODE_KIND.blockOpener}`, `    ${NODE_KIND.calc}`, `    ${NODE_KIND.blockCloser}`,
      `  ${NODE_KIND.blockCloser}`,
      NODE_KIND.calc,
    ])
  })

  it('reads lines in a block by what the block holds: prose, raw LaTeX, constants', () => {
    const source = [
      '@layout.text Notes {', 'Some prose, x = 1 # not a note', '}',
      '@latex {', '\frac{a}{b}', '}',
      '@constants {', 'rho = 1000 kg/m^3', '}',
      'z = 1',
    ].join('\n')
    expect(shape(encode(source).body)).toEqual([
      NODE_KIND.prose, `  ${NODE_KIND.proseOpener}`, `  ${NODE_KIND.proseLine}`, `  ${NODE_KIND.blockCloser}`,
      NODE_KIND.latexBlock, `  ${NODE_KIND.latexOpener}`, `  ${NODE_KIND.latexLine}`, `  ${NODE_KIND.blockCloser}`,
      NODE_KIND.constants, `  ${NODE_KIND.constantsOpener}`, `  ${NODE_KIND.constantLine}`, `  ${NODE_KIND.blockCloser}`,
      NODE_KIND.calc,
    ])
  })

  it('keeps imported data’s rows as one node, up to the first line not indented under it', () => {
    const tree = encode('@import("run.csv")\n    t (s), x (m)\n    0.1, 0.2\n\nx_avg')
    expect(shape(tree.body)).toEqual([NODE_KIND.import, `  ${NODE_KIND.importLine}`, `  ${NODE_KIND.data}`, NODE_KIND.blank, NODE_KIND.calc])
    const data = (tree.body[0].parts[1] as SyntaxNode).parts
    expect(data).toEqual([{ t: TOKEN_KIND.rows, text: '    t (s), x (m)\n    0.1, 0.2\n' }])
  })

  it('reads a line’s #commands and note as tokens of their own', () => {
    // (A block's title isn't an expression: what it says is one token, before its #commands and note.
    // A command after the note's `#` is one too, as the line's reader takes it: the note is around it.)
    const opener = (encode('Forces {  #val #sci  # the force #sym is shown').body[0].parts[0] as SyntaxNode).parts
    expect(opener.map((p) => (isToken(p) ? `${p.t}:${p.text}` : ''))).toEqual([
      `${TOKEN_KIND.body}:Forces {`, `${TOKEN_KIND.space}:  `, `${TOKEN_KIND.command}:#val`, `${TOKEN_KIND.space}: `,
      `${TOKEN_KIND.command}:#sci`, `${TOKEN_KIND.space}:  `, `${TOKEN_KIND.note}:# the force`, `${TOKEN_KIND.space}: `,
      `${TOKEN_KIND.command}:#sym`, `${TOKEN_KIND.space}: `, `${TOKEN_KIND.note}:is shown`,
    ])
  })

  it('gives a line’s reader its #commands and note as the tree read them, so they aren’t read again', () => {
    const tree = encode('m = 2.0 kg  #val  # mass')
    const line = tree.body[0]
    expect(notedOf(line)).toMatchObject({ body: 'm = 2.0 kg', command: 'val', note: 'mass' })
    // (The same as reading them from the text: the one reader, syntax/commands.ts.)
    const { pieces: _pieces, ...said } = notedOf(line)!
    expect(said).toEqual(splitNote('m = 2.0 kg  #val  # mass'))
  })

  it('reads a block that isn’t closed to the end, and a } with none open as a line', () => {
    expect(shape(encode('Open {\n  a = 1').body)).toEqual([NODE_KIND.block, `  ${NODE_KIND.blockOpener}`, `  ${NODE_KIND.calc}`])
    expect(shape(encode('}\na = 1').body)).toEqual([NODE_KIND.blockCloser, NODE_KIND.calc])
  })

  it('reads a module’s own kinds of line: chemistry’s', () => {
    const source = '@chem.species {\n  dietzeite = {7Ca(IO3)2*8CaCrO4}\n}\n@chem.species edta = {EDTA^4-}\n{2 H2 + O2 -> 2 H2O}'
    expect(shape(encode(source).body)).toEqual([
      CHEM_NODE.species, `  ${CHEM_NODE.speciesOpener}`, `  ${CHEM_NODE.speciesEntry}`, `  ${NODE_KIND.blockCloser}`,
      CHEM_NODE.speciesLine, CHEM_NODE.reaction,
    ])
    expect(declaredNodeKinds().find((k) => k.kind === CHEM_NODE.species)?.owner).toBe('ChemistryModule')
  })
})

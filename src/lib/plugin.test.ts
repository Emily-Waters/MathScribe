/**
 * A module written as someone running MathScribe locally would write one: a
 * class extending EngineModule, using only the module API (plugin.ts), and
 * installed. Nothing else in MathScribe is changed for it.
 */
import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  BLOCK_KIND, CONTENT, ConstantMember, Construct, EngineModule, LINE_CONTEXT, LINE_STAGE, LineStep, NodeReader, SIGIL, latexKit,
  lexExpression, textOf, TOKEN_KIND, isToken,
  type CustomBlock, type LineInProgress, type LineResult, type Member, type ModuleBlockKind, type ModuleGrammar,
  type NodeReader as Reader, type ReadsLines, type SheetReader, type TreeItem,
} from './plugin.ts'
import { Calculator, moduleSettingWords, sheetModules } from './engine/index.ts'
import { evaluateSheet } from './sheet/document.ts'
import { toLatexDocument } from './output/latex.ts'
import { RenderedBlock } from '../components/blocks/index.tsx'
import { DISPLAY_MODE } from './syntax.ts'
import { OPTIONS } from '../test/helpers.ts'

/** Its kind of line, `@mars.orbit Phobos`, and its kind of block. */
const ORBIT = { node: 'marsOrbit', block: 'mars.orbit', opener: `${SIGIL}mars.orbit ` } as const

/** What an orbit block holds: the moon it's of. */
interface Orbit {
  moon: string
}

/** An orbit, written to LaTeX (and to Word as nothing, for brevity). */
class OrbitConstruct extends Construct<CustomBlock> {
  readonly kind = BLOCK_KIND.custom

  latex(b: CustomBlock): string {
    return `\\paragraph{Orbit} ${latexKit.escapeTex((b.data as Orbit).moon)}`
  }

  docx() {
    return []
  }
}

/** An orbit line read into its block. */
class OrbitReader extends NodeReader {
  readonly kinds = [ORBIT.node]

  read({ line }: TreeItem, sheet: SheetReader): void {
    const block: CustomBlock<Orbit> = {
      kind: BLOCK_KIND.custom, type: ORBIT.block, line: line.number, endLine: line.number, data: { moon: line.parts.body.slice(ORBIT.opener.length) },
    }
    sheet.add(block)
  }
}

const ORBIT_KIND: ModuleBlockKind = {
  construct: new OrbitConstruct(),
  view: ({ block }) => createElement('p', { className: 'orbit' }, `Orbit of ${(block.data as Orbit).moon}`),
}

const GRAMMAR: ModuleGrammar = {
  nodeKinds: { [ORBIT.node]: 'An orbit: @mars.orbit Phobos' },
  syntaxes: [{ kind: ORBIT.node, contexts: [LINE_CONTEXT.sheet], content: CONTENT.noted, matches: (_, split) => split().body.startsWith(ORBIT.opener) }],
}

/** A Martian day, as a word in a line: written out before the line is worked out. */
const SOL = { word: 'sol', value: '88775.244 s' } as const

/** A step of a line's pipeline: `sol`, wherever it's a name, as the length of a Martian day. */
class SolStep extends LineStep {
  readonly stage = LINE_STAGE.expand

  run(line: LineInProgress): LineResult | undefined {
    // (The line's tokens, as the lexer reads them: only a name `sol` is one, not `solar` or `"sol"`.)
    line.text = lexExpression(line.text)
      .map((p) => (isToken(p) && p.t === TOKEN_KIND.symbol && p.text === SOL.word ? `(${SOL.value})` : textOf(p)))
      .join('')
    return undefined
  }
}

/** A module of one's own: Mars's surface gravity as `@g_mars`, a setting, and an orbit line with a block of its own. */
class MarsModule extends EngineModule implements ReadsLines {
  override builtinMembers(): Member[] {
    return [new ConstantMember('g_mars', { value: 3.72076, unit: 'm/s^2', tex: 'g_{\\mathrm{Mars}}', description: 'surface gravity on Mars' })]
  }

  override readonly lineSettings = { mars: 'shown as on Mars (an example)' }

  override readonly lineSteps = [new SolStep()]

  override grammar(): ModuleGrammar {
    return GRAMMAR
  }

  lineReaders(): Reader[] {
    return [new OrbitReader()]
  }

  override blockKinds(): Readonly<Record<string, ModuleBlockKind>> {
    return { [ORBIT.block]: ORBIT_KIND }
  }
}

describe('a module of one’s own', () => {
  const modules = () => [...sheetModules(), new MarsModule()]

  it('adds what it says, through the hooks alone', () => {
    const line = new Calculator(OPTIONS, modules()).evaluate('w = 2.0 kg * @g_mars', DISPLAY_MODE.val)
    expect(line.error).toBeUndefined()
    expect(line.tex).toContain('7.4')
  })

  it('can add a step to a line’s pipeline, which changes the line on its way', () => {
    const line = new Calculator(OPTIONS, modules()).evaluate('t = 2 * sol to h', DISPLAY_MODE.val)
    expect(line.error).toBeUndefined()
    expect(line.tex).toContain('49.3')
  })

  it('is known to the editor too, once installed', () => {
    expect(moduleSettingWords()).toContainEqual({ name: 'mars', description: 'shown as on Mars (an example)' })
  })

  it('can have a kind of block of its own, which it reads, writes to the exports and draws', () => {
    const sheet = evaluateSheet('x = 1\n@mars.orbit Phobos', OPTIONS, modules())
    const orbit = sheet.blocks[1]
    expect(orbit).toMatchObject({ kind: BLOCK_KIND.custom, type: ORBIT.block, data: { moon: 'Phobos' } })
    expect(toLatexDocument(sheet.blocks)).toContain('\\paragraph{Orbit} Phobos')
    expect(renderToStaticMarkup(createElement(RenderedBlock, { block: orbit }))).toBe('<p class="orbit">Orbit of Phobos</p>')
  })
})

/**
 * Formulas as an engine module: `@formula { F = m * a }`, a card of formulas
 * typeset with every name a symbol, never worked out. A sheet states its
 * relations here, rather than in raw LaTeX (`@latex`), and works values out on
 * calculation lines.
 */
import { BlockMember, EngineModule, type Member, type ModuleGrammar, type NodeReader, type PlacedTopic, type ReadsLines } from '../../lib/plugin.ts'
import { FORMULA_GRAMMAR } from './grammar.ts'
import { FORMULA_TOPICS } from './language.ts'
import { FormulaReader } from './readers.ts'
import { FORMULA_BLOCK } from './syntax.ts'

export class FormulaModule extends EngineModule implements ReadsLines {
  /** Its topics of the language tree: what's said about its features, with examples the tests check (language.ts). */
  override languageTopics(): readonly PlacedTopic[] {
    return FORMULA_TOPICS
  }

  /** Its part of a sheet's tree: the `@formula { }` block. */
  override grammar(): ModuleGrammar {
    return FORMULA_GRAMMAR
  }

  /** Its lines of a sheet: the formulas in an `@formula { }` block (see ReadsLines). */
  lineReaders(): NodeReader[] {
    return [new FormulaReader()]
  }

  override builtinMembers(): Member[] {
    return [new BlockMember(FORMULA_BLOCK, 'Formulas, typeset and not worked out, every name a symbol: F = m * a')]
  }
}

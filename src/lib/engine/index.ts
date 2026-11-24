/**
 * The calculation engine: what the rest of MathScribe uses of it. Inside, it's
 * split by concern under core/ (the Calculator, scopes, units, LaTeX, sig-fig
 * and uncertainty helpers); the modules that extend it are in src/modules/,
 * which registers them (registerModules): the app's entry, main.tsx, loads it
 * first, as the tests' setup does. Only what's exported here is its public face.
 */

export { Calculator } from './core/calculator.ts'
export {
  AUTO_PRECISION, UNCERTAINTY_WORKING, unexpectedError,
  type CalcOptions, type UncertaintyWorking, type CalcResult, type DataColumn, type Definition, type LineNotation, type LineValue,
  type ResultBlock, type TraceLine,
} from './core/results.ts'
export { describeUnit, isUnitName, unitNames, withMicroPrefix } from './core/literals.ts'
export { preprocess } from './core/writer.ts'
export { numberTex, symbolTex, unitTex } from './core/tex.ts'
export { outsideMaths, wordsTex } from './core/text.ts'
export { bareTuple } from './core/tuples.ts'
export { expandNamespaceCalls } from './core/builtinCalls.ts'
export {
  EngineModule, LineForm, markupText, moduleBlockKind, moduleFigureKind, registerModules, sheetModules, moduleEditorExtensions, moduleLanguageTopics, modulePreamble, moduleSettingWords, moduleSubscriptTex,
  type FigurePicture, type ModuleBlockKind, type ModuleFigureKind, type ModuleHost,
} from './core/module.ts'
// (What the rest of MathScribe may use of a module itself is the module's own `public.ts`:
// modules/series/public.ts. It's imported from there, not through here, so it needn't load the engine.)

import { moduleLanguageTopics } from './core/module.ts'
import { CORE_TOPICS } from '../language/topics.ts'
import { languageTree } from '../language/tree.ts'

/**
 * MathScribe's language as one tree, in order: the core's topics and every
 * installed module's (lib/language/tree.ts), from which the Reference tab, the
 * AI primer and the docs are made, and whose every example the tests check.
 */
export const languageTopics = () => languageTree(CORE_TOPICS, moduleLanguageTopics())

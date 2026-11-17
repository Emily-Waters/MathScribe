/**
 * The calculation engine: what the rest of MathScribe uses of it. Inside, it's
 * split by concern under core/ (the Calculator, scopes, units, LaTeX, sig-fig
 * and uncertainty helpers); the modules that extend it are in src/modules/,
 * which registers them (registerModules): the app's entry, main.tsx, loads it
 * first, as the tests' setup does. Only what's exported here is its public face.
 */

export { Calculator } from './core/calculator.ts'
export {
  AUTO_PRECISION, unexpectedError,
  type CalcOptions, type CalcResult, type DataColumn, type Definition, type LineNotation,
  type TraceLine,
} from './core/results.ts'
export { describeUnit, isUnitName, unitNames, withMicroPrefix } from './core/literals.ts'
export { preprocess } from './core/writer.ts'
export { numberTex, symbolTex, unitTex } from './core/tex.ts'
export { outsideMaths, wordsTex } from './core/text.ts'
export { bareTuple } from './core/tuples.ts'
export { expandNamespaceCalls } from './core/builtinCalls.ts'
export {
  EngineModule, LineForm, markupText, moduleBlockKind, registerModules, sheetModules, moduleEditorExtensions, modulePreamble, moduleSettingWords, moduleSubscriptTex,
  type ModuleBlockKind, type ModuleHost,
} from './core/module.ts'
// (What the rest of MathScribe may use of a module itself is the module's own `public.ts`:
// modules/series/public.ts. It's imported from there, not through here, so it needn't load the engine.)

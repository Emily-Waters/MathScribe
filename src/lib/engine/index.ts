/**
 * The calculation engine: what the rest of MathScribe uses of it. Inside, it's
 * split by concern under core/ (the Calculator, scopes, units, LaTeX, sig-fig
 * and uncertainty helpers), with modules/ extending it (chemistry); only what's
 * exported here is its public face.
 */
import { installModule } from './core/module.ts'
import { ChemistryModule } from './modules/chemistry/module.ts'

export { Calculator } from './core/calculator.ts'
export {
  unexpectedError,
  type CalcOptions, type CalcResult, type DataColumn, type Definition, type FunctionLine, type FunctionResult, type LineNotation,
  type TraceLine,
} from './core/results.ts'
export { describeUnit, isUnitName, preprocess, unitNames, withMicroPrefix } from './core/literals.ts'
export { numberTex, symbolTex, unitTex } from './core/tex.ts'
export { outsideMaths, wordsTex } from './core/text.ts'
export { bareTuple, closesVector, expandVectors } from './core/vectors.ts'
export { expandNamespaceCalls } from './core/builtinCalls.ts'
export { EngineModule, type ModuleHost } from './core/module.ts'
export { ChemistryModule }

// The modules MathScribe has, their shared parts installed now: their units, and their
// `@` members (`@chem`), so the editor knows them before any sheet is worked out.
// (Each Calculator is still given its own instances, for their per-sheet state.)
installModule(new ChemistryModule())

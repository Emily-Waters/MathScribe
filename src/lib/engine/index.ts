/**
 * The calculation engine: what the rest of MathScribe uses of it. Inside, it's
 * split by concern under core/ (the Calculator, scopes, units, LaTeX, sig-fig
 * and uncertainty helpers), with modules/ extending it (chemistry); only what's
 * exported here is its public face.
 */
import { inDependencyOrder, installModule, type EngineModule } from './core/module.ts'
import { ChemistryModule } from './modules/chemistry/module.ts'
import { SeriesModule } from './modules/series/module.ts'
import { SolveModule } from './modules/solve/module.ts'
import { VectorModule } from './modules/vectors/module.ts'

export { Calculator } from './core/calculator.ts'
export {
  AUTO_PRECISION, unexpectedError,
  type CalcOptions, type CalcResult, type DataColumn, type Definition, type FunctionLine, type FunctionResult, type LineNotation,
  type TraceLine,
} from './core/results.ts'
export { describeUnit, isUnitName, preprocess, unitNames, withMicroPrefix } from './core/literals.ts'
export { numberTex, symbolTex, unitTex } from './core/tex.ts'
export { outsideMaths, wordsTex } from './core/text.ts'
export { bareTuple } from './core/tuples.ts'
export { closesVector, expandVectors } from './modules/vectors/literals.ts'
export { expandNamespaceCalls } from './core/builtinCalls.ts'
export { EngineModule, LineForm, markupText, moduleSubscriptTex, type ModuleHost } from './core/module.ts'
export { ChemistryModule, SeriesModule, SolveModule, VectorModule }

/**
 * The modules MathScribe works a sheet out with, made fresh for each sheet (each
 * keeps the sheet's own state, such as its species' names). Adding a module is
 * adding it here.
 */
export const sheetModules = (): EngineModule[] => [new VectorModule(), new ChemistryModule(), new SeriesModule(), new SolveModule()]

// Their shared parts installed now: their units, and their `@` members (`@chem`),
// so the editor knows them before any sheet is worked out.
for (const m of inDependencyOrder(sheetModules())) installModule(m)

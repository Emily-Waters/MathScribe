/**
 * The calculation engine: what the rest of MathScribe uses of it. Inside, it's
 * split by concern under core/ (the Calculator, scopes, units, LaTeX, sig-fig
 * and uncertainty helpers); the modules that extend it are in src/modules/,
 * found and installed from there. Only what's exported here is its public face.
 */
import { inDependencyOrder, installModule, type EngineModule } from './core/module.ts'
import { MODULE_CLASSES } from '../../modules/index.ts'

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
export { EngineModule, LineForm, markupText, modulePreamble, moduleSettingWords, moduleSubscriptTex, type ModuleHost } from './core/module.ts'
// (What the rest of MathScribe may use of a module itself is the module's own `public.ts`:
// modules/series/public.ts. It's imported from there, not through here, so it needn't load the engine.)

/**
 * The modules MathScribe works a sheet out with (every one in src/modules/),
 * made fresh for each sheet: each keeps the sheet's own state, such as its
 * species' names.
 */
export const sheetModules = (): EngineModule[] => [...MODULE_CLASSES.values()].map((Module) => new Module())

// Their shared parts installed now: their units, and their `@` members (`@chem`),
// so the editor knows them before any sheet is worked out.
for (const m of inDependencyOrder(sheetModules())) installModule(m)

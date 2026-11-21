/**
 * The module API: everything a module (a plugin, MathScribe's own included)
 * may use of MathScribe, in one place. A module imports from here, from its
 * own folder, and from the public face (`index.ts`) of a module it `requires`;
 * nothing else (boundaries.test.ts checks).
 *
 * A module is a class extending `EngineModule`, overriding the hooks it needs
 * (each documented where it's declared, in engine/core/module.ts), with a
 * folder of its own under src/modules/ whose `index.ts` exports it as its
 * default. That's all: it's found and installed from there.
 *
 * What's here, by what it's for:
 *   the module itself      EngineModule, LineForm, ModuleHost, ModuleGrammar, …
 *   the sheet's language   syntax (words, names, patterns: syntax/*), the `@` tree (builtins)
 *   the tree               nodes and tokens, lex and text rules, contexts, line shapes
 *   reading a sheet        NodeReader, SheetWideReader, blocks
 *   working lines out      mathjs (math), values, results, sig figs, LaTeX for values and names
 *   its own kinds of block a construct (LaTeX and Word, with the kits `latexKit` and `docxKit`) and a
 *                          view (the Rendered tab, with Tex, Title, BlockMessages, useLineLink)
 *   the editor             CodeMirror extensions (`Extension`)
 */

// The language's settings: a call's settings declared once, each a kind of Setting (lib/language/settings.ts),
// from which they're read, written back, and listed in their error. (First: it needs nothing, and a
// module's settings, which the outputs' files reach through its public face, are declared with it as it loads.)
export {
  ChoiceSetting, FlagSetting, NameSetting, RowsSetting, Setting, SettingsSpec, SwitchSetting, TitleSetting, SETTING_WORD,
  formatRowRange, joinSettings, parseRowRange, parseTitle, settingParts, titleSetting, type KeysOf, type SettingValue,
} from './language/settings.ts'

// The module itself, and what the engine offers it.
export {
  EngineModule, LINE_STAGE, LINE_STAGES, LineForm, LineStep, SETTING_PLACE, registerModules,
  type DerivedVariable, type InstallableModule, type LineInProgress, type LineStage, type ModuleBlockKind, type ModuleClass, type FormLine, type LookSetting, type ModuleGrammar, type ModuleHost, type PreparedLine, type SettingPlace,
  type TupleLook,
} from './engine/core/module.ts'
// (markupText: text with every module's notation in it as inline maths, as a sheet's text and titles have it: `{KCl}` a formula.)
export { markupText } from './engine/core/module.ts'

// The sheet's language: its words and patterns, and what's built in under `@`.
export * from './syntax.ts'
export { BlockMember, ConstantMember, FunctionMember, LineFormMember, Namespace, type Expansion, type Member } from './builtins.ts'
export { isNamespaceConstant, type BuiltinConstant, type NamespaceConstant } from './constants.ts'
export {
  FIT, JOIN, RESERVED_NAMESPACES, builtinFunctionName, memberName, parseMemberName, readableMembers, seriesMemberName, solvedName,
  unpackedColumnName,
} from './sheet/names.ts'

// The tree: nodes and tokens, and the rules a module adds to it.
export { LINE_CONTEXT, NODE_KIND, TOKEN_KIND, isToken, type Part } from './tree/nodes.ts'
export { TOKEN_ROLE } from './tree/registry.ts'
export { BODY_END, CONTENT } from './tree/grammar.ts'
// (opensBracket, closesBracket: whether a delimiter opens or closes a bracket, for following a call's depth over its tokens.)
export { ROUND_BRACKETS, closesBracket, lexExpression, node, opensBracket, token, withUnit, type LexRule } from './tree/lexer.ts'
export type { TextRule } from './tree/lines.ts'
// (encode: a sheet's text as its tree, for a module's part of the editor that finds its lines in it, as the series' ⚙ does;
// sheetStatements: each thing it says, as one line over however many it's written, every token where it is.)
export { encode, textOf } from './tree/codec.ts'
export { sheetStatements, type PlacedToken, type SheetStatement, type Statement } from './tree/statements.ts'
// (SETTING_MARK: the `:` before each of a name's settings, for writing a name with its settings back out; ASSIGN: the `=` that assigns;
// SEPARATOR: the `,` between a call's arguments.)
export { ASSIGN, SEPARATOR, SETTING_MARK, lineShape, soleCall } from './tree/shapes.ts'

// Reading a sheet into blocks.
export { NodeReader, SheetWideReader, bodyLines, type ReadsLines, type TreeItem } from './reading/reader.ts'
export type { SheetReader } from './reading/sheetReader.ts'
export { BLOCK_KIND, CAPTION_KIND, SYMBOL_KIND, type CaptionKind, type CardBlock, type CardEntry, type CustomBlock, type DefinedName } from './sheet/blocks.ts'
export type { Contributions } from './sheet/values.ts'

// Working lines out: mathjs, values, results, and writing them.
export { isTuple, math } from './engine/core/math.ts'
export { BASE_DIMENSION, FN, OP, OP_SYMBOL, UNIT } from './maths/mathjsNames.ts'
export { EXACT } from './maths/sigfigs.ts'
export { POLYNOMIAL_KIND, Solver, contains, countOccurrences, matchingParen, splitArgs, splitEquation } from './maths/solve.ts'
export { isRealValue, magnitudeOf, normalise, sameValue, withMagnitude } from './engine/core/normalise.ts'
export {
  ExplainedError, readableUnitError, seriesDefinitions, type Definition, type LineResult, type TraceLine,
} from './engine/core/results.ts'
export { CONVERSION_TAIL, NAME_IN_LINE } from './engine/core/literals.ts'
export {
  isConversionUnit, isTokenOf, partBefore, preprocess, quantitySource, typedNumbers, unitCallSource, unitSource, type PartWriter,
} from './engine/core/writer.ts'
export { parseTupleName, type TupleName } from './engine/core/declarations.ts'
export { expandDots } from './engine/core/memberAccess.ts'
export { unwrap } from './engine/core/nodes.ts'
export { SIDE, needsBrackets } from './engine/core/products.ts'
export { attachUnit, isLitCall, isUnitCall, numberTex, symbolTex, unitCallText, unitTex } from './engine/core/tex.ts'
// (nestBrackets: an equation's grouping brackets by how deep they go, as every line's are, for LaTeX a module builds itself.)
export { nestBrackets } from './maths/brackets.ts'
export { outsideMaths } from './engine/core/text.ts'
export { linearFit, type LinearFit, type PlotData, type PlotPoint, type PlotSeries } from './output/plot.ts'

// A module's own kinds of block: a construct for the exports, and a view for the Rendered tab.
export { Construct, type DocxOut, type LatexOut } from './output/constructs/construct.ts'
export * as latexKit from './output/latexKit.ts'
export * as docxKit from './output/docxKit.ts'
export { BlockMessages, Tex, Title } from '../components/blocks/shared.tsx'
export { useCaptionNumber, useLineLink } from '../components/blocks/context.ts'

// The editor.
export type { Extension } from '@codemirror/state'
export { fixedPanelPosition, placeFixedPanel, type PanelAnchor, type PanelAlignment } from '../editor/popover.ts'
// (inlineHintsShown: whether the editor shows its faint hints, a line's result after it and the like: a module's hints follow it.)
export { inlineHintsShown } from '../editor/inlineResults.ts'

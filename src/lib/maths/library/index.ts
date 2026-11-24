/**
 * MathScribe's maths library, as the rest of MathScribe sees it: its own names
 * for values and expressions, what each is, and the library's names for what
 * the engine works with. What implements it is the adapter (mathjs.ts), the only
 * file that knows which library it is; nothing else imports that, or the
 * library itself (boundaries.test.ts).
 */
export {
  type AssignExpr, type CallExpr, type CompiledExpr, type ConditionalExpr, type ConstantExpr, type Expr, type FunctionAssignExpr,
  type OperatorExpr, type ParenExpr, type Quantity, type SymbolExpr, type Value, type ValueMatrix,
  isAssign, isCall, isComparisonChain, isConditional, isConstant, isFunctionAssign, isOp, isOperator, isParen, isQuantity,
  isSymbol, isValueMatrix,
  BASE_DIMENSION, COMPARISONS, FN, LIBRARY_IN, MATH_CONSTANT, OP, OP_SYMBOL, UNIT, UNIT_LOOKS, type Op,
  MATHS_ERROR, mathsError, type MathsError,
  // Expressions
  parse, compile, evaluateCompiled, evaluate, evaluateText, findAll, transform, mapParts, copyExpr, exprText, exprTex, symbol, call, operator,
  constant, paren, assign, source, type Scope, type ScopeMap, type ExprPath, type TexOptions,
  // Algebra
  derivative, simplify,
  // Values
  isTuple, quantity, magnitude, baseMagnitude, withBaseMagnitude, convert, unitText, sameDimension, unitParts, type UnitPart, inSI, copyQuantity,
  hasFixedPrefix, fixPrefix, withFixedPrefix, keepUnitsAsGiven, bestPrefix, unitNames, isValuelessUnit, formatValue, type ValueFormat,
  tupleOf, valuesOf, mapValues, add, subtract, multiply, divide, abs, sqrt, isZero, larger, smaller,
  // Adding to it
  libraryFunction, isLibraryFunction, isLibraryName, defineFunctions, defineUnit, type LibraryFunction,
} from './mathjs.ts'

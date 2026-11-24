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
} from './mathjs.ts'

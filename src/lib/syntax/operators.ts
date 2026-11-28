/**
 * What an expression is written with: mathjs's delimiters and named delimiters,
 * as in its parser (mathjs/lib/esm/expression/parse.js), which the lexer reads a
 * calculation by (tree/lexer.ts). A sheet's expressions are mathjs's language,
 * so these are its list as it is, not the sheet's punctuation by name
 * (punctuation.ts names what MathScribe's own code looks for).
 */

/** mathjs's delimiters: operators, brackets, separators. Longest first, as mathjs tries them. */
export const MATHJS_DELIMITERS = [
  '>>>',
  '.*', './', '.^', '^|', '?.', '??', '==', '!=', '<=', '>=', '<<', '>>',
  ',', '.', '(', ')', '[', ']', '{', '}', '"', '\'', ';', '+', '-', '*', '/', '%', '^', '~', '!', '&', '|', '=', ':', '?', '<', '>',
] as const

/** mathjs's conditional: `x > 0 ? x : 0` (its `:` isn't a range's or a setting's). */
export const TERNARY = { condition: '?', otherwise: ':' } as const

/** mathjs's named delimiters: words that are operators (`2 m to cm`, `a mod b`). */
export const MATHJS_NAMED_DELIMITERS = ['mod', 'to', 'in', 'and', 'xor', 'or', 'not'] as const

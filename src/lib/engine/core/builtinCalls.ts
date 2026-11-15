/** Calls to built-in functions (`@chem.mm(…)`), written out as what they stand for. */
import { builtinFunction } from '../../builtins.ts'
import { NAME } from '../../syntax.ts'
import { JOIN, constantKey } from '../../names.ts'
import { matchingParen } from '../../solve.ts'

/**
 * A call to a built-in function in a namespace, `@chem.mm(`, `@chem.total(`,
 * once dots are read or not (1: its path, `chem.mm` or chem__mm).
 */
export const BUILTIN_CALL = new RegExp(String.raw`@(${NAME}(?:\.${NAME})*)\s*\(`, 'g')

/**
 * A line with each call to a built-in function written out as what it stands
 * for (see builtins.ts), for the engine to work out, innermost first:
 *   `@chem.mm({Ca(OH)2})`      → (@chem.mm.Ca + 2 * @chem.mm.O + 2 * @chem.mm.H)
 *   `@chem.total(n_Na, n_Cl)`  → (n_Na + n_Cl), each with its species taken off
 */
export function expandNamespaceCalls(line: string): { text: string; error?: string } {
  BUILTIN_CALL.lastIndex = 0
  let m: RegExpExecArray | null
  // (Only a namespace's members are calls: a name on its own, `@c(`, is left for the constants to explain.)
  while ((m = BUILTIN_CALL.exec(line)) && constantKey(m[1]).split(JOIN).length < 2) { /* not a call: look further */ }
  if (!m) return { text: line }
  const path = constantKey(m[1]).split(JOIN)
  const fn = builtinFunction(path)
  if ('error' in fn) return { text: line, error: fn.error }
  const open = m.index + m[0].length - 1
  const close = matchingParen(line, open)
  if (close < 0) return { text: line, error: `${fn.typed}( is missing its closing ).` }
  const inside = expandNamespaceCalls(line.slice(open + 1, close))
  if (inside.error) return inside
  const call = fn.expand(inside.text)
  if ('error' in call) return { text: line, error: call.error }
  return expandNamespaceCalls(line.slice(0, m.index) + call.text + line.slice(close + 1))
}

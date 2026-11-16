/** Calls to built-in functions (`@tuple(…)`, `@chem.mm(…)`), written out as what they stand for. */
import { FunctionMember, builtinAt, builtinFunction } from '../../builtins.ts'
import { NAME } from '../../syntax.ts'
import { JOIN, constantKey } from '../../names.ts'
import { matchingParen } from '../../solve.ts'

/**
 * A call to a built-in function, `@tuple(`, or one in a namespace, `@chem.mm(`,
 * once dots are read or not (1: its path, `chem.mm` or chem__mm).
 */
export const BUILTIN_CALL = new RegExp(String.raw`@(${NAME}(?:\.${NAME})*)\s*\(`, 'g')

/**
 * A line with each call to a built-in function written out as what it stands
 * for (see builtins.ts), for the engine to work out, innermost first:
 *   `@tuple(1.0, 2.0)`         → the function mathjs makes a tuple with
 *   `@chem.mm({Ca(OH)2})`      → (@chem.mm.Ca + 2 * @chem.mm.O + 2 * @chem.mm.H)
 *   `@chem.total(n_Na, n_Cl)`  → (n_Na + n_Cl), each with its species taken off
 * A call that's a line of its own, `@table(…)`, is left for its line form.
 */
export function expandNamespaceCalls(line: string): { text: string; error?: string } {
  BUILTIN_CALL.lastIndex = 0
  for (let m = BUILTIN_CALL.exec(line); m; m = BUILTIN_CALL.exec(line)) {
    const path = constantKey(m[1]).split(JOIN)
    // (A name on its own that isn't a function, `@c(`, is left for the constants to explain.)
    if (path.length < 2 && !(builtinAt(path) instanceof FunctionMember)) continue
    const fn = builtinFunction(path)
    if ('error' in fn) return { text: line, error: fn.error }
    if (fn.standsAlone) continue
    return expandCall(line, m, fn)
  }
  return { text: line }
}

/** A line with one call to a built-in function written out, and any after it. */
function expandCall(line: string, m: RegExpExecArray, fn: FunctionMember): { text: string; error?: string } {
  const open = m.index + m[0].length - 1
  const close = matchingParen(line, open)
  if (close < 0) return { text: line, error: `${fn.typed}( is missing its closing ).` }
  const inside = expandNamespaceCalls(line.slice(open + 1, close))
  if (inside.error) return inside
  const call = fn.expand(inside.text)
  if ('error' in call) return { text: line, error: call.error }
  return expandNamespaceCalls(line.slice(0, m.index) + call.text + line.slice(close + 1))
}

/**
 * What's wrong with a line that still has a call that's a line of its own
 * (`x = 2 * @table(t)`), once no line form has taken it; undefined if it has none.
 */
export function strayLineFormCall(line: string): string | undefined {
  BUILTIN_CALL.lastIndex = 0
  for (let m = BUILTIN_CALL.exec(line); m; m = BUILTIN_CALL.exec(line)) {
    const fn = builtinAt(constantKey(m[1]).split(JOIN))
    if (fn instanceof FunctionMember && fn.standsAlone) {
      const call = fn.expand('')
      return 'error' in call ? call.error : undefined
    }
  }
  return undefined
}

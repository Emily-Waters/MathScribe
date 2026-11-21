/**
 * Solving as an engine module: one equation for an unknown (`d = @solve(v^2 =
 * 2*a*d, d)`), by rearranging it or numerically from a guess, and a system of
 * them by substitution (`@tuple(x, y) = @solve(eq_1, eq_2)`). Each answer is
 * worked out as any formula is, through the ModuleHost, so units, sig figs and
 * uncertainty carry through.
 */
import { EngineModule, type LineForm, LineFormMember, type Member } from '../../lib/plugin.ts'
import { SOLVE_FUNCTION } from './syntax.ts'
import { SolveForm } from './solve.ts'
import { SolveSystemForm } from './system.ts'
import { SOLVE_TOPICS } from './language.ts'
import type { PlacedTopic } from '../../lib/plugin.ts'

export class SolveModule extends EngineModule {
  /** Its topics of the language tree: what's said about its features, with examples the tests check (language.ts). */
  override languageTopics(): readonly PlacedTopic[] {
    return SOLVE_TOPICS
  }

  override readonly lineForms: readonly LineForm[] = [new SolveSystemForm(), new SolveForm()]

  override builtinMembers(): Member[] {
    return [new LineFormMember(SOLVE_FUNCTION, 'equation, unknown, guess?',
      'Rearrange an equation for the unknown and evaluate it; @tuple(x, y) = @solve(eq, eq) solves a system',
      'x = @solve(equation, x), or @tuple(x, y) = @solve(equation, equation)')]
  }
}

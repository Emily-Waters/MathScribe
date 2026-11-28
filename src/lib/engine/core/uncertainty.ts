/**
 * Uncertainty syntax:
 *
 *   m = 2.0 kg pm 0.1 kg     (pm only: ± is how a result is shown, not written)
 *   m = (2.0 pm 0.1) kg
 *   m = 2.0 kg pm 0.1        uncertainty takes the value's unit
 *   m = 2.0 kg pm 5%         relative uncertainty
 *   delta F / Delta F        the uncertainty of F, rendered δF / ΔF as typed
 *
 * (Each delta F, @c and value a module holds, such as @solve's answer, is in a hidden variable: see names.ts.)
 */
import {
  KEYWORD, LOOSE_NUMBER, LOOSE_SIGNED_NUMBER, NAME, RELATIVE_MARK, ROUND_BRACKETS, SETTING_MARK, UNCERTAINTY_WORDS, inClass, lit, oneOf, regex, src,
} from '../../syntax.ts'
import { isTokenOf, unitPartsAt } from '../../tree/lexer.ts'
import { topLevelAt } from '../../tree/topLevel.ts'
import { TOKEN_KIND } from '../../tree/nodes.ts'

/** A value in text with settings on its name: `V:4 to mL` (1: the name, 2: the settings, 3: the rest). */
export const NAME_THEN_SETTINGS = regex(src`^(${NAME})((?:${SETTING_MARK}[^${inClass(SETTING_MARK)}\s]+)+)(.*)$`)

/** `delta F` (or `Delta F`): F's uncertainty (1: the letter, 2: the name). */
export const DELTA_REF = regex(src`\b(${oneOf(UNCERTAINTY_WORDS)})\s+(${NAME})`, 'g')

/** `(2.0 pm 0.1)`: a bracketed value with its uncertainty (1: value, 2: uncertainty, 3: `%` if relative). */
export const PAREN_PM = regex(
  src`${lit(ROUND_BRACKETS.open)}\s*(${LOOSE_SIGNED_NUMBER})\s*${KEYWORD.pm}\b\s*(${LOOSE_NUMBER})(${lit(RELATIVE_MARK)}?)\s*${lit(ROUND_BRACKETS.close)}`, 'g',
)

/** `(2.0 pm 0.1) kg` → `2.0 kg pm 0.1 kg` (the unit as typed, with what's part of it: `mol {EDTA}`). */
export function expandParenPm(src: string): string {
  let out = ''
  let last = 0
  for (const m of src.matchAll(PAREN_PM)) {
    const after = m.index + m[0].length
    const unit = unitPartsAt(src, after)
    const u = unit ? ` ${src.slice(after, after + unit.length).trim()}` : ''
    out += `${src.slice(last, m.index)}${m[1]}${u} ${KEYWORD.pm} ${m[2]}${m[3] ? RELATIVE_MARK : u}`
    last = after + (unit?.length ?? 0)
  }
  return out + src.slice(last)
}

/** Split `value pm uncertainty` at a top-level pm. */
export function splitPm(text: string): [string, string] | null {
  const at = topLevelAt(text, (part) => isTokenOf(part, TOKEN_KIND.keyword, KEYWORD.pm))
  return at < 0 ? null : [text.slice(0, at).trim(), text.slice(at + KEYWORD.pm.length).trim()]
}

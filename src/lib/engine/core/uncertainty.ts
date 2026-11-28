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
import { KEYWORD, NAME, NAME_CHAR_RE, ROUND_BRACKETS, SETTING_MARK, UNCERTAINTY_WORDS, inClass, lit, regex, src } from '../../syntax.ts'
import { PM_WORD } from './literals.ts'
import { unitPartsAt } from '../../tree/lexer.ts'

/** A value in text with settings on its name: `V:4 to mL` (1: the name, 2: the settings, 3: the rest). */
export const NAME_THEN_SETTINGS = regex(src`^(${NAME})((?:${SETTING_MARK}[^${inClass(SETTING_MARK)}\s]+)+)(.*)$`)

/** `delta F` (or `Delta F`): F's uncertainty (1: the letter, 2: the name). */
export const DELTA_REF = regex(src`\b(${UNCERTAINTY_WORDS.join('|')})\s+(${NAME})`, 'g')

/** `(2.0 pm 0.1)`: a bracketed value with its uncertainty (1: value, 2: uncertainty, 3: `%` if relative). */
export const PAREN_PM = regex(
  src`${lit(ROUND_BRACKETS.open)}\s*([-+]?[\d.]+(?:[eE][+-]?\d+)?)\s*${KEYWORD.pm}\b\s*([\d.]+(?:[eE][+-]?\d+)?)(%?)\s*${lit(ROUND_BRACKETS.close)}`, 'g',
)

/** `(2.0 pm 0.1) kg` → `2.0 kg pm 0.1 kg` (the unit as typed, with what's part of it: `mol {EDTA}`). */
export function expandParenPm(src: string): string {
  let out = ''
  let last = 0
  for (const m of src.matchAll(PAREN_PM)) {
    const after = m.index + m[0].length
    const unit = unitPartsAt(src, after)
    const u = unit ? ` ${src.slice(after, after + unit.length).trim()}` : ''
    out += `${src.slice(last, m.index)}${m[1]}${u} pm ${m[2]}${m[3] ? '%' : u}`
    last = after + (unit?.length ?? 0)
  }
  return out + src.slice(last)
}

/** Split `value pm uncertainty` at a top-level pm. */
export function splitPm(src: string): [string, string] | null {
  let depth = 0
  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (c === '(' || c === '[') depth++
    else if (c === ')' || c === ']') depth--
    if (depth !== 0) continue
    if (PM_WORD.test(src.slice(i)) && (i === 0 || !NAME_CHAR_RE.test(src[i - 1]))) {
      return [src.slice(0, i).trim(), src.slice(i + KEYWORD.pm.length).trim()]
    }
  }
  return null
}

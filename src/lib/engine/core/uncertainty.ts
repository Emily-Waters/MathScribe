/**
 * Uncertainty syntax:
 *
 *   m = 2.0 kg pm 0.1 kg     (also ± or +-)
 *   m = (2.0 pm 0.1) kg
 *   m = 2.0 kg pm 0.1        uncertainty takes the value's unit
 *   m = 2.0 kg pm 5%         relative uncertainty
 *   delta F / Delta F        the uncertainty of F, rendered δF / ΔF as typed
 *
 * (Each delta F, @c and solved unknown is held in a hidden variable: see names.ts.)
 */
import { NAME, KEYWORD, UNCERTAINTY_WORDS } from '../../syntax.ts'
import { readUnit, PM_WORD, NAME_CHAR_RE } from './literals.ts'

/** A value in text with settings on its name: `V:4 to mL` (1: the name, 2: the settings, 3: the rest). */
export const NAME_THEN_SETTINGS = new RegExp(String.raw`^(${NAME})((?::[^:\s]+)+)(.*)$`)

/** `delta F` (or `Delta F`): F's uncertainty (1: the letter, 2: the name). */
export const DELTA_REF = new RegExp(String.raw`\b(${UNCERTAINTY_WORDS.join('|')})\s+(${NAME})`, 'g')

/** `(2.0 pm 0.1)`: a bracketed value with its uncertainty (1: value, 2: uncertainty, 3: `%` if relative). */
export const PAREN_PM = new RegExp(String.raw`\(\s*([-+]?[\d.]+(?:[eE][+-]?\d+)?)\s*(?:${KEYWORD.pm}\b|±|\+-)\s*([\d.]+(?:[eE][+-]?\d+)?)(%?)\s*\)`, 'g')

/** `(2.0 pm 0.1) kg` → `2.0 kg pm 0.1 kg` */
export function expandParenPm(src: string): string {
  let out = ''
  let last = 0
  for (const m of src.matchAll(PAREN_PM)) {
    const unit = readUnit(src, m.index + m[0].length)
    const u = unit ? ` ${unit.text}` : ''
    out += `${src.slice(last, m.index)}${m[1]}${u} pm ${m[2]}${m[3] ? '%' : u}`
    last = unit ? unit.end : m.index + m[0].length
  }
  return out + src.slice(last)
}

/** Split `value pm uncertainty` at a top-level pm / ± / +-. */
export function splitPm(src: string): [string, string] | null {
  let depth = 0
  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (c === '(' || c === '[') depth++
    else if (c === ')' || c === ']') depth--
    if (depth !== 0) continue
    let len = 0
    if (c === '±') len = 1
    else if (c === '+' && src[i + 1] === '-') len = 2
    else if (c === 'p' && PM_WORD.test(src.slice(i)) && (i === 0 || !NAME_CHAR_RE.test(src[i - 1]))) len = 2
    if (len) return [src.slice(0, i).trim(), src.slice(i + len).trim()]
  }
  return null
}

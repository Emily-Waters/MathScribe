/** Unit literals (`9.81 m/s^2` as a number times a unit) and numbers kept as typed. */
import { NAME, NAME_CHAR, KEYWORD } from '../../syntax.ts'
import { MATHJS_IN } from '../../mathjsNames.ts'
import { math } from './math.ts'
import { DERIVED_UNITS } from './normalise.ts'
import { MESSAGE_DIGITS } from './numbers.ts'

/** mathjs's built-in constants. Series sums never take these names. */
export const BUILTIN_CONSTANT_NAMES = new Set([
  'pi', 'PI', 'e', 'E', 'tau', 'phi', 'i', 'Infinity', 'NaN',
  'LN2', 'LN10', 'LOG2E', 'LOG10E', 'SQRT1_2', 'SQRT2', 'true', 'false', 'null',
])

// ---------------------------------------------------------------------------
// Unit literals
//
// mathjs resolves a symbol from the scope before treating it as a unit, so after
// `m = 2 kg`, the text `9.81 m/s^2` would multiply by the mass. To keep plain
// text natural, a unit written directly after a number is always a unit:
// `9.81 m/s^2` is written `(9.81 * unit("m/s^2"))` for mathjs (writer.ts).
// A compound unit has no spaces (`kg*m/s^2`); a space ends it, so `5 kg * m`
// multiplies by a variable m.
// ---------------------------------------------------------------------------

/** Single-letter units that are far more often meant as variables. */
export const UNIT_DENYLIST = new Set(['b', 'B'])

/**
 * The micro prefix as typed: the micro sign µ, or the Greek μ often typed for
 * it, before a unit's name. mathjs writes micro as u, so `3.0 µm` is 3.0 um.
 */
export const MICRO_SIGN = /^[µμ](?=[A-Za-z])/
/** A unit's name with a typed micro sign written as mathjs's u: `µm` → um. */
export const withMicroPrefix = (id: string) => id.replace(MICRO_SIGN, 'u')

/** Whether a word is a unit (used after a number, or after `to`). µ counts as the micro prefix. */
export function isUnitName(id: string): boolean {
  id = withMicroPrefix(id)
  if (UNIT_DENYLIST.has(id)) return false
  try {
    return math.Unit.isValuelessUnit(id)
  } catch {
    return false
  }
}

/** Prefixed units people type often (mathjs lists units without their prefixes). */
export const COMMON_PREFIXED = [
  'km', 'cm', 'mm', 'um', 'nm', 'pm', 'kg', 'mg', 'ug', 'mL', 'kJ', 'MJ', 'kPa', 'MPa', 'kN',
  'kHz', 'MHz', 'GHz', 'mA', 'kV', 'mV', 'kW', 'MW', 'ms', 'us', 'ns', 'kmol', 'mmol', 'keV', 'MeV',
]

/** Unit names for completions: mathjs's units plus common prefixed ones. */
export function unitNames(): string[] {
  const units = Object.keys(math.Unit.UNITS)
  const known = new Set(units)
  // Leave out plural spellings (angstroms, hours) when the singular is there too.
  const singular = units.filter((u) => !(u.length > 3 && u.endsWith('s') && known.has(u.slice(0, -1))))
  return [...new Set([...singular, ...COMMON_PREFIXED])].filter(isUnitName)
}

/** What a unit is, in SI: "1 angstrom = 1e-10 m", or null if it's not a unit (or is SI already). */
export function describeUnit(name: string): string | null {
  if (!isUnitName(name)) return null
  try {
    const u = math.unit(1, name)
    // Temperature scales have an offset: "1 degC = 274.15 K" would mislead.
    if (u.units.some((p) => p.unit.offset)) return null
    const si = u.toSI()
    // In a derived unit where one fits (1 eV = 1.6e-19 J), else in base units (1 N = 1 kg m/s^2).
    const derived = DERIVED_UNITS.find((d) => si.equalBase(d) && d.formatUnits() !== name)
    const text = math.format(derived ? si.to(derived.formatUnits()) : si, { precision: MESSAGE_DIGITS })
    return text === `1 ${name}` ? null : `1 ${name} = ${text}`
  } catch {
    return null
  }
}

/** Pieces of a unit expression, read one after another: a power (`^2`, `^(-1)`), the first unit, then `/unit` or `*unit`. */
export const POWER = /\^(\(-?\d+(?:\.\d+)?\)|-?\d+(?:\.\d+)?)/y
/** (A unit ends where a name or a call would go on: `2 mλ` has no unit.) */
/** A unit's name, which may start with a typed micro sign (µm). */
export const UNIT_WORD = String.raw`(?:[µμ](?=[A-Za-z]))?[A-Za-z]+`
export const FIRST_UNIT = new RegExp(String.raw`[ \t]*(${UNIT_WORD})(?!${NAME_CHAR}|\()`, 'y')
export const NEXT_UNIT = new RegExp(String.raw`([*/·])(${UNIT_WORD})(?!${NAME_CHAR}|\()`, 'y')

/** Read a unit expression like `m/s^2` or `kg*m^2` starting at `pos`. */
export function readUnit(src: string, pos: number): { text: string; end: number } | null {
  FIRST_UNIT.lastIndex = pos
  const first = FIRST_UNIT.exec(src)
  if (!first || !isUnitName(first[1])) return null
  let text = withMicroPrefix(first[1])
  let end = FIRST_UNIT.lastIndex

  const readPower = () => {
    POWER.lastIndex = end
    const p = POWER.exec(src)
    if (p) {
      text += `^${p[1].replace(/[()]/g, '')}`
      end = POWER.lastIndex
    }
  }
  readPower()

  for (;;) {
    NEXT_UNIT.lastIndex = end
    const next = NEXT_UNIT.exec(src)
    if (!next || !isUnitName(next[2])) break
    text += (next[1] === '/' ? '/' : '*') + withMicroPrefix(next[2])
    end = NEXT_UNIT.lastIndex
    readPower()
  }
  return { text, end }
}

/** Every name in a line that isn't a call: not part of a longer name, or after `.` or `\`. */
export const NAME_IN_LINE = new RegExp(String.raw`(?<!${NAME_CHAR}|[\\.])(${NAME})(?!${NAME_CHAR}|\()`, 'g')
/** After a unit, another term (a name or a bracket), not `to` or `in`: `1/2 m v^2`. */
export const MORE_TERMS = new RegExp(String.raw`^[ \t]+(?!(?:${KEYWORD.to}|${MATHJS_IN})(?!${NAME_CHAR}))(?:${NAME_CHAR}|\()`)
/** `pm` as a word (not the start of a name like `pmax`). */
export const PM_WORD = new RegExp(`^${KEYWORD.pm}(?!${NAME_CHAR})`)
/** A character that can be part of a name. */
export const NAME_CHAR_RE = new RegExp(NAME_CHAR)
/** A conversion that's all that's left of a line: `to cm` (1: the unit). */
export const CONVERSION_TAIL = new RegExp(String.raw`^${KEYWORD.to}\s+(.+)$`)

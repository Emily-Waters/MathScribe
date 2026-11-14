/**
 * The elements, for `@chem.Na` (a molar mass) and `@chem.mm({…})` (a compound's).
 *
 * Weights are IUPAC's abridged standard atomic weights (2021), written with the
 * digits IUPAC gives, which are their sig figs: Na 22.990, Cl 35.45. An element
 * with no stable isotope has no standard weight; it has the mass number of its
 * longest-lived isotope instead (Tc 97), marked `massNumber`.
 */

/** One element. */
export interface Element {
  /** Atomic number, Z. */
  readonly number: number
  readonly name: string
  /** Standard atomic weight, or mass number, as written: its digits are its sig figs. Also its molar mass in g/mol. */
  readonly weight: string
  /** No stable isotope: the weight is the mass number of the longest-lived one. */
  readonly massNumber?: true
}

/** The unit an element's weight is a molar mass in. */
export const MOLAR_MASS_UNIT = 'g/mol'

/** Every element, by its symbol. */
export const ELEMENTS = {
  H: { number: 1, name: 'hydrogen', weight: '1.008' },
  He: { number: 2, name: 'helium', weight: '4.0026' },
  Li: { number: 3, name: 'lithium', weight: '6.94' },
  Be: { number: 4, name: 'beryllium', weight: '9.0122' },
  B: { number: 5, name: 'boron', weight: '10.81' },
  C: { number: 6, name: 'carbon', weight: '12.011' },
  N: { number: 7, name: 'nitrogen', weight: '14.007' },
  O: { number: 8, name: 'oxygen', weight: '15.999' },
  F: { number: 9, name: 'fluorine', weight: '18.998' },
  Ne: { number: 10, name: 'neon', weight: '20.180' },
  Na: { number: 11, name: 'sodium', weight: '22.990' },
  Mg: { number: 12, name: 'magnesium', weight: '24.305' },
  Al: { number: 13, name: 'aluminium', weight: '26.982' },
  Si: { number: 14, name: 'silicon', weight: '28.085' },
  P: { number: 15, name: 'phosphorus', weight: '30.974' },
  S: { number: 16, name: 'sulfur', weight: '32.06' },
  Cl: { number: 17, name: 'chlorine', weight: '35.45' },
  Ar: { number: 18, name: 'argon', weight: '39.95' },
  K: { number: 19, name: 'potassium', weight: '39.098' },
  Ca: { number: 20, name: 'calcium', weight: '40.078' },
  Sc: { number: 21, name: 'scandium', weight: '44.956' },
  Ti: { number: 22, name: 'titanium', weight: '47.867' },
  V: { number: 23, name: 'vanadium', weight: '50.942' },
  Cr: { number: 24, name: 'chromium', weight: '51.996' },
  Mn: { number: 25, name: 'manganese', weight: '54.938' },
  Fe: { number: 26, name: 'iron', weight: '55.845' },
  Co: { number: 27, name: 'cobalt', weight: '58.933' },
  Ni: { number: 28, name: 'nickel', weight: '58.693' },
  Cu: { number: 29, name: 'copper', weight: '63.546' },
  Zn: { number: 30, name: 'zinc', weight: '65.38' },
  Ga: { number: 31, name: 'gallium', weight: '69.723' },
  Ge: { number: 32, name: 'germanium', weight: '72.630' },
  As: { number: 33, name: 'arsenic', weight: '74.922' },
  Se: { number: 34, name: 'selenium', weight: '78.971' },
  Br: { number: 35, name: 'bromine', weight: '79.904' },
  Kr: { number: 36, name: 'krypton', weight: '83.798' },
  Rb: { number: 37, name: 'rubidium', weight: '85.468' },
  Sr: { number: 38, name: 'strontium', weight: '87.62' },
  Y: { number: 39, name: 'yttrium', weight: '88.906' },
  Zr: { number: 40, name: 'zirconium', weight: '91.224' },
  Nb: { number: 41, name: 'niobium', weight: '92.906' },
  Mo: { number: 42, name: 'molybdenum', weight: '95.95' },
  Tc: { number: 43, name: 'technetium', weight: '97', massNumber: true },
  Ru: { number: 44, name: 'ruthenium', weight: '101.07' },
  Rh: { number: 45, name: 'rhodium', weight: '102.91' },
  Pd: { number: 46, name: 'palladium', weight: '106.42' },
  Ag: { number: 47, name: 'silver', weight: '107.87' },
  Cd: { number: 48, name: 'cadmium', weight: '112.41' },
  In: { number: 49, name: 'indium', weight: '114.82' },
  Sn: { number: 50, name: 'tin', weight: '118.71' },
  Sb: { number: 51, name: 'antimony', weight: '121.76' },
  Te: { number: 52, name: 'tellurium', weight: '127.60' },
  I: { number: 53, name: 'iodine', weight: '126.90' },
  Xe: { number: 54, name: 'xenon', weight: '131.29' },
  Cs: { number: 55, name: 'caesium', weight: '132.91' },
  Ba: { number: 56, name: 'barium', weight: '137.33' },
  La: { number: 57, name: 'lanthanum', weight: '138.91' },
  Ce: { number: 58, name: 'cerium', weight: '140.12' },
  Pr: { number: 59, name: 'praseodymium', weight: '140.91' },
  Nd: { number: 60, name: 'neodymium', weight: '144.24' },
  Pm: { number: 61, name: 'promethium', weight: '145', massNumber: true },
  Sm: { number: 62, name: 'samarium', weight: '150.36' },
  Eu: { number: 63, name: 'europium', weight: '151.96' },
  Gd: { number: 64, name: 'gadolinium', weight: '157.25' },
  Tb: { number: 65, name: 'terbium', weight: '158.93' },
  Dy: { number: 66, name: 'dysprosium', weight: '162.50' },
  Ho: { number: 67, name: 'holmium', weight: '164.93' },
  Er: { number: 68, name: 'erbium', weight: '167.26' },
  Tm: { number: 69, name: 'thulium', weight: '168.93' },
  Yb: { number: 70, name: 'ytterbium', weight: '173.05' },
  Lu: { number: 71, name: 'lutetium', weight: '174.97' },
  Hf: { number: 72, name: 'hafnium', weight: '178.49' },
  Ta: { number: 73, name: 'tantalum', weight: '180.95' },
  W: { number: 74, name: 'tungsten', weight: '183.84' },
  Re: { number: 75, name: 'rhenium', weight: '186.21' },
  Os: { number: 76, name: 'osmium', weight: '190.23' },
  Ir: { number: 77, name: 'iridium', weight: '192.22' },
  Pt: { number: 78, name: 'platinum', weight: '195.08' },
  Au: { number: 79, name: 'gold', weight: '196.97' },
  Hg: { number: 80, name: 'mercury', weight: '200.59' },
  Tl: { number: 81, name: 'thallium', weight: '204.38' },
  Pb: { number: 82, name: 'lead', weight: '207.2' },
  Bi: { number: 83, name: 'bismuth', weight: '208.98' },
  Po: { number: 84, name: 'polonium', weight: '209', massNumber: true },
  At: { number: 85, name: 'astatine', weight: '210', massNumber: true },
  Rn: { number: 86, name: 'radon', weight: '222', massNumber: true },
  Fr: { number: 87, name: 'francium', weight: '223', massNumber: true },
  Ra: { number: 88, name: 'radium', weight: '226', massNumber: true },
  Ac: { number: 89, name: 'actinium', weight: '227', massNumber: true },
  Th: { number: 90, name: 'thorium', weight: '232.04' },
  Pa: { number: 91, name: 'protactinium', weight: '231.04' },
  U: { number: 92, name: 'uranium', weight: '238.03' },
  Np: { number: 93, name: 'neptunium', weight: '237', massNumber: true },
  Pu: { number: 94, name: 'plutonium', weight: '244', massNumber: true },
  Am: { number: 95, name: 'americium', weight: '243', massNumber: true },
  Cm: { number: 96, name: 'curium', weight: '247', massNumber: true },
  Bk: { number: 97, name: 'berkelium', weight: '247', massNumber: true },
  Cf: { number: 98, name: 'californium', weight: '251', massNumber: true },
  Es: { number: 99, name: 'einsteinium', weight: '252', massNumber: true },
  Fm: { number: 100, name: 'fermium', weight: '257', massNumber: true },
  Md: { number: 101, name: 'mendelevium', weight: '258', massNumber: true },
  No: { number: 102, name: 'nobelium', weight: '259', massNumber: true },
  Lr: { number: 103, name: 'lawrencium', weight: '262', massNumber: true },
  Rf: { number: 104, name: 'rutherfordium', weight: '267', massNumber: true },
  Db: { number: 105, name: 'dubnium', weight: '268', massNumber: true },
  Sg: { number: 106, name: 'seaborgium', weight: '269', massNumber: true },
  Bh: { number: 107, name: 'bohrium', weight: '270', massNumber: true },
  Hs: { number: 108, name: 'hassium', weight: '269', massNumber: true },
  Mt: { number: 109, name: 'meitnerium', weight: '278', massNumber: true },
  Ds: { number: 110, name: 'darmstadtium', weight: '281', massNumber: true },
  Rg: { number: 111, name: 'roentgenium', weight: '282', massNumber: true },
  Cn: { number: 112, name: 'copernicium', weight: '285', massNumber: true },
  Nh: { number: 113, name: 'nihonium', weight: '286', massNumber: true },
  Fl: { number: 114, name: 'flerovium', weight: '289', massNumber: true },
  Mc: { number: 115, name: 'moscovium', weight: '290', massNumber: true },
  Lv: { number: 116, name: 'livermorium', weight: '293', massNumber: true },
  Ts: { number: 117, name: 'tennessine', weight: '294', massNumber: true },
  Og: { number: 118, name: 'oganesson', weight: '294', massNumber: true },
} as const satisfies Record<string, Element>

export type ElementSymbol = keyof typeof ELEMENTS

/** Whether some text is an element's symbol: `Na` is, `NA` and `Xx` aren't. */
export const isElement = (symbol: string): symbol is ElementSymbol => Object.hasOwn(ELEMENTS, symbol)

/** An element's description, as the editor and Reference show it: "molar mass of sodium". */
export function elementDescription(symbol: ElementSymbol): string {
  const e: Element = ELEMENTS[symbol]
  return e.massNumber
    ? `molar mass of ${e.name} (no stable isotope: the mass number of its longest-lived one)`
    : `molar mass of ${e.name}`
}

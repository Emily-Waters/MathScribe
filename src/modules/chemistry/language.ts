/**
 * The chemistry module's topics of the language tree (lib/language/tree.ts): each
 * feature, what's said about it, and whole sheets showing it, which the
 * Reference tab shows live and the tests check.
 */
import type { PlacedTopic } from '../../lib/plugin.ts'

/** Its topics, each placed after the core's topic it follows. */
export const CHEMISTRY_TOPICS: readonly PlacedTopic[] = [
  {
    id: 'chemistry',
    title: 'Chemistry',
    after: 'constants',
    entries: [
      {
        explain: '@chem.substance is a substance: its molar mass (.M), and an amount of it (.n, 1 mol until set) and '
          + 'its mass (.m); each element’s amount, mass, molar mass and mass fraction in it (.H.n, .H.m, .H.M, '
          + '.H.w). A member on its own line shows how it’s worked out.',
        rules: [
          'A substance\'s molar mass comes from its formula (brackets and a hydrate\'s * work); set any amount '
            + 'or mass and the rest follow.',
        ],
        examples: [{
          source: [
            'H2SO4 = @chem.substance({H2SO4})',
            'H2SO4.n = 2.00 mol',
            'H2SO4.m',
            'H2SO4.H.m',
            'H2SO4.H.w',
          ].join('\n'),
        }],
      },
      {
        explain: 'Set any amount or mass, the substance’s or an element’s, and the rest follow from it, from that line '
          + 'on. A formula can have groups in brackets and a hydrate’s water after *; a charge or state is left '
          + 'out of the molar mass.',
        examples: [{
          source: [
            'CuSO4 = @chem.substance({CuSO4*5H2O})',
            'CuSO4.m = 5.00 g',
            'CuSO4.n',
            'CuSO4.O.m',
          ].join('\n'),
        }],
      },
      {
        explain: '{formula} after a value is its species: on g a mass of it, on mol an amount, on g/mol a molar mass. '
          + 'Once there are species, every mass, amount and molar mass needs one.',
        rules: [
          'A formula goes in single braces: {Na^+}, {Ca^2+}, {H3O^+(aq)}, {2 H2O(l)} (counts as digits, a '
            + 'charge after ^, a state in brackets).',
          'Species are strict: once a calculation has species, give every mass, amount and molar mass in it '
            + 'its species. Go from one species to another only with a mole ratio, (1 mol {X}) / (1 mol {EDTA}).',
          'M is molarity (mol/L). A whole number of a species (1 mol {X}) is exact.',
        ],
        examples: [{
          source: [
            'NaOH = @chem.substance({NaOH})',
            'm = 5.00 g {NaOH}',
            'n = m / NaOH.M',
          ].join('\n'),
        }],
      },
      {
        explain: '@chem.species names a species: {dietzeite} is its formula wherever braces take one, shown by its '
          + 'name (declare it :formula, or put :formula on a line, to show the formula).',
        examples: [{
          source: [
            '@chem.species dietzeite = {7Ca(IO3)2*8CaCrO4}',
            'D = @chem.substance({dietzeite})',
            'm = 5.00 g {dietzeite}',
            'n = m / D.M',
          ].join('\n'),
        }],
      },
      {
        explain: '@chem.reaction checks a reaction balances; each coefficient is a member, an exact amount, so r.H2O / '
          + 'r.H2 is a mole ratio.',
        examples: [{
          source: [
            'r = @chem.reaction({2 H2 + O2 -> 2 H2O})',
            'H2 = @chem.substance({H2})',
            'H2O = @chem.substance({H2O})',
            'H2.m = 4.00 g',
            'H2O.n = H2.n * r.H2O / r.H2',
            'H2O.m',
          ].join('\n'),
        }],
      },
      {
        explain: '@inv(x) is 1/x, written turned over: a molar mass as 1 mol over its grams, a conversion factor '
          + 'flipped. @inv(m / V) is V/m.',
        examples: [{
          source: [
            'H2O = @chem.substance({H2O})',
            'n = 36.0 g {H2O} * @inv(H2O.M)',
          ].join('\n'),
        }],
      },
      {
        explain: 'Amounts of different species can’t be added with +; @chem.total adds them as plain amounts.',
        examples: [{
          source: [
            'n_Na = 0.100 mol {Na^+}',
            'n_Cl = 0.200 mol {Cl^-}',
            'n = @chem.total(n_Na, n_Cl)',
          ].join('\n'),
        }],
      },
      {
        explain: 'A display-name template: words in quotes with {{x}} where each argument goes, used as a setting on a '
          + 'name. A subscript starting with a capital is drawn as a formula.',
        rules: [
          'A display name goes on the name being assigned: n_Na:"Moles of {Na^+}" = …; it can hold values: '
            + '"Moles in {{V}}".',
        ],
        examples: [{
          source: [
            'massName(x) = "m_{{x}}"',
            'm_w:massName(H2O) = 18.02 g',
            'm_s:massName(NaCl) = 5.85 g',
          ].join('\n'),
        }],
      },
    ],
  },
]

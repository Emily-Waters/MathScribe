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
        explain: 'A formula goes in single braces, anywhere text is: prose, headings, block titles, display names. On '
          + 'a line of its own it\'s a reaction, drawn but not worked out.',
        rules: [
          'Inside the braces: counts as digits, a charge after ^ (Ca^2+, OH^-; Na+ works too), a state in '
            + 'brackets, a coefficient before, arrows (->, <=>), a hydrate\'s dot as *.',
          '{{…}} is still a value. Formulas are drawn with mhchem, which the LaTeX export loads when the sheet '
            + 'has one.',
        ],
        examples: [{
          source: [
            '> The {Na^+} concentration.',
            '{OH^-(aq) + H3O^+(aq) -> 2 H2O(l)}',
          ].join('\n'),
        }],
      },
      {
        explain: 'M is mol/L, with mM and µM; a worked-out concentration is shown in M. MPa is still megapascals, and '
          + 'M is still free as a name.',
        examples: [{
          source: [
            'c = 0.100 M',
            'V = 25.0 mL',
            'n = c * V',
          ].join('\n'),
        }],
      },
      {
        explain: '@chem.substance is a substance: its molar mass (.M), and an amount of it (.n, 1 mol until set) and '
          + 'its mass (.m); each element’s amount, mass, molar mass and mass fraction in it (.H.n, .H.m, .H.M, '
          + '.H.w). A member on its own line shows how it’s worked out.',
        rules: [
          'A substance\'s molar mass comes from its formula (brackets and a hydrate\'s * work); set any amount '
            + 'or mass and the rest follow.',
          'Its members: X.M its molar mass, X.n its amount (1 mol until set), X.m its mass, and each element\'s '
            + 'X.E.n, X.E.m, X.E.M and X.E.w (its mass fraction).',
          'A member on a line of its own shows how it\'s worked out, back to what was set; in a calculation '
            + 'it\'s a value like any other.',
          'Atomic weights are IUPAC\'s abridged standard atomic weights (2021), their digits as sig figs; an '
            + 'element with no stable isotope has its longest-lived isotope\'s mass number.',
          'Groups in brackets work (Ca(OH)2, K4[Fe(CN)6]). A charge or state doesn\'t change the molar mass, '
            + 'but is part of the species. Symbols are case-sensitive: {Co} is cobalt, {CO} carbon monoxide.',
          'In a formula of parts joined by *, a number against a part is how many of it: {7Ca(IO3)2*8CaCrO4} '
            + 'is 7 Ca(IO3)2 and 8 CaCrO4.',
          'A substance is one formula, with no count in front: for 2 mol of water, set H2O.n = 2. A mass '
            + 'worked out from grams stays in grams.',
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
        rules: [
          'A value with no unit is read as mol or g; one already of a species (from a mole ratio) is used as '
            + 'it is. Molar masses and mass fractions follow from the formula, so they can\'t be set.',
        ],
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
          'What {H2O} makes a value follows from its unit: a mass, an amount (mol, M), a mass concentration '
            + '(g/L), a molar mass (g/mol); with no mass or amount, it\'s an error.',
          'It can follow a unit, a bracket or a name (n_1 {H2O}). A value of one species can\'t be given '
            + 'another.',
          'Species cancel as units do, and to keeps the species: n to mmol is in mmol NaOH. 1 mol on its own, '
            + 'as in a molar mass (18.02 g / 1 mol), is exact too.',
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
        rules: [
          'Names apply to the whole sheet, above the block too; a block names several: @chem.species { … }.',
          'A name can\'t be something braces already read: a formula (CO), an electron (e) or a state (aq, s, '
            + 'l, g). What it names needn\'t be a formula: {EDTA} is a species too.',
          'In a reaction it\'s drawn by its formula, and its member is the name: r.dietzeite.',
        ],
        examples: [{
          source: [
            '@chem.species dietzeite = {7Ca(IO3)2*8CaCrO4}',
            'D = @chem.substance({dietzeite})',
            'm = 5.00 g {dietzeite}',
            'n = m / D.M',
          ].join('\n'),
        }, {
          source: [
            '@chem.species dietzeite = {7Ca(IO3)2*8CaCrO4}',
            'm:formula = 5.00 g {dietzeite}',
            'n:name = 0.0100 mol {dietzeite}',
          ].join('\n'),
        }],
      },
      {
        explain: '@chem.reaction checks a reaction balances; each coefficient is a member, an exact amount, so r.H2O / '
          + 'r.H2 is a mole ratio.',
        rules: [
          'It\'s checked atom by atom and by charge: {H2 + O2 -> H2O} says O has 2 on the left and 1 on the '
            + 'right. Electrons are e^-; the arrow can be ->, <=>, <-> or =.',
          'A species whose formula isn\'t a name is a member by its letters and digits: Ca(OH)2 is r.CaOH2, '
            + 'Na^+ is r.Na.',
          'A name\'s subscript that\'s a formula (n_H2O, c_NaCl) is drawn as chemistry; a single letter, or '
            + 'labels that aren\'t elements (v_AB), stay as they are.',
        ],
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
          'Arguments are text, as written, separated by commas. A {{name}} that isn\'t a parameter is a value.',
          'Braces around a parameter make it a formula: conc(ion) = "[{{{ion}}}]".',
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

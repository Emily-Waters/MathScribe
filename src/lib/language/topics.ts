/**
 * The core's topics of the language tree (tree.ts): each feature, what's said
 * about it, the rules for writing it, and whole sheets showing it, which the
 * Reference tab shows live and the tests check. A module's topics are its own
 * (EngineModule.languageTopics), placed among these.
 */
import type { LanguageTopic } from './tree.ts'

/** The core's topics, in order. */
export const CORE_TOPICS: readonly LanguageTopic[] = [
  {
    id: 'basics',
    title: 'Basics',
    entries: [
      {
        explain: 'Assign a value. Text after # is a note shown beside the result.',
        rules: [
          'Text after ` # ` on a calculation is its note: two spaces or more before the #.',
        ],
        examples: [{ source: 'm = 2.00 kg   # mass of the block' }],
      },
      {
        explain: '// starts a comment, never shown. A blank line is spacing; two leave a gap in the output.',
        rules: [
          'Don\'t use # for a comment on its own line: it makes a heading.',
        ],
        examples: [{
          source: [
            '// the block\'s mass',
            'm = 2.00 kg',
          ].join('\n'),
        }],
      },
      {
        explain: 'Use earlier variables; the working is shown with values substituted.',
        rules: [
          'Always write * for multiplication: 1/2 * m * v^2, 2 * pi * r. Never 2m or 1/2 m v^2.',
          'Don\'t write LaTeX in calculation lines (\\frac, \\cdot): write plain maths.',
          'A variable can be redefined; later lines use the newest value.',
        ],
        examples: [{
          source: [
            'm = 2.00 kg',
            'F = m * 9.81 m/s^2',
          ].join('\n'),
        }],
      },
      {
        explain: 'Names are letters, digits and underscores, and _ makes a subscript: v_0 is v₀, v_1x (or v1x) is '
          + 'v₁ₓ, F_net_x is F_net,x; a subscript that\'s a word (net, max) is upright. Greek letters by name '
          + '(theta, mu_k, Delta) or as characters (ΔE, ω).',
        rules: [
          'Name things as the question writes them.',
          'Write Δt, not dt. No dots in names.',
          'Don\'t use phi, tau, e or pi as names of your own.',
        ],
        examples: [{
          source: [
            'v_0 = 2.0 m/s',
            'Δt = 1.5 s',
            'mu_k = 0.150',
            'a = v_0 / Δt',
          ].join('\n'),
        }],
      },
      {
        explain: 'Powers are ^. The functions of maths: sqrt, sin, cos, tan, asin, acos, atan, atan2, exp, log '
          + '(natural), log10, abs, min, max, round; and pi and e.',
        examples: [{
          source: [
            'r = 2.00 m',
            'A = pi * r^2',
            'h = sqrt(2 * 9.81 m/s^2 * 1.20 m)',
          ].join('\n'),
        }],
      },
      {
        explain: 'Headings. # and ## are numbered, like LaTeX sections. In headings and block titles, a_b is a '
          + 'subscript (write \\_ for a plain underscore) and $…$ is maths.',
        rules: [
          'A line starting with # is always a heading: write // for a comment.',
        ],
        examples: [{
          source: [
            '# Section',
            '## The 2p_z orbital',
            '### Energy $E_n$',
          ].join('\n'),
        }],
      },
      {
        explain: 'A line starting with > is a paragraph of text.',
        rules: [
          'Don\'t start a line with $: $…$ is inline maths, for prose.',
        ],
        examples: [{ source: '> Prose, with inline maths like $E = mc^2$.' }],
      },
      {
        explain: '{{name}} in prose or a heading puts in a variable\'s value as worked out above it, with its unit and '
          + 'sig figs. Settings and to work in it: {{V:3 to L}}.',
        rules: [
          'Don\'t type a worked-out number into prose: write {{name}}, so it stays right.',
        ],
        examples: [{
          source: [
            'T1 = 1.21 s',
            'T2 = 1.17 s',
            '> The mean period was {{T_avg}}.',
          ].join('\n'),
        }],
      },
      {
        explain: '@latex { … } is raw LaTeX, displayed but not calculated.',
        examples: [{ source: '@latex { \\int_0^\\infty e^{-x}\\,dx = 1 }' }],
      },
      {
        explain: 'Over several lines, it goes up to a } on its own line.',
        examples: [{
          source: [
            '@latex {',
            '    \\begin{aligned}',
            '      F &= ma \\\\',
            '        &= 19.6\\,\\mathrm{N}',
            '    \\end{aligned}',
            '}',
          ].join('\n'),
        }],
      },
      {
        explain: 'Title { … } is a block. Variables assigned inside are local to it.',
        rules: [
          'Indent the lines inside 4 spaces.',
          'Title {  #hide works the whole block out without showing it.',
          'Don\'t end a line with : to start a block: write Title {.',
        ],
        examples: [{
          source: [
            'g = 9.81 m/s^2',
            'Steeper ramp {',
            '    theta = 45.0 deg',
            '    a = g * sin(theta)',
            '}',
          ].join('\n'),
        }],
      },
    ],
  },
  {
    id: 'units',
    title: 'Units',
    entries: [
      {
        explain: 'A unit goes right after the number. Compound units have no spaces.',
        rules: [
          'A unit goes right after a number: 9.81 m/s^2, 2.00 kg, 5.0 um (micro is u). Never after a name (m '
            + 'kg).',
          'Compound units have no spaces: kg*m^2, J/mol/K.',
          'Litres are L and mL. Use kelvin for temperature.',
        ],
        examples: [{ source: 'g = 9.81 m/s^2' }],
      },
      {
        explain: 'to converts to another unit.',
        examples: [{
          source: [
            'v = 25.0 m/s',
            'v to km/h',
          ].join('\n'),
        }],
      },
      {
        explain: 'Ångström is angstrom (A is the ampere).',
        examples: [{ source: 'r = 0.400 angstrom' }],
      },
      {
        explain: 'name:unit shows (and keeps) the result in that unit; a plain angle from atan or asin counts as '
          + 'radians. Combine it with sig figs in either order: phi:3:deg.',
        examples: [{ source: 'phi:3:deg = atan(1.00 / 2.00)' }],
      },
      {
        explain: 'Angles in deg or rad; trig functions accept either.',
        rules: [
          'Trig takes radians unless given deg; asin, acos and atan give radians, so add to deg.',
        ],
        examples: [{ source: 'theta = 30.0 deg' }],
      },
      {
        explain: 'to percent shows a unitless result ×100 (stored as the fraction). Values with units are refused.',
        examples: [{
          source: [
            'P = 0.950 angstrom^-1',
            'dr = 0.010 angstrom',
            'shell = P * dr to percent',
          ].join('\n'),
        }],
      },
    ],
  },
  {
    id: 'sigfigs',
    title: 'Significant figures',
    entries: [
      {
        explain: 'Numbers with a decimal point or a unit are measured; whole numbers alone (the 2) are exact.',
        rules: [
          'Write 1/2, not 0.5, for an exact factor: 0.5 is a measurement with 1 sig fig, and rounds the answer '
            + 'to 1.',
        ],
        examples: [{ source: 'd = 2 * 1.50 m' }],
      },
      {
        explain: 'Trailing zeros without a decimal point aren’t significant. Write 300. m if they are.',
        rules: [
          'Prefer values like 12.0 m and 30.0 deg; write 300. m or 3.00e2 m when the zeros count.',
        ],
        examples: [{ source: 'L = 300 m', warns: true }],
      },
      {
        explain: 'A rounded result of exact inputs follows ≈. Measured results use =; Options can switch them to ≈ '
          + 'too.',
        examples: [{
          source: [
            'q = pi / 4',
            'F = 2.00 kg * 9.81 m/s^2',
          ].join('\n'),
        }],
      },
      {
        explain: 'name:n = … sets the sig figs of a result.',
        rules: [
          'Settings go on the name being assigned, left of = only: d:km = …, N:sci = …, L:dec = ….',
        ],
        examples: [{ source: 'third:3 = 1/3' }],
      },
      {
        explain: ':exact shows full precision.',
        examples: [{ source: 'third:exact = 1/3' }],
      },
      {
        explain: ':sci always shows scientific notation, :dec always plain digits. A variable keeps its notation '
          + 'wherever its value appears; combine with sig figs and units, like E:3:sci:eV.',
        examples: [{
          source: [
            'N:sci = 1500. * 12.0',
            'lambda:dec = 5.32e-7 m',
            'x = lambda / 2',
          ].join('\n'),
        }],
      },
      {
        explain: 'Exponents written as plain numbers (^0.5, ^(3/2)) don’t limit sig figs.',
        examples: [{ source: 'side = (4.00 m^2)^0.5' }],
      },
      {
        explain: 'A measured zero counts by decimal places, and doesn’t limit a function’s result.',
        examples: [{
          source: [
            'theta = 0.00 deg',
            'c = cos(theta)',
          ].join('\n'),
        }],
      },
    ],
  },
  {
    id: 'uncertainty',
    title: 'Uncertainty',
    entries: [
      {
        explain: 'pm (or ±) gives a value an uncertainty.',
        rules: [
          'Write pm only where a value is defined, never inside a function\'s brackets: it propagates by itself.',
        ],
        examples: [{ source: 'd = 3.50 m pm 0.02 m' }],
      },
      {
        explain: 'A percentage uncertainty.',
        examples: [{ source: 'm = 2.00 kg pm 2%' }],
      },
      {
        explain: 'Results combine uncertainties in quadrature. delta v = shows how; delta v / v is the relative '
          + 'uncertainty.',
        rules: [
          'delta F (shown δF) is F\'s uncertainty; on its own line it shows the working of its propagation.',
        ],
        examples: [{
          source: [
            'd = 3.50 m pm 0.02 m',
            't = 1.21 s pm 0.03 s',
            'v = d / t',
            'delta v =',
            'delta v / v',
          ].join('\n'),
        }],
      },
    ],
  },
  {
    id: 'functions',
    title: 'Functions',
    entries: [
      {
        explain: 'A one-line function, written as in maths.',
        rules: [
          'A function is one line, f(x) = …; it can use variables defined above it. There are no loops.',
        ],
        examples: [{
          source: [
            'f(x) = 2 * x^2 + 1',
            'y = f(3.0)',
          ].join('\n'),
        }],
      },
      {
        explain: 'condition ? a : b gives a if the condition holds and b otherwise; conditions nest, for more than two '
          + 'cases.',
        rules: [
          'Conditions compare values: <, >, <=, >=, ==, and, or.',
        ],
        examples: [{
          source: [
            'ramp(x) = x > 0 ? x : 0',
            'y = ramp(3.0)',
            'friction(v, f_k) = v > 0 m/s ? -f_k : (v < 0 m/s ? f_k : 0 N)',
            'F_f = friction(-1.5 m/s, 6.0 N)',
          ].join('\n'),
        }],
      },
      {
        explain: 'The working shows the variables you passed in (r₁), not the parameter names.',
        examples: [{
          source: [
            'area(r) = pi * r^2',
            'r_1 = 2.0 cm',
            'A = area(r_1)',
          ].join('\n'),
        }],
      },
      {
        explain: 'name to unit converts that argument on the way in, so the working shows it in that unit. An argument '
          + 'in the wrong kind of unit, or with no unit, is an error.',
        examples: [{
          source: [
            'E(n, m to kg, L to m) = n^2 * @h^2 / (8*m*L^2)',
            'm_e = 9.11e-31 kg',
            'E_1 = E(1, m_e, 0.100 nm)',
          ].join('\n'),
        }],
      },
      {
        explain: 'Settings after the parameters, f(x):3:deg, apply to every call’s result: its sig figs and unit, as '
          + 'on a variable.',
        examples: [{
          source: [
            'ang(y, x):3:deg = atan(y / x)',
            'phi = ang(1.0, 2.0)',
          ].join('\n'),
        }],
      },
      {
        explain: 'A function can return a tuple of values, such as coordinates.',
        examples: [{
          source: [
            'polar(x, y) = @tuple(sqrt(x^2 + y^2), atan2(y, x))',
            'P = polar(1.00 m, 1.00 m)',
          ].join('\n'),
        }],
      },
    ],
  },
  {
    id: 'tuples',
    title: 'Tuples and coordinates',
    entries: [
      {
        explain: '@tuple(…) makes a tuple, shown as (x, y, z). A shared unit is written once; tuples scale, add, '
          + 'convert with to, and norm, dot and cross work on them.',
        rules: [
          'Don\'t write (a, b) for a pair: write @tuple(a, b). <3.0, 4.0> N is a vector.',
        ],
        examples: [{
          source: [
            'r = @tuple(1.00 m, 2.00 m, 3.00 m)',
            's = 2 * r',
            'd = norm(r)',
          ].join('\n'),
        }],
      },
      {
        explain: '@tuple(a, b) = … unpacks a tuple: each value becomes a variable of its own. Each name can take sig '
          + 'figs and a unit, like b:cm or theta:3:deg.',
        examples: [{
          source: [
            'p = @tuple(1.414 m, 0.7854)',
            '@tuple(r:3, theta:deg) = p',
            'x = r * cos(theta)',
          ].join('\n'),
        }],
      },
    ],
  },
  {
    id: 'constants',
    title: 'Constants',
    entries: [
      {
        explain: 'Built-in constants start with @ and default to 3 sig figs (list below).',
        examples: [{ source: 'E = @h * @c / 532 nm to eV' }],
      },
      {
        explain: '@name:n uses n sig figs here; @name:exact uses full precision.',
        examples: [{ source: 'F = @G:5 * 5.972e24 kg * 70.0 kg / (6.371e6 m)^2' }],
      },
      {
        explain: 'A line with only @name:n sets that constant’s precision for the whole sheet.',
        examples: [{
          source: [
            '@c:4',
            't = 1.000 m / @c',
          ].join('\n'),
        }],
      },
      {
        explain: 'Add to unit to show the constant in that unit everywhere.',
        examples: [{
          source: [
            '@a_0:3 to angstrom',
            'r = 2 * @a_0',
          ].join('\n'),
        }],
      },
      {
        explain: 'Define your own constants, usable anywhere in the sheet as @name.',
        examples: [{
          source: [
            '@constants {',
            '    rho_w = 998 kg/m^3   # water at 20 °C',
            '}',
            'P = @rho_w * @g * 0.250 m to kPa',
          ].join('\n'),
        }],
      },
    ],
  },
  {
    id: 'display',
    title: 'Display commands',
    entries: [
      {
        explain: '#sym shows the equation only.',
        examples: [{ source: 'F = 2.00 kg * 9.81 m/s^2   #sym' }],
      },
      {
        explain: '#val shows the result only.',
        examples: [{ source: 'F = 2.00 kg * 9.81 m/s^2   #val' }],
      },
      {
        explain: '#sci shows the result in scientific notation, #dec in plain digits: for a line with no name to put '
          + ':sci on, or a whole block.',
        examples: [{
          source: [
            'p = 0.0707',
            'p^2   #sci',
          ].join('\n'),
        }],
      },
      {
        explain: '#hide calculates the line but doesn’t show it.',
        examples: [{
          source: [
            'm = 2.00 kg   #hide',
            'F = m * 9.81 m/s^2',
          ].join('\n'),
        }],
      },
      {
        explain: '#multiline puts each = on its own row, lined up. It combines with the others (#sym #multiline), and '
          + 'works on a block.',
        examples: [{
          source: [
            'm = 2.00 kg',
            'F = m * 9.81 m/s^2   #multiline',
          ].join('\n'),
        }],
      },
      {
        explain: 'On a function (f(x) = …), every line that calls it is shown multiline.',
        examples: [{
          source: [
            'area(r) = pi * r^2   #multiline',
            'r_1 = 2.0 cm',
            'A = area(r_1)',
          ].join('\n'),
        }],
      },
      {
        explain: 'On a block, a command applies to every line inside; a line’s own command (#full) wins.',
        examples: [{
          source: [
            'Results only {   #val',
            '    F = 2.00 kg * 9.81 m/s^2',
            '    p = 2.00 kg * 3.00 m/s   #full',
            '}',
          ].join('\n'),
        }],
      },
    ],
  },
  {
    id: 'layout',
    title: 'Layout',
    entries: [
      {
        explain: '@layout.list makes the lines up to its } bullets; indent further for a sub-list. The title is '
          + 'optional.',
        examples: [{
          source: [
            '@layout.list Assumptions {',
            '    > The box is one-dimensional',
            '    > The walls are infinitely high',
            '        > so ψ = 0 at the walls',
            '}',
          ].join('\n'),
        }],
      },
      {
        explain: '@layout.numbered makes a numbered list. Variables assigned inside stay available afterwards (unlike '
          + 'Title { } blocks).',
        examples: [{
          source: [
            '@layout.numbered Steps {',
            '    m = 2.00 kg',
            '    F = m * 9.81 m/s^2',
            '}',
          ].join('\n'),
        }],
      },
      {
        explain: '@layout.center centers the lines. The title is optional: “@layout.center {” on its own works too.',
        examples: [{
          source: [
            '@layout.center Key result {',
            '    E = 2.00 kg * (3.00e8 m/s)^2',
            '}',
          ].join('\n'),
        }],
      },
      {
        explain: '@layout.titlepage makes a title page of prose: the first line is the title, bold and larger; each '
          + 'line after it is centered on its own. The exports start a new page after it.',
        examples: [{
          source: [
            '@layout.titlepage {',
            '    Lab 3: Motion on a ramp',
            '    Emily Waters',
            '    PHYS 101, Section B',
            '}',
          ].join('\n'),
        }],
      },
      {
        explain: '@layout.hidden works out the lines inside without showing them; what they define is usable after it.',
        examples: [{
          source: [
            '@layout.hidden {',
            '    m = 2.00 kg',
            '    g_0 = 9.81 m/s^2',
            '}',
            'F = m * g_0',
          ].join('\n'),
        }],
      },
      {
        explain: '.sym, .val, .full, .multiline, .sci and .dec set how every line inside is shown, as their #commands '
          + 'do on a line. Members combine (@layout.numbered.val); a line’s own command still wins.',
        examples: [{
          source: [
            '@layout.val.multiline Results {',
            '    F = 2.00 kg * 9.81 m/s^2',
            '    p = 2.00 kg * 3.00 m/s   #full',
            '}',
          ].join('\n'),
        }],
      },
      {
        explain: 'On a single line, #center centers just that line (#list and #numbered work too).',
        examples: [{ source: 'F = 2.00 kg * 9.81 m/s^2   #center' }],
      },
      {
        explain: '@layout.text makes a block of prose: lines join into paragraphs (a blank line starts a new one), $…$ '
          + 'is maths, and nothing is calculated.',
        examples: [{
          source: [
            '@layout.text Discussion {',
            '    The measured acceleration is lower than g sin θ, because',
            '    the ramp isn’t frictionless: $\\mu_k \\approx 0.05$ would explain it.',
            '',
            '    A blank line starts a new paragraph.',
            '}',
          ].join('\n'),
        }],
      },
    ],
  },
]

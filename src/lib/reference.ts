/**
 * The Reference tab: every feature, as source you can type and the output it
 * gives. Each example is evaluated live by the real engine as its own small
 * sheet, so the reference can't drift from what MathScribe actually does.
 */

export interface ReferenceExample {
  /** Sheet source, exactly as you'd type it. */
  source: string
  /** One line on what it shows. */
  explain: string
}

export interface ReferenceSection {
  id: string
  title: string
  examples: ReferenceExample[]
}

/** The Reference tab’s examples, by section. */
export const REFERENCE: ReferenceSection[] = [
  {
    id: 'basics',
    title: 'Basics',
    examples: [
      { source: 'm = 2.00 kg   # mass of the block', explain: 'Assign a value. Text after # is a note shown beside the result.' },
      { source: 'm = 2.00 kg\nF = m * 9.81 m/s^2', explain: 'Use earlier variables; the working is shown with values substituted.' },
      {
        source: '# Section\n## The 2p_z orbital\n### Energy $E_n$',
        explain: 'Headings. # and ## are numbered, like LaTeX sections. In headings and block titles, '
          + 'a_b is a subscript (write \\_ for a plain underscore) and $…$ is maths.',
      },
      { source: '> Prose, with inline maths like $E = mc^2$.', explain: 'A line starting with > is a paragraph of text.' },
      { source: '$ \\int_0^\\infty e^{-x}\\,dx = 1', explain: 'A line starting with $ is raw LaTeX, displayed but not calculated.' },
      {
        source: 'g = 9.81 m/s^2\nSteeper ramp {\n  theta = 45.0 deg\n  a = g * sin(theta)\n}',
        explain: 'Title { … } is a block. Variables assigned inside are local to it.',
      },
    ],
  },
  {
    id: 'units',
    title: 'Units',
    examples: [
      { source: 'g = 9.81 m/s^2', explain: 'A unit goes right after the number. Compound units have no spaces.' },
      { source: 'v = 25.0 m/s\nv to km/h', explain: 'to converts to another unit.' },
      { source: 'r = 0.400 angstrom', explain: 'Ångström is angstrom (A is the ampere).' },
      {
        source: 'phi:3:deg = atan(1.00 / 2.00)',
        explain: 'name:unit shows (and keeps) the result in that unit; a plain angle from atan or asin counts as radians. '
          + 'Combine it with sig figs in either order: phi:3:deg.',
      },
      { source: 'theta = 30.0 deg', explain: 'Angles in deg or rad; trig functions accept either.' },
      {
        source: 'P = 0.950 angstrom^-1\ndr = 0.010 angstrom\nshell = P * dr to percent',
        explain: 'to percent shows a unitless result ×100 (stored as the fraction). Values with units are refused.',
      },
    ],
  },
  {
    id: 'sigfigs',
    title: 'Significant figures',
    examples: [
      { source: 'd = 2 * 1.50 m', explain: 'Numbers with a decimal point or a unit are measured; whole numbers alone (the 2) are exact.' },
      { source: 'L = 300 m', explain: 'Trailing zeros without a decimal point aren’t significant. Write 300. m if they are.' },
      {
        source: 'q = pi / 4\nF = 2.00 kg * 9.81 m/s^2',
        explain: 'A rounded result of exact inputs follows ≈. Measured results use =; Options can switch them to ≈ too.',
      },
      { source: 'third:3 = 1/3', explain: 'name:n = … sets the sig figs of a result.' },
      { source: 'third:exact = 1/3', explain: ':exact shows full precision.' },
      {
        source: 'N:sci = 1500. * 12.0\nlambda:dec = 5.32e-7 m\nx = lambda / 2',
        explain: ':sci always shows scientific notation, :dec always plain digits. A variable keeps its notation '
          + 'wherever its value appears; combine with sig figs and units, like E:3:sci:eV.',
      },
      { source: 'side = (4.00 m^2)^0.5', explain: 'Exponents written as plain numbers (^0.5, ^(3/2)) don’t limit sig figs.' },
      { source: 'theta = 0.00 deg\nc = cos(theta)', explain: 'A measured zero counts by decimal places, and doesn’t limit a function’s result.' },
    ],
  },
  {
    id: 'uncertainty',
    title: 'Uncertainty',
    examples: [
      { source: 'd = 3.50 m pm 0.02 m', explain: 'pm (or ±) gives a value an uncertainty.' },
      { source: 'm = 2.00 kg pm 2%', explain: 'A percentage uncertainty.' },
      {
        source: 'd = 3.50 m pm 0.02 m\nt = 1.21 s pm 0.03 s\nv = d / t\ndelta v =\ndelta v / v',
        explain: 'Results combine uncertainties in quadrature. delta v = shows how; delta v / v is the relative uncertainty.',
      },
    ],
  },
  {
    id: 'series',
    title: 'Repeated measurements',
    examples: [
      {
        source: 't_1 = 1.21 s\nt_2 = 1.17 s\nt_3 = 1.24 s\nt_avg\nt_count\nt',
        explain: 'Numbered variables form a series: t_avg is the mean ± standard error, t_count the count, t the sum.',
      },
      {
        source: [
          'import("ramp.csv")',
          '    t (s), d (m)',
          '    1.21, 3.50',
          '    1.17, 3.48',
          '    1.24, 3.52',
          't_avg',
          'v = d_2 / t_2',
        ].join('\n'),
        explain: 'import() opens a file chooser for a CSV file. Its rows go into the sheet under the line, folded away, and each '
          + 'value becomes a variable named for its column and row: t_1, t_2, …. A unit in a header, t (s), goes with that column.',
      },
      {
        source: [
          't1 = 1.21 s',
          't2 = 1.17 s',
          't3 = 1.24 s',
          'd1 = 3.50 m',
          'd2 = 3.48 m',
          'd3 = 3.52 m',
          'table(t, d, v = d / t)',
          'v_avg',
        ].join('\n'),
        explain: 'table(…) shows series side by side, a row per number. name = … works out a column row by row, '
          + 'and makes it a series of its own (v_1, v_2, …), so v_avg works afterwards.',
      },
      {
        source: [
          't1 = 0.10 s',
          't2 = 0.20 s',
          't3 = 0.30 s',
          't4 = 0.40 s',
          'x1 = 0.051 m pm 0.004 m',
          'x2 = 0.098 m pm 0.004 m',
          'x3 = 0.152 m pm 0.004 m',
          'x4 = 0.199 m pm 0.004 m',
          'plot(t, x; fit linear)',
          'v = x_slope',
        ].join('\n'),
        explain: 'plot(x axis, y series…) draws one series against another, with error bars for uncertainties. '
          + 'fit linear adds a best-fit line and its equation, and makes its slope and intercept variables: x_slope, x_intercept. '
          + 'The ⚙ after it sets the rows, style, fit, axes and title.',
      },
      {
        source: [
          't1 = 0.10 s',
          't2 = 0.20 s',
          't3 = 0.30 s',
          't4 = 0.40 s',
          'x1 = 0.020 m',
          'x2 = 0.098 m',
          'x3 = 0.152 m',
          'x4 = 0.199 m',
          'a = select(t, x; t from 0.2)',
          'p = plot(a.t, a.x; fit linear)',
          'v = p.slope',
        ].join('\n'),
        explain: 'select(…) keeps the rows where its conditions hold, as new series under a name: a.t, a.x, numbered from 1. '
          + 'A named plot keeps its fit the same way: p.slope, p.intercept. Name an import too, run1 = import(…), to keep two files apart.',
      },
    ],
  },
  {
    id: 'functions',
    title: 'Functions',
    examples: [
      { source: 'f(x) = 2 * x^2 + 1\ny = f(3.0)', explain: 'A one-line function, written as in maths.' },
      {
        source: 'def KE(mass, speed)\n    E = 1/2 * mass * speed^2\n    return E\nE_k = KE(2.00 kg, 3.00 m/s)',
        explain: 'def with an indented body for several steps. Assignments inside are local.',
      },
      {
        source: [
          'def friction(v, f_k)',
          '    if v > 0 m/s',
          '        return -f_k',
          '    else if v < 0 m/s',
          '        return f_k',
          '    else',
          '        return 0 N',
          'F_f = friction(-1.5 m/s, 6.0 N)',
          'ramp(x) = x > 0 ? x : 0',
          'y = ramp(3.0)',
        ].join('\n'),
        explain: 'if, else if and else in a def, with their lines indented under them: the first whose condition holds runs. '
          + 'In a line, condition ? a : b gives a if the condition holds and b otherwise.',
      },
      {
        source: 'area(r) = pi * r^2\nr_1 = 2.0 cm\nA = area(r_1)',
        explain: 'The working shows the variables you passed in (r₁), not the parameter names.',
      },
      {
        source: 'E(n, m to kg, L to m) = n^2 * @h^2 / (8*m*L^2)\nm_e = 9.11e-31 kg\nE_1 = E(1, m_e, 0.100 nm)',
        explain: 'name to unit converts that argument on the way in, so the working shows it in that unit. '
          + 'An argument in the wrong kind of unit, or with no unit, is an error.',
      },
      {
        source: 'ang(y, x):3:deg = atan(y / x)\nphi = ang(1.0, 2.0)',
        explain: 'Settings after the parameters, f(x):3:deg (or def f(x):3:deg), apply to every call’s result: '
          + 'its sig figs and unit, as on a variable.',
      },
      {
        source: 'def steps(a, b)\n    s = a + b\n    p = 2 * s\nsteps(1.0, 2.0)',
        explain: 'A def without return gives no value, as in Python: call it on a line of its own to show its working. '
          + 'Using it in a calculation (r = steps(…)) is an error.',
      },
      {
        source: [
          'def polar(x, y)',
          '    r = sqrt(x^2 + y^2)',
          '    theta:deg = atan2(y, x)',
          '    return tuple(r, theta)',
          'P = polar(1.00 m, 1.00 m)',
        ].join('\n'),
        explain: 'A function can return a tuple of values, such as coordinates.',
      },
    ],
  },
  {
    id: 'vectors',
    title: 'Vectors',
    examples: [
      {
        source: 'F = <3.0, 4.0> N\nF_2 = 2 * F + <1.0, -1.0> N\nmag = norm(F)',
        explain: '<…> is a vector, shown ⟨…⟩. A unit after the > applies to every component. Vectors scale and add, '
          + 'and norm, dot and cross work on them.',
      },
      {
        source: 'v:ijk = <2.0, -1.5, 4.0> m/s\nw = 2 * v',
        explain: 'name:ijk shows a vector with unit vectors, î ĵ k̂. Vectors worked out from it are shown that way too.',
      },
      {
        source: 'a:xyz = <0.50, -9.81> m/s^2\nt = 2.0 s\nd_y = 1/2 * a_y * t^2',
        explain: 'name:xyz also makes each component a variable of its own, a_x, a_y (and a_z), shown under the vector.',
      },
    ],
  },
  {
    id: 'tuples',
    title: 'Tuples and coordinates',
    examples: [
      {
        source: 'r = tuple(1.00 m, 2.00 m, 3.00 m)\ns = 2 * r\nd = norm(r)',
        explain: 'tuple(…) makes a tuple, shown as (x, y, z). A shared unit is written once; tuples scale, add, '
          + 'convert with to, and norm, dot and cross work on them.',
      },
      {
        source: 'p = tuple(1.414 m, 0.7854)\ntuple(r:3, theta:deg) = p\nx = r * cos(theta)',
        explain: 'tuple(a, b) = … unpacks a tuple: each value becomes a variable of its own. '
          + 'Each name can take sig figs and a unit, like b:cm or theta:3:deg.',
      },
    ],
  },
  {
    id: 'constants',
    title: 'Constants',
    examples: [
      { source: 'E = @h * @c / 532 nm to eV', explain: 'Built-in constants start with @ and default to 3 sig figs (list below).' },
      { source: 'F = @G:5 * 5.972e24 kg * 70.0 kg / (6.371e6 m)^2', explain: '@name:n uses n sig figs here; @name:exact uses full precision.' },
      { source: '@c:4\nt = 1.000 m / @c', explain: 'A line with only @name:n sets that constant’s precision for the whole sheet.' },
      { source: '@a_0:3 to angstrom\nr = 2 * @a_0', explain: 'Add to unit to show the constant in that unit everywhere.' },
      {
        source: '@constants {\n    rho_w = 998 kg/m^3   # water at 20 °C\n}\nP = @rho_w * @g * 0.250 m to kPa',
        explain: 'Define your own constants, usable anywhere in the sheet as @name.',
      },
    ],
  },
  {
    id: 'chemistry',
    title: 'Chemistry',
    examples: [
      { source: 'M = @chem.mm.Na', explain: '@chem.mm.Na is an element’s molar mass, with the digits IUPAC gives (@chem.mm.Na:3 for 3 sig figs).' },
      {
        source: 'M = @chem.mm({CuSO4*5H2O})',
        explain: '@chem.mm({formula}) adds up a compound’s molar mass: groups in brackets, a hydrate’s water after *. A charge or state is left out.',
      },
      {
        source: 'm = 5.00 g {NaOH}\nn = m / @chem.mm({NaOH})',
        explain: 'After a unit, {formula} is the species an amount is of; a molar mass needs none.',
      },
      {
        source: 'n_Na = 0.100 mol {Na^+}\nn_Cl = 0.200 mol {Cl^-}\nn = @chem.total(n_Na, n_Cl)',
        explain: 'Amounts of different species can’t be added with +; @chem.total adds them as plain amounts.',
      },
    ],
  },
  {
    id: 'display',
    title: 'Display commands',
    examples: [
      { source: 'F = 2.00 kg * 9.81 m/s^2   #sym', explain: '#sym shows the equation only.' },
      { source: 'F = 2.00 kg * 9.81 m/s^2   #val', explain: '#val shows the result only.' },
      {
        source: 'p = 0.0707\np^2   #sci',
        explain: '#sci shows the result in scientific notation, #dec in plain digits: for a line with no name to put :sci on, or a whole block.',
      },
      { source: 'm = 2.00 kg   #hide\nF = m * 9.81 m/s^2', explain: '#hide calculates the line but doesn’t show it.' },
      {
        source: 'm = 2.00 kg\nF = m * 9.81 m/s^2   #multiline',
        explain: '#multiline puts each = on its own row, lined up. It combines with the others (#sym #multiline), and works on a block.',
      },
      {
        source: 'area(r) = pi * r^2   #multiline\nr_1 = 2.0 cm\nA = area(r_1)',
        explain: 'On a function (f(x) = … or a def line), every line that calls it is shown multiline.',
      },
      {
        source: 'Results only {   #val\n  F = 2.00 kg * 9.81 m/s^2\n  p = 2.00 kg * 3.00 m/s   #full\n}',
        explain: 'On a block, a command applies to every line inside; a line’s own command (#full) wins.',
      },
    ],
  },
  {
    id: 'layout',
    title: 'Layout',
    examples: [
      {
        source: '@layout.list Assumptions {\n    > The box is one-dimensional\n    > The walls are infinitely high\n        > so ψ = 0 at the walls\n}',
        explain: '@layout.list makes the lines up to its } bullets; indent further for a sub-list. The title is optional.',
      },
      {
        source: '@layout.numbered Steps {\n    m = 2.00 kg\n    F = m * 9.81 m/s^2\n}',
        explain: '@layout.numbered makes a numbered list. Variables assigned inside stay available afterwards (unlike Title { } blocks).',
      },
      {
        source: '@layout.center Key result {\n    E = 2.00 kg * (3.00e8 m/s)^2\n}',
        explain: '@layout.center centers the lines. The title is optional: “@layout.center {” on its own works too.',
      },
      {
        source: '@layout.titlepage {\n    Lab 3: Motion on a ramp\n    Emily Waters\n    PHYS 101, Section B\n}',
        explain: '@layout.titlepage makes a title page of prose: the first line is the title, bold and larger; each line after it is centered on its own. The exports start a new page after it.',
      },
      {
        source: '@layout.hidden {\n    m = 2.00 kg\n    g_0 = 9.81 m/s^2\n}\nF = m * g_0',
        explain: '@layout.hidden works out the lines inside without showing them; what they define is usable after it.',
      },
      {
        source: '@layout.val.multiline Results {\n    F = 2.00 kg * 9.81 m/s^2\n    p = 2.00 kg * 3.00 m/s   #full\n}',
        explain: '.sym, .val, .full, .multiline, .sci and .dec set how every line inside is shown, as their #commands do on a line. Members combine (@layout.numbered.val); a line’s own command still wins.',
      },
      { source: 'F = 2.00 kg * 9.81 m/s^2   #center', explain: 'On a single line, #center centers just that line (#list and #numbered work too).' },
      {
        source: [
          '@layout.text Discussion {',
          '    The measured acceleration is lower than g sin θ, because',
          '    the ramp isn’t frictionless: $\\mu_k \\approx 0.05$ would explain it.',
          '',
          '    A blank line starts a new paragraph.',
          '}',
        ].join('\n'),
        explain: '@layout.text makes a block of prose: lines join into paragraphs (a blank line starts a new one), $…$ is maths, and nothing is calculated.',
      },
    ],
  },
  {
    id: 'solving',
    title: 'Solving',
    examples: [
      {
        source: 'v = 5.00 m/s\na = 2.00 m/s^2\nd = solve(v^2 = 2*a*d, d)',
        explain: 'solve(equation, unknown) rearranges for the unknown and evaluates it.',
      },
      {
        source: 'm_1 = 3.00 kg\nm_2 = 5.00 kg\ntuple(T, a) = solve(T - m_1 * @g = m_1 * a, m_2 * @g - T = m_2 * a)',
        explain: 'Several unknowns: name them in tuple(…) on the left, and give as many equations. '
          + 'They are solved by substitution, and the working shows each unknown in turn.',
      },
    ],
  },
]

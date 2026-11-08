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
        source: 'area(r) = pi * r^2\nr_1 = 2.0 cm\nA = area(r_1)',
        explain: 'The working shows the variables you passed in (r₁), not the parameter names.',
      },
      {
        source: 'E(n, m to kg, L to m) = n^2 * @h^2 / (8*m*L^2)\nm_e = 9.11e-31 kg\nE_1 = E(1, m_e, 0.100 nm)',
        explain: 'name to unit converts that argument on the way in, so the working shows it in that unit. '
          + 'An argument in the wrong kind of unit, or with no unit, is an error.',
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
    id: 'display',
    title: 'Display commands',
    examples: [
      { source: 'F = 2.00 kg * 9.81 m/s^2   #sym', explain: '#sym shows the equation only.' },
      { source: 'F = 2.00 kg * 9.81 m/s^2   #val', explain: '#val shows the result only.' },
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
        source: 'Assumptions:   #list\n    > The box is one-dimensional\n    > The walls are infinitely high\n        > so ψ = 0 at the walls',
        explain: 'A line ending in : holds the lines indented under it. #list makes them bullets; indent further for a sub-list.',
      },
      {
        source: 'Steps:   #numbered\n    m = 2.00 kg\n    F = m * 9.81 m/s^2',
        explain: '#numbered makes a numbered list. Variables assigned inside stay available afterwards (unlike { } blocks).',
      },
      {
        source: 'Key result:   #center\n    E = 2.00 kg * (3.00e8 m/s)^2',
        explain: '#center centers the lines. The title is optional: “:  #center” on its own works too.',
      },
      { source: 'F = 2.00 kg * 9.81 m/s^2   #center', explain: 'On a single line, #center centers just that line.' },
      {
        source: [
          'Discussion:   #text',
          '    The measured acceleration is lower than g sin θ, because',
          '    the ramp isn’t frictionless: $\\mu_k \\approx 0.05$ would explain it.',
          '',
          '    A blank line starts a new paragraph.',
        ].join('\n'),
        explain: '#text makes a block of prose: lines join into paragraphs (a blank line starts a new one), $…$ is maths, and nothing is calculated.',
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
    ],
  },
]

/**
 * The core's topics of the language tree (tree.ts): each feature, what's said
 * about it, the rules for writing it, and whole sheets showing it, which the
 * Reference tab shows live and the tests check. A module's topics are its own
 * (EngineModule.languageTopics), placed among these.
 */
import {
  EXACT_SETTING, KEYWORD, LINE_COMMAND, LINE_LAYOUT, MULTILINE, NOTATION, PERCENT, UNCERTAINTY_WORDS,
} from '../syntax.ts'
import { TERM_KIND, commandTerm, type LanguageTopic } from './tree.ts'

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
          'A // line is never shown or worked out, wherever it is: in a block, a function, or an @layout.text '
            + 'block (where it doesn\'t split a paragraph).',
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
          'A Greek letter typed into a name stays part of it: ΔE is a variable of its own, while Delta E (with '
            + 'a space) is E\'s uncertainty; both show ΔE.',
          'Type one as \\ and its name, then Tab or a space: \\Delta gives Δ, and the space ends the name, as in '
            + 'LaTeX (\\Delta E types ΔE). Not in headings, prose, @latex, notes or $…$, where \\Delta is LaTeX.',
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
        terms: [
          { kind: TERM_KIND.function, name: 'sqrt', summary: 'Square root', signature: 'sqrt(x)' },
          { kind: TERM_KIND.function, name: 'cbrt', summary: 'Cube root', signature: 'cbrt(x)' },
          { kind: TERM_KIND.function, name: 'nthRoot', summary: 'The nth root', signature: 'nthRoot(x, n)' },
          { kind: TERM_KIND.function, name: 'abs', summary: 'Absolute value', signature: 'abs(x)' },
          { kind: TERM_KIND.function, name: 'exp', summary: 'e to the power x', signature: 'exp(x)' },
          { kind: TERM_KIND.function, name: 'log', summary: 'Natural logarithm (or log(x, base))', signature: 'log(x)' },
          { kind: TERM_KIND.function, name: 'log10', summary: 'Base-10 logarithm', signature: 'log10(x)' },
          { kind: TERM_KIND.function, name: 'log2', summary: 'Base-2 logarithm', signature: 'log2(x)' },
          { kind: TERM_KIND.function, name: 'sin', summary: 'Sine; angles in rad, or with deg', signature: 'sin(θ)' },
          { kind: TERM_KIND.function, name: 'cos', summary: 'Cosine; angles in rad, or with deg', signature: 'cos(θ)' },
          { kind: TERM_KIND.function, name: 'tan', summary: 'Tangent; angles in rad, or with deg', signature: 'tan(θ)' },
          { kind: TERM_KIND.function, name: 'asin', summary: 'Inverse sine, in rad (add to deg)', signature: 'asin(x)' },
          { kind: TERM_KIND.function, name: 'acos', summary: 'Inverse cosine, in rad (add to deg)', signature: 'acos(x)' },
          { kind: TERM_KIND.function, name: 'atan', summary: 'Inverse tangent, in rad (add to deg)', signature: 'atan(x)' },
          { kind: TERM_KIND.function, name: 'atan2', summary: 'Angle of the point (x, y), in rad', signature: 'atan2(y, x)' },
          { kind: TERM_KIND.function, name: 'sinh', summary: 'Hyperbolic sine', signature: 'sinh(x)' },
          { kind: TERM_KIND.function, name: 'cosh', summary: 'Hyperbolic cosine', signature: 'cosh(x)' },
          { kind: TERM_KIND.function, name: 'tanh', summary: 'Hyperbolic tangent', signature: 'tanh(x)' },
          { kind: TERM_KIND.function, name: 'round', summary: 'Round to n decimal places', signature: 'round(x, n)' },
          { kind: TERM_KIND.function, name: 'floor', summary: 'Round down', signature: 'floor(x)' },
          { kind: TERM_KIND.function, name: 'ceil', summary: 'Round up', signature: 'ceil(x)' },
          { kind: TERM_KIND.function, name: 'min', summary: 'Smallest value', signature: 'min(a, b, …)' },
          { kind: TERM_KIND.function, name: 'max', summary: 'Largest value', signature: 'max(a, b, …)' },
          { kind: TERM_KIND.function, name: 'factorial', summary: 'n!', signature: 'factorial(n)' },
          { kind: TERM_KIND.function, name: 'norm', summary: 'Length of a vector or tuple: norm(<3, 4>) = 5', signature: 'norm(r)' },
          { kind: TERM_KIND.function, name: 'dot', summary: 'Dot product of two vectors', signature: 'dot(a, b)' },
          { kind: TERM_KIND.function, name: 'cross', summary: 'Cross product of two 3D vectors', signature: 'cross(a, b)' },
          { kind: TERM_KIND.constant, name: 'pi', summary: 'π ≈ 3.14159' },
          { kind: TERM_KIND.constant, name: 'e', summary: 'Euler’s number ≈ 2.71828' },
          { kind: TERM_KIND.constant, name: 'tau', summary: 'τ = 2π' },
          { kind: TERM_KIND.constant, name: 'phi', summary: 'The golden ratio ≈ 1.61803' },
        ],
        rules: [
          'Everything mathjs has works, except matrices: square brackets make a series, [1.0 s, 2.0 s].',
          'pi, e and the like stay symbols in substitution steps, and so does a variable made only of numbers '
            + 'and them: after theta = pi/4, sin(theta) shows sin(π/4).',
          'sin, cos and tan of exact angles are exact: sin(pi) is 0, sin(30 deg) is 0.5.',
          'A name of your own with a number or subscript is a name of its own: with e1 and e_1 defined, e is '
            + 'still Euler\'s number.',
          'phi and tau are built in too (the golden ratio, 2π): define them before using them as names of your '
            + 'own.',
          'atan2(y, x) takes coordinates with units, as long as they match: atan2(1.0 m, 2.0 m).',
        ],
        examples: [{
          source: [
            'r = 2.00 m',
            'A = pi * r^2',
            'h = sqrt(2 * 9.81 m/s^2 * 1.20 m)',
          ].join('\n'),
        }],
      },
      {
        explain: '@ starts everything built in rather than written in the sheet: constants (@c), the @constants { } '
          + 'block, MathScribe\'s own functions (@tuple, @table, @plot, @solve, …) and namespaces, whose '
          + 'members are written with a dot (@layout.text, @chem.substance). mathjs\'s maths isn\'t (sin, sqrt, '
          + 'norm).',
        rules: [
          'The names of MathScribe\'s functions are free for your own: tuple(a, b) = … defines a function of '
            + 'yours.',
          'Your own constants are @name too, so they can\'t be called layout, chem, constants, or one of '
            + 'MathScribe\'s functions.',
        ],
        examples: [{ source: 'E = @h * @c / 532 nm to eV' }],
      },
      {
        explain: 'Products are written as in a textbook: 1/2 * m * v^2 shows ½mv², 2 * pi * r shows 2πr. Where a '
          + 'number comes next, or a unit ends a factor, a × keeps them apart (2.00 kg × 9.81 m/s²); brackets go '
          + 'only where they\'re needed: a value to a power, (2.0 s)², a negative after another factor, a sum, '
          + 'm(v + u). The Output options can show · in every product.',
        examples: [{
          source: [
            'm = 2.00 kg',
            'v = 3.0 m/s',
            'K = 1/2 * m * v^2',
          ].join('\n'),
        }],
      },
      {
        explain: 'Brackets with others inside them change, as in textbooks: ( ) innermost, then [ ], then ( ) again, '
          + 'so ((a + b) * c)^2 shows [(a + b)c]². A function\'s brackets stay round, and so do a tuple\'s. What '
          + 'you type stays as you wrote it.',
        examples: [{
          source: [
            'a = 1.0 m',
            'b = 2.0 m',
            'c = 3.0',
            'd = ((a + b) * c)^2',
          ].join('\n'),
        }],
      },
      {
        explain: 'Headings. # and ## are numbered, like LaTeX sections. In headings and block titles, a_b is a '
          + 'subscript (write \\_ for a plain underscore) and $…$ is maths.',
        rules: [
          'A line starting with # is always a heading: write // for a comment.',
          'x_{max} takes a subscript of more than one letter.',
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
          'Any expression works: {{2 * m}}, {{delta F}}, {{t[1]}}, {{t.avg}}; and settings ({{x:3}}, {{x:sci}}) and to.',
          'A value is worked out where the text is, so it must be defined above it: one that isn\'t is marked '
            + 'as an error, and left as typed.',
          'Inside $…$, {{…}} is left alone. In the exports, each value is inline maths.',
        ],
        examples: [{
          source: [
            'T = [1.21 s, 1.17 s]',
            '> The mean period was {{T.avg}}.',
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
        explain: 'A name can be shown as words, with a setting in quotes on the name being assigned: n_Na:"Moles of '
          + '{Na^+}" = …. It\'s shown so wherever the variable is: on its own line, in later substitutions and in '
          + 'the exports.',
        rules: [
          'It can hold formulas and values; a value in it is the one when the variable was defined. It '
            + 'combines with the other settings: n:3:"Moles":sci = ….',
          'Subscripts work as in names: m_ball, x_{max}, F_net_x; one starting with a capital letter is a '
            + 'formula, m_{H2O}. $…$ is maths.',
        ],
        examples: [{
          source: [
            'V_s = 25.00 mL',
            'n_X = 0.00120 mol',
            'n_Ca:"Moles of {Ca^2+} in {{V_s}}" = n_X / 6',
          ].join('\n'),
        }],
      },
      {
        explain: 'A line that leaves a ( or [ open carries on over the lines after it, up to the one that closes it, '
          + 'so a long series, @table or @plot (or any call) can list one thing a line.',
        rules: [
          'The lines inside are indented further than the first; the closing bracket can be under the first '
            + 'line. A blank line, or one not indented further, ends it.',
          'A trailing comma before the closing bracket is fine (the formatter takes it out). #commands and '
            + 'notes can go on any of its lines.',
          'The formatter (Ctrl+Shift+F, or saving) lays it out so.',
        ],
        examples: [{
          source: [
            't = [',
            '    1.52 s,',
            '    1.48 s,',
            '    1.55 s',
            ']',
          ].join('\n'),
        }],
      },
      {
        explain: 'Title { … } is a block. Variables assigned inside are local to it.',
        rules: [
          'Indent the lines inside 4 spaces.',
          'Title {  #hide works the whole block out without showing it.',
          'Don\'t end a line with : to start a block: write Title {.',
          'Inside a block you can read everything defined above it, in the blocks around it too.',
          'What\'s assigned inside is gone at its }; a name that\'s outside too is shadowed, and the outer value '
            + 'is as it was.',
          'A block without a title has no title bar: just its lines, in a card.',
          'A block\'s title can be a heading: # Kinematics { titles it as a numbered section, ## Energy { as a '
            + 'subsection. Commands and a note go after the {.',
        ],
        examples: [{
          source: [
            'g = 9.81 m/s^2',
            'Steeper ramp {',
            '    theta = 45.0 deg',
            '    a = g * sin(theta)',
            '}',
          ].join('\n'),
        }, {
          source: [
            '# Kinematics {',
            '    v = 2.0 m/s',
            '    t = 3.0 s',
            '    d = v * t',
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
          'A unit right after a number is always a unit, even where a variable has its name: after m = 2.0 kg, '
            + '3.5 m is metres. To multiply by such a variable, write *; a warning says when a line looks like '
            + 'that mistake.',
          'Micro is u (5.0 um, 2.0 uF), or typed as µ or μ (5.0 µm); μ alone is still a name.',
          'A value you type keeps its unit wherever it\'s shown later: L = 1.00e-10 m stays in m.',
          'Worked-out results are shown in tidy units (N/kg is m/s², kg m/s² is N) with a sensible prefix, '
            + 'none beyond pico and tera; a single unit with a fractional power (Å^-1.5) is kept as it is.',
        ],
        examples: [{ source: 'g = 9.81 m/s^2' }],
      },
      {
        explain: 'to converts to another unit.',
        terms: [
          { kind: TERM_KIND.keyword, name: KEYWORD.to, summary: 'Convert to a unit: v to km/h, or to percent' },
        ],
        rules: [
          'A variable defined with to (a = @a_0 to angstrom) keeps that unit.',
        ],
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
        rules: [
          'A unit that doesn\'t fit is an error (3.0 m can\'t be shown in deg); a plain number takes only an '
            + 'angle unit this way. Uncertainties are converted too.',
        ],
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
        terms: [
          { kind: TERM_KIND.setting, name: PERCENT, summary: 'a unitless result ×100, with %' },
        ],
        rules: [
          'The variable keeps the fraction, so later lines work with it.',
        ],
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
          '× ÷, powers and functions: the fewest sig figs of the inputs. + −: the least precise decimal place '
            + '(12.52 m + 3.1 m = 15.6 m).',
          'Values are kept at full precision and rounded only to be shown, so rounding doesn\'t build up; a '
            + 'substitution step shows each variable to its own sig figs.',
          'Trailing zeros that count show with a decimal point (20., 90.°); where one can\'t show the '
            + 'precision, scientific notation does: 1.50 × 10³.',
          'Sig figs in the Output options can be a number instead of Auto, to show every result to that many.',
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
        rules: [
          'A value with a ± always uses =.',
          'A result of exact inputs isn\'t limited (1/3 ≈ 0.333333): write name:3 = … to choose.',
        ],
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
          'Later lines count it as that many; its value is kept at full precision. It keeps them with a fixed '
            + 'Sig figs setting too.',
          'It\'s that assignment\'s: a later m = … without :n counts as written again.',
          'With a pm uncertainty, the uncertainty sets its precision, and :n is ignored, with a warning.',
          'It works in blocks, function bodies, @constants and with @solve (d:3 = @solve(…, d)).',
          'A function\'s result takes its sig figs from its expression, so a measured number in it carries '
            + 'through.',
        ],
        examples: [{ source: 'third:3 = 1/3' }],
      },
      {
        explain: ':exact shows full precision.',
        terms: [
          { kind: TERM_KIND.setting, name: EXACT_SETTING, summary: 'full precision; never limits a result' },
        ],
        examples: [{ source: 'third:exact = 1/3' }],
      },
      {
        explain: ':sci always shows scientific notation, :dec always plain digits. A variable keeps its notation '
          + 'wherever its value appears; combine with sig figs and units, like E:3:sci:eV.',
        terms: [
          { kind: TERM_KIND.setting, name: NOTATION.sci, summary: 'always scientific notation' },
          { kind: TERM_KIND.setting, name: NOTATION.dec, summary: 'always decimal notation, no powers of ten' },
        ],
        rules: [
          'Without them, numbers are plain digits, and scientific for very large or small values, or where '
            + 'digits can\'t show the precision.',
          ':sci always uses a power of ten (but not × 10⁰); :dec never does, even where its zeros then can\'t '
            + 'show the precision.',
          'It works with uncertainties ((1.50 ± 0.02) × 10³ m), tuples and their unpacked names, and a '
            + 'function\'s result (f(x):sci = …).',
        ],
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
        terms: [
          { kind: TERM_KIND.keyword, name: KEYWORD.pm, summary: 'An uncertainty: 2.0 kg pm 0.1 kg (also ± or +-)' },
        ],
        rules: [
          'Write pm only where a value is defined, never inside a function\'s brackets: it propagates by itself.',
          '(2.0 pm 0.1) kg brackets it; 3.50 m pm 0.05 takes the value\'s unit. A value without pm has none.',
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
        terms: [
          { kind: TERM_KIND.keyword, name: UNCERTAINTY_WORDS[0], summary: 'The uncertainty of a variable: delta F' },
        ],
        rules: [
          'delta F (shown δF) is F\'s uncertainty; on its own line it shows the working of its propagation.',
          'It works through any formula, functions and blocks too.',
          'Correlations are kept: each pm is a source of its own, so in F = m * a then G = F / m, m\'s '
            + 'uncertainty cancels, and m - m has none.',
          'delta and Delta mean an uncertainty only before a defined variable; otherwise they\'re δ and Δ, '
            + 'names like any other (delta = 5 deg). Write delta * x to multiply.',
          'A worked-out uncertainty is given to 1 sig fig (2 if it starts with 1), and its value to the same '
            + 'place: (20 ± 1) N. A declared one keeps the precision typed; with a fixed Sig figs setting, 2 sig '
            + 'figs.',
          'The working\'s derivatives are left out when the formula has a unit written in it or a function of '
            + 'yours, or when its inputs share a source; the result still counts it.',
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
          'A function reads variables from where it\'s defined; one defined in a { } block is only seen in that '
            + 'block.',
          'Units, sig figs and uncertainties carry through a call. A variable the body reads from outside '
            + 'gives its value but not its uncertainty: pass it as a parameter if that matters.',
          'Your function wins over a built-in of the same name: sum(a, b) = ….',
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
          'It\'s typeset with a brace, as piecewise functions are, and the result has the sig figs of the value '
            + 'it came to.',
          '!= and not work too. A comparison on a line of its own shows true or false: ok = sigma < '
            + 'sigma_allow.',
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
        rules: [
          'When the right-hand side is just the call, the line reads K = ½mv² = … (the function\'s expression); '
            + 'a call in a bigger expression is shown as usual.',
          '#sym on the calling line shows the equation without values, #val just the result.',
        ],
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
        rules: [
          'The definition shows the casts: E(n, m [kg], L [m]).',
          'A cast unit can\'t have spaces or brackets in it: write J/mol/K, not J/(mol*K).',
        ],
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
        rules: [
          'The definition says its unit after the equation (… in °); a tuple result takes it on each value.',
          'Settings on the calling line still win: w:2 = ang(y, x).',
        ],
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
      {
        explain: '@inv(x) is 1/x, written as the fraction turned over rather than with ⁻¹: @inv(m / V) is V/m, and a '
          + 'value whose unit is a fraction is turned over whole, so a conversion factor reads flipped, as in '
          + 'factor-label working.',
        rules: [
          'Units, species, sig figs and uncertainty follow as for any division. Zero, or a tuple, has nothing '
            + 'to turn over.',
        ],
        examples: [{
          source: [
            'T = 2.0 s',
            'f = @inv(T)',
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
          'A unit every value shares is written once, after the bracket; values with different units keep '
            + 'their own: (1.41 m, 45.0°).',
          'A display unit (r:cm = …) applies to every value.',
          'A bracketed list, (1, 2), is an error that points to @tuple(1, 2): brackets only group, or call a '
            + 'function.',
          'For now, uncertainties don\'t carry into a tuple\'s values.',
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
        rules: [
          'The right-hand side can be any tuple, a function\'s result too: @tuple(r, theta) = polar(x, y). It '
            + 'works in function bodies.',
          'Each name keeps its settings afterwards.',
        ],
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
        rules: [
          'The rounded value counts as a measured value with that many sig figs, as when a problem says use g '
            + '= 9.81 m/s².',
          'Constants carry units, so conversions work: @R gives litres with to L.',
          'A mistyped name suggests the nearest: @kb, Did you mean @k_B?',
          '@e is the elementary charge and @g standard gravity: they don\'t clash with Euler\'s e, grams, or a g '
            + 'of your own.',
          'The values are CODATA 2018 (exact means exact by definition in the SI). The elements\' molar masses '
            + 'are in @chem.',
        ],
        examples: [{ source: 'E = @h * @c / 532 nm to eV' }],
      },
      {
        explain: '@name:n uses n sig figs here; @name:exact uses full precision.',
        examples: [{ source: 'F = @G:5 * 5.972e24 kg * 70.0 kg / (6.371e6 m)^2' }],
      },
      {
        explain: 'A line with only @name:n sets that constant’s precision for the whole sheet.',
        rules: [
          'It applies to the whole sheet, lines above it and constants defined from it too, and its line shows '
            + 'the value it sets. A use with its own :n still wins; a second declaration is ignored, with a '
            + 'warning. It can go in an @constants { } block.',
        ],
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
        rules: [
          'They\'re usable anywhere as @name, above the block too.',
          'They default to the precision they\'re written with; :n and :exact work as for built-ins.',
          'They can use units, other constants and pm uncertainties, but not the sheet\'s variables: they\'re '
            + 'worked out first.',
          'One with a built-in\'s name takes its place.',
        ],
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
        terms: [
          commandTerm(LINE_COMMAND.sym, 'Show the equation only'),
        ],
        rules: [
          'A command goes before or after the note: F = m * a  #val  # weight is F = m * a  # weight  #val.',
          'Commands combine: #sym #multiline.',
          'On a line that\'s just a name (delta F, t.avg), #sym shows how it\'s worked out (δF = √(…)), and #val '
            + 'its name and value.',
          'Only these words are commands: any other #word (#3) stays part of the note.',
        ],
        examples: [{ source: 'F = 2.00 kg * 9.81 m/s^2   #sym' }],
      },
      {
        explain: '#val shows the result only.',
        terms: [
          commandTerm(LINE_COMMAND.val, 'Show the result only'),
        ],
        examples: [{ source: 'F = 2.00 kg * 9.81 m/s^2   #val' }],
      },
      {
        explain: 'A variable defined with #sym stays a symbol in later lines\' substitution steps (F = k·x = k · 0.150 '
          + 'm), though its value is used in every calculation; in a function\'s working too, and for a #sym '
          + 'block\'s variables.',
        rules: [
          'Defining it again without #sym brings its value back into substitutions.',
        ],
        examples: [{
          source: [
            'k = 4.0 N/m * 2   #sym',
            'x = 0.150 m',
            'F = k * x',
          ].join('\n'),
        }],
      },
      {
        explain: '#sci shows the result in scientific notation, #dec in plain digits: for a line with no name to put '
          + ':sci on, or a whole block.',
        terms: [
          commandTerm(NOTATION.sci, 'Results in scientific notation (on a line, or every line in a block)'),
          commandTerm(NOTATION.dec, 'Results in plain decimal digits, no powers of ten (on a line, or every line in a block)'),
        ],
        rules: [
          'They only change how the line is shown: the variable doesn\'t keep the notation (write x:sci = … for '
            + 'that).',
          'A name\'s own :sci or :dec beats the line\'s command, which beats a variable\'s own notation, which '
            + 'beats the block\'s.',
        ],
        examples: [{
          source: [
            'p = 0.0707',
            'p^2   #sci',
          ].join('\n'),
        }],
      },
      {
        explain: '#hide calculates the line but doesn’t show it.',
        terms: [
          commandTerm(LINE_COMMAND.hide, 'Calculate, but don’t show the line or block'),
        ],
        rules: [
          'Hidden lines and blocks are left out of the exports too, but their variables can still be used. A '
            + 'hidden line with an error is shown anyway.',
        ],
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
        terms: [
          commandTerm(MULTILINE, 'Each = on its own row, lined up'),
        ],
        rules: [
          'A line with only one = left to show stays on one line.',
        ],
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
        terms: [
          commandTerm(LINE_COMMAND.full, 'Show everything (the default; overrides a block’s command)'),
        ],
        rules: [
          'It applies to the blocks inside too; #hide on a block hides all of it.',
          'To give some lines a command without scoping their variables, use an @layout block: @layout.val {, '
            + '@layout.hidden {.',
        ],
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
        rules: [
          'Indent further for a sub-list; anywhere else, indenting the lines inside is for reading only.',
          'A layout block only arranges lines: what\'s assigned inside stays available after it (a Title { } '
            + 'block scopes it).',
          'Its title is optional. A note after the opener shows beside the title, and display commands on the '
            + 'opener apply to the lines inside.',
          'In the LaTeX export, lists are itemize and enumerate (each calculation inline beside its marker), '
            + 'and centred blocks center.',
        ],
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
        explain: '@layout.list(1) numbers the list instead: its brackets hold how the first item is marked. (1) '
          + 'numbers it 1, 2, 3; (a) and (A) letter it a, b, c or A, B, C; (i) and (I) use roman numerals.',
        rules: [
          'A numbered list\'s sub-lists are numbered too: under 1 they\'re a; under a or A, i; under i or I, 1.',
          'Without brackets the list is bulleted, and so are its sub-lists.',
          'Variables assigned inside stay available afterwards (unlike Title { } blocks).',
        ],
        examples: [{
          source: [
            '@layout.list(1) Steps {',
            '    m = 2.00 kg',
            '    F = m * 9.81 m/s^2',
            '        > the weight, pulling down',
            '}',
          ].join('\n'),
        }, {
          source: [
            '@layout.list(a) Parts {',
            '    > Find the mass',
            '    > Find the weight',
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
        rules: [
          'Its lines are prose (no >, nothing worked out; {{values}} and $…$ work), each a line of its own; a '
            + 'blank line leaves a gap.',
          'A title on the opener (@layout.titlepage Lab 3 {) is the title instead, and every line inside goes '
            + 'under it.',
          'In the exports it\'s a page of its own; in the Rendered tab a dashed line marks where the page ends.',
        ],
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
          + 'do on a line. Members combine (@layout.list(1).val); a line’s own command still wins.',
        rules: [
          'Members combine in any order: a layout with display settings (@layout.list(1).val), or display '
            + 'settings alone (@layout.val.multiline).',
          'Some can\'t both apply, and are warned of: of two layouts the first is used; of two of .sym, .val '
            + 'and .full (or .sci and .dec) the last; on prose only .hidden does anything.',
          'The members win over #commands on the opener.',
        ],
        examples: [{
          source: [
            '@layout.val.multiline Results {',
            '    F = 2.00 kg * 9.81 m/s^2',
            '    p = 2.00 kg * 3.00 m/s   #full',
            '}',
          ].join('\n'),
        }, {
          source: [
            'm = 2.00 kg',
            '@layout.sym.multiline Formulas {',
            '    F = m * 9.81 m/s^2',
            '}',
            '@layout.full.sci Results {',
            '    N = 6.02e23 * 2.00',
            '}',
            '@layout.dec {',
            '    lambda = 5.32e-7 m',
            '}',
          ].join('\n'),
        }],
      },
      {
        explain: 'On a single line, #center centers just that line; #list makes it a bullet, and #list(1), #list(a) '
          + 'and so on a numbered item, marked as @layout.list(1) marks them.',
        terms: [
          commandTerm(LINE_LAYOUT.center, 'Center the line (for a block of lines: @layout.center { })'),
          commandTerm(LINE_LAYOUT.list, 'The line as a bullet, or #list(1), #list(a) a numbered item (for a block of lines: @layout.list { })'),
        ],
        examples: [{ source: 'F = 2.00 kg * 9.81 m/s^2   #center' }, { source: 'F = 2.00 kg * 9.81 m/s^2   #list(a)' }],
      },
      {
        explain: '@layout.text makes a block of prose: lines join into paragraphs (a blank line starts a new one), $…$ '
          + 'is maths, and nothing is calculated.',
        rules: [
          'Nothing in it is worked out: a line that looks like a calculation or a heading is just text.',
        ],
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
      {
        explain: '@layout.column sets the lines inside side by side in columns: a blank line starts the next '
          + 'column, and each block inside is a column of its own. A row has up to 4; @layout.column(n) sets n a '
          + 'row (2 to 4). With no breaks, the lines are shared out evenly. It combines with a layout, which then '
          + 'applies within each column: @layout.column(3).list(1).',
        rules: [
          'Each block inside (a Title { } block, another layout block, @constants) is a column of its own, '
            + 'whatever blank lines are in it.',
          'A numbered list\'s count carries on from column to column. In .text prose, where a blank line starts '
            + 'a paragraph, two start a column.',
          'In the exports each column is a minipage (LaTeX) or a borderless table\'s cell (Word), and a long '
            + 'equation goes one = per row sooner.',
        ],
        examples: [{
          source: [
            '@layout.column Givens {',
            '    m = 2.00 kg',
            '    g_0 = 9.81 m/s^2',
            '',
            '    theta = 30.0 deg',
            '    d = 3.50 m',
            '}',
          ].join('\n'),
        }, {
          source: [
            'm = 2.00 kg',
            'g_0 = 9.81 m/s^2',
            'theta = 30.0 deg',
            '@layout.column {',
            '    Forces {',
            '        F_g = m * g_0',
            '    }',
            '    Motion {',
            '        a = g_0 * sin(theta)',
            '    }',
            '}',
          ].join('\n'),
        }],
      },
    ],
  },
]

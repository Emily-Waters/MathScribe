/**
 * The Library tab: common equations from first-year physics and general
 * chemistry, each as a one-line MathScribe function you can insert into the
 * sheet. Inserted, it's ordinary text: its working shows in the output, and
 * you can rename or change it. Each entry's example is evaluated live by the
 * real engine, as in the Reference tab.
 */

export interface LibrarySymbol {
  /** As written in MathScribe (`v_0`); shown typeset. */
  name: string
  meaning: string
  /** Typical unit, for the legend. */
  unit?: string
}

export interface LibraryEntry {
  id: string
  title: string
  /** The function, one line, exactly as inserted. */
  source: string
  /** Lines that use it, shown (not inserted) as a worked example. */
  example: string
  symbols: LibrarySymbol[]
  /** When it applies, or what to watch out for. */
  note?: string
  /** Extra words to find it by in the search. */
  keywords?: string
}

export interface LibraryTopic {
  id: string
  title: string
  subject: 'Physics' | 'Chemistry'
  entries: LibraryEntry[]
}

/** A symbol for an entry’s key. */
const s = (name: string, meaning: string, unit?: string): LibrarySymbol => ({ name, meaning, unit })

/** The equations, by topic. */
export const LIBRARY: LibraryTopic[] = [
  // -------------------------------------------------------------------------
  // Physics
  // -------------------------------------------------------------------------
  {
    id: 'kinematics',
    title: 'Kinematics',
    subject: 'Physics',
    entries: [
      {
        id: 'velocity',
        title: 'Velocity after a time',
        source: 'velocity(v_0, a, t) = v_0 + a * t',
        example: 'v = velocity(0 m/s, 9.81 m/s^2, 2.50 s)',
        symbols: [s('v_0', 'initial velocity', 'm/s'), s('a', 'acceleration', 'm/s²'), s('t', 'time', 's')],
        note: 'Constant acceleration.',
        keywords: 'suvat v = u + at',
      },
      {
        id: 'displacement',
        title: 'Displacement after a time',
        source: 'displacement(v_0, a, t) = v_0 * t + 1/2 * a * t^2',
        example: 's = displacement(5.0 m/s, 2.0 m/s^2, 3.0 s)',
        symbols: [s('v_0', 'initial velocity', 'm/s'), s('a', 'acceleration', 'm/s²'), s('t', 'time', 's')],
        note: 'Constant acceleration.',
        keywords: 'suvat s = ut + 1/2 at^2 distance position',
      },
      {
        id: 'vfinal',
        title: 'Speed after a distance',
        source: 'vfinal(v_0, a, s) = sqrt(v_0^2 + 2 * a * s)',
        example: 'v = vfinal(0 m/s, 9.81 m/s^2, 20.0 m)',
        symbols: [s('v_0', 'initial speed', 'm/s'), s('a', 'acceleration', 'm/s²'), s('s', 'displacement', 'm')],
        note: 'Constant acceleration: v² = v₀² + 2as.',
        keywords: 'suvat v^2 = u^2 + 2as free fall',
      },
      {
        id: 'projrange',
        title: 'Range of a projectile',
        source: 'projrange(v_0, theta) = v_0^2 * sin(2 * theta) / @g',
        example: 'R = projrange(20.0 m/s, 35.0 deg)',
        symbols: [s('v_0', 'launch speed', 'm/s'), s('theta', 'launch angle', '° or rad')],
        note: 'Level ground, no air resistance.',
        keywords: 'projectile range distance launch',
      },
    ],
  },
  {
    id: 'forces',
    title: 'Forces',
    subject: 'Physics',
    entries: [
      {
        id: 'weight',
        title: 'Weight',
        source: 'weight(m) = m * @g',
        example: 'W = weight(70.0 kg)',
        symbols: [s('m', 'mass', 'kg')],
        note: 'Near Earth’s surface.',
        keywords: 'gravity force mg',
      },
      {
        id: 'friction',
        title: 'Friction',
        source: 'friction(mu, N) = mu * N',
        example: 'f = friction(0.300, 686 N)',
        symbols: [s('mu', 'coefficient of friction (static or kinetic)'), s('N', 'normal force', 'N')],
        keywords: 'friction coefficient normal force',
      },
      {
        id: 'centripetal',
        title: 'Centripetal force',
        source: 'centripetal(m, v, r) = m * v^2 / r',
        example: 'F_c = centripetal(1.20 kg, 4.00 m/s, 0.800 m)',
        symbols: [s('m', 'mass', 'kg'), s('v', 'speed', 'm/s'), s('r', 'radius', 'm')],
        note: 'Uniform circular motion.',
        keywords: 'circular motion mv^2/r',
      },
      {
        id: 'gravity',
        title: 'Newton’s law of gravitation',
        source: 'gravity(m_1, m_2, r) = @G * m_1 * m_2 / r^2',
        example: 'F = gravity(5.97e24 kg, 70.0 kg, 6.37e6 m)',
        symbols: [s('m_1', 'first mass', 'kg'), s('m_2', 'second mass', 'kg'), s('r', 'distance between centres', 'm')],
        keywords: 'gravitational force Gmm/r^2',
      },
      {
        id: 'spring',
        title: 'Hooke’s law',
        source: 'spring(k, x) = k * x',
        example: 'F = spring(250. N/m, 0.040 m)',
        symbols: [s('k', 'spring constant', 'N/m'), s('x', 'extension', 'm')],
        note: 'Size of the force; it acts against the extension.',
        keywords: 'spring hooke force kx',
      },
    ],
  },
  {
    id: 'energy',
    title: 'Energy, work and momentum',
    subject: 'Physics',
    entries: [
      {
        id: 'KE',
        title: 'Kinetic energy',
        source: 'KE(m, v) = 1/2 * m * v^2',
        example: 'E_k = KE(2.00 kg, 3.00 m/s)',
        symbols: [s('m', 'mass', 'kg'), s('v', 'speed', 'm/s')],
        keywords: 'kinetic energy 1/2 mv^2',
      },
      {
        id: 'PE',
        title: 'Gravitational potential energy',
        source: 'PE(m, h) = m * @g * h',
        example: 'E_p = PE(2.00 kg, 1.50 m)',
        symbols: [s('m', 'mass', 'kg'), s('h', 'height', 'm')],
        note: 'Near Earth’s surface.',
        keywords: 'potential energy mgh',
      },
      {
        id: 'elastic',
        title: 'Elastic potential energy',
        source: 'elastic(k, x) = 1/2 * k * x^2',
        example: 'E = elastic(250. N/m, 0.040 m)',
        symbols: [s('k', 'spring constant', 'N/m'), s('x', 'extension', 'm')],
        keywords: 'spring energy 1/2 kx^2',
      },
      {
        id: 'work',
        title: 'Work',
        source: 'work(F, d, theta) = F * d * cos(theta)',
        example: 'W = work(50.0 N, 3.00 m, 30.0 deg)',
        symbols: [s('F', 'force', 'N'), s('d', 'displacement', 'm'), s('theta', 'angle between them', '° or rad')],
        keywords: 'work done Fd cos',
      },
      {
        id: 'power',
        title: 'Power',
        source: 'power(W, t) = W / t',
        example: 'P = power(1500. J, 12.0 s)',
        symbols: [s('W', 'work or energy', 'J'), s('t', 'time', 's')],
        keywords: 'power energy per time watts',
      },
      {
        id: 'momentum',
        title: 'Momentum',
        source: 'momentum(m, v) = m * v',
        example: 'p = momentum(0.160 kg, 25.0 m/s)',
        symbols: [s('m', 'mass', 'kg'), s('v', 'velocity', 'm/s')],
        keywords: 'momentum mv',
      },
      {
        id: 'impulse',
        title: 'Impulse',
        source: 'impulse(F, t) = F * t',
        example: 'J = impulse(400. N, 0.0100 s)',
        symbols: [s('F', 'average force', 'N'), s('t', 'time it acts', 's')],
        note: 'Equal to the change in momentum.',
        keywords: 'impulse change in momentum Ft',
      },
    ],
  },
  {
    id: 'oscillation',
    title: 'Rotation and oscillation',
    subject: 'Physics',
    entries: [
      {
        id: 'torque',
        title: 'Torque',
        source: 'torque(r, F, theta):N*m = r * F * sin(theta)',
        example: 'tau = torque(0.300 m, 40.0 N, 90.0 deg)',
        symbols: [s('r', 'distance from the pivot', 'm'), s('F', 'force', 'N'), s('theta', 'angle between r and F', '° or rad')],
        keywords: 'torque moment rF sin',
      },
      {
        id: 'Tspring',
        title: 'Period of a mass on a spring',
        source: 'Tspring(m, k) = 2 * pi * sqrt(m / k)',
        example: 'T = Tspring(0.500 kg, 200. N/m)',
        symbols: [s('m', 'mass', 'kg'), s('k', 'spring constant', 'N/m')],
        note: 'Simple harmonic motion.',
        keywords: 'period oscillation spring shm',
      },
      {
        id: 'Tpendulum',
        title: 'Period of a pendulum',
        source: 'Tpendulum(L) = 2 * pi * sqrt(L / @g)',
        example: 'T = Tpendulum(1.00 m)',
        symbols: [s('L', 'length', 'm')],
        note: 'Small swings (under about 15°).',
        keywords: 'period pendulum shm',
      },
    ],
  },
  {
    id: 'waves',
    title: 'Waves and optics',
    subject: 'Physics',
    entries: [
      {
        id: 'wavespeed',
        title: 'Wave speed',
        source: 'wavespeed(f, lambda) = f * lambda',
        example: 'v = wavespeed(440. Hz, 0.780 m)',
        symbols: [s('f', 'frequency', 'Hz'), s('lambda', 'wavelength', 'm')],
        keywords: 'wave speed frequency wavelength v = f lambda',
      },
      {
        id: 'snell',
        title: 'Snell’s law (angle of refraction)',
        source: 'snell(n_1, theta_1, n_2):deg = asin(n_1 * sin(theta_1) / n_2)',
        example: 'theta_2 = snell(1.00, 30.0 deg, 1.33)',
        symbols: [
          s('n_1', 'refractive index the light comes from'), s('theta_1', 'angle of incidence', '° or rad'),
          s('n_2', 'refractive index it goes into'),
        ],
        note: 'Angles from the normal. The result is in degrees.',
        keywords: 'refraction snell index angle',
      },
      {
        id: 'thinlens',
        title: 'Thin lens (image distance)',
        source: 'thinlens(f, d_o) = 1 / (1/f - 1/d_o)',
        example: 'd_i = thinlens(10.0 cm, 30.0 cm)',
        symbols: [s('f', 'focal length', 'm'), s('d_o', 'object distance', 'm')],
        note: '1/f = 1/dₒ + 1/dᵢ, real-is-positive: a negative result is a virtual image.',
        keywords: 'lens mirror focal length image object',
      },
    ],
  },
  {
    id: 'electricity',
    title: 'Electricity',
    subject: 'Physics',
    entries: [
      {
        id: 'current',
        title: 'Ohm’s law (current)',
        source: 'current(V, R) = V / R',
        example: 'I = current(9.00 V, 220. ohm)',
        symbols: [s('V', 'voltage', 'V'), s('R', 'resistance', 'Ω (ohm)')],
        keywords: 'ohm current voltage resistance V = IR',
      },
      {
        id: 'elpower',
        title: 'Electrical power',
        source: 'elpower(V, I) = V * I',
        example: 'P = elpower(12.0 V, 1.50 A)',
        symbols: [s('V', 'voltage', 'V'), s('I', 'current', 'A')],
        keywords: 'power P = VI watts',
      },
      {
        id: 'parallel',
        title: 'Two resistors in parallel',
        source: 'parallel(R_1, R_2) = 1 / (1/R_1 + 1/R_2)',
        example: 'R = parallel(100. ohm, 220. ohm)',
        symbols: [s('R_1', 'first resistance', 'Ω'), s('R_2', 'second resistance', 'Ω')],
        note: 'In series, they just add: R₁ + R₂.',
        keywords: 'resistors parallel series combined resistance',
      },
      {
        id: 'coulomb',
        title: 'Coulomb’s law',
        source: 'coulomb(q_1, q_2, r) = @k_e * q_1 * q_2 / r^2',
        example: 'F = coulomb(2.0e-6 C, -3.0e-6 C, 0.050 m)',
        symbols: [s('q_1', 'first charge', 'C'), s('q_2', 'second charge', 'C'), s('r', 'distance', 'm')],
        note: 'Negative: the charges attract.',
        keywords: 'electric force charges coulomb',
      },
      {
        id: 'capenergy',
        title: 'Energy in a capacitor',
        source: 'capenergy(C, V) = 1/2 * C * V^2',
        example: 'E = capenergy(470e-6 F, 12.0 V)',
        symbols: [s('C', 'capacitance', 'F'), s('V', 'voltage', 'V')],
        keywords: 'capacitor energy 1/2 CV^2',
      },
    ],
  },
  {
    id: 'heat',
    title: 'Heat',
    subject: 'Physics',
    entries: [
      {
        id: 'heat',
        title: 'Heat to change temperature',
        source: 'heat(m, c, dT) = m * c * dT',
        example: 'Q = heat(0.250 kg, 4186 J/(kg K), 15.0 K)',
        symbols: [s('m', 'mass', 'kg'), s('c', 'specific heat capacity', 'J/(kg·K)'), s('dT', 'temperature change', 'K')],
        note: 'Write the change in K (a change of 1 K is a change of 1 °C). Also calorimetry: q = mcΔT.',
        keywords: 'specific heat capacity calorimetry q = mc delta T',
      },
      {
        id: 'radiated',
        title: 'Power radiated (Stefan–Boltzmann)',
        source: 'radiated(eps, A, T to K) = eps * @sigma * A * T^4',
        example: 'P = radiated(0.95, 1.80 m^2, 34.0 degC)',
        symbols: [s('eps', 'emissivity (1 for a black body)'), s('A', 'surface area', 'm²'), s('T', 'temperature (converted to K)', 'K or °C')],
        keywords: 'radiation black body stefan boltzmann',
      },
    ],
  },
  {
    id: 'modern',
    title: 'Modern physics',
    subject: 'Physics',
    entries: [
      {
        id: 'photon',
        title: 'Photon energy',
        source: 'photon(lambda) = @h * @c / lambda',
        example: 'E = photon(532 nm) to eV',
        symbols: [s('lambda', 'wavelength', 'm')],
        note: 'Use to eV for electronvolts.',
        keywords: 'photon energy hc/lambda planck light',
      },
      {
        id: 'debroglie',
        title: 'de Broglie wavelength',
        source: 'debroglie(m, v) = @h / (m * v)',
        example: 'lambda = debroglie(@m_e, 2.00e6 m/s) to nm',
        symbols: [s('m', 'mass', 'kg'), s('v', 'speed', 'm/s')],
        keywords: 'de broglie wavelength matter wave h/p',
      },
      {
        id: 'hydrogen',
        title: 'Hydrogen energy levels',
        source: 'hydrogen(n) = -13.6 eV / n^2',
        example: 'E_2 = hydrogen(2)\ndE = hydrogen(3) - hydrogen(2)',
        symbols: [s('n', 'principal quantum number (1, 2, 3, …)')],
        note: 'Bohr model.',
        keywords: 'bohr hydrogen atom energy level transition',
      },
      {
        id: 'decay',
        title: 'Radioactive decay',
        source: 'decay(N_0, t, t_half) = N_0 * 2^(-t / t_half)',
        example: 'N = decay(1000, 10.0 days, 8.02 days)',
        symbols: [s('N_0', 'starting amount'), s('t', 'time', 's'), s('t_half', 'half-life', 's')],
        keywords: 'half life radioactive decay exponential',
      },
      {
        id: 'lorentz',
        title: 'Lorentz factor',
        source: 'lorentz(v) = 1 / sqrt(1 - v^2 / @c^2)',
        example: 'gam = lorentz(0.800 * @c:exact)',
        symbols: [s('v', 'speed', 'm/s')],
        note: 'Time dilation Δt = γΔt₀, length contraction L = L₀/γ.',
        keywords: 'relativity gamma time dilation length contraction',
      },
    ],
  },

  // -------------------------------------------------------------------------
  // Chemistry
  // -------------------------------------------------------------------------
  {
    id: 'moles',
    title: 'Moles and solutions',
    subject: 'Chemistry',
    entries: [
      {
        id: 'moles',
        title: 'Moles from mass',
        source: 'moles(m, M) = m / M',
        example: 'n = moles(5.00 g, 18.02 g/mol)',
        symbols: [s('m', 'mass', 'g'), s('M', 'molar mass', 'g/mol')],
        keywords: 'moles mass molar mass n = m/M stoichiometry',
      },
      {
        id: 'mass',
        title: 'Mass from moles',
        source: 'mass(n, M):g = n * M',
        example: 'm = mass(0.150 mol, 58.44 g/mol)',
        symbols: [s('n', 'amount', 'mol'), s('M', 'molar mass', 'g/mol')],
        keywords: 'mass moles molar mass stoichiometry',
      },
      {
        id: 'particles',
        title: 'Number of particles',
        source: 'particles(n) = n * @N_A',
        example: 'N = particles(0.250 mol)',
        symbols: [s('n', 'amount', 'mol')],
        keywords: 'avogadro particles molecules atoms',
      },
      {
        id: 'conc',
        title: 'Concentration (molarity)',
        source: 'conc(n, V):mol/L = n / V',
        example: 'c = conc(0.150 mol, 250. mL)',
        symbols: [s('n', 'amount of solute', 'mol'), s('V', 'volume of solution', 'L or mL')],
        note: 'The result is in mol/L (M).',
        keywords: 'concentration molarity molar solution',
      },
      {
        id: 'dilute',
        title: 'Dilution',
        source: 'dilute(c_1, V_1, V_2):mol/L = c_1 * V_1 / V_2',
        example: 'c_2 = dilute(2.00 mol/L, 25.0 mL, 250. mL)',
        symbols: [s('c_1', 'starting concentration', 'mol/L'), s('V_1', 'volume taken', 'mL'), s('V_2', 'final volume', 'mL')],
        note: 'c₁V₁ = c₂V₂.',
        keywords: 'dilution c1v1 = c2v2 concentration',
      },
      {
        id: 'percentyield',
        title: 'Percent yield',
        source: 'percentyield(actual, theoretical) = actual / theoretical * 100',
        example: 'Y = percentyield(4.12 g, 4.85 g)',
        symbols: [s('actual', 'amount obtained'), s('theoretical', 'amount expected')],
        note: 'Both in the same kind of unit (g, or mol).',
        keywords: 'yield percent stoichiometry',
      },
      {
        id: 'pH',
        title: 'pH',
        source: 'pH(c_H to mol/L) = -log10(c_H / (mol/L))',
        example: 'p = pH(3.20e-4 mol/L)',
        symbols: [s('c_H', 'concentration of H⁺ (H₃O⁺)', 'mol/L')],
        keywords: 'ph acid hydrogen ion concentration log',
      },
    ],
  },
  {
    id: 'gases',
    title: 'Gases',
    subject: 'Chemistry',
    entries: [
      {
        id: 'pressure',
        title: 'Ideal gas law (pressure)',
        source: 'pressure(n, T to K, V):kPa = n * @R * T / V',
        example: 'P = pressure(0.500 mol, 25.0 degC, 10.0 L)',
        symbols: [s('n', 'amount', 'mol'), s('T', 'temperature (converted to K)', 'K or °C'), s('V', 'volume', 'L')],
        note: 'PV = nRT. The result is in kPa.',
        keywords: 'ideal gas law pv = nrt pressure',
      },
      {
        id: 'gasmoles',
        title: 'Ideal gas law (moles)',
        source: 'gasmoles(P, V, T to K):mol = P * V / (@R * T)',
        example: 'n = gasmoles(101.3 kPa, 2.00 L, 20.0 degC)',
        symbols: [s('P', 'pressure', 'kPa or atm'), s('V', 'volume', 'L'), s('T', 'temperature (converted to K)', 'K or °C')],
        note: 'PV = nRT, solved for n.',
        keywords: 'ideal gas law pv = nrt moles amount',
      },
      {
        id: 'combined',
        title: 'Combined gas law (new pressure)',
        source: 'combined(P_1, V_1, T_1 to K, V_2, T_2 to K):kPa = P_1 * V_1 * T_2 / (T_1 * V_2)',
        example: 'P_2 = combined(100. kPa, 2.00 L, 20.0 degC, 1.50 L, 80.0 degC)',
        symbols: [
          s('P_1', 'starting pressure', 'kPa'), s('V_1', 'starting volume', 'L'), s('T_1', 'starting temperature', 'K or °C'),
          s('V_2', 'new volume', 'L'), s('T_2', 'new temperature', 'K or °C'),
        ],
        note: 'P₁V₁/T₁ = P₂V₂/T₂, for a fixed amount of gas. Boyle’s and Charles’s laws are special cases.',
        keywords: 'combined gas law boyle charles',
      },
    ],
  },
  {
    id: 'thermochemistry',
    title: 'Thermochemistry and electrochemistry',
    subject: 'Chemistry',
    entries: [
      {
        id: 'gibbs',
        title: 'Gibbs free energy',
        source: 'gibbs(dH, T to K, dS) = dH - T * dS',
        example: 'dG = gibbs(-92.2 kJ/mol, 25.0 degC, -198.7 J/(mol K)) to kJ/mol',
        symbols: [s('dH', 'enthalpy change', 'kJ/mol'), s('T', 'temperature (converted to K)', 'K or °C'), s('dS', 'entropy change', 'J/(mol·K)')],
        note: 'ΔG = ΔH − TΔS; negative means spontaneous.',
        keywords: 'gibbs free energy enthalpy entropy spontaneous',
      },
      {
        id: 'nernst',
        title: 'Nernst equation',
        source: 'nernst(E_0, n, Q, T to K) = E_0 - @R * T / (n * @F) * log(Q)',
        example: 'E = nernst(1.10 V, 2, 0.010, 25.0 degC)',
        symbols: [
          s('E_0', 'standard cell potential', 'V'), s('n', 'electrons transferred'), s('Q', 'reaction quotient'),
          s('T', 'temperature (converted to K)', 'K or °C'),
        ],
        keywords: 'nernst cell potential electrochemistry',
      },
    ],
  },
  {
    id: 'kinetics',
    title: 'Kinetics and spectroscopy',
    subject: 'Chemistry',
    entries: [
      {
        id: 'firstorder',
        title: 'First-order reaction',
        source: 'firstorder(c_0, k, t):mol/L = c_0 * exp(-k * t)',
        example: 'c = firstorder(0.100 mol/L, 0.0350 1/s, 30.0 s)',
        symbols: [s('c_0', 'starting concentration', 'mol/L'), s('k', 'rate constant', '1/s'), s('t', 'time', 's')],
        keywords: 'first order kinetics rate integrated rate law',
      },
      {
        id: 'halflife',
        title: 'First-order half-life',
        source: 'halflife(k) = log(2) / k',
        example: 't_half = halflife(0.0350 1/s)',
        symbols: [s('k', 'rate constant', '1/s')],
        keywords: 'half life first order kinetics',
      },
      {
        id: 'arrhenius',
        title: 'Arrhenius equation',
        source: 'arrhenius(A, E_a, T to K):s^-1 = A * exp(-E_a / (@R * T))',
        example: 'k = arrhenius(1.0e10 1/s, 50.0 kJ/mol, 37.0 degC)',
        symbols: [s('A', 'pre-exponential factor', '1/s'), s('E_a', 'activation energy', 'kJ/mol'), s('T', 'temperature (converted to K)', 'K or °C')],
        keywords: 'arrhenius activation energy rate constant temperature',
      },
      {
        id: 'absorbance',
        title: 'Beer–Lambert law',
        source: 'absorbance(eps, b, c) = eps * b * c',
        example: 'A = absorbance(1.20e4 L/(mol cm), 1.00 cm, 2.5e-5 mol/L)',
        symbols: [s('eps', 'molar absorptivity', 'L/(mol·cm)'), s('b', 'path length', 'cm'), s('c', 'concentration', 'mol/L')],
        keywords: 'beer lambert absorbance spectroscopy',
      },
    ],
  },
]

/** The function's name, from its source line. */
export const entryName = (e: LibraryEntry) => /^[A-Za-z]\w*/.exec(e.source)![0]

/** Entries whose title, name, symbols or keywords contain every word of the query. */
export function searchLibrary(query: string): LibraryTopic[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (!words.length) return LIBRARY
  return LIBRARY.map((t) => ({
    ...t,
    entries: t.entries.filter((e) => {
      const hay = [t.title, t.subject, e.title, e.source, e.note ?? '', e.keywords ?? '',
        ...e.symbols.map((x) => `${x.name} ${x.meaning}`)].join(' ').toLowerCase()
      return words.every((w) => hay.includes(w))
    }),
  })).filter((t) => t.entries.length)
}

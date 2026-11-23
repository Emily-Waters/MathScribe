/** The example sheet shown the first time MathScribe opens. */
export const SAMPLE = `# Block sliding down a ramp
> A block is released from rest on a frictionless incline.

m = 2.00 kg             // mass of block
g = 9.81 m/s^2          // gravitational acceleration
theta = 30.0 deg pm 0.5 deg // incline angle, measured
d = 3.50 m pm 0.02 m    // length of ramp, measured

## Forces
F_g = m * g             // weight
F_par = F_g * sin(theta) // component along the ramp
a = F_par / m           // acceleration

## Motion
v_f = sqrt(2 * a * d)   // speed at the bottom
t = v_f / a             // time on the ramp
E_k = 1/2 * m * v_f^2   // kinetic energy at the bottom
v_f to km/h

## Uncertainty
> Values with pm carry an uncertainty; results combine them in quadrature.
delta v_f =             // how the uncertainty in v_f is worked out
delta v_f / v_f         // relative uncertainty

## Repeated measurements
> A series is measurements under one name: t_down.avg is their mean ± σ/√n.
t_down = [1.21 s, 1.17 s, 1.24 s, 1.19 s]
t_down.avg                   // mean time down the ramp
t_down.count
a_exp = 2 * d / t_down.avg^2 // measured acceleration, with uncertainty

## Functions
> A function is written the way it is in maths; values and uncertainties flow through it.
KE(mass, speed) = 1/2 * mass * speed^2
E_bottom = KE(m, v_f)   // same as E_k above
p(mass, speed) = mass * speed
p_bottom = p(m, v_f)

## Constants
> Built-in constants start with @ (3 sig figs unless you write @name:n or @name:exact).
@constants {
    rho_w = 998 kg/m^3  // water at 20 °C
}
P_water = @rho_w * @g * 0.250 m to kPa  // pressure 25 cm under water
E_photon = @h * @c / 532 nm to eV       // green laser photon

## Solving
> @solve(equation, unknown) rearranges the equation and evaluates the result.
d_stop = @solve(v_f^2 = 2*a*d_stop, d_stop)    // ramp length needed to reach v_f
h0 = 2.00 m
t_fall = @solve(h0 = 1/2*@g*t_fall^2 + v_f*t_fall, t_fall)  // quadratic: positive root

## What if?
> Variables assigned inside a block are local to it, like a scoped block in code.
Steeper ramp {          // outer values are readable, and can be shadowed
  theta = 45 deg        // 2 sig figs, so results here have 2
  a = g * sin(theta)
  v_f = sqrt(2 * a * d)
}
v_f                     // unchanged outside the block
`

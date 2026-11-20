/**
 * Templates: the start of a kind of document, for "New from template" (the
 * Template menu beside New): its sections in order, with a little of each
 * filled in as an example of what goes there, to write over. Each works out as
 * it is (a test checks), so a new sheet starts without errors.
 */

/** A template: its name (a new sheet's), what it's for, and its text. */
export interface Template {
  readonly name: string
  readonly description: string
  readonly source: string
}

/** A lab report: title page, purpose, method, data, calculations, results, discussion and conclusion. */
const LAB_REPORT = `@layout.titlepage {
    Lab 1: Title of the experiment
    Your name
    Course, section
    Date
}

# Purpose
> What the experiment sets out to find, in a sentence or two.

# Method
@layout.numbered Procedure {
    > Set up the apparatus.
    > Take each reading three times.
    > Record each with its uncertainty.
}

# Data
> Each measurement, with its uncertainty (pm).
t_1 = 0.50 s pm 0.02 s
t_2 = 1.00 s pm 0.02 s
t_3 = 1.50 s pm 0.02 s
x_1 = 0.61 m pm 0.01 m
x_2 = 1.24 m pm 0.01 m
x_3 = 1.83 m pm 0.01 m
@table(t, x; title "Measurements")

# Calculations
@table(t, x, v = x / t; title "Speeds")
v_avg                    # mean speed

# Results
p = @plot(t, x; fit linear, title "Distance against time")
v_fit = p.slope          # speed from the fit

# Discussion
@layout.text Discussion {
    What the results show, how they compare with what was expected, and the main
    sources of uncertainty.
}

# Conclusion
> The answer to the purpose, in a sentence.
`

/** A problem set: title page, then each problem with its given values and its answer. */
const PROBLEM_SET = `@layout.titlepage {
    Problem Set 1
    Your name
    Course
    Date
}

# Problem 1
> The problem, as it's set.
m = 2.00 kg              # given
a = 3.00 m/s^2           # given
F = m * a                # the answer

# Problem 2
> The problem, as it's set.
v_0 = 12.0 m/s           # given
t = 2.50 s               # given
d = v_0 * t - 1/2 * @g * t^2
`

/** The templates, in the order the menu lists them. */
export const TEMPLATES: readonly Template[] = [
  { name: 'Lab report', description: 'Title page, purpose, method, data, calculations, results, discussion, conclusion', source: LAB_REPORT },
  { name: 'Problem set', description: 'Title page, then each problem with its givens and its answer', source: PROBLEM_SET },
]

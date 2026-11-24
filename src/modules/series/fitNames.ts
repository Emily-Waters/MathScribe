/**
 * A named plot's fit as the sheet sees it (`p = @plot(t, x; fit linear)`):
 * its R² and χ² typeset as they're written by hand, and a missing `p.slope`
 * explained (the series module's EngineModule.memberTex and explainMessage).
 */
import { FIT } from './syntax.ts'

/** mathjs's message for a named plot's fit member that isn't there (1: which). */
const MISSING_FIT_MEMBER = new RegExp(String.raw`^Undefined symbol \S+\.(${FIT.alternation})$`)

/** A missing p.slope (or intercept, r2, chi2) explained: a plot has one only with a fit. */
export function fitMessage(message: string): string | undefined {
  const m = MISSING_FIT_MEMBER.exec(message)
  if (!m) return undefined
  return m[1] === FIT.chi2
    ? `${message}: a plot has a χ² only for a weighted fit (fit linear, with an uncertainty on every y value).`
    : `${message}: a plot has a slope, intercept and R² only with a fit. Add fit linear to it (or choose Fit in its ⚙).`
}

/** A named plot's fit statistic as it's written by hand, given the plot's name as TeX: p.r2 → R²_p, p.chi2 → χ²_ν,p. */
export function fitMemberTex(member: string, ns: string): string | undefined {
  if (member === FIT.r2) return `R^{2}_{${ns}}`
  if (member === FIT.chi2) return `\\chi^{2}_{\\nu,${ns}}`
  return undefined
}

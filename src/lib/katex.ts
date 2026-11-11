/**
 * KaTeX, with mhchem for chemistry (\ce{…}, which formulas in braces become;
 * see chemistry.ts). Everything that draws maths imports KaTeX from here, so
 * mhchem is always loaded with it.
 */
import katex from 'katex'
import 'katex/contrib/mhchem'

export default katex

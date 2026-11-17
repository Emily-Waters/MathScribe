/**
 * The chemistry module's part of a sheet's tree: its kinds of node, its kinds of
 * line, and the context of an `@chem.species { }` block's lines.
 */
import type { ModuleGrammar } from '../../core/module.ts'
import { BODY_END, CONTENT } from '../../../tree/grammar.ts'
import { LINE_CONTEXT } from '../../../tree/nodes.ts'
import { token, type LexRule } from '../../../tree/lexer.ts'
import { REACTION_LINE } from './chemistry.ts'
import { SPECIES_LINE, SPECIES_OPENER } from './syntax.ts'

/** The chemistry module's kinds of node. */
export const CHEM_NODE = {
  /** `@chem.species {`. */
  speciesOpener: 'speciesOpener',
  /** A species' name in one: `dietzeite = {7Ca(IO3)2*8CaCrO4}`. */
  speciesEntry: 'speciesEntry',
  /** An `@chem.species` block: its opener, its names, and its `}`. */
  species: 'species',
  /** One species named on a line of its own: `@chem.species dietzeite = {…}`. */
  speciesLine: 'speciesLine',
  /** A reaction on a line of its own, drawn: `{2 H2 + O2 -> 2 H2O}`. */
  reaction: 'reaction',
} as const

/** The chemistry module's kinds of token. */
export const CHEM_TOKEN = {
  /** A formula in braces in an expression: the species a value is of (`5.00 g {H2O}`), or a compound (`@chem.substance({H2O})`). */
  species: 'species',
} as const

/** A formula in single braces at a position (not a value's `{{`): `{Na^+}`. */
const SPECIES_AT = /\{(?!\{)[^{}]+\}/y

const SPECIES_RULE: LexRule = {
  describes: 'a formula in braces, {H2O}: the species a value is of, or a compound',
  read: (pos, { text }) => {
    SPECIES_AT.lastIndex = pos
    const m = SPECIES_AT.exec(text)
    return m ? { parts: [token(CHEM_TOKEN.species, m[0])], length: m[0].length } : undefined
  },
}

/** The context of an `@chem.species { }` block's lines. */
export const SPECIES_CONTEXT = 'speciesNames'

export const CHEM_GRAMMAR: ModuleGrammar = {
  nodeKinds: {
    [CHEM_NODE.speciesOpener]: 'An @chem.species block’s opener: @chem.species {',
    [CHEM_NODE.speciesEntry]: 'A species’ name in an @chem.species block: dietzeite = {7Ca(IO3)2*8CaCrO4}',
    [CHEM_NODE.species]: 'An @chem.species block: its opener, its names, and its }',
    [CHEM_NODE.speciesLine]: 'One species named on a line of its own: @chem.species dietzeite = {…}',
    [CHEM_NODE.reaction]: 'A reaction on a line of its own, drawn: {2 H2 + O2 -> 2 H2O}',
  } satisfies Record<(typeof CHEM_NODE)[keyof typeof CHEM_NODE], string>,
  tokenKinds: { [CHEM_TOKEN.species]: 'A formula in braces in an expression: the species a value is of (5.00 g {H2O}), or a compound (@chem.substance({H2O}))' } satisfies Record<(typeof CHEM_TOKEN)[keyof typeof CHEM_TOKEN], string>,
  contexts: [{ name: SPECIES_CONTEXT, lineKind: CHEM_NODE.speciesEntry, content: CONTENT.noted }],
  lexRules: [SPECIES_RULE],
  // (After a unit, a species is part of it: `2.0 mol {EDTA}`, mol of EDTA.)
  unitRules: [SPECIES_RULE],
  syntaxes: [
    { kind: CHEM_NODE.speciesLine, contexts: [LINE_CONTEXT.sheet], content: CONTENT.noted, matches: (_, split) => SPECIES_LINE.test(split().body) },
    {
      kind: CHEM_NODE.speciesOpener, contexts: [LINE_CONTEXT.sheet], content: CONTENT.noted,
      matches: (_, split) => SPECIES_OPENER.test(split().body),
      opens: { node: CHEM_NODE.species, context: SPECIES_CONTEXT, ends: BODY_END.brace },
    },
    { kind: CHEM_NODE.reaction, contexts: [LINE_CONTEXT.sheet], content: CONTENT.noted, matches: (_, split) => REACTION_LINE.test(split().body) },
  ],
}

/**
 * The chemistry module's part of a sheet's tree: its kinds of node, its kinds of
 * line, and the context of an `@chem.species { }` block's lines.
 */
import type { ModuleGrammar } from '../../core/module.ts'
import { BODY_END, CONTENT } from '../../../tree/grammar.ts'
import { LINE_CONTEXT } from '../../../tree/nodes.ts'
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
  contexts: [{ name: SPECIES_CONTEXT, lineKind: CHEM_NODE.speciesEntry, content: CONTENT.noted }],
  syntaxes: [
    { kind: CHEM_NODE.speciesLine, contexts: [LINE_CONTEXT.sheet], content: CONTENT.noted, matches: (_, split) => SPECIES_LINE.test(split().body) },
    {
      kind: CHEM_NODE.speciesOpener, contexts: [LINE_CONTEXT.sheet], content: CONTENT.noted,
      matches: (_, split) => SPECIES_OPENER.test(split().body),
      opens: () => ({ node: CHEM_NODE.species, context: SPECIES_CONTEXT, ends: BODY_END.brace }),
    },
    { kind: CHEM_NODE.reaction, contexts: [LINE_CONTEXT.sheet], content: CONTENT.noted, matches: (_, split) => REACTION_LINE.test(split().body) },
  ],
}

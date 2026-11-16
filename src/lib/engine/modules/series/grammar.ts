/**
 * The series module's part of a sheet's tree: the settings after a `;` in a
 * table, plot or selection (`@plot(t, x; fit linear, x from 0 to 2)`), kept as
 * one token: they have a language of their own (tableSettings.ts,
 * plotSettings.ts), which the ⚙ menus read and write.
 */
import type { ModuleGrammar } from '../../core/module.ts'
import { SIGIL } from '../../../syntax.ts'
import { TOKEN_KIND } from '../../../tree/nodes.ts'
import { token, type LexRule } from '../../../tree/lexer.ts'
import { SERIES_CALL } from './syntax.ts'

/** The series module's kinds of token. */
export const SERIES_TOKEN = {
  /** The settings after a `;`: `fit linear, x from 0 to 2`. */
  settings: 'settings',
} as const

/** Between a call's series and its settings. */
const SETTINGS_SEPARATOR = ';'

/** The calls with settings after a `;`, as typed: `@table`, `@plot`, `@select`. */
const CALLS: ReadonlySet<string> = new Set(Object.values(SERIES_CALL).map((c) => `${SIGIL}${c}`))

const SETTINGS_RULE: LexRule = {
  describes: 'the settings after a ; in @table(…), @plot(…) or @select(…), as one token',
  read: (pos, state) => {
    if (state.text[pos] !== SETTINGS_SEPARATOR || !state.callee || !CALLS.has(state.callee)) return undefined
    const rest = state.text.slice(pos + 1, state.end)
    const lead = /^[ \t]*/.exec(rest)![0]
    const settings = rest.slice(lead.length)
    return {
      parts: [
        token(TOKEN_KIND.delimiter, SETTINGS_SEPARATOR), ...(lead ? [token(TOKEN_KIND.space, lead)] : []),
        ...(settings ? [token(SERIES_TOKEN.settings, settings)] : []),
      ],
      length: state.end - pos,
    }
  },
}

export const SERIES_GRAMMAR: ModuleGrammar = {
  tokenKinds: { [SERIES_TOKEN.settings]: 'The settings after a ; in @table(…), @plot(…) or @select(…): fit linear, x from 0 to 2' } satisfies Record<(typeof SERIES_TOKEN)[keyof typeof SERIES_TOKEN], string>,
  lexRules: [SETTINGS_RULE],
}

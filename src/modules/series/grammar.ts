/**
 * The series module's part of a sheet's tree: the settings after a `;` in a
 * table or plot (`@plot(t, x; fit linear, x from 0 to 2)`), kept as
 * one token: they have a language of their own (tableSettings.ts,
 * plotSettings.ts), which the ⚙ menus read and write; and a typed table,
 * `@table { … }`, its lines each a row of cells.
 */
import {
  BODY_END, CONTENT, LINE_CONTEXT, type LexRule, type ModuleGrammar, SIGIL, token, TOKEN_KIND, TOKEN_ROLE,
} from '../../lib/plugin.ts'
import { SERIES_CALL, SPREAD, TYPED_TABLE_OPENER } from './syntax.ts'

/** The series module's kinds of node: a typed table's. */
export const SERIES_NODE = {
  /** `@table {`, or `@table(title "Runs") {`. */
  tableOpener: 'typedTableOpener',
  /** A row of a typed table: `1 | 12.3 g | pale blue`. */
  tableRow: 'typedTableRow',
  /** A typed table: its opener, its rows, and its `}`. */
  table: 'typedTable',
} as const

/** The context of a typed table's lines: each a row of cells. */
const TABLE_CONTEXT = 'typedTable'

/** The series module's kinds of token. */
export const SERIES_TOKEN = {
  /** The settings after a `;`: `fit linear, x from 0 to 2`. */
  settings: 'settings',
} as const

/** Between a call's series and its settings. */
const SETTINGS_SEPARATOR = ';'

/** The calls with settings after a `;`, as typed: `@table`, `@plot`. */
const CALLS: ReadonlySet<string> = new Set(Object.values(SERIES_CALL).map((c) => `${SIGIL}${c}`))

const SETTINGS_RULE: LexRule = {
  describes: 'the settings after a ; in @table(…) or @plot(…), as one token',
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

/** `...`, a series spread in place or the rest of one gathered, as one token (not three dots). */
const SPREAD_RULE: LexRule = {
  describes: 'a series spread in place, or the rest of one gathered: ... in [...x, 11 s] and [a, ...rest] = x',
  read: (pos, state) => (state.text.startsWith(SPREAD, pos) ? { parts: [token(TOKEN_KIND.delimiter, SPREAD)], length: SPREAD.length } : undefined),
}

export const SERIES_GRAMMAR: ModuleGrammar = {
  nodeKinds: {
    [SERIES_NODE.tableOpener]: 'A typed table’s opener, with any settings in its brackets: @table(title "Runs") {',
    [SERIES_NODE.tableRow]: 'A row of a typed table, its cells between |s: 1 | 12.3 g | pale blue',
    [SERIES_NODE.table]: 'A typed table: its opener, its rows, and its }',
  } satisfies Record<(typeof SERIES_NODE)[keyof typeof SERIES_NODE], string>,
  contexts: [{ name: TABLE_CONTEXT, lineKind: SERIES_NODE.tableRow, content: CONTENT.cells }],
  syntaxes: [
    {
      kind: SERIES_NODE.tableOpener, contexts: [LINE_CONTEXT.sheet], content: CONTENT.opener,
      matches: (_, split) => TYPED_TABLE_OPENER.test(split().body),
      opens: { node: SERIES_NODE.table, context: TABLE_CONTEXT, ends: BODY_END.brace },
    },
  ],
  tokenKinds: { [SERIES_TOKEN.settings]: 'The settings after a ; in @table(…) or @plot(…): fit linear, x from 0 to 2' } satisfies Record<(typeof SERIES_TOKEN)[keyof typeof SERIES_TOKEN], string>,
  lexRules: [SETTINGS_RULE, SPREAD_RULE],
  // (A call's settings are words, read by their own language, not maths.)
  tokenRoles: { [SERIES_TOKEN.settings]: TOKEN_ROLE.text },
}

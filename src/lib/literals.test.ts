/**
 * Punctuation and patterns are written once, where their language is defined,
 * and taken from there everywhere else (CLAUDE.md: no magic strings; syntax is
 * read once, by the tree). Checked from the source, outside the files that
 * define a language:
 *
 *   - no regular-expression literal (`/\{[^}]*\}/`), and no `new RegExp(…)`:
 *     patterns are built with `regex(src…)` from named pieces (syntax/patterns.ts);
 *   - no quoted punctuation (`'('`, `','`, `'\\'`): the character is named, in
 *     its language's syntax file: a `syntax.ts` beside the code that uses it
 *     (LaTeX's latex/syntax.ts, a module's), or the sheet's src/lib/syntax/.
 *
 * Syntax files may quote punctuation (that's where it's named), but build their
 * patterns with the regex builder too.
 *
 * What's still written the old way is listed in KNOWN, a count per file, which
 * only goes down: a file over its count fails, and so does one under it, until
 * its count is lowered (or its entry removed, at 0).
 */
import { describe, expect, it } from 'vitest'

/** Every source file of the app (tests aside), by its path from here (src/lib/). */
const FILES = import.meta.glob<string>(['../**/*.{ts,tsx}', '!../**/*.test.ts', '!../test/**'], { query: '?raw', import: 'default', eager: true })

/** A path from here as a path from src/: `./plugin.ts` → lib/plugin.ts, `../App.tsx` → App.tsx. */
const fromSrc = (path: string) => (path.startsWith('./') ? `lib/${path.slice(2)}` : path.replace(/^\.\.\//, ''))

/** Every source file's text, by its path from src/. */
const SOURCES: ReadonlyMap<string, string> = new Map(Object.entries(FILES).map(([path, text]) => [fromSrc(path), text]))

// ---------------------------------------------------------------------------
// The files that define a language
// ---------------------------------------------------------------------------

/** Where patterns are built: regular expressions are made here, and nowhere else. */
const BUILDS_PATTERNS: ReadonlySet<string> = new Set(['lib/syntax/patterns.ts'])

/**
 * Where punctuation is defined, so it can be quoted (patterns are still built
 * with regex): the sheet's (src/lib/syntax/), any language's `syntax.ts`; and
 * the language tree, whose examples are sheet text.
 */
const DEFINES_PUNCTUATION = [
  /^lib\/syntax\//,
  /(?:^|\/)syntax\.ts$/,
  /^lib\/language\/topics\.ts$/,
  /^modules\/[^/]+\/language\.ts$/,
]

// ---------------------------------------------------------------------------
// Reading a file's code
// ---------------------------------------------------------------------------

/** What's found: a regular expression written out, or quoted punctuation. */
const FOUND = { regex: 'regex', punctuation: 'punctuation' } as const
type Found = (typeof FOUND)[keyof typeof FOUND]

interface Finding {
  kind: Found
  line: number
  text: string
}

/** Characters after which a `/` starts a regular expression rather than dividing. */
const BEFORE_REGEX = new Set(['(', ',', '=', ':', '[', '!', '&', '|', '?', '{', '}', ';', '+', '-', '*', '%', '<', '>', '~', '^'])

/** Characters after which a `/` starts a regular expression even when a `>` follows it (not JSX's `<br />`). */
const REGEX_EVEN_BEFORE_GT = new Set(['(', ',', '=', ':', '['])

/** Words after which a `/` starts a regular expression. */
const KEYWORDS_BEFORE_REGEX = new Set(['return', 'typeof', 'case', 'in', 'of', 'void', 'throw', 'yield', 'await'])

/** A quoted string that's only punctuation: one to three characters, none a letter, digit or space. */
const PUNCTUATION_ONLY = /^[^\p{L}\p{N}\s_]{1,3}$/u

/** A string's content with its escapes read: `\\` → `\`, `\'` → `'`. */
const unescaped = (s: string) => s.replace(/\\(.)/g, '$1')

/**
 * What a file's code writes out: its regular-expression literals, its
 * `new RegExp`s, and its quoted punctuation. Comments and the text of template
 * strings aren't code (the expressions in a template's `${…}` are).
 */
function findingsIn(source: string): Finding[] {
  const found: Finding[] = []
  let line = 1
  /** The last thing in the code that wasn't a space: a character, or a word. */
  let last = ''
  /** For each template string being read, how deep in `${…}` braces its current expression is. */
  const templates: number[] = []
  let i = 0
  const n = source.length
  const take = (to: number) => {
    for (let k = i; k < to; k++) if (source[k] === '\n') line++
    i = to
  }
  while (i < n) {
    const c = source[i]
    const next = source[i + 1]
    // Comments.
    if (c === '/' && next === '/') {
      const end = source.indexOf('\n', i)
      take(end < 0 ? n : end)
      continue
    }
    if (c === '/' && next === '*') {
      const end = source.indexOf('*/', i + 2)
      take(end < 0 ? n : end + 2)
      continue
    }
    // Quoted strings.
    if (c === "'" || c === '"') {
      let j = i + 1
      while (j < n && source[j] !== c && source[j] !== '\n') j += source[j] === '\\' ? 2 : 1
      const content = source.slice(i + 1, j)
      if (PUNCTUATION_ONLY.test(unescaped(content))) found.push({ kind: FOUND.punctuation, line, text: source.slice(i, j + 1) })
      take(j + 1)
      last = 'string'
      continue
    }
    // Template strings: their text is skipped, their expressions read as code.
    if (c === '`' || (c === '}' && templates.length && templates.at(-1) === 0)) {
      if (c === '}') templates.pop()
      let j = i + 1
      while (j < n && source[j] !== '`' && !(source[j] === '$' && source[j + 1] === '{')) j += source[j] === '\\' ? 2 : 1
      if (source[j] === '$') {
        templates.push(0)
        take(j + 2)
        last = '{'
      } else {
        take(j + 1)
        last = 'string'
      }
      continue
    }
    if (templates.length && c === '{') templates[templates.length - 1]++
    if (templates.length && c === '}') templates[templates.length - 1]--
    // Regular-expression literals (not JSX's closing tags, `</div>`, or self-closing ones, `<br />`).
    // (After `(`, `,`, `=`, `:` or `[`, a `/` starts a regular expression even before a `>`: `.replace(/>/g, …)`.)
    const jsxTag = last === '<' || (next === '>' && !REGEX_EVEN_BEFORE_GT.has(last))
    if (c === '/' && !jsxTag && (last === '' || BEFORE_REGEX.has(last) || KEYWORDS_BEFORE_REGEX.has(last))) {
      let j = i + 1
      let inClass = false
      while (j < n && source[j] !== '\n' && (inClass || source[j] !== '/')) {
        if (source[j] === '\\') j++
        else if (source[j] === '[') inClass = true
        else if (source[j] === ']') inClass = false
        j++
      }
      j++
      while (j < n && /[a-z]/.test(source[j])) j++
      found.push({ kind: FOUND.regex, line, text: source.slice(i, j) })
      take(j)
      last = 'regex'
      continue
    }
    // Words (and `new RegExp(`), numbers, and everything else.
    if (/[\w$]/.test(c)) {
      let j = i
      while (j < n && /[\w$]/.test(source[j])) j++
      const word = source.slice(i, j)
      if (word === 'RegExp' && last === 'new') found.push({ kind: FOUND.regex, line, text: 'new RegExp(…)' })
      take(j)
      last = word
      continue
    }
    if (!/\s/.test(c)) last = c
    take(i + 1)
  }
  return found
}

/** What a file is checked for: everything, or only patterns where it defines punctuation; nothing where patterns are built. */
function checkedIn(path: string, found: readonly Finding[]): Finding[] {
  if (BUILDS_PATTERNS.has(path)) return []
  if (DEFINES_PUNCTUATION.some((re) => re.test(path))) return found.filter((f) => f.kind !== FOUND.punctuation)
  return [...found]
}

/** Each file's findings, where it has any. */
const FINDINGS: ReadonlyMap<string, Finding[]> = new Map(
  [...SOURCES].map(([path, text]) => [path, checkedIn(path, findingsIn(text))] as const).filter(([, f]) => f.length > 0),
)

// ---------------------------------------------------------------------------
// What's still written the old way
// ---------------------------------------------------------------------------

/** Each file still to move onto named punctuation and built patterns, and how many it has left. */
const KNOWN: Readonly<Record<string, number>> = {
  'lib/engine/core/literals.ts': 3,
  'lib/engine/core/normalise.ts': 1,
  'lib/engine/core/tex.ts': 19,
  'modules/chemistry/species.ts': 2,
  'modules/series/plotGraph.ts': 14,
}

describe('punctuation and patterns', () => {
  it('are found by the check (a sample of each kind)', () => {
    const sample = findingsIn([
      "const a = /\\{x\\}/g",
      "const b = new RegExp(x)",
      "if (c === '(') d = e / f / g",
      "const h = `${i === ',' ? 'j' : 'k'}text / with ' quotes`",
      "// a comment's '(' isn't code",
      "return /y/.test(z)",
      "s.replace(/>/g, '&gt;')",
    ].join('\n'))
    expect(sample.map((f) => [f.kind, f.line, f.text])).toEqual([
      [FOUND.regex, 1, '/\\{x\\}/g'],
      [FOUND.regex, 2, 'new RegExp(…)'],
      [FOUND.punctuation, 3, "'('"],
      [FOUND.punctuation, 4, "','"],
      [FOUND.regex, 6, '/y/'],
      [FOUND.regex, 7, '/>/g'],
    ])
  })

  it('are written once, where their language is defined (except what KNOWN still lists)', () => {
    const over = [...FINDINGS]
      .filter(([path, f]) => f.length > (KNOWN[path] ?? 0))
      .map(([path, f]) => `${path}: ${f.length} (allowed ${KNOWN[path] ?? 0})\n${f.map((x) => `    ${x.line}: ${x.text}`).join('\n')}`)
    expect(over, 'Name the punctuation (syntax/punctuation.ts, latex.ts, a module\'s syntax.ts) and build patterns with regex(src…)').toEqual([])
  })

  it('only go down: KNOWN lists each file\'s count as it is', () => {
    const counts = Object.fromEntries([...FINDINGS].map(([path, f]) => [path, f.length]))
    const stale = Object.entries(KNOWN).filter(([path, n]) => (counts[path] ?? 0) < n).map(([path, n]) => `${path}: ${counts[path] ?? 0} (listed ${n})`)
    expect(stale, 'Lower these in KNOWN (or remove them, at 0)').toEqual([])
  })
})

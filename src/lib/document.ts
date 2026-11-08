import {
  Calculator,
  type CalcOptions,
  type FunctionLine,
  type FunctionResult,
  type LineCommand,
  type TraceLine,
  type Variable,
  symbolTex,
} from './engine.ts'

/** Indentation width, counting a tab as 4 spaces. */
const indentOf = (line: string) => /^[ \t]*/.exec(line)![0].replace(/\t/g, '    ').length

/**
 * Line-based document model. Each non-empty line becomes one block:
 *   # / ## / ###     → numbered \section, numbered \subsection, \textbf heading (### or more)
 *   > Some prose       → paragraph (inline $latex$ allowed)
 *   $ \raw{latex}      → displayed LaTeX, not evaluated
 *   Title {            → opens a scoped block (title optional); `}` closes it
 *   m = 2.0 kg  # note → calculation; the text after # is shown as its description
 *   @constants {       → constants, usable anywhere as @name; `}` closes it
 *   def f(a, b)        → function; its body is the following, more-indented lines
 *       c = a * b        (local assignments)
 *       return c + 1
 *
 * Display commands can go anywhere after a calculation or block opener:
 *   #sym   show the equation only        F = m·a
 *   #val   show the result only          F = 19.6 N
 *   #full  show everything (the default; overrides a block's command)
 *   #hide  calculate, but don't show the line (or the whole block)
 *   #multiline  put each = on its own row, lined up (combines with the above)
 * On a block opener, the command applies to every line inside unless a line
 * has its own.
 *
 * Layout blocks end with `:`, and hold the lines indented under them:
 *   Steps:  #numbered  → numbered list (#list: bullets, #center: centered)
 *       a = …            each line is an item; indent further for a sub-list
 * They only arrange lines: variables assigned inside stay available afterwards.
 * `#center` (or #list/#numbered) on a single calculation lays out just that line.
 *
 * Blocks scope variables like a programming language: inside a block you can
 * read everything defined above it, but anything assigned inside is local and
 * disappears at the closing `}`, leaving outer variables of the same name untouched.
 */
export type Block =
  /** `#` → 1 (section), `##` → 2 (subsection), `###` or more → 3 (bold paragraph) */
  | { kind: 'heading'; line: number; level: 1 | 2 | 3; text: string; /** "2" or "2.1", as LaTeX numbers it */ number?: string }
  | { kind: 'text'; line: number; text: string }
  | { kind: 'latex'; line: number; latex: string }
  /** A gap of one empty line, from two or more blank lines in the input. */
  | { kind: 'spacer'; line: number }
  | CalcBlock
  | GroupBlock
  | LayoutBlock
  | FunctionBlock
  | ConstantsBlock

/** `@constants { … }`: constants usable anywhere in the sheet as `@name`. */
export interface ConstantsBlock {
  kind: 'constants'
  line: number
  /** Line of the closing brace. */
  endLine: number
  note?: string
  entries: { line: number; source: string; tex: string; note?: string; error?: string; warning?: string; info?: string }[]
  error?: string
  hidden?: boolean
}

/** `def f(a, b)` with its indented body. */
export interface FunctionBlock extends FunctionResult {
  kind: 'function'
  line: number
  /** Last line of the body. */
  endLine: number
  name: string
  note?: string
  hidden?: boolean
}

export interface CalcBlock {
  kind: 'calc'
  line: number
  source: string
  tex: string
  note?: string
  error?: string
  warning?: string
  /** Extra information, e.g. other solutions of an equation (may contain $inline math$). */
  info?: string
  /** Working from inside functions called on this line, shown before it. */
  trace?: TraceLine[]
  /** Calculated but not shown (`#hide`). */
  hidden?: boolean
}

export interface GroupBlock {
  kind: 'group'
  line: number
  /** Line of the closing brace (or the last line, if it's missing). */
  endLine?: number
  title: string
  note?: string
  children: Block[]
  /** Variables defined inside this block (not visible after it). */
  locals: Variable[]
  error?: string
  /** Display command given on the opener, inherited by lines inside. */
  command?: Command
  /** `#multiline` on the opener: every line inside is laid out one `=` per row. */
  multiline?: boolean
}

/** How a layout block arranges its lines. */
export type LayoutStyle = 'center' | 'list' | 'numbered'

/**
 * `Title:  #numbered` with indented lines under it: a block that only arranges
 * its lines (centered, or as a bulleted or numbered list). Unlike `{ }` blocks,
 * it doesn't scope variables. Indenting further inside a list makes a sub-list.
 */
export interface LayoutBlock {
  kind: 'layout'
  line: number
  /** Last line that belongs to it. */
  endLine?: number
  title: string
  note?: string
  /** No style: just a titled, indented section. */
  style?: LayoutStyle
  children: Block[]
  /** A sub-list made by indenting further; it belongs to the item before it. */
  nested?: boolean
  error?: string
  /** Display command given on the opener, inherited by lines inside. */
  command?: Command
  multiline?: boolean
  /** Indentation of the opener; a line indented no further ends the block. */
  indent: number
  /** Indentation of its first line; a line indented further starts a sub-list. */
  itemIndent?: number
}

export interface Sheet {
  blocks: Block[]
  variables: Variable[]
}

export type Command = LineCommand

const COMMAND = /(^|\s)#(sym|val|full|hide)(?=\s|$)/gi
/** `#multiline`: a layout, so it combines with the commands above. */
const MULTILINE = /(^|\s)#multiline(?=\s|$)/gi
/** `#center`, `#list`, `#numbered`: how a layout block (or one line) is arranged. */
const LAYOUT = /(^|\s)#(center|list|numbered)(?=\s|$)/gi

/**
 * A line that is only `@name:n`, `@name:exact`, `@name to unit` or `@name:n to unit`:
 * sets that constant's precision and/or display unit sheet-wide.
 */
const DECLARATION = /^@([A-Za-z]\w*)(?::(\d+|exact))?(?:\s+to\s+(\S.*?))?\s*$/

interface Declaration { name: string; precision?: string; unit?: string }

function parseDeclaration(body: string): Declaration | null {
  const m = DECLARATION.exec(body)
  if (!m || (m[2] === undefined && m[3] === undefined)) return null
  return { name: m[1], precision: m[2], unit: m[3] }
}

/**
 * Split a line into its body, display command and note:
 * `F = m * a  #val  # weight` → body `F = m * a`, command `val`, note `weight`.
 * Only the known commands are taken; any other `#word` stays in the note.
 */
function splitNote(text: string): {
  body: string; note?: string; command?: Command; multiline: boolean; layout?: LayoutStyle
} {
  let command: Command | undefined
  let multiline = false
  let layout: LayoutStyle | undefined
  const rest = text
    .replace(LAYOUT, (_m, space: string, style: string) => {
      layout = style.toLowerCase() as LayoutStyle
      return space
    })
    .replace(COMMAND, (_m, space: string, cmd: string) => {
      command = cmd.toLowerCase() as Command
      return space
    })
    .replace(MULTILINE, (_m, space: string) => {
      multiline = true
      return space
    })
  const hash = rest.indexOf('#')
  if (hash < 0) return { body: rest.trim(), command, multiline, layout }
  return { body: rest.slice(0, hash).trim(), note: rest.slice(hash + 1).trim() || undefined, command, multiline, layout }
}

export function evaluateSheet(source: string, options: CalcOptions): Sheet {
  const calc = new Calculator(options)
  const root: Block[] = []
  /** Blocks currently open: `{ }` groups, and indentation-based layout blocks. */
  const open: (GroupBlock | LayoutBlock)[] = []
  const add = (b: Block) => (open.at(-1)?.children ?? root).push(b)
  const lastLine = (b: Block): number =>
    ('endLine' in b && b.endLine) || b.line
  /** Close the innermost layout block, at its last line. */
  const closeLayout = () => {
    const layout = open.pop() as LayoutBlock
    layout.endLine = layout.children.length ? lastLine(layout.children.at(-1)!) : layout.line
    if (!layout.children.length && !layout.nested) {
      layout.error = `Nothing is indented under "${layout.title || ':'}". Indent the lines that belong to it.`
    }
  }
  let section = 0
  let subsection = 0

  const lines = source.split(/\r?\n/)

  // Declarations (`@c:4` or `@a_0:3 to angstrom` on its own line) apply to the
  // whole sheet, including constants defined from them, so they're read before
  // anything else. The first declaration for a constant wins; later ones get a warning.
  const declaredAt = new Map<string, number>()
  const duplicateDeclarations = new Map<number, string>()
  lines.forEach((text, i) => {
    const d = parseDeclaration(splitNote(text.trim()).body)
    if (!d || d.precision === '0') return
    const first = declaredAt.get(d.name)
    if (first !== undefined) {
      duplicateDeclarations.set(i + 1, `@${d.name} is already declared on line ${first}; this line doesn't change it.`)
      return
    }
    declaredAt.set(d.name, i + 1)
    if (d.precision !== undefined) {
      calc.declareConstantPrecision(d.name, d.precision === 'exact' ? 'exact' : Number(d.precision))
    }
    if (d.unit !== undefined) calc.declareConstantUnit(d.name, d.unit)
  })
  /** Note shown on a declaration line. */
  const declarationInfo = (body: string, line: number) => {
    const d = parseDeclaration(body)
    if (!d || declaredAt.get(d.name) !== line) return undefined
    const parts = [
      d.precision === undefined ? '' : d.precision === 'exact' ? 'at full precision' : `to ${d.precision} sig figs`,
      d.unit === undefined ? '' : `in ${d.unit}`,
    ].filter(Boolean).join(', ')
    const unless = d.precision === undefined ? '' : ', unless written with its own :n'
    return `Every @${d.name} in this sheet uses this value, ${parts}${unless}.`
  }

  // Define every `@constants { }` block's constants, so `@name` works anywhere
  // in the sheet, even above the block.
  const constantBlocks = new Map<number, { end: number; block: ConstantsBlock }>()
  for (let i = 0; i < lines.length; i++) {
    const opener = splitNote(lines[i].trim())
    if (!/^@constants\s*\{$/.test(opener.body)) continue
    const entries: ConstantsBlock['entries'] = []
    /** Precision declarations in the block, shown once all its constants exist. */
    const declarations: number[] = []
    let end = lines.length - 1
    let closed = false
    for (let j = i + 1; j < lines.length; j++) {
      const text = lines[j].trim()
      if (text.startsWith('}')) {
        end = j
        closed = true
        break
      }
      if (!text || text.startsWith('#')) continue
      const entry = splitNote(text)
      if (parseDeclaration(entry.body)) {
        declarations.push(entries.length)
        entries.push({ line: j + 1, source: entry.body, note: entry.note, tex: '' })
        continue
      }
      entries.push({ line: j + 1, source: entry.body, note: entry.note, ...calc.defineConstant(entry.body) })
    }
    for (const k of declarations) {
      const e = entries[k]
      const result = calc.evaluate(e.source, 'full')
      entries[k] = {
        ...e, ...result,
        info: result.error ? undefined : declarationInfo(e.source, e.line),
        warning: duplicateDeclarations.get(e.line) ?? result.warning,
      }
    }
    constantBlocks.set(i, {
      end,
      block: {
        kind: 'constants', line: i + 1, endLine: end + 1, note: opener.note, entries, hidden: opener.command === 'hide',
        error: closed ? undefined : `The @constants block on line ${i + 1} is missing its closing }.`,
      },
    })
    i = end
  }

  /** Consecutive blank lines just before the current line. */
  let blankRun = 0
  for (let idx = 0; idx < lines.length; idx++) {
    const raw = lines[idx]
    const line = idx + 1
    const trimmed = raw.trim()
    if (!trimmed) {
      blankRun++
      continue
    }
    // Layout blocks end at the first line indented no further than their opener.
    const indent = indentOf(raw)
    while (open.at(-1)?.kind === 'layout' && indent <= (open.at(-1) as LayoutBlock).indent) closeLayout()
    // In a list, a line indented further than the items starts a sub-list.
    const top = open.at(-1)
    if (top?.kind === 'layout') {
      top.itemIndent ??= indent
      if (indent > top.itemIndent && (top.style === 'list' || top.style === 'numbered') && top.children.length) {
        const sub: LayoutBlock = {
          kind: 'layout', line, title: '', style: top.style, children: [], nested: true,
          indent: top.itemIndent, itemIndent: indent,
        }
        add(sub)
        open.push(sub)
      }
    }
    // One blank line is just for readability; two or more leave a gap in the
    // output (always one line's worth). Not at the very start of a block, not
    // before a closing brace, and not between list items.
    const parent = open.at(-1)
    const container = parent?.children ?? root
    const inList = parent?.kind === 'layout' && (parent.style === 'list' || parent.style === 'numbered')
    if (blankRun >= 2 && container.length && !trimmed.startsWith('}') && !inList) add({ kind: 'spacer', line })
    blankRun = 0

    // Already evaluated in the first pass; just place the block.
    const constants = constantBlocks.get(idx)
    if (constants) {
      add(constants.block)
      idx = constants.end
      continue
    }
    if (trimmed.startsWith('#')) {
      const level = Math.min(/^#+/.exec(trimmed)![0].length, 3) as 1 | 2 | 3
      // Mirror LaTeX's counters: a new section resets the subsection count.
      let number: string | undefined
      if (level === 1) {
        section++
        subsection = 0
        number = `${section}`
      } else if (level === 2) {
        subsection++
        number = `${section}.${subsection}`
      }
      add({ kind: 'heading', line, level, number, text: trimmed.replace(/^#+/, '').trim() })
      continue
    }
    if (trimmed.startsWith('>')) {
      add({ kind: 'text', line, text: trimmed.slice(1).trim() })
      continue
    }
    if (trimmed.startsWith('$')) {
      add({ kind: 'latex', line, latex: trimmed.replace(/^\$+|\$+$/g, '').trim() })
      continue
    }

    const { body, note, command, multiline: ownMultiline, layout } = splitNote(trimmed)
    // A line's own command wins; otherwise the nearest enclosing block's.
    const inherited = [...open].reverse().find((g) => g.command)?.command
    const multiline = ownMultiline || open.some((g) => g.multiline)

    // `def f(a, b)`: the function body is every following line indented further.
    const def = /^def\s+([A-Za-z]\w*)\s*\(([^)]*)\)\s*:?$/.exec(body)
    if (def) {
      const defIndent = indentOf(raw)
      const bodyLines: FunctionLine[] = []
      while (idx + 1 < lines.length && (!lines[idx + 1].trim() || indentOf(lines[idx + 1]) > defIndent)) {
        idx++
        const text = lines[idx].trim()
        // Blank lines at the end of the body count toward the gap after the function.
        blankRun = text ? 0 : blankRun + 1
        if (!text || text.startsWith('#')) continue // blank lines and comments
        const split = splitNote(text)
        bodyLines.push({ line: idx + 1, text: split.body, note: split.note, command: split.command, multiline: split.multiline })
      }
      const params = def[2].split(',').map((p) => p.trim()).filter(Boolean)
      // Parameters (`m`, or `m to kg`) are checked by defineFunction.
      const result = bodyLines.length
        ? calc.defineFunction(def[1], params, bodyLines, multiline)
        : { signature: symbolTex(def[1]), body: [], error: `${def[1]} has no body: indent the lines under def.` }
      add({
        kind: 'function', line, endLine: bodyLines.at(-1)?.line ?? line, name: def[1], note,
        hidden: (command ?? inherited) === 'hide', ...result,
      })
      continue
    }

    if (body === '}') {
      // Layout blocks inside the group end with it.
      while (open.at(-1)?.kind === 'layout') closeLayout()
      const group = open.pop() as GroupBlock | undefined
      if (group) {
        group.locals = calc.popScope()
        group.endLine = line
      }
      else add({ kind: 'calc', line, source: body, tex: '', error: 'Unmatched }: no block is open here.' })
    } else if (body.endsWith(':')) {
      // `Title:  #numbered`: the lines indented under it are laid out together.
      const block: LayoutBlock = {
        kind: 'layout', line, title: body.slice(0, -1).trim(), note, style: layout, children: [], indent,
        command: command ?? (inherited === 'hide' ? 'hide' : undefined),
        multiline: ownMultiline || undefined,
      }
      add(block)
      open.push(block)
    } else if (body.endsWith('{')) {
      const group: GroupBlock = {
        kind: 'group', line, title: body.slice(0, -1).trim(), note, children: [], locals: [],
        command: command ?? (inherited === 'hide' ? 'hide' : undefined),
        multiline: ownMultiline || undefined,
      }
      add(group)
      open.push(group)
      calc.pushScope()
    } else {
      const effective = command ?? inherited ?? 'full'
      const mode = effective === 'hide' ? 'full' : effective
      const result = calc.evaluate(body, mode, (command ?? inherited) !== undefined, multiline)
      // `#center` (or another layout) on a single line: lay out just that line.
      const own: LayoutBlock | undefined = layout
        ? { kind: 'layout', line, endLine: line, title: '', style: layout, children: [], indent }
        : undefined
      if (own) add(own)
      // A line that's just a function call can take its note from the return line.
      ;(own?.children ?? open.at(-1)?.children ?? root).push({
        kind: 'calc', line, source: body, hidden: effective === 'hide', ...result,
        note: note ?? result.returnNote,
        info: result.info ?? (result.error ? undefined : declarationInfo(body, line)),
        warning: duplicateDeclarations.get(line) ?? result.warning,
      })
    }
  }

  // Close anything left open so its locals don't leak into the top level.
  while (open.length) {
    if (open.at(-1)!.kind === 'layout') {
      closeLayout()
      continue
    }
    const group = open.pop() as GroupBlock
    group.locals = calc.popScope()
    group.endLine = lines.length
    group.error = `Block opened on line ${group.line} is missing its closing }.`
  }

  return { blocks: root, variables: calc.variables() }
}

/** Split prose into plain-text and inline-math segments on $...$. */
export function splitInlineMath(text: string): { math: boolean; value: string }[] {
  return text
    .split(/(\$[^$]+\$)/)
    .filter(Boolean)
    .map((s) => (s.length > 2 && s.startsWith('$') && s.endsWith('$')
      ? { math: true, value: s.slice(1, -1) }
      : { math: false, value: s }))
}

/** A piece of a title: plain text, a subscript, or inline maths. */
export type TitleSegment = { kind: 'text' | 'sub' | 'math'; value: string }

/** `p_z`, `E_k`, `x_{max}`: a subscript after a letter or digit. `\_` is a plain underscore. */
const SUBSCRIPT = /(?<=[A-Za-z0-9])(?<!\\)_(\{[^{}]*\}|[A-Za-z0-9]+)/g

/**
 * Headings and block titles: `2p_z` shows its subscript (as variable names do),
 * and `$…$` is inline maths, as in `>` text.
 */
export function titleSegments(text: string): TitleSegment[] {
  const out: TitleSegment[] = []
  const plain = (s: string) => {
    if (s) out.push({ kind: 'text', value: s.replace(/\\_/g, '_') })
  }
  for (const seg of splitInlineMath(text)) {
    if (seg.math) {
      out.push({ kind: 'math', value: seg.value })
      continue
    }
    let last = 0
    for (const m of seg.value.matchAll(SUBSCRIPT)) {
      plain(seg.value.slice(last, m.index))
      out.push({ kind: 'sub', value: m[1].replace(/^\{|\}$/g, '') })
      last = m.index + m[0].length
    }
    plain(seg.value.slice(last))
  }
  return out
}

/** A heading or block title in LaTeX: `2p_z` → 2p\textsubscript{z}. */
function titleToLatex(text: string): string {
  return titleSegments(text).map((s) => (s.kind === 'math'
    ? `$${s.value}$`
    : s.kind === 'sub' ? `\\textsubscript{${escapeTex(s.value)}}` : escapeTex(s.value))).join('')
}

const escapeTex = (s: string) =>
  s.replace(/[\\{}#%&_^~$]/g, (c) =>
    c === '\\' ? '\\textbackslash{}' : c === '^' ? '\\^{}' : c === '~' ? '\\~{}' : `\\${c}`)

/** LaTeX for a list of blocks, leaving out hidden ones. */
function joinBlocks(blocks: Block[]): string {
  return blocks.map(blockToLatex).filter(Boolean).join('\n\n')
}

function blockToLatex(b: Block): string {
  switch (b.kind) {
    case 'heading': {
      const text = titleToLatex(b.text)
      if (b.level === 1) return `\\section{${text}}`
      if (b.level === 2) return `\\subsection{${text}}`
      return `\\noindent\\textbf{${text}}`
    }
    case 'spacer':
      return '\\vspace{\\baselineskip}'
    case 'constants': {
      if (b.hidden && !b.error && !b.entries.some((e) => e.error)) return ''
      const body = b.entries.map((e) => (e.error
        ? `% Line ${e.line}: ${e.source}\n% Error: ${e.error}`
        : `\\[\n  ${e.tex}${e.note ? ` \\tag*{${escapeTex(e.note)}}` : ''}\n\\]`))
      return [
        `\\paragraph{Constants${b.note ? ` --- ${escapeTex(b.note)}` : ''}}`,
        '\\begin{quote}',
        body.join('\n'),
        '\\end{quote}',
      ].join('\n')
    }
    case 'text':
      return splitInlineMath(b.text)
        .map((seg) => (seg.math ? `$${seg.value}$` : escapeTex(seg.value)))
        .join('')
    case 'latex':
      return `\\[\n  ${b.latex}\n\\]`
    case 'calc':
      if (b.error) return `% Line ${b.line}: ${b.source}\n% Error: ${b.error}`
      if (b.hidden) return ''
      return [
        ...(b.trace ?? []).map((t) => `\\[\n  ${t.tex}${t.note ? ` \\tag*{${escapeTex(t.note)}}` : ''}\n\\]`),
        `\\[\n  ${b.tex}${b.note ? ` \\tag*{${escapeTex(b.note)}}` : ''}\n\\]`,
      ].join('\n')
    case 'function': {
      if (b.error) return `% Line ${b.line}: function ${b.name}\n% Error: ${b.error}`
      if (b.hidden) return ''
      return [
        `\\paragraph{Function $${b.signature}$${b.note ? ` --- ${escapeTex(b.note)}` : ''}}`,
        '\\begin{quote}',
        b.body.map((s) => `\\[\n  ${s.tex}${s.note ? ` \\tag*{${escapeTex(s.note)}}` : ''}\n\\]`).join('\n'),
        '\\end{quote}',
      ].join('\n')
    }
    case 'layout': {
      if (b.error && !b.children.length) return `% Line ${b.line}: ${b.title}:\n% Error: ${b.error}`
      if (b.command === 'hide') return ''
      const title = [b.title && titleToLatex(b.title), b.note && escapeTex(b.note)].filter(Boolean).join(' --- ')
      const env = b.style === 'center' ? 'center' : b.style === 'list' ? 'itemize' : b.style === 'numbered' ? 'enumerate' : 'quote'
      const body = env === 'itemize' || env === 'enumerate'
        ? listItems(b.children).map(({ item, subs }) =>
          [`\\item ${itemLatex(item)}`, ...subs.map(blockToLatex)].filter(Boolean).join('\n')).join('\n')
        : joinBlocks(b.children)
      return [
        title ? `\\paragraph{${title}}` : '',
        `\\begin{${env}}`,
        body,
        `\\end{${env}}`,
      ].filter(Boolean).join('\n')
    }
    case 'group': {
      if (b.command === 'hide') return ''
      const title = [b.title && titleToLatex(b.title), b.note && escapeTex(b.note)].filter(Boolean).join(' --- ')
      return [
        title ? `\\paragraph{${title}}` : '',
        '\\begin{quote}',
        joinBlocks(b.children),
        '\\end{quote}',
      ].filter(Boolean).join('\n')
    }
  }
}

/** Whether a block is left out of the output (and so isn't a list item). */
export function isOmitted(b: Block): boolean {
  if (b.kind === 'spacer') return true
  if (b.kind === 'calc' || b.kind === 'function' || b.kind === 'constants') return !!b.hidden && !b.error
  if (b.kind === 'group' || b.kind === 'layout') return b.command === 'hide' && !b.error
  return false
}

/** A list block's items, each with the sub-lists indented under it. */
export function listItems(children: Block[]): { item: Block; subs: Block[] }[] {
  const items: { item: Block; subs: Block[] }[] = []
  for (const c of children) {
    if (isOmitted(c)) continue
    if (c.kind === 'layout' && c.nested && items.length) items.at(-1)!.subs.push(c)
    else items.push({ item: c, subs: [] })
  }
  return items
}

/** A block as the content of `\item`: inline display maths, so it sits beside the marker. */
function itemLatex(b: Block): string {
  if (b.kind === 'calc' && !b.error && !b.trace?.length) {
    return `$\\displaystyle ${b.tex}$${b.note ? ` \\hfill ${escapeTex(b.note)}` : ''}`
  }
  if (b.kind === 'latex') return `$\\displaystyle ${b.latex}$`
  return blockToLatex(b)
}

/** Full, compilable LaTeX source for the sheet. */
export function toLatexDocument(blocks: Block[]): string {
  return [
    '\\documentclass{article}',
    '\\usepackage{amsmath, amssymb}',
    '',
    '\\begin{document}',
    '',
    joinBlocks(blocks),
    '',
    '\\end{document}',
    '',
  ].join('\n')
}

/**
 * Where each function is defined, by name: `def f(…)` lines and one-line
 * `f(…) = …` lines, in order. (For go-to-definition in the editor.)
 */
export function collectDefinitions(blocks: Block[]): Map<string, number[]> {
  const out = new Map<string, number[]>()
  const put = (name: string, line: number) => out.set(name, [...(out.get(name) ?? []), line])
  const visit = (b: Block) => {
    if (b.kind === 'function') put(b.name, b.line)
    else if (b.kind === 'calc') {
      const m = /^([A-Za-z]\w*)\s*\([^()]*\)\s*=(?!=)/.exec(b.source)
      if (m) put(m[1], b.line)
    } else if (b.kind === 'group' || b.kind === 'layout') b.children.forEach(visit)
  }
  blocks.forEach(visit)
  for (const lines of out.values()) lines.sort((a, b) => a - b)
  return out
}

/** A name the editor can suggest or describe, and where it's visible. */
export interface SheetSymbol {
  name: string
  kind: 'variable' | 'parameter' | 'function' | 'constant'
  /** Line it's defined on. */
  line: number
  /** Lines it can be used on (a `{ }` block or function body scopes it). */
  from: number
  to: number
  /** TeX for its value (`m = 2.00 kg`) or signature, if known. */
  tex?: string
  /** Plain-text parameters of a function, e.g. "n, m to kg, L to m". */
  params?: string
}

const ASSIGNMENT = /^([A-Za-z]\w*)(?::(?:\d+|exact))?\s*=(?!=)/
const ONE_LINE_DEF = /^([A-Za-z]\w*)\s*\(([^()]*)\)\s*=(?!=)/

/**
 * Everything defined in the sheet, for completions and hover information:
 * variables (with their value), function parameters, functions (with their
 * signature) and `@constants`, each with the lines it's visible on.
 */
export function collectSymbols(sheet: Sheet, source: string): SheetSymbol[] {
  const lines = source.split(/\r?\n/)
  const out: SheetSymbol[] = []
  const texOf = (name: string, scope: Variable[]) => scope.find((v) => v.name === name)?.tex

  /** `to`: the last line of the innermost `{ }` block (or the sheet), where its names stop being visible;
   * `scope`: that block's variables, for their values. */
  const visit = (blocks: Block[], to: number, scope: Variable[]) => {
    for (const b of blocks) {
      switch (b.kind) {
        case 'calc': {
          const def = ONE_LINE_DEF.exec(b.source)
          if (def) {
            out.push({
              name: def[1], kind: 'function', line: b.line, from: b.line, to,
              tex: b.tex.split(' = ')[0], params: def[2].trim(),
            })
            break
          }
          const assign = ASSIGNMENT.exec(b.source)
          if (assign) out.push({ name: assign[1], kind: 'variable', line: b.line, from: b.line + 1, to, tex: texOf(assign[1], scope) })
          break
        }
        case 'function': {
          const params = /^\s*def\s+[A-Za-z]\w*\s*\(([^)]*)\)/.exec(lines[b.line - 1] ?? '')?.[1].trim() ?? ''
          out.push({ name: b.name, kind: 'function', line: b.line, from: b.line, to, tex: b.signature, params })
          // Inside the body, its parameters are names too.
          for (const p of params.split(',')) {
            const name = /^\s*([A-Za-z]\w*)/.exec(p)?.[1]
            if (name) out.push({ name, kind: 'parameter', line: b.line, from: b.line + 1, to: b.endLine })
          }
          break
        }
        case 'constants':
          for (const e of b.entries) {
            const name = ASSIGNMENT.exec(e.source)?.[1]
            if (name) out.push({ name: `@${name}`, kind: 'constant', line: e.line, from: 1, to: lines.length, tex: e.tex })
          }
          break
        case 'group':
          visit(b.children, b.endLine ?? lines.length, b.locals)
          break
        case 'layout':
          // Layout blocks don't scope their variables.
          visit(b.children, to, scope)
          break
      }
    }
  }
  visit(sheet.blocks, lines.length, sheet.variables)
  return out
}

export interface Diagnostic {
  kind: 'error' | 'warning'
  message: string
}

/** Errors and warnings by source line, for marking lines in the editor. */
export function collectDiagnostics(blocks: Block[]): Map<number, Diagnostic> {
  const out = new Map<number, Diagnostic>()
  const put = (line: number, kind: Diagnostic['kind'], message?: string) => {
    if (!message) return
    const existing = out.get(line)
    if (!existing || (existing.kind === 'warning' && kind === 'error')) out.set(line, { kind, message })
  }
  const visit = (b: Block) => {
    switch (b.kind) {
      case 'calc':
        put(b.line, 'warning', b.warning)
        put(b.line, 'error', b.error)
        break
      case 'function': {
        // "Line 12: …" errors point at a body line.
        const at = /^Line (\d+): (.*)$/.exec(b.error ?? '')
        put(at ? Number(at[1]) : b.line, 'error', at ? at[2] : b.error)
        break
      }
      case 'constants':
        put(b.line, 'error', b.error)
        for (const e of b.entries) {
          put(e.line, 'warning', e.warning)
          put(e.line, 'error', e.error)
        }
        break
      case 'group':
      case 'layout':
        put(b.line, 'error', b.error)
        b.children.forEach(visit)
        break
    }
  }
  blocks.forEach(visit)
  return out
}

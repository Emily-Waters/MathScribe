import {
  Calculator,
  type CalcOptions,
  type DataColumn,
  type FunctionLine,
  type FunctionResult,
  type TraceLine,
  type Variable,
  symbolTex,
} from './engine.ts'
import {
  ASSIGNMENT, CONSTANT_DECLARATION, EXACT_SETTING, DEF, DEF_HEAD, FUNCTION_HEAD, IMPORT, LAYOUT_STYLES, LEADING_NAME, LINE_COMMANDS,
  MULTILINE, NAME_WITH_SETTINGS, NOTATIONS, UNPACK_HEAD, commandPattern, indentOf, type LayoutStyle, type LineCommand,
  type Notation,
} from './syntax.ts'
import { parseCsv, type CsvData } from './csv.ts'

/**
 * Imported data as read, kept between evaluations of the sheet (one per edit)
 * while its rows don't change, so it isn't read again, and its values (made
 * once per column read; see the engine) are reused. Only the latest few are kept.
 */
const readData = new Map<string, CsvData>()
const KEPT_IMPORTS = 8
function readCsv(rows: string[]): CsvData {
  const key = rows.join('\n')
  let data = readData.get(key)
  if (!data) {
    data = parseCsv(rows)
    readData.set(key, data)
    if (readData.size > KEPT_IMPORTS) readData.delete(readData.keys().next().value!)
  }
  return data
}

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
 *   #sci, #dec  show results in scientific notation, or plain digits (combine too)
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
  | ImportBlock

/**
 * `import("run1.csv")` with the file's rows indented under it: data whose
 * values become variables (t_1, t_2, …). Only a summary is shown, not the rows.
 */
export interface ImportBlock {
  kind: 'import'
  line: number
  /** Last line of the data. */
  endLine: number
  /** The file's name, or undefined for `import()` before a file is chosen. */
  file?: string
  /** What each column made. */
  columns: DataColumn[]
  rows: number
  note?: string
  error?: string
  hidden?: boolean
}

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

/** A calculation line, evaluated: its LaTeX, and anything to say about it. */
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

/** A `Title { … }` block: the variables assigned inside it are local to it. */
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
  /** `#sci` / `#dec` on the opener: the notation results inside are shown in. */
  notation?: Notation
}

export type { LayoutStyle }

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
  notation?: Notation
  /** Indentation of the opener; a line indented no further ends the block. */
  indent: number
  /** Indentation of its first line; a line indented further starts a sub-list. */
  itemIndent?: number
}

/** A whole sheet, evaluated: its blocks, and the variables it ends with. */
export interface Sheet {
  blocks: Block[]
  variables: Variable[]
}

/** A display command on a line or block (#sym, #val, #full, #hide). */
export type Command = LineCommand

/** `#sym`, `#val`, `#full`, `#hide` in a line. */
const COMMAND = commandPattern(LINE_COMMANDS, 'gi')
/** `#multiline`: a layout, so it combines with the commands above. */
const MULTILINE_COMMAND = commandPattern([MULTILINE], 'gi')
/** `#sci`, `#dec`: the notation results are shown in, which combines with the others too. */
const NOTATION_COMMAND = commandPattern(NOTATIONS, 'gi')
/** `#center`, `#list`, `#numbered`, `#text`: how a layout block (or one line) is arranged. */
const LAYOUT = commandPattern(LAYOUT_STYLES, 'gi')

/** A line that sets a constant's precision and/or display unit sheet-wide: `@c:4`, `@a_0:3 to angstrom`. */
interface Declaration { name: string; precision?: string; unit?: string }

/** A constant declaration's parts, or null if the line isn't one (`@c` alone isn't). */
function parseDeclaration(body: string): Declaration | null {
  const m = CONSTANT_DECLARATION.exec(body)
  if (!m || (m[2] === undefined && m[3] === undefined)) return null
  return { name: m[1], precision: m[2], unit: m[3] }
}

/**
 * Split a line into its body, display command and note:
 * `F = m * a  #val  # weight` → body `F = m * a`, command `val`, note `weight`.
 * Only the known commands are taken; any other `#word` stays in the note.
 */
function splitNote(text: string): {
  body: string; note?: string; command?: Command; multiline: boolean; notation?: Notation; layout?: LayoutStyle
} {
  let command: Command | undefined
  let multiline = false
  let notation: Notation | undefined
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
    .replace(MULTILINE_COMMAND, (_m, space: string) => {
      multiline = true
      return space
    })
    .replace(NOTATION_COMMAND, (_m, space: string, n: string) => {
      notation = n.toLowerCase() as Notation
      return space
    })
  const hash = rest.indexOf('#')
  if (hash < 0) return { body: rest.trim(), command, multiline, notation, layout }
  return { body: rest.slice(0, hash).trim(), note: rest.slice(hash + 1).trim() || undefined, command, multiline, notation, layout }
}

/** Read and evaluate a whole sheet, line by line, into blocks. */
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
    // (Only a line starting with @ can be one; most lines, such as imported data, can be passed over quickly.)
    if (!text.trimStart().startsWith('@')) return
    const d = parseDeclaration(splitNote(text.trim()).body)
    if (!d || d.precision === '0') return
    const first = declaredAt.get(d.name)
    if (first !== undefined) {
      duplicateDeclarations.set(i + 1, `@${d.name} is already declared on line ${first}; this line doesn't change it.`)
      return
    }
    declaredAt.set(d.name, i + 1)
    if (d.precision !== undefined) {
      calc.declareConstantPrecision(d.name, d.precision === EXACT_SETTING ? EXACT_SETTING : Number(d.precision))
    }
    if (d.unit !== undefined) calc.declareConstantUnit(d.name, d.unit)
  })
  /** Note shown on a declaration line. */
  const declarationInfo = (body: string, line: number) => {
    const d = parseDeclaration(body)
    if (!d || declaredAt.get(d.name) !== line) return undefined
    const parts = [
      d.precision === undefined ? '' : d.precision === EXACT_SETTING ? 'at full precision' : `to ${d.precision} sig figs`,
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

    const { body, note, command, multiline: ownMultiline, notation: ownNotation, layout } = splitNote(trimmed)
    // A line's own command wins; otherwise the nearest enclosing block's.
    const inherited = [...open].reverse().find((g) => g.command)?.command
    const multiline = ownMultiline || open.some((g) => g.multiline)
    const blockNotation = [...open].reverse().find((g) => g.notation)?.notation

    // `import("run1.csv")`: the file's rows are every following line indented further.
    const imported = IMPORT.exec(body)
    if (imported) {
      const importIndent = indentOf(raw)
      const rows: string[] = []
      let endLine = line
      // The rows are the lines straight under it, indented further; a blank line ends them.
      while (idx + 1 < lines.length && lines[idx + 1].trim() && indentOf(lines[idx + 1]) > importIndent) {
        idx++
        blankRun = 0
        rows.push(lines[idx].trim())
        endLine = idx + 1
      }
      const block: ImportBlock = {
        kind: 'import', line, endLine, file: imported[1], columns: [], rows: 0, note,
        hidden: (command ?? inherited) === 'hide',
      }
      if (rows.length) {
        const csv = readCsv(rows)
        const defined = csv.error ? { columns: [], error: csv.error } : calc.defineData(csv.columns)
        Object.assign(block, { columns: defined.columns, rows: csv.rows, error: defined.error })
      } else if (imported[1] !== undefined) {
        block.error = `The data from ${imported[1]} is missing: choose the file again.`
      }
      add(block)
      continue
    }

    // `def f(a, b)`: the function body is every following line indented further.
    // (`def f(x):3:deg`: settings for the result after the parameters; a lone trailing `:` is fine too.)
    const def = DEF.exec(body)
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
        ? calc.defineFunction(def[1], params, bodyLines, multiline, def[3])
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
    } else if (body.endsWith(':') && layout === 'text') {
      // `Title:  #text`: the lines indented under it are prose, not calculations.
      // Lines run together into paragraphs; a blank line starts a new one.
      const block: LayoutBlock = {
        kind: 'layout', line, title: body.slice(0, -1).trim(), note, style: 'text', children: [], indent,
        command: command ?? (inherited === 'hide' ? 'hide' : undefined),
      }
      let paragraph: { line: number; text: string[] } | null = null
      let lastText = line
      const endParagraph = () => {
        if (paragraph) block.children.push({ kind: 'text', line: paragraph.line, text: paragraph.text.join(' ') })
        paragraph = null
      }
      while (idx + 1 < lines.length && (!lines[idx + 1].trim() || indentOf(lines[idx + 1]) > indent)) {
        idx++
        const text = lines[idx].trim()
        // Blank lines at the end of the block count toward the gap after it.
        blankRun = text ? 0 : blankRun + 1
        if (!text) {
          endParagraph()
          continue
        }
        paragraph ??= { line: idx + 1, text: [] }
        paragraph.text.push(text)
        lastText = idx + 1
      }
      endParagraph()
      block.endLine = lastText
      if (!block.children.length) {
        block.error = `Nothing is indented under "${block.title || ':'}". Indent the text that belongs to it.`
      }
      add(block)
    } else if (body.endsWith(':')) {
      // `Title:  #numbered`: the lines indented under it are laid out together.
      const block: LayoutBlock = {
        kind: 'layout', line, title: body.slice(0, -1).trim(), note, style: layout, children: [], indent,
        command: command ?? (inherited === 'hide' ? 'hide' : undefined),
        multiline: ownMultiline || undefined,
        notation: ownNotation,
      }
      add(block)
      open.push(block)
    } else if (body.endsWith('{')) {
      const group: GroupBlock = {
        kind: 'group', line, title: body.slice(0, -1).trim(), note, children: [], locals: [],
        command: command ?? (inherited === 'hide' ? 'hide' : undefined),
        multiline: ownMultiline || undefined,
        notation: ownNotation,
      }
      add(group)
      open.push(group)
      calc.pushScope()
    } else {
      const effective = command ?? inherited ?? 'full'
      const mode = effective === 'hide' ? 'full' : effective
      const result = calc.evaluate(body, mode, (command ?? inherited) !== undefined, multiline, { own: ownNotation, block: blockNotation })
      // `#center` (or another layout) on a single line: lay out just that line.
      const own: LayoutBlock | undefined = layout && layout !== 'text'
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

  // The variables are listed when first asked for (for hover information): with
  // imported data there can be thousands, and most edits never need them. (Not
  // enumerable, so code that walks the sheet's properties doesn't list them all.)
  let variables: Variable[] | undefined
  return Object.defineProperty({ blocks: root }, 'variables', {
    get: () => (variables ??= calc.variables()), enumerable: false,
  }) as Sheet
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

/** Whether a block is left out of the output (and so isn't a list item). */
export function isOmitted(b: Block): boolean {
  // Spacers, and imported data, which only defines variables.
  if (b.kind === 'spacer' || b.kind === 'import') return true
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
      const m = FUNCTION_HEAD.exec(b.source)
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
  /**
   * How many numbered members of a series this name stands for (1 if not
   * given). An imported column lists only its first and last values, which
   * between them stand for all of its values.
   */
  members?: number
}

/**
 * Everything defined in the sheet, for completions and hover information:
 * variables (with their value), function parameters, functions (with their
 * signature) and `@constants`, each with the lines it's visible on.
 */
export function collectSymbols(sheet: Sheet, source: string): SheetSymbol[] {
  const lines = source.split(/\r?\n/)
  const out: SheetSymbol[] = []
  // Each scope's variables by name (a sheet can have thousands, from imported data).
  const byName = new WeakMap<() => Variable[], Map<string, Variable>>()
  const lookup = (scope: () => Variable[]) => {
    let map = byName.get(scope)
    if (!map) byName.set(scope, map = new Map(scope().map((v) => [v.name, v])))
    return map
  }
  /** A variable's symbol, with its value's TeX worked out only when it's shown. */
  const variable = (name: string, line: number, from: number, to: number, scope: () => Variable[], members?: number): SheetSymbol =>
    Object.defineProperty({ name, kind: 'variable', line, from, to, members }, 'tex', {
      get: () => lookup(scope).get(name)?.tex, enumerable: false,
    }) as SheetSymbol

  /** `to`: the last line of the innermost `{ }` block (or the sheet), where its names stop being visible;
   * `scope`: that block's variables (worked out when first needed), for their values. */
  const visit = (blocks: Block[], to: number, scope: () => Variable[]) => {
    for (const b of blocks) {
      switch (b.kind) {
        case 'calc': {
          // `tuple(a, b) = …`: each name is a variable.
          const unpack = UNPACK_HEAD.exec(b.source)
          if (unpack) {
            for (const entry of unpack[1].split(',').map((n) => n.trim())) {
              // The name without its display settings (`theta:deg` → theta).
              const name = NAME_WITH_SETTINGS.exec(entry)?.[1]
              if (name) out.push(variable(name, b.line, b.line + 1, to, scope))
            }
            break
          }
          const def = FUNCTION_HEAD.exec(b.source)
          if (def) {
            out.push({
              name: def[1], kind: 'function', line: b.line, from: b.line, to,
              tex: b.tex.split(' = ')[0], params: def[2].trim(),
            })
            break
          }
          const assign = ASSIGNMENT.exec(b.source)
          if (assign) out.push(variable(assign[1], b.line, b.line + 1, to, scope))
          break
        }
        case 'function': {
          const params = DEF_HEAD.exec(lines[b.line - 1] ?? '')?.[2].trim() ?? ''
          out.push({ name: b.name, kind: 'function', line: b.line, from: b.line, to, tex: b.signature, params })
          // Inside the body, its parameters are names too.
          for (const p of params.split(',')) {
            const name = LEADING_NAME.exec(p.trim())?.[0]
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
        case 'import':
          // Each value is a variable, t_1, t_2, …: listed by the first and last (a
          // column can have thousands), which stand for all of them in a series.
          for (const c of b.columns) {
            if (!c.count) continue
            out.push(variable(`${c.name}_${c.first}`, b.line, b.endLine + 1, to, scope, c.count > 1 ? c.count - 1 : 1))
            if (c.count > 1) out.push(variable(`${c.name}_${c.last}`, b.line, b.endLine + 1, to, scope, 1))
          }
          break
        case 'group':
          visit(b.children, b.endLine ?? lines.length, () => b.locals)
          break
        case 'layout':
          // Layout blocks don't scope their variables.
          visit(b.children, to, scope)
          break
      }
    }
  }
  visit(sheet.blocks, lines.length, () => sheet.variables)
  return out
}

/**
 * Line numbers as the sheet shows them: an import's data rows count as part of
 * its line (they're folded under it), so the line after a 27-row import on
 * line 1 is line 2. Takes a line of the file (1-based) and gives its number.
 * (The editor numbers its gutter the same way; see dataBlocks.ts.)
 */
export function lineNumbering(blocks: Block[]): (line: number) => number {
  const hidden: { after: number; count: number }[] = []
  const visit = (b: Block) => {
    if (b.kind === 'import' && b.endLine > b.line) hidden.push({ after: b.endLine, count: b.endLine - b.line })
    else if (b.kind === 'group' || b.kind === 'layout') b.children.forEach(visit)
  }
  blocks.forEach(visit)
  return (line) => line - hidden.reduce((sum, h) => sum + (h.after < line ? h.count : 0), 0)
}

/** An error or warning on a line, for the editor’s gutter. */
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
      case 'import':
        put(b.line, 'error', b.error)
        break
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

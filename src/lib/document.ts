import { Calculator, type CalcOptions, type FunctionLine, type Variable, symbolTex, unexpectedError } from './engine.ts'
import {
  ASSIGNMENT, CONSTANT_DECLARATION, EXACT_SETTING, DEF, DEF_HEAD, FUNCTION_HEAD, IMPORT, LEADING_NAME, LINE_COMMANDS,
  DISPLAY_MODE, LAYOUT_STYLE, LINE_COMMAND, MULTILINE, NAME_WITH_SETTINGS, NOTATIONS, PLOT_CALL, SELECT_CALL, UNPACK_HEAD, VALUE_IN_TEXT,
  BLOCK_CLOSE, BLOCK_OPEN, CONSTANTS_BLOCK, CONSTANTS_OPENER, LAYOUT_OPENER, LINE_LAYOUTS, PROSE_LAYOUTS, SIGIL, layoutOpenerText,
  DISPLAY_MODES, LAYOUT_MEMBERS, LAYOUT_MODIFIER, LAYOUT_MODIFIERS, LAYOUT_STYLES, MEMBER_DOT, NAMESPACE, layoutMembers, layoutName,
  commandPattern, indentOf, isComment,
  type DisplayMode, type LayoutModifier, type LayoutStyle, type LineLayout, type Notation,
} from './syntax.ts'
import { constantKey } from './names.ts'
import { parseCsv, type CsvData } from './csv.ts'
import { REACTION_LINE, formulaTex, outsideMaths, withFormulas } from './chemistry.ts'
import {
  BLOCK_KIND, isContainer, type Block, type BlockSettings, type Command, type ConstantsBlock, type GroupBlock, type ImportBlock,
  type LayoutBlock,
} from './blocks.ts'

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
 * Layout blocks are in @layout, and hold the lines up to their `}`:
 *   @layout.numbered Steps {   → numbered list (list: bullets, center: centered)
 *       a = …                     each line is an item; indent further for a sub-list
 *   }
 *   @layout.text Discussion {  → prose: lines run into paragraphs, nothing is worked out
 *   @layout.titlepage Lab 3 {  → a title page: the title, with the lines inside centered under it
 * They only arrange lines: variables assigned inside stay available afterwards.
 * `#center` (or #list/#numbered) on a single calculation lays out just that line.
 *
 * Blocks scope variables like a programming language: inside a block you can
 * read everything defined above it, but anything assigned inside is local and
 * disappears at the closing `}`, leaving outer variables of the same name untouched.
 *
 * (What each kind of block holds is in blocks.ts.)
 */

/** A whole sheet, evaluated: its blocks, and the variables it ends with. */
export interface Sheet {
  blocks: Block[]
  variables: Variable[]
}

/** `#sym`, `#val`, `#full`, `#hide` in a line. */
const COMMAND = commandPattern(LINE_COMMANDS, 'gi')
/** `#multiline`: a layout, so it combines with the commands above. */
const MULTILINE_COMMAND = commandPattern([MULTILINE], 'gi')
/** `#sci`, `#dec`: the notation results are shown in, which combines with the others too. */
const NOTATION_COMMAND = commandPattern(NOTATIONS, 'gi')
/** `#center`, `#list`, `#numbered`: how one line is laid out. */
const LAYOUT = commandPattern(LINE_LAYOUTS, 'gi')

/** A layout block's opener, read: its members as written, the layout and settings they give, and its title. */
interface LayoutOpener extends BlockSettings {
  members: string[]
  style?: LayoutStyle
  title: string
  /** A member @layout doesn't have. */
  error?: string
  /** Members that clash, such as .sym with .val: the block still works, as described. */
  warning?: string
}

const isLayoutStyle = (m: string): m is LayoutStyle => (LAYOUT_STYLES as readonly string[]).includes(m)
const isLayoutModifier = (m: string): m is LayoutModifier => (LAYOUT_MODIFIERS as readonly string[]).includes(m)

/** The display modes a layout block's members can set, of which only one can apply: .full, .sym, .val. */
const MODE_MODIFIERS: ReadonlySet<string> = new Set(DISPLAY_MODES)

/** A member written as it is in a name, for messages: `.val`. */
const asMember = (m: string) => `${MEMBER_DOT}${m}`

/**
 * A layout block's opener, `@layout.numbered.val Steps {`, read; null if the line
 * isn't one. Members combine as written; where two can't both apply (two layouts,
 * .sym with .val, .sci with .dec, a display setting on prose), there's a warning,
 * and the first layout and the last of the others are used.
 */
function layoutOpener(body: string): LayoutOpener | null {
  const m = LAYOUT_OPENER.exec(body)
  if (!m) return null
  const members = layoutMembers(m[1])
  const opener: LayoutOpener = { members, title: m[2] ?? '' }
  const unknown = members.find((x) => !isLayoutStyle(x) && !isLayoutModifier(x))
  if (unknown) {
    return { ...opener, error: `${SIGIL}${NAMESPACE.layout} has no ${unknown}; its members are ${LAYOUT_MEMBERS.join(', ')}.` }
  }
  const styles = members.filter(isLayoutStyle)
  const modifiers = members.filter(isLayoutModifier)
  const modes = modifiers.filter((x) => MODE_MODIFIERS.has(x)) as DisplayMode[]
  const notations = modifiers.filter((x) => (NOTATIONS as readonly string[]).includes(x)) as Notation[]
  opener.style = styles[0]
  opener.command = modifiers.includes(LAYOUT_MODIFIER.hidden) ? LINE_COMMAND.hide : modes.at(-1)
  opener.multiline = modifiers.includes(LAYOUT_MODIFIER.multiline) || undefined
  opener.notation = notations.at(-1)
  const name = layoutName(...members)
  const shown = modifiers.filter((x) => x !== LAYOUT_MODIFIER.hidden)
  const warnings = [
    styles.length > 1 && `${name} has more than one layout; it's laid out as ${asMember(styles[0])}.`,
    modes.length > 1 && `${name} has more than one of ${DISPLAY_MODES.map(asMember).join(', ')}; the last, ${asMember(modes.at(-1)!)}, is used.`,
    notations.length > 1 && `${name} has both ${NOTATIONS.map(asMember).join(' and ')}; the last, ${asMember(notations.at(-1)!)}, is used.`,
    opener.style && PROSE_LAYOUTS.has(opener.style) && shown.length > 0
      && `Nothing in ${layoutName(opener.style)} is worked out, so ${shown.map(asMember).join(', ')} does nothing there.`,
  ].filter((w): w is string => !!w)
  if (warnings.length) opener.warning = warnings.join(' ')
  return opener
}

/** Whether a line closes a block: `}`, with anything after it. */
const closesBlock = (text: string) => text.trimStart().startsWith(BLOCK_CLOSE)

/** A layout block's opener as written, for messages: `@layout.list Steps {`. */
const openerText = (b: LayoutBlock) => layoutOpenerText(b.members ?? [b.style ?? LAYOUT_STYLE.list], b.title)

/**
 * A line that sets a constant's precision and/or display unit sheet-wide: `@c:4`,
 * `@a_0:3 to angstrom`, `@chem.mm.Na:3`. Its name as typed (chem.mm.Na), and inside (chem__mm__Na).
 */
interface Declaration { name: string; key: string; precision?: string; unit?: string }

/** A constant declaration's parts, or null if the line isn't one (`@c` alone isn't). */
function parseDeclaration(body: string): Declaration | null {
  const m = CONSTANT_DECLARATION.exec(body)
  if (!m || (m[2] === undefined && m[3] === undefined)) return null
  return { name: m[1], key: constantKey(m[1]), precision: m[2], unit: m[3] }
}

/**
 * Split a line into its body, display command and note:
 * `F = m * a  #val  # weight` → body `F = m * a`, command `val`, note `weight`.
 * Only the known commands are taken; any other `#word` stays in the note.
 */
function splitNote(text: string): {
  body: string; note?: string; command?: Command; multiline: boolean; notation?: Notation; layout?: LineLayout
} {
  let command: Command | undefined
  let multiline = false
  let notation: Notation | undefined
  let layout: LineLayout | undefined
  const rest = text
    .replace(LAYOUT, (_m, space: string, style: string) => {
      layout = style.toLowerCase() as LineLayout
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

/** A sheet evaluated, and how long that took (ms), to decide when to evaluate it next. */
export function evaluateSheetTimed(source: string, options: CalcOptions): { sheet: Sheet; ms: number } {
  const started = performance.now()
  return { sheet: evaluateSheetSafely(source, options), ms: performance.now() - started }
}

/**
 * A sheet evaluated, whatever happens: if reading it fails in a way nothing
 * expected, the sheet is one error saying so, rather than the app going blank.
 */
export function evaluateSheetSafely(source: string, options: CalcOptions): Sheet {
  try {
    return evaluateSheet(source, options)
  } catch (e) {
    return { blocks: [{ kind: BLOCK_KIND.calc, line: 1, source: '', tex: '', error: unexpectedError(e) }], variables: [] }
  }
}

/** Read and evaluate a whole sheet, line by line, into blocks. */
export function evaluateSheet(source: string, options: CalcOptions): Sheet {
  const calc = new Calculator(options)
  const root: Block[] = []
  /** Blocks currently open: `{ }` groups, `@list { }` layout blocks, and the sub-lists indented inside lists. */
  const open: (GroupBlock | LayoutBlock)[] = []
  const add = (b: Block) => (open.at(-1)?.children ?? root).push(b)
  /**
   * Text with each `{{x}}` (outside `$…$`) as x's value at this point in the
   * sheet, and each formula `{Na^+}` as chemistry, in inline maths; and what's
   * wrong with the first value that can't be worked out.
   */
  const withValues = (text: string): { text: string; error?: string } => {
    if (!text.includes('{')) return { text }
    let error: string | undefined
    const filled = outsideMaths(text, (part) => part.replace(VALUE_IN_TEXT, (whole, source: string) => {
      const v = calc.inlineValue(source)
      if (v.tex !== undefined) return `$${v.tex}$`
      error ??= `${whole}: ${v.error}`
      return whole
    }))
    return { text: withFormulas(filled), error }
  }
  const lastLine = (b: Block): number =>
    ('endLine' in b && b.endLine) || b.line
  /** Whether the innermost open block is a sub-list (which ends where its indentation does). */
  const inSubList = () => open.at(-1)?.kind === BLOCK_KIND.layout && !!(open.at(-1) as LayoutBlock).nested
  /** Close the innermost layout block: at its `}` line, or for a sub-list, at its last line. */
  const closeLayout = (closingLine?: number) => {
    const layout = open.pop() as LayoutBlock
    layout.endLine = closingLine ?? (layout.children.length ? lastLine(layout.children.at(-1)!) : layout.line)
    if (!layout.children.length && !layout.nested) {
      layout.error = `${openerText(layout)} is empty: put the lines that belong to it before its ${BLOCK_CLOSE}.`
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
    if (!text.trimStart().startsWith(SIGIL)) return
    const d = parseDeclaration(splitNote(text.trim()).body)
    if (!d || d.precision === '0') return
    const first = declaredAt.get(d.key)
    if (first !== undefined) {
      duplicateDeclarations.set(i + 1, `${SIGIL}${d.name} is already declared on line ${first}; this line doesn't change it.`)
      return
    }
    declaredAt.set(d.key, i + 1)
    if (d.precision !== undefined) {
      calc.declareConstantPrecision(d.key, d.precision === EXACT_SETTING ? EXACT_SETTING : Number(d.precision))
    }
    if (d.unit !== undefined) calc.declareConstantUnit(d.key, d.unit)
  })
  /** Note shown on a declaration line. */
  const declarationInfo = (body: string, line: number) => {
    const d = parseDeclaration(body)
    if (!d || declaredAt.get(d.key) !== line) return undefined
    const parts = [
      d.precision === undefined ? '' : d.precision === EXACT_SETTING ? 'at full precision' : `to ${d.precision} sig figs`,
      d.unit === undefined ? '' : `in ${d.unit}`,
    ].filter(Boolean).join(', ')
    const unless = d.precision === undefined ? '' : ', unless written with its own :n'
    return `Every ${SIGIL}${d.name} in this sheet uses this value, ${parts}${unless}.`
  }

  // Define every `@constants { }` block's constants, so `@name` works anywhere
  // in the sheet, even above the block.
  const constantBlocks = new Map<number, { end: number; block: ConstantsBlock }>()
  for (let i = 0; i < lines.length; i++) {
    const opener = splitNote(lines[i].trim())
    if (!CONSTANTS_OPENER.test(opener.body)) continue
    const entries: ConstantsBlock['entries'] = []
    /** Precision declarations in the block, shown once all its constants exist. */
    const declarations: number[] = []
    let end = lines.length - 1
    let closed = false
    for (let j = i + 1; j < lines.length; j++) {
      const text = lines[j].trim()
      if (closesBlock(text)) {
        end = j
        closed = true
        break
      }
      if (!text || text.startsWith('#') || isComment(text)) continue
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
      const result = calc.evaluate(e.source, DISPLAY_MODE.full)
      entries[k] = {
        ...e, ...result,
        info: result.error ? undefined : declarationInfo(e.source, e.line),
        warning: duplicateDeclarations.get(e.line) ?? result.warning,
      }
    }
    constantBlocks.set(i, {
      end,
      block: {
        kind: BLOCK_KIND.constants, line: i + 1, endLine: end + 1, note: opener.note, entries, hidden: opener.command === LINE_COMMAND.hide,
        error: closed ? undefined : `The ${SIGIL}${CONSTANTS_BLOCK} block on line ${i + 1} is missing its closing ${BLOCK_CLOSE}.`,
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
    // A comment is as if it weren't there: it doesn't end a block, or break up blank lines.
    if (isComment(trimmed)) continue
    // A sub-list ends at the first line indented no further than the items it's under.
    const indent = indentOf(raw)
    while (inSubList() && indent <= (open.at(-1) as LayoutBlock).indent) closeLayout()
    // In a list, a line indented further than the items starts a sub-list.
    const top = open.at(-1)
    if (top?.kind === BLOCK_KIND.layout && !closesBlock(trimmed)) {
      top.itemIndent ??= indent
      if (indent > top.itemIndent && (top.style === LAYOUT_STYLE.list || top.style === LAYOUT_STYLE.numbered) && top.children.length) {
        const sub: LayoutBlock = {
          kind: BLOCK_KIND.layout, line, title: '', style: top.style, children: [], nested: true,
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
    const inList = parent?.kind === BLOCK_KIND.layout && (parent.style === LAYOUT_STYLE.list || parent.style === LAYOUT_STYLE.numbered)
    if (blankRun >= 2 && container.length && !closesBlock(trimmed) && !inList) add({ kind: BLOCK_KIND.spacer, line })
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
      add({ kind: BLOCK_KIND.heading, line, level, number, ...withValues(trimmed.replace(/^#+/, '').trim()) })
      continue
    }
    if (trimmed.startsWith('>')) {
      add({ kind: BLOCK_KIND.text, line, ...withValues(trimmed.slice(1).trim()) })
      continue
    }
    if (trimmed.startsWith('$')) {
      add({ kind: BLOCK_KIND.latex, line, latex: trimmed.replace(/^\$+|\$+$/g, '').trim() })
      continue
    }

    const { body, note, command, multiline: ownMultiline, notation: ownNotation, layout } = splitNote(trimmed)

    // `{OH^- + H3O^+ -> 2 H2O}`: a formula on its own, a reaction, displayed (not worked out).
    const reaction = REACTION_LINE.exec(body)
    if (reaction) {
      add({ kind: BLOCK_KIND.latex, line, latex: formulaTex(reaction[1]) })
      continue
    }
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
        kind: BLOCK_KIND.import, line, endLine, name: imported[1], file: imported[2], columns: [], rows: 0, note,
        hidden: (command ?? inherited) === LINE_COMMAND.hide,
      }
      if (rows.length) {
        const csv = readCsv(rows)
        const defined = csv.error ? { columns: [], error: csv.error } : calc.defineData(csv.columns, imported[1])
        Object.assign(block, { columns: defined.columns, rows: csv.rows, error: defined.error })
      } else if (imported[2] !== undefined) {
        block.error = `The data from ${imported[2]} is missing: choose the file again.`
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
        if (isComment(text)) continue
        // Blank lines at the end of the body count toward the gap after the function.
        blankRun = text ? 0 : blankRun + 1
        if (!text || text.startsWith('#')) continue // blank lines and comments
        const split = splitNote(text)
        bodyLines.push({ line: idx + 1, text: split.body, note: split.note, command: split.command, multiline: split.multiline, indent: indentOf(lines[idx]) })
      }
      const params = def[2].split(',').map((p) => p.trim()).filter(Boolean)
      // Parameters (`m`, or `m to kg`) are checked by defineFunction.
      const result = bodyLines.length
        ? calc.defineFunction(def[1], params, bodyLines, multiline, def[3])
        : { signature: symbolTex(def[1]), body: [], error: `${def[1]} has no body: indent the lines under def.` }
      add({
        kind: BLOCK_KIND.function, line, endLine: bodyLines.at(-1)?.line ?? line, name: def[1], note,
        hidden: (command ?? inherited) === LINE_COMMAND.hide, ...result,
      })
      continue
    }

    const layoutBlock = layoutOpener(body)
    if (body === BLOCK_CLOSE) {
      // Sub-lists inside the block end with it; then the block itself, a `{ }` group or an `@layout.list { }`.
      while (inSubList()) closeLayout()
      const block = open.at(-1)
      if (block?.kind === BLOCK_KIND.layout) {
        closeLayout(line)
      } else if (block) {
        open.pop()
        block.locals = calc.popScope()
        block.endLine = line
      } else {
        add({ kind: BLOCK_KIND.calc, line, source: body, tex: '', error: `Unmatched ${BLOCK_CLOSE}: no block is open here.` })
      }
    } else if (layoutBlock?.style && PROSE_LAYOUTS.has(layoutBlock.style)) {
      // `@layout.text Title {` and `@layout.titlepage {`: the lines up to the `}` are
      // prose, not calculations. In a text block, lines run together into paragraphs
      // and a blank line starts a new one; on a title page each line stays a line of
      // its own, a blank line leaves a gap, and the first line is the title (unless
      // the opener has one).
      const style = layoutBlock.style
      const titlePage = style === LAYOUT_STYLE.titlepage
      const block: LayoutBlock = {
        kind: BLOCK_KIND.layout, line, title: '', note, style, members: layoutBlock.members, children: [], indent,
        // (Prose only takes .hidden, or #hide.)
        command: (layoutBlock.command === LINE_COMMAND.hide ? layoutBlock.command : undefined)
          ?? command ?? (inherited === LINE_COMMAND.hide ? LINE_COMMAND.hide : undefined),
        warning: layoutBlock.warning,
      }
      let titleSource = layoutBlock.title
      let paragraph: { line: number; text: string[] } | null = null
      let gap = false
      const endParagraph = () => {
        if (paragraph) block.children.push({ kind: BLOCK_KIND.text, line: paragraph.line, ...withValues(paragraph.text.join(' ')) })
        paragraph = null
      }
      let closed = false
      while (idx + 1 < lines.length) {
        idx++
        const text = lines[idx].trim()
        if (closesBlock(text)) {
          closed = true
          break
        }
        if (isComment(text)) continue
        if (!text) {
          endParagraph()
          gap = block.children.length > 0
          continue
        }
        if (!titlePage) {
          paragraph ??= { line: idx + 1, text: [] }
          paragraph.text.push(text)
          continue
        }
        if (!titleSource) {
          titleSource = text
          continue
        }
        if (gap) block.children.push({ kind: BLOCK_KIND.spacer, line: idx + 1 })
        gap = false
        block.children.push({ kind: BLOCK_KIND.text, line: idx + 1, ...withValues(text) })
      }
      endParagraph()
      const title = withValues(titleSource)
      block.title = title.text
      block.error = title.error
      blankRun = 0
      block.endLine = idx + 1
      if (!closed) block.error = `${openerText(block)} is missing its closing ${BLOCK_CLOSE}.`
      else if (!block.children.length && !(titlePage && block.title)) {
        block.error = `${openerText(block)} is empty: put the text that belongs to it before its ${BLOCK_CLOSE}.`
      }
      add(block)
    } else if (layoutBlock) {
      // `@layout.numbered Title {`, `@layout.val.multiline {`: the lines up to its `}` are
      // laid out together, shown as its members say (and stay in scope after it).
      // Its members' settings win over the #commands on its opener.
      const title = withValues(layoutBlock.title)
      const block: LayoutBlock = {
        kind: BLOCK_KIND.layout, line, title: title.text, note, style: layoutBlock.style, members: layoutBlock.members, children: [], indent,
        command: layoutBlock.command ?? command ?? (inherited === LINE_COMMAND.hide ? LINE_COMMAND.hide : undefined),
        multiline: layoutBlock.multiline || ownMultiline || undefined,
        notation: layoutBlock.notation ?? ownNotation,
        error: layoutBlock.error ?? title.error,
        warning: layoutBlock.warning,
      }
      add(block)
      open.push(block)
    } else if (body.endsWith(BLOCK_OPEN)) {
      // (Values in its title are the ones from before the block.)
      const title = withValues(body.slice(0, -1).trim())
      const group: GroupBlock = {
        kind: BLOCK_KIND.group, line, title: title.text, note, children: [], locals: [],
        command: command ?? (inherited === LINE_COMMAND.hide ? LINE_COMMAND.hide : undefined),
        multiline: ownMultiline || undefined,
        notation: ownNotation,
        error: title.error,
      }
      add(group)
      open.push(group)
      calc.pushScope()
    } else {
      const effective = command ?? inherited ?? DISPLAY_MODE.full
      const mode = effective === LINE_COMMAND.hide ? DISPLAY_MODE.full : effective
      const result = calc.evaluate(body, mode, (command ?? inherited) !== undefined, multiline, { own: ownNotation, block: blockNotation })
      // `#center` (or another layout) on a single line: lay out just that line.
      const own: LayoutBlock | undefined = layout
        ?{ kind: BLOCK_KIND.layout, line, endLine: line, title: '', style: layout, children: [], indent }
        : undefined
      if (own) add(own)
      // A line that's just a function call can take its note from the return line.
      ;(own?.children ?? open.at(-1)?.children ?? root).push({
        kind: BLOCK_KIND.calc, line, source: body, hidden: effective === LINE_COMMAND.hide, ...result,
        note: note ?? result.returnNote,
        info: result.info ?? (result.error ? undefined : declarationInfo(body, line)),
        warning: duplicateDeclarations.get(line) ?? result.warning,
      })
    }
  }

  // Close anything left open so its locals don't leak into the top level.
  while (open.length) {
    const block = open.at(-1)!
    if (block.kind === BLOCK_KIND.layout) {
      const subList = !!block.nested
      closeLayout(subList ? undefined : lines.length)
      block.error ??= subList ? undefined : `${openerText(block)} on line ${block.line} is missing its closing ${BLOCK_CLOSE}.`
      continue
    }
    open.pop()
    block.locals = calc.popScope()
    block.endLine = lines.length
    block.error = `Block opened on line ${block.line} is missing its closing ${BLOCK_CLOSE}.`
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
/** Each kind of piece of a title. */
export const TITLE_SEGMENT = { text: 'text', sub: 'sub', math: 'math' } as const
export type TitleSegmentKind = (typeof TITLE_SEGMENT)[keyof typeof TITLE_SEGMENT]

export type TitleSegment = { kind: TitleSegmentKind; value: string }

/** `p_z`, `E_k`, `x_{max}`: a subscript after a letter or digit. `\_` is a plain underscore. */
const SUBSCRIPT = /(?<=[A-Za-z0-9])(?<!\\)_(\{[^{}]*\}|[A-Za-z0-9]+)/g

/**
 * Headings and block titles: `2p_z` shows its subscript (as variable names do),
 * and `$…$` is inline maths, as in `>` text.
 */
export function titleSegments(text: string): TitleSegment[] {
  const out: TitleSegment[] = []
  const plain = (s: string) => {
    if (s) out.push({ kind: TITLE_SEGMENT.text, value: s.replace(/\\_/g, '_') })
  }
  for (const seg of splitInlineMath(text)) {
    if (seg.math) {
      out.push({ kind: TITLE_SEGMENT.math, value: seg.value })
      continue
    }
    let last = 0
    for (const m of seg.value.matchAll(SUBSCRIPT)) {
      plain(seg.value.slice(last, m.index))
      out.push({ kind: TITLE_SEGMENT.sub, value: m[1].replace(/^\{|\}$/g, '') })
      last = m.index + m[0].length
    }
    plain(seg.value.slice(last))
  }
  return out
}

/** Whether a block is left out of the output (and so isn't a list item). */
export function isOmitted(b: Block): boolean {
  // Spacers, and imported data, which only defines variables.
  if (b.kind === BLOCK_KIND.spacer || b.kind === BLOCK_KIND.import) return true
  if (b.kind === BLOCK_KIND.calc || b.kind === BLOCK_KIND.function || b.kind === BLOCK_KIND.constants) return !!b.hidden && !b.error
  if (isContainer(b)) return b.command === LINE_COMMAND.hide && !b.error
  return false
}

/** A list block's items, each with the sub-lists indented under it. */
export function listItems(children: Block[]): { item: Block; subs: Block[] }[] {
  const items: { item: Block; subs: Block[] }[] = []
  for (const c of children) {
    if (isOmitted(c)) continue
    if (c.kind === BLOCK_KIND.layout && c.nested && items.length) items.at(-1)!.subs.push(c)
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
    if (b.kind === BLOCK_KIND.function) put(b.name, b.line)
    else if (b.kind === BLOCK_KIND.calc) {
      const m = FUNCTION_HEAD.exec(b.source)
      if (m) put(m[1], b.line)
    } else if (isContainer(b)) b.children.forEach(visit)
  }
  blocks.forEach(visit)
  for (const lines of out.values()) lines.sort((a, b) => a - b)
  return out
}

/** Each kind of name the editor knows. */
export const SYMBOL_KIND = { variable: 'variable', parameter: 'parameter', function: 'function', constant: 'constant' } as const
export type SymbolKind = (typeof SYMBOL_KIND)[keyof typeof SYMBOL_KIND]

/** A name the editor can suggest or describe, and where it's visible. */
export interface SheetSymbol {
  name: string
  kind: SymbolKind
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
  /**
   * TeX for any variable defined where this one is, by name: for a series'
   * members between its first and last, which aren't listed one by one.
   */
  texOf?: (name: string) => string | undefined
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
    Object.defineProperties({ name, kind: SYMBOL_KIND.variable, line, from, to, members }, {
      tex: { get: () => lookup(scope).get(name)?.tex, enumerable: false },
      texOf: { value: (other: string) => lookup(scope).get(other)?.tex, enumerable: false },
    }) as SheetSymbol

  /** `to`: the last line of the innermost `{ }` block (or the sheet), where its names stop being visible;
   * `scope`: that block's variables (worked out when first needed), for their values. */
  const visit = (blocks: Block[], to: number, scope: () => Variable[]) => {
    for (const b of blocks) {
      switch (b.kind) {
        case BLOCK_KIND.calc: {
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
              name: def[1], kind: SYMBOL_KIND.function, line: b.line, from: b.line, to,
              tex: b.tex.split(' = ')[0], params: def[2].trim(),
            })
            break
          }
          // A select or named plot: the variables it made, a.x_1, p.slope (not a variable a).
          if (b.defines || SELECT_CALL.test(b.source) || PLOT_CALL.test(b.source)) {
            for (const d of b.defines ?? []) out.push(variable(d.name, b.line, b.line + 1, to, scope, d.members))
            break
          }
          const assign = ASSIGNMENT.exec(b.source)
          if (assign) out.push(variable(assign[1], b.line, b.line + 1, to, scope))
          break
        }
        case BLOCK_KIND.function: {
          const params = DEF_HEAD.exec(lines[b.line - 1] ?? '')?.[2].trim() ?? ''
          out.push({ name: b.name, kind: SYMBOL_KIND.function, line: b.line, from: b.line, to, tex: b.signature, params })
          // Inside the body, its parameters are names too.
          for (const p of params.split(',')) {
            const name = LEADING_NAME.exec(p.trim())?.[0]
            if (name) out.push({ name, kind: SYMBOL_KIND.parameter, line: b.line, from: b.line + 1, to: b.endLine })
          }
          break
        }
        case BLOCK_KIND.constants:
          for (const e of b.entries) {
            const name = ASSIGNMENT.exec(e.source)?.[1]
            if (name) out.push({ name: `@${name}`, kind: SYMBOL_KIND.constant, line: e.line, from: 1, to: lines.length, tex: e.tex })
          }
          break
        case BLOCK_KIND.import:
          // Each value is a variable, t_1, t_2, …: listed by the first and last (a
          // column can have thousands), which stand for all of them in a series.
          for (const c of b.columns) {
            if (!c.count) continue
            out.push(variable(`${c.name}_${c.first}`, b.line, b.endLine + 1, to, scope, c.count > 1 ? c.count - 1 : 1))
            if (c.count > 1) out.push(variable(`${c.name}_${c.last}`, b.line, b.endLine + 1, to, scope, 1))
          }
          break
        case BLOCK_KIND.group:
          visit(b.children, b.endLine ?? lines.length, () => b.locals)
          break
        case BLOCK_KIND.layout:
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
    if (b.kind === BLOCK_KIND.import && b.endLine > b.line) hidden.push({ after: b.endLine, count: b.endLine - b.line })
    else if (isContainer(b)) b.children.forEach(visit)
  }
  blocks.forEach(visit)
  return (line) => line - hidden.reduce((sum, h) => sum + (h.after < line ? h.count : 0), 0)
}

/** How serious a line's message is. */
export const DIAGNOSTIC_KIND = { error: 'error', warning: 'warning' } as const
export type DiagnosticKind = (typeof DIAGNOSTIC_KIND)[keyof typeof DIAGNOSTIC_KIND]

/** An error or warning on a line, for the editor’s gutter. */
export interface Diagnostic {
  kind: DiagnosticKind
  message: string
}

/** Errors and warnings by source line, for marking lines in the editor. */
export function collectDiagnostics(blocks: Block[]): Map<number, Diagnostic> {
  const out = new Map<number, Diagnostic>()
  const put = (line: number, kind: Diagnostic['kind'], message?: string) => {
    if (!message) return
    const existing = out.get(line)
    if (!existing || (existing.kind === DIAGNOSTIC_KIND.warning && kind === DIAGNOSTIC_KIND.error)) out.set(line, { kind, message })
  }
  const visit = (b: Block) => {
    switch (b.kind) {
      case BLOCK_KIND.calc:
        put(b.line, DIAGNOSTIC_KIND.warning, b.warning)
        put(b.line, DIAGNOSTIC_KIND.error, b.error)
        break
      case BLOCK_KIND.function: {
        // "Line 12: …" errors point at a body line.
        const at = /^Line (\d+): (.*)$/.exec(b.error ?? '')
        put(at ? Number(at[1]) : b.line, DIAGNOSTIC_KIND.error, at ? at[2] : b.error)
        break
      }
      case BLOCK_KIND.import:
      case BLOCK_KIND.heading:
      case BLOCK_KIND.text:
        put(b.line, DIAGNOSTIC_KIND.error, b.error)
        break
      case BLOCK_KIND.constants:
        put(b.line, DIAGNOSTIC_KIND.error, b.error)
        for (const e of b.entries) {
          put(e.line, DIAGNOSTIC_KIND.warning, e.warning)
          put(e.line, DIAGNOSTIC_KIND.error, e.error)
        }
        break
      case BLOCK_KIND.layout:
        put(b.line, DIAGNOSTIC_KIND.warning, b.warning)
        put(b.line, DIAGNOSTIC_KIND.error, b.error)
        b.children.forEach(visit)
        break
      case BLOCK_KIND.group:
        put(b.line, DIAGNOSTIC_KIND.error, b.error)
        b.children.forEach(visit)
        break
    }
  }
  blocks.forEach(visit)
  return out
}

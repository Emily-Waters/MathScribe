/**
 * The reader of each kind of node in a sheet's tree (the core's: a module's are
 * its own). The tree says what each line is, and which lines a block holds.
 */
import { symbolTex, type FunctionLine } from '../engine/index.ts'
import { BLOCK_CLOSE, BLOCK_OPEN, CONSTANTS_BLOCK, DEF, DISPLAY_MODE, EXACT_SETTING, IMPORT, LATEX_BLOCK, LATEX_OPENER, LAYOUT_STYLE, LINE_COMMAND, SIGIL } from '../syntax.ts'
import { BLOCK_KIND, HEADING_LEVEL, type ConstantsBlock, type GroupBlock, type HeadingLevel, type SectionTitle, type ImportBlock, type LayoutBlock } from '../blocks.ts'
import { NODE_KIND } from '../tree/index.ts'
import { bracesBalance, layoutOpener, openerText, parseConstantDeclaration, readCsv, splitNote, type SplitLine } from './lineSyntax.ts'
import { NodeReader, SheetWideReader, bodyLines, type Line, type TreeItem } from './reader.ts'
import type { SheetReader } from './sheetReader.ts'

// ---------------------------------------------------------------------------
// Read before anything else: what applies to the whole sheet
// ---------------------------------------------------------------------------

/**
 * Declarations, `@c:4` or `@a_0:3 to angstrom` on a line of its own: they apply
 * to the whole sheet, constants defined from them included, so they're read
 * before the constants. The first declaration of a constant wins; later ones get
 * a warning. (The line itself is worked out as a calculation, where it's written.)
 */
class DeclarationsReader extends NodeReader {
  // (It reads no node: a declaration is worked out as a calculation where it's written.)
  readonly kinds = []

  override prepare(sheet: SheetReader): void {
    sheet.lines.forEach((text, i) => {
      // (Only a line starting with @ can be one; most lines, such as imported data, can be passed over quickly.)
      if (!text.trimStart().startsWith(SIGIL)) return
      const d = parseConstantDeclaration(splitNote(text.trim()).body)
      if (!d || d.precision === '0') return
      const first = sheet.declaredAt.get(d.key)
      if (first !== undefined) {
        sheet.duplicateDeclarations.set(i + 1, `${SIGIL}${d.name} is already declared on line ${first}; this line doesn't change it.`)
        return
      }
      sheet.declaredAt.set(d.key, i + 1)
      if (d.precision !== undefined) {
        sheet.calc.declareConstantPrecision(d.key, d.precision === EXACT_SETTING ? EXACT_SETTING : Number(d.precision))
      }
      if (d.unit !== undefined) sheet.calc.declareConstantUnit(d.key, d.unit)
    })
  }

  read(): void {}
}

/** Every `@constants { }` block's constants, defined first, so `@name` works anywhere in the sheet, above the block too. */
class ConstantsReader extends SheetWideReader<ConstantsBlock> {
  readonly kinds = [NODE_KIND.constants]

  override prepare(sheet: SheetReader): void {
    const { calc } = sheet
    for (const item of sheet.allItems()) {
      if (item.node.kind !== NODE_KIND.constants) continue
      const opener = item.line.parts
      const entries: ConstantsBlock['entries'] = []
      /** Precision declarations in the block, shown once all its constants exist. */
      const declarations: number[] = []
      for (const { number, trimmed: text } of bodyLines(item)) {
        if (!text || text.startsWith('#')) continue
        const entry = splitNote(text)
        if (parseConstantDeclaration(entry.body)) {
          declarations.push(entries.length)
          entries.push({ line: number, source: entry.body, note: entry.note, tex: '' })
          continue
        }
        entries.push({ line: number, source: entry.body, note: entry.note, ...calc.defineConstant(entry.body) })
      }
      for (const k of declarations) {
        const e = entries[k]
        const result = calc.evaluate(e.source, DISPLAY_MODE.full)
        entries[k] = {
          ...e, ...result,
          info: result.error ? undefined : sheet.declarationInfo(e.source, e.line),
          warning: sheet.duplicateDeclarations.get(e.line) ?? result.warning,
        }
      }
      const line = item.line.number
      this.prepared.set(item, {
        kind: BLOCK_KIND.constants, line, endLine: item.last + 1, note: opener.note, entries, hidden: opener.command === LINE_COMMAND.hide,
        error: item.closer ? undefined : `The ${SIGIL}${CONSTANTS_BLOCK} block on line ${line} is missing its closing ${BLOCK_CLOSE}.`,
      })
    }
  }
}

// ---------------------------------------------------------------------------
// Lines of text
// ---------------------------------------------------------------------------

/** `# Title`, `## Title`, `### Title`: a heading, numbered as LaTeX numbers sections and subsections. */
class HeadingReader extends NodeReader {
  readonly kinds = [NODE_KIND.heading]

  read({ line }: TreeItem, sheet: SheetReader): void {
    const heading = headingOf(line.trimmed)!
    addHeading(sheet, line, heading.level, heading.text)
  }
}

/** A heading's marks, the `#`s it starts with. */
const HEADING_MARKS = /^#+/

/** A line written as a heading, `## Title`: its level and its text (null if it isn't one). */
function headingOf(trimmed: string): { level: HeadingLevel; text: string } | null {
  const marks = HEADING_MARKS.exec(trimmed)?.[0]
  if (!marks) return null
  return { level: Math.min(marks.length, HEADING_LEVEL.paragraph) as HeadingLevel, text: trimmed.slice(marks.length).trim() }
}

/** A heading's number, as LaTeX numbers sections and subsections (none for a bold paragraph). */
function headingNumber(sheet: SheetReader, level: HeadingLevel): string | undefined {
  // Mirror LaTeX's counters: a new section resets the subsection count.
  if (level === HEADING_LEVEL.section) {
    sheet.section++
    sheet.subsection = 0
    return `${sheet.section}`
  }
  if (level === HEADING_LEVEL.subsection) {
    sheet.subsection++
    return `${sheet.section}.${sheet.subsection}`
  }
  return undefined
}

/** Add a heading, numbered as LaTeX numbers sections and subsections. */
function addHeading(sheet: SheetReader, line: Line, level: HeadingLevel, text: string): void {
  sheet.add({ kind: BLOCK_KIND.heading, line: line.number, level, number: headingNumber(sheet, level), ...sheet.withValues(text) })
}

/** `> Some prose`: a paragraph. */
class TextReader extends NodeReader {
  readonly kinds = [NODE_KIND.paragraph]

  read({ line }: TreeItem, sheet: SheetReader): void {
    sheet.add({ kind: BLOCK_KIND.text, line: line.number, ...sheet.withValues(line.trimmed.slice(1).trim()) })
  }
}

/** `@latex { … }`: raw LaTeX, up to a `}` on its own line, or all on this one. */
class LatexReader extends NodeReader {
  readonly kinds = [NODE_KIND.latex, NODE_KIND.latexBlock]

  read(item: TreeItem, sheet: SheetReader): void {
    const { line } = item
    const rest = LATEX_OPENER.exec(line.trimmed)![1].trim()
    if (item.node.kind === NODE_KIND.latex) {
      // (Its `}` is the one after the LaTeX's own braces: `\frac{a}{b}` alone isn't closed.)
      const closed = rest.endsWith(BLOCK_CLOSE) && bracesBalance(rest.slice(0, -BLOCK_CLOSE.length))
      sheet.add({
        kind: BLOCK_KIND.latex, line: line.number, latex: closed ? rest.slice(0, -BLOCK_CLOSE.length).trim() : rest,
        error: closed ? undefined : `${SIGIL}${LATEX_BLOCK} on one line ends with its ${BLOCK_CLOSE}: ${SIGIL}${LATEX_BLOCK} ${BLOCK_OPEN} \\frac{a}{b} ${BLOCK_CLOSE}.`,
      })
      return
    }
    const latex = bodyLines(item).map((l) => l.trimmed).filter(Boolean).join('\n')
    sheet.add({
      kind: BLOCK_KIND.latex, line: line.number, endLine: item.last + 1, latex,
      error: !item.closer ? `The ${SIGIL}${LATEX_BLOCK} block on line ${line.number} is missing its closing ${BLOCK_CLOSE}.`
        : !latex ? `The ${SIGIL}${LATEX_BLOCK} block on line ${line.number} is empty: put the LaTeX before its ${BLOCK_CLOSE}.` : undefined,
    })
    sheet.blankRun = 0
  }
}

// ---------------------------------------------------------------------------
// Blocks whose body is the lines indented under them
// ---------------------------------------------------------------------------

/** `@import("run1.csv")`: the file's rows are every following line indented further. */
class ImportReader extends NodeReader {
  readonly kinds = [NODE_KIND.import]

  read(item: TreeItem, sheet: SheetReader): void {
    const { line } = item
    const { body, note, command } = line.parts
    const imported = IMPORT.exec(body)!
    // The rows are the lines straight under it, indented further (the tree's: a blank line ends them).
    const rowLines = item.body.flatMap((b) => b.rows)
    const rows = rowLines.map((r) => r.trimmed)
    if (rows.length) sheet.blankRun = 0
    const endLine = item.last + 1
    const block: ImportBlock = {
      kind: BLOCK_KIND.import, line: line.number, endLine, name: imported[1], file: imported[2], columns: [], rows: 0, note,
      hidden: (command ?? sheet.inheritedCommand) === LINE_COMMAND.hide,
    }
    if (rows.length) {
      const csv = readCsv(rows)
      const defined = csv.error ? { columns: [], error: csv.error } : sheet.calc.defineData(csv.columns, imported[1])
      Object.assign(block, { columns: defined.columns, rows: csv.rows, error: defined.error })
    } else if (imported[2] !== undefined) {
      block.error = `The data from ${imported[2]} is missing: choose the file again.`
    }
    sheet.add(block)
  }
}

/**
 * `def f(a, b)`: the function body is every following line indented further.
 * (`def f(x):3:deg`: settings for the result after the parameters; a lone trailing `:` is fine too.)
 */
class DefReader extends NodeReader {
  readonly kinds = [NODE_KIND.function]

  read(item: TreeItem, sheet: SheetReader): void {
    const { line } = item
    const { body, note, command, multiline } = line.parts
    const def = DEF.exec(body)!
    const bodyLines: FunctionLine[] = []
    for (const b of item.body) {
      if (b.node.kind === NODE_KIND.comment) continue
      const text = b.line.trimmed
      // Blank lines at the end of the body count toward the gap after the function.
      sheet.blankRun = text ? 0 : sheet.blankRun + 1
      if (!text || text.startsWith('#')) continue // blank lines and comments
      const split = splitNote(text)
      bodyLines.push({ line: b.line.number, text: split.body, note: split.note, command: split.command, multiline: split.multiline, indent: b.line.indent })
    }
    const params = def[2].split(',').map((p) => p.trim()).filter(Boolean)
    // Parameters (`m`, or `m to kg`) are checked by defineFunction.
    const result = bodyLines.length
      ? sheet.calc.defineFunction(def[1], params, bodyLines, multiline || sheet.inheritedMultiline, def[3])
      : { signature: symbolTex(def[1]), body: [], error: `${def[1]} has no body: indent the lines under def.` }
    sheet.add({
      kind: BLOCK_KIND.function, line: line.number, endLine: bodyLines.at(-1)?.line ?? line.number, name: def[1], note,
      hidden: (command ?? sheet.inheritedCommand) === LINE_COMMAND.hide, ...result,
    })
  }
}

// ---------------------------------------------------------------------------
// Braced blocks: opened with `{`, closed by `}`
// ---------------------------------------------------------------------------

/** `}` with no block open (a block's own `}` is read with the block: see SheetReader.closeAt). */
class CloseReader extends NodeReader {
  readonly kinds = [NODE_KIND.blockCloser]

  read({ line }: TreeItem, sheet: SheetReader): void {
    sheet.add({ kind: BLOCK_KIND.calc, line: line.number, source: line.parts.body, tex: '', error: `Unmatched ${BLOCK_CLOSE}: no block is open here.` })
  }
}

/**
 * `@layout.text Title {` and `@layout.titlepage {`: the lines up to the `}` are
 * prose, not calculations. In a text block, lines run together into paragraphs
 * and a blank line starts a new one; on a title page each line stays a line of
 * its own, a blank line leaves a gap, and the first line is the title (unless
 * the opener has one).
 */
class ProseLayoutReader extends NodeReader {
  readonly kinds = [NODE_KIND.prose]

  read(item: TreeItem, sheet: SheetReader): void {
    const { line } = item
    const { body: opened, note, command } = line.parts
    const opener = layoutOpener(opened)!
    const style = opener.style!
    const titlePage = style === LAYOUT_STYLE.titlepage
    const block: LayoutBlock = {
      kind: BLOCK_KIND.layout, line: line.number, title: '', note, style, members: opener.members, children: [], indent: line.indent,
      // (Prose only takes .hidden, or #hide.)
      command: (opener.command === LINE_COMMAND.hide ? opener.command : undefined) ?? command ?? sheet.inheritedHide,
      warning: opener.warning,
    }
    let titleSource = opener.title
    let paragraph: { line: number; text: string[] } | null = null
    let gap = false
    const endParagraph = () => {
      if (paragraph) block.children.push({ kind: BLOCK_KIND.text, line: paragraph.line, ...sheet.withValues(paragraph.text.join(' ')) })
      paragraph = null
    }
    for (const { number, trimmed: text } of bodyLines(item)) {
      if (!text) {
        endParagraph()
        gap = block.children.length > 0
        continue
      }
      if (!titlePage) {
        paragraph ??= { line: number, text: [] }
        paragraph.text.push(text)
        continue
      }
      if (!titleSource) {
        titleSource = text
        continue
      }
      if (gap) block.children.push({ kind: BLOCK_KIND.spacer, line: number })
      gap = false
      block.children.push({ kind: BLOCK_KIND.text, line: number, ...sheet.withValues(text) })
    }
    endParagraph()
    const title = sheet.withValues(titleSource)
    block.title = title.text
    block.error = title.error
    sheet.blankRun = 0
    block.endLine = item.last + 1
    if (!item.closer) block.error = `${openerText(block)} is missing its closing ${BLOCK_CLOSE}.`
    else if (!block.children.length && !(titlePage && block.title)) {
      block.error = `${openerText(block)} is empty: put the text that belongs to it before its ${BLOCK_CLOSE}.`
    }
    sheet.add(block)
  }
}

/**
 * `@layout.numbered Title {`, `@layout.val.multiline {`: the lines up to its `}` are
 * laid out together, shown as its members say (and stay in scope after it).
 * Its members' settings win over the #commands on its opener.
 */
class LayoutReader extends NodeReader {
  readonly kinds = [NODE_KIND.layout]

  read(item: TreeItem, sheet: SheetReader): void {
    const { line } = item
    const { body, note, command, multiline, notation } = line.parts
    const opener = layoutOpener(body)!
    const title = sheet.withValues(opener.title)
    const block: LayoutBlock = {
      kind: BLOCK_KIND.layout, line: line.number, title: title.text, note, style: opener.style, members: opener.members, children: [], indent: line.indent,
      command: opener.command ?? command ?? sheet.inheritedHide,
      multiline: opener.multiline || multiline || undefined,
      notation: opener.notation ?? notation,
      error: opener.error ?? title.error,
      warning: opener.warning,
    }
    sheet.add(block)
    sheet.open.push(block)
    readBody(item, sheet)
  }
}

/**
 * `Title {`: a block whose variables are its own, gone after its `}`. Its title
 * can be a section's (`# Kinematics {`, `##` a subsection's): numbered with the
 * headings, and set as one in its title bar. (Commands and a note go after the
 * `{`, as on any block: `# Kinematics {  #val`.)
 */
class GroupReader extends NodeReader {
  readonly kinds = [NODE_KIND.block]

  read(item: TreeItem, sheet: SheetReader): void {
    const { line } = item
    const heading = headingOf(line.trimmed)
    if (heading) openGroup(sheet, line, splitNote(heading.text), { level: heading.level, number: headingNumber(sheet, heading.level) })
    else openGroup(sheet, line, line.parts)
    readBody(item, sheet)
  }
}

/** A `{ }` or `@layout` block's lines, read in it, then its `}` (left open, to the end of the sheet, if it has none). */
function readBody(item: TreeItem, sheet: SheetReader): void {
  sheet.readItems(item.body)
  if (item.closer) sheet.closeAt(item.closer)
}

/** Open a `{ }` block from its opener's parts (its body is its title and the `{`), titled as a section or not. */
function openGroup(sheet: SheetReader, line: Line, parts: SplitLine, section?: SectionTitle): void {
  const { body, note, command, multiline, notation } = parts
  // (Values in its title are the ones from before the block.)
  const title = sheet.withValues(body.slice(0, -BLOCK_OPEN.length).trim())
  const group: GroupBlock = {
    kind: BLOCK_KIND.group, line: line.number, title: title.text, note, children: [], locals: [],
    command: command ?? sheet.inheritedHide,
    multiline: multiline || undefined,
    notation,
    error: title.error,
    section,
  }
  sheet.add(group)
  sheet.open.push(group)
  sheet.calc.pushScope()
}

// ---------------------------------------------------------------------------
// Everything else: a calculation
// ---------------------------------------------------------------------------

/** `m = 2.0 kg  # note`: a calculation, shown as its #commands (or the blocks around it) say. */
class CalcReader extends NodeReader {
  readonly kinds = [NODE_KIND.calc]

  read({ line }: TreeItem, sheet: SheetReader): void {
    const { body, note, command, multiline, notation, layout } = line.parts
    // A line's own command wins; otherwise the nearest enclosing block's.
    const inherited = sheet.inheritedCommand
    const effective = command ?? inherited ?? DISPLAY_MODE.full
    const mode = effective === LINE_COMMAND.hide ? DISPLAY_MODE.full : effective
    const result = sheet.calc.evaluate(body, mode, (command ?? inherited) !== undefined, multiline || sheet.inheritedMultiline, {
      own: notation, block: sheet.inheritedNotation,
    })
    // `#center` (or another layout) on a single line: lay out just that line.
    const own: LayoutBlock | undefined = layout
      ? { kind: BLOCK_KIND.layout, line: line.number, endLine: line.number, title: '', style: layout, children: [], indent: line.indent }
      : undefined
    if (own) sheet.add(own)
    // A line that's just a function call can take its note from the return line.
    ;(own?.children ?? sheet.open.at(-1)?.children ?? sheet.root).push({
      kind: BLOCK_KIND.calc, line: line.number, source: body, hidden: effective === LINE_COMMAND.hide, ...result,
      note: note ?? result.returnNote,
      info: result.info ?? (result.error ? undefined : sheet.declarationInfo(body, line.number)),
      warning: sheet.duplicateDeclarations.get(line.number) ?? result.warning,
    })
  }
}

/**
 * The core's readers, fresh for a sheet (the sheet-wide ones keep what they
 * read), one for each kind of node. Their `prepare`s run in this order, after
 * the modules' (species' names): declarations, then the constants that may use both.
 */
export const lineReaders = (): NodeReader[] => [
  new DeclarationsReader(),
  new ConstantsReader(),
  new HeadingReader(),
  new TextReader(),
  new LatexReader(),
  new ImportReader(),
  new DefReader(),
  new CloseReader(),
  new ProseLayoutReader(),
  new LayoutReader(),
  new GroupReader(),
  new CalcReader(),
]

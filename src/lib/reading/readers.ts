/**
 * Every kind of line a sheet has, and its reader. A line is offered to them in
 * the order lineReaders gives, and the first that reads it makes its block.
 */
import { symbolTex, type FunctionLine } from '../engine/index.ts'
import { BLOCK_CLOSE, BLOCK_OPEN, CONSTANTS_BLOCK, CONSTANTS_OPENER, DEF, DISPLAY_MODE, EXACT_SETTING, IMPORT, LATEX_BLOCK, LATEX_OPENER, LAYOUT_STYLE, LINE_COMMAND, PROSE_LAYOUTS, SIGIL, closesLatex, indentOf, isComment } from '../syntax.ts'
import { BLOCK_KIND, type ConstantsBlock, type GroupBlock, type ImportBlock, type LayoutBlock } from '../blocks.ts'
import { bracesBalance, closesBlock, layoutOpener, openerText, parseConstantDeclaration, readCsv, splitNote } from './lineSyntax.ts'
import { BracedReader, LineReader, SheetWideReader, type Line } from './reader.ts'
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
class DeclarationsReader extends LineReader {
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

  read(): boolean {
    return false
  }
}

/** Every `@constants { }` block's constants, defined first, so `@name` works anywhere in the sheet, above the block too. */
class ConstantsReader extends SheetWideReader<ConstantsBlock> {
  override prepare(sheet: SheetReader): void {
    const { lines, calc } = sheet
    for (let i = 0; i < lines.length; i++) {
      const opener = splitNote(lines[i].trim())
      if (!CONSTANTS_OPENER.test(opener.body)) continue
      const body = this.body(lines, i)
      const entries: ConstantsBlock['entries'] = []
      /** Precision declarations in the block, shown once all its constants exist. */
      const declarations: number[] = []
      for (const { index, text } of body.lines) {
        if (!text || text.startsWith('#')) continue
        const entry = splitNote(text)
        if (parseConstantDeclaration(entry.body)) {
          declarations.push(entries.length)
          entries.push({ line: index + 1, source: entry.body, note: entry.note, tex: '' })
          continue
        }
        entries.push({ line: index + 1, source: entry.body, note: entry.note, ...calc.defineConstant(entry.body) })
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
      this.prepared.set(i, {
        end: body.end,
        block: {
          kind: BLOCK_KIND.constants, line: i + 1, endLine: body.end + 1, note: opener.note, entries, hidden: opener.command === LINE_COMMAND.hide,
          error: body.closed ? undefined : `The ${SIGIL}${CONSTANTS_BLOCK} block on line ${i + 1} is missing its closing ${BLOCK_CLOSE}.`,
        },
      })
      i = body.end
    }
  }
}

// ---------------------------------------------------------------------------
// Lines of text
// ---------------------------------------------------------------------------

/** The deepest heading level: `###` and more are all the third. */
const DEEPEST_HEADING = 3

/** `# Title`, `## Title`, `### Title`: a heading, numbered as LaTeX numbers sections and subsections. */
class HeadingReader extends LineReader {
  read(line: Line, sheet: SheetReader): boolean {
    if (!line.trimmed.startsWith('#')) return false
    const level = Math.min(/^#+/.exec(line.trimmed)![0].length, DEEPEST_HEADING) as 1 | 2 | 3
    // Mirror LaTeX's counters: a new section resets the subsection count.
    let number: string | undefined
    if (level === 1) {
      sheet.section++
      sheet.subsection = 0
      number = `${sheet.section}`
    } else if (level === 2) {
      sheet.subsection++
      number = `${sheet.section}.${sheet.subsection}`
    }
    sheet.add({ kind: BLOCK_KIND.heading, line: line.number, level, number, ...sheet.withValues(line.trimmed.replace(/^#+/, '').trim()) })
    return true
  }
}

/** `> Some prose`: a paragraph. */
class TextReader extends LineReader {
  read(line: Line, sheet: SheetReader): boolean {
    if (!line.trimmed.startsWith('>')) return false
    sheet.add({ kind: BLOCK_KIND.text, line: line.number, ...sheet.withValues(line.trimmed.slice(1).trim()) })
    return true
  }
}

/** `@latex { … }`: raw LaTeX, up to a `}` on its own line, or all on this one. */
class LatexReader extends BracedReader {
  protected closes(raw: string): boolean {
    return closesLatex(raw)
  }

  read(line: Line, sheet: SheetReader): boolean {
    const opener = LATEX_OPENER.exec(line.trimmed)
    if (!opener) return false
    const rest = opener[1].trim()
    if (rest) {
      // (Its `}` is the one after the LaTeX's own braces: `\frac{a}{b}` alone isn't closed.)
      const closed = rest.endsWith(BLOCK_CLOSE) && bracesBalance(rest.slice(0, -BLOCK_CLOSE.length))
      sheet.add({
        kind: BLOCK_KIND.latex, line: line.number, latex: closed ? rest.slice(0, -BLOCK_CLOSE.length).trim() : rest,
        error: closed ? undefined : `${SIGIL}${LATEX_BLOCK} on one line ends with its ${BLOCK_CLOSE}: ${SIGIL}${LATEX_BLOCK} ${BLOCK_OPEN} \\frac{a}{b} ${BLOCK_CLOSE}.`,
      })
      return true
    }
    const body = this.body(sheet.lines, line.index)
    sheet.index = body.end
    const latex = body.lines.map((l) => l.text).filter(Boolean).join('\n')
    sheet.add({
      kind: BLOCK_KIND.latex, line: line.number, endLine: body.end + 1, latex,
      error: !body.closed ? `The ${SIGIL}${LATEX_BLOCK} block on line ${line.number} is missing its closing ${BLOCK_CLOSE}.`
        : !latex ? `The ${SIGIL}${LATEX_BLOCK} block on line ${line.number} is empty: put the LaTeX before its ${BLOCK_CLOSE}.` : undefined,
    })
    sheet.blankRun = 0
    return true
  }
}

// ---------------------------------------------------------------------------
// Blocks whose body is the lines indented under them
// ---------------------------------------------------------------------------

/** `@import("run1.csv")`: the file's rows are every following line indented further. */
class ImportReader extends LineReader {
  read(line: Line, sheet: SheetReader): boolean {
    const { body, note, command } = line.parts
    const imported = IMPORT.exec(body)
    if (!imported) return false
    const { lines } = sheet
    const rows: string[] = []
    let endLine = line.number
    // The rows are the lines straight under it, indented further; a blank line ends them.
    while (sheet.index + 1 < lines.length && lines[sheet.index + 1].trim() && indentOf(lines[sheet.index + 1]) > line.indent) {
      sheet.index++
      sheet.blankRun = 0
      rows.push(lines[sheet.index].trim())
      endLine = sheet.index + 1
    }
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
    return true
  }
}

/**
 * `def f(a, b)`: the function body is every following line indented further.
 * (`def f(x):3:deg`: settings for the result after the parameters; a lone trailing `:` is fine too.)
 */
class DefReader extends LineReader {
  read(line: Line, sheet: SheetReader): boolean {
    const { body, note, command, multiline } = line.parts
    const def = DEF.exec(body)
    if (!def) return false
    const { lines } = sheet
    const bodyLines: FunctionLine[] = []
    while (sheet.index + 1 < lines.length && (!lines[sheet.index + 1].trim() || indentOf(lines[sheet.index + 1]) > line.indent)) {
      sheet.index++
      const text = lines[sheet.index].trim()
      if (isComment(text)) continue
      // Blank lines at the end of the body count toward the gap after the function.
      sheet.blankRun = text ? 0 : sheet.blankRun + 1
      if (!text || text.startsWith('#')) continue // blank lines and comments
      const split = splitNote(text)
      bodyLines.push({ line: sheet.index + 1, text: split.body, note: split.note, command: split.command, multiline: split.multiline, indent: indentOf(lines[sheet.index]) })
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
    return true
  }
}

// ---------------------------------------------------------------------------
// Braced blocks: opened with `{`, closed by `}`
// ---------------------------------------------------------------------------

/** `}`: closes the innermost open block (and any sub-lists in it). */
class CloseReader extends LineReader {
  read(line: Line, sheet: SheetReader): boolean {
    const { body } = line.parts
    if (body !== BLOCK_CLOSE) return false
    // Sub-lists inside the block end with it; then the block itself, a `{ }` group or an `@layout.list { }`.
    while (sheet.inSubList()) sheet.closeLayout()
    const block = sheet.open.at(-1)
    if (block?.kind === BLOCK_KIND.layout) {
      sheet.closeLayout(line.number)
    } else if (block) {
      sheet.open.pop()
      block.locals = sheet.calc.popScope()
      block.endLine = line.number
    } else {
      sheet.add({ kind: BLOCK_KIND.calc, line: line.number, source: body, tex: '', error: `Unmatched ${BLOCK_CLOSE}: no block is open here.` })
    }
    return true
  }
}

/**
 * `@layout.text Title {` and `@layout.titlepage {`: the lines up to the `}` are
 * prose, not calculations. In a text block, lines run together into paragraphs
 * and a blank line starts a new one; on a title page each line stays a line of
 * its own, a blank line leaves a gap, and the first line is the title (unless
 * the opener has one).
 */
class ProseLayoutReader extends BracedReader {
  protected closes(raw: string): boolean {
    return closesBlock(raw)
  }

  read(line: Line, sheet: SheetReader): boolean {
    const { body: opened, note, command } = line.parts
    const opener = layoutOpener(opened)
    if (!opener?.style || !PROSE_LAYOUTS.has(opener.style)) return false
    const style = opener.style
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
    const body = this.body(sheet.lines, line.index)
    for (const { index, text } of body.lines) {
      if (!text) {
        endParagraph()
        gap = block.children.length > 0
        continue
      }
      if (!titlePage) {
        paragraph ??= { line: index + 1, text: [] }
        paragraph.text.push(text)
        continue
      }
      if (!titleSource) {
        titleSource = text
        continue
      }
      if (gap) block.children.push({ kind: BLOCK_KIND.spacer, line: index + 1 })
      gap = false
      block.children.push({ kind: BLOCK_KIND.text, line: index + 1, ...sheet.withValues(text) })
    }
    endParagraph()
    sheet.index = body.end
    const title = sheet.withValues(titleSource)
    block.title = title.text
    block.error = title.error
    sheet.blankRun = 0
    block.endLine = body.end + 1
    if (!body.closed) block.error = `${openerText(block)} is missing its closing ${BLOCK_CLOSE}.`
    else if (!block.children.length && !(titlePage && block.title)) {
      block.error = `${openerText(block)} is empty: put the text that belongs to it before its ${BLOCK_CLOSE}.`
    }
    sheet.add(block)
    return true
  }
}

/**
 * `@layout.numbered Title {`, `@layout.val.multiline {`: the lines up to its `}` are
 * laid out together, shown as its members say (and stay in scope after it).
 * Its members' settings win over the #commands on its opener.
 */
class LayoutReader extends LineReader {
  read(line: Line, sheet: SheetReader): boolean {
    const { body, note, command, multiline, notation } = line.parts
    const opener = layoutOpener(body)
    if (!opener) return false
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
    return true
  }
}

/** `Title {`: a block whose variables are its own, gone after its `}`. */
class GroupReader extends LineReader {
  read(line: Line, sheet: SheetReader): boolean {
    const { body, note, command, multiline, notation } = line.parts
    if (!body.endsWith(BLOCK_OPEN)) return false
    // (Values in its title are the ones from before the block.)
    const title = sheet.withValues(body.slice(0, -1).trim())
    const group: GroupBlock = {
      kind: BLOCK_KIND.group, line: line.number, title: title.text, note, children: [], locals: [],
      command: command ?? sheet.inheritedHide,
      multiline: multiline || undefined,
      notation,
      error: title.error,
    }
    sheet.add(group)
    sheet.open.push(group)
    sheet.calc.pushScope()
    return true
  }
}

// ---------------------------------------------------------------------------
// Everything else: a calculation
// ---------------------------------------------------------------------------

/** `m = 2.0 kg  # note`: a calculation, shown as its #commands (or the blocks around it) say. */
class CalcReader extends LineReader {
  read(line: Line, sheet: SheetReader): boolean {
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
    return true
  }
}

/**
 * The readers, fresh for a sheet (the sheet-wide ones keep what they read), in
 * the order a line is offered to them: the first that reads it makes its block.
 * (Their `prepare`s run in this order too: species' names, then declarations,
 * then the constants that may use both.)
 */
export const lineReaders = (): LineReader[] => [
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

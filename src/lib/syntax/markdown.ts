/**
 * Markdown as MathScribe writes documents in it: the reference (docs/REFERENCE.md),
 * the AI primer, and a sheet in an AI's answer, read back. (A sheet's own text
 * markup, headings, emphasis and links, is text.ts's, which this builds on.)
 */
import { HEADING_MARK, RULE_MARK, TEXT_ESCAPE } from './text.ts'
import { inClass, lit, regex, src } from './patterns.ts'

/** Around a block of code: ```` ``` ```` on a line before it and after it. */
export const CODE_FENCE = '```'

/** Some text as a block of code, between fences. */
export const fencedCode = (text: string) => [CODE_FENCE, text, CODE_FENCE].join('\n')

/** The first block of code in some text, whatever its fence's language (1: the code). */
export const FENCED_CODE = regex(src`${lit(CODE_FENCE)}[^\n]*\n([\s\S]*?)${lit(CODE_FENCE)}`)

/** Between a table row's cells, and around them: `| a | b |`. */
export const TABLE_CELL = '|'

/** A table's row of cells, as Markdown writes it. */
export const markdownRow = (cells: readonly string[]) => `${TABLE_CELL} ${cells.join(` ${TABLE_CELL} `)} ${TABLE_CELL}`

/** What's under a table's header, in each column: `---`. */
export const TABLE_RULE = RULE_MARK.repeat(3)

/** What starts a list's item: `- item` (nested, indented under it). */
export const LIST_ITEM = '- '

/** A section's heading, at its level: `## Units`. */
export const markdownHeading = (level: number, title: string) => `${HEADING_MARK.repeat(level)} ${title}`

/** A document's first heading, `# Title`, on a line of its own (1: the title). */
export const FIRST_HEADING = regex(src`^${lit(HEADING_MARK)}\s+(.+)$`, 'm')

/** What Markdown reads as markup in plain text: emphasis, headings, maths, tags, links, code. */
const MARKUP_CHARS = ['\\', '`', '*', '_', '{', '}', '[', ']', '<', '>', '#', '$', '|', '~']
const MARKUP = regex(src`[${inClass(...MARKUP_CHARS)}]`, 'g')

/** Plain text as Markdown shows it as it is: `1/2 * m * v^2` not in italics, `# Title` not a heading, `$…$` not maths. */
export const plainMarkdown = (text: string) => text.replace(MARKUP, (c) => `${TEXT_ESCAPE}${c}`)

/** A heading's anchor, as GitHub makes it: `Significant figures` → `significant-figures`. */
const NOT_IN_ANCHOR = regex(src`[^\p{L}\p{N}\s-]`, 'gu')
const SPACES_IN_ANCHOR = regex(src`\s+`, 'g')
const ANCHOR_JOIN = '-'
export const markdownAnchor = (title: string) => title.toLowerCase().replace(NOT_IN_ANCHOR, '').trim().replace(SPACES_IN_ANCHOR, ANCHOR_JOIN)

/** A heading as a file's name: letters and digits, joined by `-`, none at the ends: "Kinematics practice test" → kinematics-practice-test. */
const NOT_IN_SLUG = regex(src`[^a-z0-9]+`, 'g')
const SLUG_ENDS = regex(src`^${lit(ANCHOR_JOIN)}|${lit(ANCHOR_JOIN)}$`, 'g')
export const fileSlug = (text: string) => text.toLowerCase().replace(NOT_IN_SLUG, ANCHOR_JOIN).replace(SLUG_ENDS, '')

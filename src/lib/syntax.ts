/**
 * The sheet language's shared vocabulary: the words and patterns that the
 * engine, the sheet's structure and the editor (highlighting, completions) all
 * have to agree on. Each concept has a file of its own in syntax/; this gathers
 * them, for code that uses several.
 *
 *   patterns.ts   how patterns and word lists are written (src, named, words)
 *   punctuation.ts  brackets, `=`, `:`, `,`, `;` and quotes, each written out once
 *   operators.ts  mathjs's delimiters and named delimiters, which expressions are read by
 *   lexical.ts   names, numbers, the sheet's own words, @, calls, members
 *   greek.ts      Greek letters
 *   settings.ts   what follows a `:`, display names, uncertainty and series words
 *   text.ts       comments, and markup in text: subscripts, {{values}}, $maths$
 *   blocks.ts     braces, @latex { }, the import line, indentation
 *   constants.ts  @constants { }, @c as written, sheet-wide declarations
 *   notes.ts      the note after a line, `// weight`
 *   layout.ts     @layout blocks: their members (how lines are shown), and LayoutSyntax for their openers
 */
export * from './syntax/patterns.ts'
export * from './syntax/punctuation.ts'
export * from './syntax/operators.ts'
export * from './syntax/lexical.ts'
export * from './syntax/greek.ts'
export * from './syntax/settings.ts'
export * from './syntax/text.ts'
export * from './syntax/blocks.ts'
export * from './syntax/constants.ts'
export * from './syntax/notes.ts'
export * from './syntax/layout.ts'

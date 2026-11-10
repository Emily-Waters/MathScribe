/**
 * Brackets by nesting, as textbooks write them: a group with no groups inside
 * it gets round brackets, one with round ones inside gets square brackets, one
 * with square ones inside gets braces, and then round again:
 *
 *   ((a + b)c)²  →  [(a + b)c]²
 *
 * Only grouping brackets change. A function call's brackets stay round (sin(x),
 * f(a, b)), and so do a tuple's ((1.0, 2.0)); they don't count as a level,
 * but the groups inside them do. Other delimiters (⟨…⟩, ‖…‖) are left alone.
 *
 * It works on the finished LaTeX of an equation, where every bracket that can
 * grow is a \left … \right pair.
 */

/** Every \left or \right with its delimiter (1: left delimiter, 2: right delimiter). */
const DELIMITER = /\\left(\(|\[|\\\{|\\langle|\\\||\||\.)|\\right(\)|\]|\\\}|\\rangle|\\\||\||\.)/g

/** The brackets for each level, innermost first; deeper levels start over. */
const LEVELS = [['\\left(', '\\right)'], ['\\left[', '\\right]'], ['\\left\\{', '\\right\\}']] as const

/** A bracket pair found in the LaTeX. */
interface Pair {
  open: number
  openEnd: number
  close: number
  closeEnd: number
  /** Round brackets that group (not a call's or a tuple's), which change by level. */
  group: boolean
  children: Pair[]
  /** The deepest group inside it (0: none). */
  inner: number
}

/**
 * Whether the round brackets opening at `open` are a call's: right after a
 * name (`\sin`, `f`, `f_{n}`). A group follows a space, an operator or `{`.
 */
const isCall = (tex: string, open: number) => /[A-Za-z}]$/.test(tex.slice(0, open))

/** Whether `content` has a comma outside any brackets or braces: a tuple, (1.0, 2.0). */
function hasTopLevelComma(content: string): boolean {
  let depth = 0
  for (let i = 0; i < content.length; i++) {
    if (content[i] === '\\' && !/^\\(?:left|right)/.test(content.slice(i))) {
      i++ // an escaped character, like the thin space \, between a number and its unit
      continue
    }
    if (content.startsWith('\\left', i)) depth++
    else if (content.startsWith('\\right', i)) depth--
    else if (content[i] === '{') depth++
    else if (content[i] === '}') depth--
    else if (content[i] === ',' && depth === 0) return true
  }
  return false
}

/** Work out how deep the groups inside each pair go; returns the pair's own depth as a group (0 if it isn't one). */
function measure(pair: Pair): number {
  pair.inner = Math.max(0, ...pair.children.map(measure))
  return pair.group ? pair.inner + 1 : pair.inner
}

/** `tex` with each grouping bracket chosen by how many groups are nested inside it. */
export function nestBrackets(tex: string): string {
  const roots: Pair[] = []
  const open: Pair[] = []
  for (const m of tex.matchAll(DELIMITER)) {
    if (m[1] !== undefined) {
      const pair: Pair = {
        open: m.index, openEnd: m.index + m[0].length, close: -1, closeEnd: -1,
        group: m[1] === '(' && !isCall(tex, m.index), children: [], inner: 0,
      }
      ;(open.at(-1)?.children ?? roots).push(pair)
      open.push(pair)
    } else {
      const pair = open.pop()
      if (!pair) return tex // unbalanced: leave it as it is
      pair.close = m.index
      pair.closeEnd = m.index + m[0].length
      if (pair.group && (m[2] !== ')' || hasTopLevelComma(tex.slice(pair.openEnd, pair.close)))) pair.group = false
    }
  }
  if (open.length) return tex
  roots.forEach(measure)

  // Replace from the end, so earlier positions stay right.
  const changes: { from: number; to: number; text: string }[] = []
  const collect = (pair: Pair) => {
    if (pair.group && pair.inner > 0) {
      const [l, r] = LEVELS[pair.inner % LEVELS.length]
      changes.push({ from: pair.open, to: pair.openEnd, text: l }, { from: pair.close, to: pair.closeEnd, text: r })
    }
    pair.children.forEach(collect)
  }
  roots.forEach(collect)
  return changes
    .sort((a, b) => b.from - a.from)
    .reduce((out, c) => out.slice(0, c.from) + c.text + out.slice(c.to), tex)
}

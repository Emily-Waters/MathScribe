/**
 * Display names, as the Calculator uses them: a name's own words in place of
 * its symbol (`n_Na:"Moles of {Na^+}"`), with values in them (`{{V}}`), and
 * the templates that make them (`massName(x) = "m_{{x}}"`, used as
 * `m_w:massName(H2O) = …`).
 */
import { VALUE_IN_TEXT, IS_NAME, splitInlineMath } from '../../syntax.ts'
import { outsideMaths, wordsTex } from './text.ts'
import { symbolTex } from './tex.ts'
import type { LineResult } from './results.ts'

/** What display names need of the Calculator they're the sheet's of. */
export interface DisplayNamesHost {
  /** A value for text, `{{V}}`, as LaTeX, or what's wrong with it. */
  inlineValue(source: string): { tex?: string; error?: string }
  /** Text with the modules' notation (chemistry's `{Na^+}`) as inline maths. */
  markupText(text: string): string
}

/** A display-name template: its parameters, and its words with `{{x}}` where each goes. */
interface Template {
  params: string[]
  words: string
}

export class DisplayNames {
  private readonly host: DisplayNamesHost
  /** The sheet's templates, by name. */
  private readonly templates = new Map<string, Template>()

  constructor(host: DisplayNamesHost) {
    this.host = host
  }

  /**
   * A display name as LaTeX: its text upright, each `{{x}}` as x's value now
   * (so the name says what it was worked out from), and a module's notation
   * (`{Na^+}`, chemistry) as it draws it.
   */
  tex(label: string): { tex: string; error?: string } {
    let error: string | undefined
    const withValuesIn = outsideMaths(label, (part) => part.replace(VALUE_IN_TEXT, (whole, source: string) => {
      const v = this.host.inlineValue(source)
      if (v.tex !== undefined) return `$${v.tex}$`
      error ??= `In its display name, ${whole}: ${v.error}`
      return whole
    }))
    // (Spaces at the ends of the words are explicit spaces, outside \text, so they survive.)
    const words = (part: string) => {
      const [, before, inner, after] = /^(\s*)([\s\S]*?)(\s*)$/.exec(part)!
      const space = (s: string) => (s ? '\\ ' : '')
      return `${space(before)}${inner ? wordsTex(inner) : ''}${space(after)}`
    }
    const tex = splitInlineMath(this.host.markupText(withValuesIn))
      .map((part) => (part.math ? part.value : words(part.value)))
      .join('')
    return { tex, error }
  }

  /**
   * Define a display-name template, `massName(x) = "m_{{x}}"`: words with `{{x}}`
   * where each argument goes, used as a setting on a name, `m_w:massName(H2O) = …`.
   * Its line shows the words with each parameter in its place.
   */
  defineTemplate(name: string, params: readonly string[], words: string): LineResult {
    const bad = params.find((p) => !IS_NAME.test(p))
    if (bad !== undefined) return { tex: '', error: `"${bad}" isn't a parameter name: write ${name}(x, y) = "…{{x}}…".` }
    this.templates.set(name, { params: [...params], words })
    const shown = this.tex(this.fillWords(words, params, params))
    return { tex: `${symbolTex(name)}\\left(${params.map(symbolTex).join(', ')}\\right) = ${shown.tex}`, error: shown.error }
  }

  /** The display name a template makes from its arguments, `massName(H2O)` → "m_{H2O}", or what's wrong. */
  fillTemplate(name: string, args: string[]): { words: string } | { error: string } {
    const template = this.templates.get(name)
    if (!template) return { error: `${name}( ) isn't a display-name template: define one first, as ${name}(x) = "…{{x}}…".` }
    if (args.length !== template.params.length) {
      const count = template.params.length
      return { error: `${name} takes ${count} argument${count === 1 ? '' : 's'} (${template.params.join(', ')}), not ${args.length}.` }
    }
    return { words: this.fillWords(template.words, template.params, args) }
  }

  /** A template's words with each `{{parameter}}` as its argument's text (other `{{…}}`, values, are left for the display name). */
  private fillWords(words: string, params: readonly string[], args: readonly string[]): string {
    return words.replace(VALUE_IN_TEXT, (whole, inside: string) => {
      const at = params.indexOf(inside.trim())
      return at < 0 ? whole : args[at]
    })
  }
}

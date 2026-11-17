/**
 * A module written as someone running MathScribe locally would write one: a
 * class extending EngineModule, using only the module API (plugin.ts), and
 * installed. Nothing else in MathScribe is changed for it.
 */
import { describe, expect, it } from 'vitest'
import { ConstantMember, EngineModule, type Member } from './plugin.ts'
import { Calculator, moduleSettingWords, sheetModules } from './engine/index.ts'
import { DISPLAY_MODE } from './syntax.ts'
import { OPTIONS } from '../test/helpers.ts'

/** A module of one's own: Mars's surface gravity as `@g_mars`, and a setting that does nothing but describe itself. */
class MarsModule extends EngineModule {
  override builtinMembers(): Member[] {
    return [new ConstantMember('g_mars', { value: 3.72076, unit: 'm/s^2', tex: 'g_{\\mathrm{Mars}}', description: 'surface gravity on Mars' })]
  }

  override readonly lineSettings = { mars: 'shown as on Mars (an example)' }
}

describe('a module of one’s own', () => {
  const calc = new Calculator(OPTIONS, [...sheetModules(), new MarsModule()])

  it('adds what it says, through the hooks alone', () => {
    const line = calc.evaluate('w = 2.0 kg * @g_mars', DISPLAY_MODE.val)
    expect(line.error).toBeUndefined()
    expect(line.tex).toContain('7.4')
  })

  it('is known to the editor too, once installed', () => {
    expect(moduleSettingWords()).toContainEqual({ name: 'mars', description: 'shown as on Mars (an example)' })
  })
})

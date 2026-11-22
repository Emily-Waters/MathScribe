/** Sharing a sheet by link: its name and text there and back, through the link's `#` part. */
import { describe, expect, it } from 'vitest'
import { shareFragment, shareLink, sharedSheet } from './share.ts'

describe('a shared sheet', () => {
  it('comes back from its link as it was, name and text (Greek, units, braces and all)', async () => {
    const text = '# Lab 3\nΔt = 1.5 s pm 0.1 s\n> The {Na^+} came to {{n}}, 50% more.\n@plot(t, x; title "Run 1, cart")\n'
    const link = await shareLink('https://example.org/MathScribe/#old', 'lab 3 & notes.txt', text)
    expect(link.startsWith('https://example.org/MathScribe/#sheet1=')).toBe(true)
    expect(link).not.toContain('#old')
    expect(await sharedSheet(new URL(link).hash)).toEqual({ name: 'lab 3 & notes.txt', text })
  })

  it('is compressed, and written with only what a link carries as it is', async () => {
    const text = 'x = 1.00 m\n'.repeat(200)
    const fragment = await shareFragment('s.txt', text)
    expect(fragment.length).toBeLessThan(text.length / 10)
    expect(fragment.split('&')[0]).toMatch(/^sheet1=[A-Za-z0-9_-]+$/)
  })

  it('is nothing in a link without one, or with one that’s been cut short', async () => {
    expect(await sharedSheet('')).toBeNull()
    expect(await sharedSheet('#section-2')).toBeNull()
    const fragment = await shareFragment('s.txt', 'x = 1.00 m\n'.repeat(50))
    expect(await sharedSheet(fragment.slice(0, 20))).toBeNull()
  })
})

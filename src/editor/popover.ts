/**
 * Edge-safe placement for small fixed panels beside an editor or button.
 * Panels can grow beside the edge: they align under or above their anchor,
 * clamp both axes, and shrink their height to the usable viewport.
 */
export interface PanelAnchor {
  top: number
  bottom: number
  left: number
  right: number
}

export type PanelAlignment = 'left' | 'right'

/** Calculate a fixed panel’s viewport-safe position. */
export function fixedPanelPosition(
  anchor: PanelAnchor,
  panelWidth: number,
  panelHeight: number,
  viewportWidth: number,
  viewportHeight: number,
  alignment: PanelAlignment = 'left',
  gap = 6,
  padding = 8,
): { left: number; top: number } {
  let left = alignment === 'right' ? anchor.right - panelWidth : anchor.left
  left = Math.max(padding, Math.min(left, viewportWidth - panelWidth - padding))

  let top: number
  if (anchor.bottom + gap + panelHeight <= viewportHeight - padding) {
    top = anchor.bottom + gap
  } else if (anchor.top - gap - panelHeight >= padding) {
    top = anchor.top - gap - panelHeight
  } else {
    top = padding
  }
  top = Math.max(padding, Math.min(top, viewportHeight - panelHeight - padding))
  return { left, top }
}

/** Keep a fixed panel wholly inside the viewport, including at resize or scroll, and as it grows or shrinks. */
export function placeFixedPanel(
  panel: HTMLElement,
  anchor: PanelAnchor,
  alignment: PanelAlignment = 'left',
  gap = 6,
): () => void {
  const padding = 8

  const place = () => {
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight
    const maxHeight = Math.max(80, viewportHeight - padding * 2)
    panel.style.maxHeight = `${maxHeight}px`
    panel.style.overflowY = 'auto'
    // (Measured at the left edge, so its width is its own, not what's left of the window beside where it was.)
    panel.style.position = 'fixed'
    panel.style.left = '0px'

    const measuredWidth = panel.offsetWidth
    const measuredHeight = panel.offsetHeight
    const { left, top } = fixedPanelPosition(
      anchor, measuredWidth, measuredHeight, viewportWidth, viewportHeight, alignment, gap, padding,
    )

    panel.style.position = 'fixed'
    panel.style.left = `${left}px`
    panel.style.top = `${top}px`
    panel.style.right = 'auto'
  }

  place()
  window.addEventListener('resize', place)
  window.addEventListener('scroll', place, true)
  // (And when what's in it changes size: a menu showing more of itself.)
  const resized = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(place)
  resized?.observe(panel)
  return () => {
    window.removeEventListener('resize', place)
    window.removeEventListener('scroll', place, true)
    resized?.disconnect()
  }
}

/** How long after a press outside a panel its click can come (a slow tap's), and is still the panel's to swallow (ms). */
const CLICK_AFTER_PRESS_MS = 600

/**
 * Close a panel (a menu, a ⚙ panel) on a press outside it, without the press
 * going through to what's under it: a click outside an open menu only closes
 * it, as a menu's should, rather than also moving the cursor, jumping to a
 * line or pressing a button. `inside` says what's the panel's (its button too,
 * whose own click opens and closes it). Returns how to stop listening.
 */
export function closeOnPressOutside(inside: (target: Node) => boolean, close: () => void): () => void {
  const swallow = (e: Event) => {
    e.preventDefault()
    e.stopPropagation()
  }
  const onDown = (e: MouseEvent) => {
    if (inside(e.target as Node)) return
    swallow(e)
    close()
    // (The click that ends this press is the panel's too.)
    document.addEventListener('click', swallow, { capture: true, once: true })
    setTimeout(() => document.removeEventListener('click', swallow, true), CLICK_AFTER_PRESS_MS)
  }
  // (Before anything else sees it: in the capturing phase, on the press, as the editor moves its cursor on it.)
  document.addEventListener('mousedown', onDown, true)
  return () => document.removeEventListener('mousedown', onDown, true)
}

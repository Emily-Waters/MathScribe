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

/** Keep a fixed panel wholly inside the viewport, including at resize or scroll. */
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
  return () => {
    window.removeEventListener('resize', place)
    window.removeEventListener('scroll', place, true)
  }
}

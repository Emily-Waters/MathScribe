import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'

const MIN = 15
const MAX = 85
const DEFAULT = 50
const STORAGE_KEY = 'mathscribe:split'

const clamp = (v: number) => Math.min(MAX, Math.max(MIN, v))

function loadSplit(): number {
  try {
    const v = Number(localStorage.getItem(STORAGE_KEY))
    if (v >= MIN && v <= MAX) return v
  } catch {
    /* storage unavailable */
  }
  return DEFAULT
}

interface SplitPaneProps {
  left: ReactNode
  right: ReactNode
}

/**
 * Two panes side by side with a draggable vertical divider.
 * Drag, use arrow keys when focused, or double-click to reset to 50/50.
 */
export function SplitPane({ left, right }: SplitPaneProps) {
  const [percent, setPercent] = useState(loadSplit)
  const [dragging, setDragging] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, String(percent))
    } catch {
      /* storage unavailable */
    }
  }, [percent])

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    setDragging(true)
  }

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!dragging || !containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    setPercent(clamp(((e.clientX - rect.left) / rect.width) * 100))
  }

  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    e.currentTarget.releasePointerCapture(e.pointerId)
    setDragging(false)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 10 : 2
    const moves: Record<string, number> = {
      ArrowLeft: percent - step,
      ArrowRight: percent + step,
      Home: MIN,
      End: MAX,
    }
    if (e.key in moves) {
      e.preventDefault()
      setPercent(clamp(moves[e.key]))
    }
  }

  return (
    <div ref={containerRef} className={`split${dragging ? ' split--dragging' : ''}`}>
      <div className="split__pane" style={{ flex: `0 0 ${percent}%` }}>
        {left}
      </div>
      <div
        className="split__divider"
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize panes"
        aria-valuemin={MIN}
        aria-valuemax={MAX}
        aria-valuenow={Math.round(percent)}
        tabIndex={0}
        title="Drag to resize · double-click to reset"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={() => setPercent(DEFAULT)}
        onKeyDown={onKeyDown}
      />
      <div className="split__pane" style={{ flex: '1 1 0' }}>
        {right}
      </div>
    </div>
  )
}

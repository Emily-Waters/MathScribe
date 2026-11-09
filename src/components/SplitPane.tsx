import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'
import { SPLIT, STORAGE_KEYS } from '../config.ts'
import { readStored, writeStored } from '../lib/storage.ts'

/** Keep the divider within its limits. */
const clamp = (v: number) => Math.min(SPLIT.max, Math.max(SPLIT.min, v))

/** Where the divider was left, in this browser. */
function loadSplit(): number {
  const v = Number(readStored(STORAGE_KEYS.split))
  return v >= SPLIT.min && v <= SPLIT.max ? v : SPLIT.default
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
    writeStored(STORAGE_KEYS.split, String(percent))
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
    const step = e.shiftKey ? SPLIT.bigKeyStep : SPLIT.keyStep
    const moves: Record<string, number> = {
      ArrowLeft: percent - step,
      ArrowRight: percent + step,
      Home: SPLIT.min,
      End: SPLIT.max,
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
        aria-valuemin={SPLIT.min}
        aria-valuemax={SPLIT.max}
        aria-valuenow={Math.round(percent)}
        tabIndex={0}
        title="Drag to resize · double-click to reset"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={() => setPercent(SPLIT.default)}
        onKeyDown={onKeyDown}
      />
      <div className="split__pane" style={{ flex: '1 1 0' }}>
        {right}
      </div>
    </div>
  )
}

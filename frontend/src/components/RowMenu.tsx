import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

export interface RowMenuItem {
  label: string
  icon: string // 24×24 stroked path
  onSelect: () => void
  danger?: boolean
}

// "⋮" button that opens a small menu of row actions.
// The menu is rendered into <body> with fixed positioning, because the table scrolls
// inside its own box and would otherwise clip it. Outside click, Esc or scrolling closes it.
export default function RowMenu({ items, label }: { items: RowMenuItem[]; label: string }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  // Place the menu under the button, right-aligned; flip above it when there's no room below
  useLayoutEffect(() => {
    if (!open || !btnRef.current || !menuRef.current) return
    const b = btnRef.current.getBoundingClientRect()
    const m = menuRef.current.getBoundingClientRect()
    const below = b.bottom + 6 + m.height <= window.innerHeight - 8
    setPos({
      top: below ? b.bottom + 6 : Math.max(8, b.top - 6 - m.height),
      left: Math.min(window.innerWidth - m.width - 8, Math.max(8, b.right - m.width)),
    })
  }, [open])

  useEffect(() => {
    if (!open) return
    const close = () => setOpen(false)
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (!menuRef.current?.contains(t) && !btnRef.current?.contains(t)) close()
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { close(); btnRef.current?.focus() } }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    // Focus the first item so the menu works from the keyboard
    menuRef.current?.querySelector<HTMLButtonElement>('button')?.focus()
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
    }
  }, [open])

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={e => { e.stopPropagation(); setPos(null); setOpen(o => !o) }}
        className={`row-menu-btn${open ? ' is-open' : ''}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        title={label}
      >
        <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor" aria-hidden="true">
          <circle cx="12" cy="5" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="12" cy="19" r="1.8" />
        </svg>
      </button>
      {open && createPortal(
        <div
          ref={menuRef}
          role="menu"
          className="row-menu"
          // Measured on first paint, then moved into place
          style={pos ? { top: pos.top, left: pos.left } : { top: 0, left: 0, visibility: 'hidden' }}
          onClick={e => e.stopPropagation()}
        >
          {items.map(item => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              className={`row-menu-item${item.danger ? ' is-danger' : ''}`}
              onClick={() => { setOpen(false); item.onSelect() }}
            >
              <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d={item.icon} />
              </svg>
              {item.label}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </>
  )
}

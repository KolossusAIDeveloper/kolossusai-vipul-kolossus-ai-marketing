import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

export interface SelectOption {
  value: string
  label: string
  color?: string // optional dot, e.g. a status colour
}

// Themed dropdown used everywhere instead of <select>. The browser's native option list
// can't be styled (it's drawn by the OS), so the list here is our own: rendered into <body>
// so table/card overflow can't clip it, flipped above the button when there's no room below.
// Keyboard: Enter/Space/↓ opens, ↑/↓ move, Enter picks, Esc or Tab closes, letters jump.
export default function Select({
  value, defaultValue, onChange, options, id, ariaLabel, size = 'md', className = '', placeholder,
}: {
  value?: string
  defaultValue?: string
  onChange: (value: string) => void
  options: SelectOption[]
  id?: string
  ariaLabel?: string
  size?: 'sm' | 'md'
  className?: string
  placeholder?: string
}) {
  // Controlled when `value` is given; otherwise keeps its own state from defaultValue
  const [inner, setInner] = useState(defaultValue ?? '')
  const current = value !== undefined ? value : inner
  const selected = options.find(o => o.value === current)

  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const [pos, setPos] = useState<{ top: number; left: number; width: number; maxHeight: number } | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const listId = useRef(`sel-${Math.random().toString(36).slice(2, 9)}`).current

  function pick(v: string) {
    if (value === undefined) setInner(v)
    onChange(v)
    setOpen(false)
    btnRef.current?.focus()
  }

  function openList() {
    setActive(Math.max(0, options.findIndex(o => o.value === current)))
    setPos(null)
    setOpen(true)
  }

  // Place under the button (or above when the screen bottom is near). The list is at least as
  // wide as the button and grows to fit its longest option, but never past the viewport.
  useLayoutEffect(() => {
    if (!open || !btnRef.current || !listRef.current) return
    const b = btnRef.current.getBoundingClientRect()
    // measured while hidden, before placing; +36 leaves room for the bold selected row and its check mark
    const natural = listRef.current.scrollWidth + 36
    const width = Math.min(Math.max(b.width, natural, 160), window.innerWidth - 16)
    const left = Math.min(Math.max(8, b.left), window.innerWidth - width - 8)
    const below = window.innerHeight - b.bottom - 12
    const above = b.top - 12
    const wanted = Math.min(300, options.length * 40 + 12)
    const goBelow = below >= Math.min(wanted, 200) || below >= above
    const maxHeight = Math.max(120, Math.min(300, goBelow ? below : above))
    const height = Math.min(wanted, maxHeight)
    setPos({ top: goBelow ? b.bottom + 6 : b.top - 6 - height, left, width, maxHeight })
  }, [open, options.length])

  // Keep the highlighted option in view
  useEffect(() => {
    if (!open) return
    listRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [open, active, pos])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (!listRef.current?.contains(t) && !btnRef.current?.contains(t)) setOpen(false)
    }
    // Scrolling the page closes it; scrolling the list itself doesn't
    const onScroll = (e: Event) => { if (!listRef.current?.contains(e.target as Node)) setOpen(false) }
    const onResize = () => setOpen(false)
    document.addEventListener('mousedown', onDown)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onResize)
    return () => {
      document.removeEventListener('mousedown', onDown)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onResize)
    }
  }, [open])

  function onKeyDown(e: React.KeyboardEvent) {
    if (!open) {
      if (['Enter', ' ', 'ArrowDown', 'ArrowUp'].includes(e.key)) { e.preventDefault(); openList() }
      return
    }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(options.length - 1, a + 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(0, a - 1)) }
    else if (e.key === 'Home') { e.preventDefault(); setActive(0) }
    else if (e.key === 'End') { e.preventDefault(); setActive(options.length - 1) }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (options[active]) pick(options[active].value) }
    else if (e.key === 'Escape') { e.preventDefault(); setOpen(false) }
    else if (e.key === 'Tab') setOpen(false)
    else if (e.key.length === 1) {
      // Jump to the next option starting with the typed letter
      const k = e.key.toLowerCase()
      const n = options.length
      for (let i = 1; i <= n; i++) {
        const idx = (active + i) % n
        if (options[idx].label.toLowerCase().startsWith(k)) { setActive(idx); break }
      }
    }
  }

  return (
    <>
      <button
        ref={btnRef}
        id={id}
        type="button"
        className={`ui-select is-${size}${open ? ' is-open' : ''} ${className}`}
        onClick={e => { e.stopPropagation(); open ? setOpen(false) : openList() }}
        onKeyDown={onKeyDown}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={ariaLabel}
      >
        {selected?.color && <span className="ui-select-dot" style={{ backgroundColor: selected.color }} aria-hidden="true" />}
        <span className={`ui-select-value${selected ? '' : ' is-placeholder'}`}>{selected?.label ?? placeholder ?? 'Select…'}</span>
        <svg className="ui-select-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && createPortal(
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          className="ui-select-list"
          style={pos
            ? { top: pos.top, left: pos.left, width: pos.width, maxHeight: pos.maxHeight }
            : { top: 0, left: 0, width: 'max-content', maxWidth: 'calc(100vw - 16px)', visibility: 'hidden' }}
          onMouseDown={e => e.preventDefault()} // keep focus on the button
        >
          {options.map((o, i) => {
            const isSel = o.value === current
            return (
              <li
                key={o.value || `__empty-${i}`}
                data-idx={i}
                role="option"
                aria-selected={isSel}
                className={`ui-select-option${isSel ? ' is-selected' : ''}${i === active ? ' is-active' : ''}`}
                onMouseEnter={() => setActive(i)}
                onClick={e => { e.stopPropagation(); pick(o.value) }}
              >
                {o.color !== undefined && <span className="ui-select-dot" style={{ backgroundColor: o.color || 'transparent' }} aria-hidden="true" />}
                <span className="flex-1 min-w-0 truncate whitespace-nowrap">{o.label}</span>
                {isSel && (
                  <svg className="ui-select-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </li>
            )
          })}
        </ul>,
        document.body,
      )}
    </>
  )
}

// Helper for plain string lists: ['High','Medium'] → options
export const opts = (values: string[]): SelectOption[] => values.map(v => ({ value: v, label: v }))

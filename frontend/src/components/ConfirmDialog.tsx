import React, { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

// Centred in-app confirmation box, used instead of the browser's window.confirm.
// Rendered into <body> so no page wrapper (transforms, animations) can clip or offset it.
// Esc or a click on the dimmed backdrop cancels; focus starts on Cancel so Enter can't delete by accident.
export default function ConfirmDialog({ open, title, message, confirmLabel = 'Delete', busy, onConfirm, onCancel }: {
  open: boolean
  title: string
  message?: React.ReactNode
  confirmLabel?: string
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  const cancelRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    cancelRef.current?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onCancel() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, busy, onCancel])

  if (!open) return null

  return createPortal(
    <div className="confirm-backdrop" onMouseDown={e => { if (e.target === e.currentTarget && !busy) onCancel() }}>
      <div className="confirm-box" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title">
        <div className="confirm-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </div>
        <h2 id="confirm-title" className="confirm-title">{title}</h2>
        {message && <div className="confirm-msg">{message}</div>}
        <div className="confirm-actions">
          <button ref={cancelRef} type="button" onClick={onCancel} disabled={busy} className="confirm-btn is-cancel">Cancel</button>
          <button type="button" onClick={onConfirm} disabled={busy} className="confirm-btn is-danger">
            {busy ? 'Deleting…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

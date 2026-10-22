import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'

// App-wide notifications: success / error / info / warning cards that close themselves.
// Wrap the app in <ToastProvider>, then call useToast().success('Saved') anywhere.

export type ToastKind = 'success' | 'error' | 'info' | 'warning'

interface ToastItem { id: number; kind: ToastKind; title: string; message?: string }

type Notify = (title: string, message?: string) => void
interface ToastApi { success: Notify; error: Notify; info: Notify; warning: Notify }

const ToastContext = createContext<ToastApi | null>(null)

const ICONS: Record<ToastKind, string> = {
  success: 'M5 13l4 4L19 7',
  error: 'M6 18L18 6M6 6l12 12',
  info: 'M13 16h-1v-4h-1m1-4h.01',
  warning: 'M12 9v4m0 4h.01',
}

// Errors stay up a little longer so there is time to read them
const DURATION: Record<ToastKind, number> = { success: 3500, info: 3500, warning: 5000, error: 6000 }

function ToastCard({ t, onClose }: { t: ToastItem; onClose: (id: number) => void }) {
  useEffect(() => {
    const timer = setTimeout(() => onClose(t.id), DURATION[t.kind])
    return () => clearTimeout(timer)
  }, [t.id, t.kind, onClose])

  return (
    <div className={`toast is-${t.kind}`} role={t.kind === 'error' ? 'alert' : 'status'}>
      <span className="toast-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
          <path d={ICONS[t.kind]} />
        </svg>
      </span>
      <div className="flex-1 min-w-0">
        <div className="toast-title">{t.title}</div>
        {t.message && <div className="toast-msg">{t.message}</div>}
      </div>
      <button onClick={() => onClose(t.id)} className="toast-close" aria-label="Dismiss notification">✕</button>
    </div>
  )
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const nextId = useRef(1)

  const remove = useCallback((id: number) => setToasts(list => list.filter(t => t.id !== id)), [])

  const push = useCallback((kind: ToastKind, title: string, message?: string) => {
    const id = nextId.current++
    // Keep at most 4 on screen; the oldest goes first
    setToasts(list => [...list.slice(-3), { id, kind, title, message }])
  }, [])

  const api = useRef<ToastApi>({
    success: (t, m) => push('success', t, m),
    error: (t, m) => push('error', t, m),
    info: (t, m) => push('info', t, m),
    warning: (t, m) => push('warning', t, m),
  }).current

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toast-stack" aria-live="polite">
        {toasts.map(t => <ToastCard key={t.id} t={t} onClose={remove} />)}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>')
  return ctx
}

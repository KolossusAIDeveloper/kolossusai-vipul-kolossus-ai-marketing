import React from 'react'

// Outline icons (24x24, stroke) for the follow-up form fields
const ICONS = {
  calendar: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z',
  chat: 'M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z',
  arrows: 'M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4',
  phone: 'M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z',
  clock: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z',
  user: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z',
  users: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z',
  flag: 'M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9',
  quote: 'M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z',
  pencil: 'M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z',
  arrowRight: 'M13 7l5 5m0 0l-5 5m5-5H6',
}

export type FieldIcon = keyof typeof ICONS
export type FieldStatus = 'ok' | 'bad' | null

function StatusMark({ status }: { status: FieldStatus }) {
  if (status === 'ok') return (
    <svg viewBox="0 0 24 24" className="w-5 h-5" aria-label="valid">
      <circle cx="12" cy="12" r="11" fill="#22c55e" />
      <path d="M7 12.5l3.2 3.2L17 9" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
  if (status === 'bad') return (
    <svg viewBox="0 0 24 24" className="w-5 h-5" aria-label="invalid">
      <circle cx="12" cy="12" r="11" fill="#ef4444" />
      <path d="M8.5 8.5l7 7M15.5 8.5l-7 7" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  )
  return null
}

// Boxed form field: icon cell | uppercase label + control | ✓ / ✕ status
export default function FormField({ icon, label, htmlFor, required, status = null, disabled, title, children }: {
  icon: FieldIcon
  label: string
  htmlFor: string
  required?: boolean
  status?: FieldStatus
  disabled?: boolean
  title?: string
  children: React.ReactNode
}) {
  return (
    <div className={`fu-field${status === 'bad' ? ' is-bad' : ''}${disabled ? ' is-disabled' : ''}`} title={title}>
      <div className="fu-icon">
        <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d={ICONS[icon]} />
        </svg>
      </div>
      <div className="fu-body">
        <label htmlFor={htmlFor} className="fu-label">{label}{required ? ' *' : ''}</label>
        {children}
      </div>
      <div className="fu-status"><StatusMark status={status} /></div>
    </div>
  )
}

import React, { useState, useEffect } from 'react'
import { nowIST, todayISTStr } from '../utils/ist'

interface Props {
  value: string // "YYYY-MM-DDTHH:MM" in IST
  onChange: (val: string) => void // returns "YYYY-MM-DDTHH:MM" in IST
  label?: string
  required?: boolean
  minDate?: string // YYYY-MM-DD in IST
  maxDate?: string // YYYY-MM-DD in IST (e.g. today for past-only fields)
  disabled?: boolean
  id?: string
}

export default function ISTDateTimePicker({
  value, onChange, label, required, minDate, maxDate, disabled, id
}: Props) {
  const defaultDate = todayISTStr()
  const defaultTime = nowIST().slice(11, 16)

  const [date, setDate] = useState(value ? value.slice(0, 10) : defaultDate)
  const [time, setTime] = useState(value ? value.slice(11, 16) : defaultTime)

  useEffect(() => {
    if (value) {
      setDate(value.slice(0, 10))
      setTime(value.slice(11, 16))
    }
  }, [value])

  function handleChange(newDate: string, newTime: string) {
    if (newDate && newTime) {
      onChange(`${newDate}T${newTime}`)
    }
  }

  const baseStyle: React.CSSProperties = {
    padding: '8px 12px',
    borderRadius: 8,
    border: '1.5px solid #d1d5db',
    fontSize: 14,
    color: disabled ? '#9ca3af' : '#111827',
    background: disabled ? '#f9fafb' : '#fff',
    cursor: disabled ? 'not-allowed' : 'pointer',
    outline: 'none',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {label && (
        <label htmlFor={id} style={{ fontSize: 13, fontWeight: 500, color: '#374151' }}>
          {label}{required && ' *'}
        </label>
      )}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input
          type="date"
          id={id}
          value={date}
          min={minDate}
          max={maxDate}
          disabled={disabled}
          onChange={e => { setDate(e.target.value); handleChange(e.target.value, time) }}
          required={required}
          style={{ ...baseStyle, flex: 1 }}
          className="fu-control"
        />
        <input
          type="time"
          value={time}
          disabled={disabled}
          onChange={e => { setTime(e.target.value); handleChange(date, e.target.value) }}
          required={required}
          style={{ ...baseStyle, width: 120 }}
          className="fu-control"
        />
        <span style={{ fontSize: 12, color: '#6b7280', whiteSpace: 'nowrap' }}>IST</span>
      </div>
    </div>
  )
}

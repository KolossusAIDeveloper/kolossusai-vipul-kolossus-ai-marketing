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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {label && (
        <label htmlFor={id} className="ist-label">
          {label}{required && ' *'}
        </label>
      )}
      {/* Time wraps under the date when the field is too narrow for both */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <input
          type="date"
          id={id}
          value={date}
          min={minDate}
          max={maxDate}
          disabled={disabled}
          onChange={e => { setDate(e.target.value); handleChange(e.target.value, time) }}
          required={required}
          style={{ flex: '1 1 140px', minWidth: 0 }}
          className="fu-control ist-input"
        />
        <input
          type="time"
          value={time}
          disabled={disabled}
          onChange={e => { setTime(e.target.value); handleChange(date, e.target.value) }}
          required={required}
          style={{ flex: '0 0 110px' }}
          className="fu-control ist-input"
        />
        <span className="ist-tz">IST</span>
      </div>
    </div>
  )
}

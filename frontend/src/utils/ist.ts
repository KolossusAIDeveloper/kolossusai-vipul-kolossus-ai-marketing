// All DB timestamps come as strings without timezone suffix (naive UTC from PostgreSQL)
// We must treat them as UTC and convert to IST for display

const TZ = 'Asia/Kolkata'
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000 // +05:30

// Parse a DB timestamp string as UTC (append Z if no timezone info)
export function parseUTC(s: string | null | undefined): Date | null {
  if (!s) return null
  // If already has Z or + timezone info, parse as-is; otherwise treat as UTC
  const str = /[Z+]/.test(s) ? s : s + 'Z'
  const d = new Date(str)
  return isNaN(d.getTime()) ? null : d
}

/** Current date in IST as "YYYY-MM-DD" — for date picker default */
export function todayISTStr(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: TZ })
}

/** Get current IST datetime as "YYYY-MM-DDTHH:MM" for datetime-local inputs (IST wall-clock) */
export function nowIST(): string {
  const now = new Date()
  const ist = new Date(now.getTime() + IST_OFFSET_MS)
  return ist.toISOString().slice(0, 16)
}

/** Format a DB UTC timestamp string as IST date+time for display: "21 Oct 2026, 03:30 PM" */
export function fmtDateTime(val: string | null | undefined): string {
  const d = parseUTC(val)
  if (!d) return ''
  try {
    return d.toLocaleString('en-IN', {
      timeZone: TZ,
      day: '2-digit', month: 'short', year: 'numeric',
      hour: 'numeric', minute: '2-digit', hour12: true
    }).replace(' am', ' AM').replace(' pm', ' PM')
  } catch { return val ?? '' }
}

/** Format a DB UTC timestamp string as IST date only: "21-10-2026" */
export function fmtDate(val: string | null | undefined): string {
  const d = parseUTC(val)
  if (!d) return ''
  try {
    const p = new Intl.DateTimeFormat('en-GB', {
      timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric'
    }).formatToParts(d)
    const get = (t: string) => p.find(x => x.type === t)?.value ?? ''
    return `${get('day')}-${get('month')}-${get('year')}`
  } catch { return val ?? '' }
}

/** "09 Oct 2026, 2:30 PM" */
export function fmtNice(val: string | null | undefined): string {
  const d = parseUTC(val)
  if (!d) return ''
  try {
    return d.toLocaleString('en-GB', {
      timeZone: TZ, day: '2-digit', month: 'short', year: 'numeric',
      hour: 'numeric', minute: '2-digit', hour12: true
    }).replace(' am', ' AM').replace(' pm', ' PM').replace('Sept', 'Sep')
  } catch { return val ?? '' }
}

/** Convert IST datetime-local string ("YYYY-MM-DDTHH:MM") to UTC ISO string for API */
export function istLocalToUTC(s: string): string {
  if (!s) return s
  // s is IST wall-clock time; subtract 5:30 to get UTC
  const istMs = new Date(s + ':00').getTime() // parsed as if local, but we treat it as UTC reference
  const utcMs = istMs - IST_OFFSET_MS
  return new Date(utcMs).toISOString()
}

/** "Today" / "Yesterday" / "X days ago" */
export function lastContactText(val: string | null | undefined): string {
  if (!val) return '—'
  const n = -daysFromToday(val)
  return n <= 0 ? 'Today' : n === 1 ? 'Yesterday' : `${n} days ago`
}

/** Whole calendar days in IST from today to val (negative = past) */
export function daysFromToday(val: string | null | undefined): number {
  if (!val) return 0
  const d = parseUTC(val)
  if (!d) return 0
  const todayStr = todayISTStr()
  const valStr = d.toLocaleDateString('en-CA', { timeZone: TZ })
  const t = new Date(todayStr + 'T00:00:00').getTime()
  const v = new Date(valStr + 'T00:00:00').getTime()
  return Math.round((v - t) / 86400000)
}

/** True if the next follow-up date (in IST) is in the past */
export function isOverdue(val: string | null | undefined, status: string): boolean {
  if (!val) return false
  const closed = new Set(["Converted", "Not Interested", "Invalid / Wrong Number", "Do Not Contact"])
  if (closed.has(status)) return false
  return daysFromToday(val) < 0
}

/** Label + colour for the next follow-up pill */
export function nextDue(val: string | null | undefined, status: string): { text: string; tone: string } {
  const closed = new Set(["Converted", "Not Interested", "Invalid / Wrong Number", "Do Not Contact"])
  if (!val || closed.has(status)) return { text: '—', tone: 'gray' }
  const days = daysFromToday(val)
  if (days < 0) return { text: `Overdue ${-days}d`, tone: 'red' }
  if (days === 0) return { text: 'Due today', tone: 'orange' }
  if (days === 1) return { text: 'Tomorrow', tone: 'yellow' }
  if (days <= 7) return { text: `In ${days}d`, tone: 'blue' }
  return { text: fmtDate(val), tone: 'gray' }
}

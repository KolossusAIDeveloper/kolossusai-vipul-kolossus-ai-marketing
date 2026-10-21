// All date/time helpers force Asia/Kolkata (IST = UTC+5:30)

const TZ = 'Asia/Kolkata'

/** Current date in IST as a Date object (time zeroed) */
export function todayIST(): Date {
  const s = new Date().toLocaleDateString('en-CA', { timeZone: TZ }) // "YYYY-MM-DD"
  return new Date(s + 'T00:00:00')
}

/** Current datetime in IST as "YYYY-MM-DDTHH:MM" for datetime-local inputs */
export function nowIST(): string {
  const now = new Date()
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false
  }).formatToParts(now)
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? '00'
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`
}

/** "YYYY-MM-DD" of today in IST — for date picker default */
export function todayISTStr(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: TZ })
}

/** Parse any ISO/pg timestamp and return a Date interpreted in IST */
function toISTDate(val: string): Date {
  return new Date(val) // JS Date is always a UTC instant; we just display in IST
}

/** DD-MM-YYYY */
export function fmtDate(val: string | null | undefined): string {
  if (!val) return ''
  try {
    const d = toISTDate(val)
    const p = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric' }).formatToParts(d)
    const get = (t: string) => p.find(x => x.type === t)?.value ?? ''
    return `${get('day')}-${get('month')}-${get('year')}`
  } catch { return val ?? '' }
}

/** DD-MM-YYYY HH:MM AM/PM */
export function fmtDateTime(val: string | null | undefined): string {
  if (!val) return ''
  try {
    const d = toISTDate(val)
    return d.toLocaleString('en-IN', {
      timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric',
      hour: 'numeric', minute: '2-digit', hour12: true
    }).replace('am', 'AM').replace('pm', 'PM')
  } catch { return val ?? '' }
}

/** "09 Oct 2026, 2:30 PM" */
export function fmtNice(val: string): string {
  try {
    const d = toISTDate(val)
    return d.toLocaleString('en-GB', {
      timeZone: TZ, day: '2-digit', month: 'short', year: 'numeric',
      hour: 'numeric', minute: '2-digit', hour12: true
    }).replace(' am', ' AM').replace(' pm', ' PM').replace('Sept', 'Sep')
  } catch { return val }
}

/** "Today" / "Yesterday" / "X days ago" */
export function lastContactText(val: string): string {
  const n = -daysFromToday(val)
  return n <= 0 ? 'Today' : n === 1 ? 'Yesterday' : `${n} days ago`
}

/** Whole calendar days in IST from today to val (negative = past) */
export function daysFromToday(val: string): number {
  const todayStr = todayISTStr()
  const valStr = new Date(val).toLocaleDateString('en-CA', { timeZone: TZ })
  const t = new Date(todayStr + 'T00:00:00').getTime()
  const d = new Date(valStr + 'T00:00:00').getTime()
  return Math.round((d - t) / 86400000)
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

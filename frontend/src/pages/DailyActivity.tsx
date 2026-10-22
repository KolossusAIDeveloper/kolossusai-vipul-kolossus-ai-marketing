import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getContactsByDate } from '../api'
import { parseUTC, todayISTStr } from '../utils/ist'
import StatusBadge, { STATUS_COLORS } from '../components/StatusBadge'

interface DailyContact {
  id: number; full_name: string; company?: string; mobile?: string
  designation?: string; city?: string; sector?: string; current_status: string
  followup_at: string; channel: string; contacted_by: string; our_notes?: string
  call_result?: string; status_after: string
}

// Each call's outcome is grouped into one of four buckets for the summary cards
type Bucket = 'interested' | 'followup' | 'notInterested' | 'noAnswer' | 'other'

// Each bar uses the Contacts colour of the status that names its bucket
const BUCKETS: { key: Exclude<Bucket, 'other'>; label: string; color: string }[] = [
  { key: 'interested', label: 'Interested', color: STATUS_COLORS['Interested'] },
  { key: 'followup', label: 'Follow-up', color: STATUS_COLORS['Follow-up Scheduled'] },
  { key: 'notInterested', label: 'Not Interested', color: STATUS_COLORS['Not Interested'] },
  { key: 'noAnswer', label: 'No Answer', color: STATUS_COLORS['Attempted - No Answer'] },
]

const NO_ANSWER_RESULTS = new Set(['No Answer', 'Busy', 'Switched Off', 'Not Replied'])

function bucketOf(c: DailyContact): Bucket {
  const s = c.status_after
  if (['Interested', 'Demo Scheduled', 'Proposal Sent', 'Negotiation', 'Converted'].includes(s)) return 'interested'
  if (['Follow-up Scheduled', 'Contacted'].includes(s)) return 'followup'
  if (['Not Interested', 'Do Not Contact', 'Invalid / Wrong Number'].includes(s)) return 'notInterested'
  if (s === 'Attempted - No Answer' || NO_ANSWER_RESULTS.has(c.call_result ?? '')) return 'noAnswer'
  return 'other'
}

const CHANNEL_ICONS: Record<string, string> = {
  phone: 'M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z',
  chat: 'M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z',
  mail: 'M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z',
  video: 'M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z',
  users: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z',
  pin: 'M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0zM15 11a3 3 0 11-6 0 3 3 0 016 0z',
  link: 'M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1',
}

const CHANNEL_ICON_KEY: Record<string, string> = {
  Call: 'phone', WhatsApp: 'chat', SMS: 'chat', Email: 'mail', 'Video Call': 'video',
  Meeting: 'users', Visit: 'pin', LinkedIn: 'link',
}

function Icon({ d, className = 'w-4 h-4' }: { d: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  )
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/)
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase()
}

// "9825000000" -> "+91 98250 00000"; anything else is shown as stored
function fmtMobile(m?: string) {
  if (!m) return '—'
  const digits = m.replace(/\D/g, '').replace(/^91(?=\d{10}$)/, '')
  return digits.length === 10 ? `+91 ${digits.slice(0, 5)} ${digits.slice(5)}` : m
}

function fmtTime(val: string, withDay: boolean) {
  const d = parseUTC(val)
  if (!d) return ''
  const time = d.toLocaleTimeString('en-US', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit' })
  if (!withDay) return time
  const day = d.toLocaleDateString('en-GB', { timeZone: 'Asia/Kolkata', weekday: 'short', day: 'numeric', month: 'short' })
  return `${day}, ${time}`
}

function addDays(iso: string, delta: number) {
  const d = new Date(iso + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + delta)
  return d.toISOString().slice(0, 10)
}

// Monday of the IST week containing the given date
function weekStart(iso: string) {
  const dow = new Date(iso + 'T00:00:00Z').getUTCDay() // 0 = Sunday
  return addDays(iso, -((dow + 6) % 7))
}

export default function DailyActivity() {
  const navigate = useNavigate()
  const today = todayISTStr()
  const yesterday = addDays(today, -1)
  const [range, setRange] = useState({ start: today, end: today })
  const [data, setData] = useState<{ count: number; contacts: DailyContact[] } | null>(null)
  const [loading, setLoading] = useState(false)

  const isRange = range.start !== range.end
  const preset =
    isRange && range.start === weekStart(today) && range.end === today ? 'week'
      : !isRange && range.start === today ? 'today'
        : !isRange && range.start === yesterday ? 'yesterday'
          : null

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    getContactsByDate(range.start, isRange ? range.end : undefined)
      .then(r => { if (!cancelled) { setData(r); setLoading(false) } })
      .catch(() => { if (!cancelled) { setData({ count: 0, contacts: [] }); setLoading(false) } })
    return () => { cancelled = true }
  }, [range.start, range.end, isRange])

  const setDay = (d: string) => setRange({ start: d, end: d })
  // Arrows step one day from the end of the current selection
  const shift = (delta: number) => setDay(addDays(range.end, delta))

  const contacts = data?.contacts ?? []
  const bucketCounts = contacts.reduce<Record<Bucket, number>>(
    (acc, c) => { acc[bucketOf(c)]++; return acc },
    { interested: 0, followup: 0, notInterested: 0, noAnswer: 0, other: 0 },
  )
  const reachedLabel = preset === 'today' ? 'Contacts reached today'
    : preset === 'yesterday' ? 'Contacts reached yesterday'
      : preset === 'week' ? 'Contacts reached this week'
        : 'Contacts reached'

  const presetBtn = (key: string, label: string, onClick: () => void) => (
    <button onClick={onClick} className={`da-seg-btn ${preset === key ? 'is-active' : ''}`} aria-pressed={preset === key}>
      {label}
    </button>
  )

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-5">
      {/* Header */}
      <div className="bg-white rounded-2xl shadow-sm p-4 md:p-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="hidden md:block text-2xl md:text-3xl font-bold text-gray-900">Daily Activity</h1>
          <p className="text-sm text-gray-500 mt-1">See all outbound contacts made on any specific date.</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button onClick={() => shift(-1)} className="da-round-btn" title="Previous day" aria-label="Previous day">
            <Icon d="M15 19l-7-7 7-7" />
          </button>
          <input
            type="date"
            value={range.end}
            max={today}
            onChange={e => e.target.value && setDay(e.target.value)}
            className="da-date-input"
            aria-label="Pick a date"
          />
          <button onClick={() => shift(1)} disabled={range.end >= today} className="da-round-btn" title="Next day" aria-label="Next day">
            <Icon d="M9 5l7 7-7 7" />
          </button>

          <div className="da-seg">
            {presetBtn('today', 'Today', () => setDay(today))}
            {presetBtn('yesterday', 'Yesterday', () => setDay(yesterday))}
            {presetBtn('week', 'This week', () => setRange({ start: weekStart(today), end: today }))}
          </div>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 md:gap-4">
        <div className="da-hero-card rounded-2xl p-4 md:p-5 shadow-sm col-span-2 sm:col-span-1">
          <div className="text-3xl font-bold">{loading ? '–' : data?.count ?? 0}</div>
          <div className="text-sm mt-1 opacity-90">{reachedLabel}</div>
        </div>
        {BUCKETS.map(b => {
          const n = bucketCounts[b.key]
          const pct = contacts.length ? (n / contacts.length) * 100 : 0
          return (
            <div key={b.key} className="bg-white rounded-2xl p-4 md:p-5 shadow-sm">
              <div className="text-3xl font-bold text-gray-900">{loading ? '–' : n}</div>
              <div className="text-sm text-gray-500 mt-1">{b.label}</div>
              <div className="da-bar mt-3"><div className="da-bar-fill" style={{ width: `${pct}%`, backgroundColor: b.color }} /></div>
            </div>
          )
        })}
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        {loading && <div className="text-gray-400 text-sm p-6">Loading…</div>}

        {!loading && contacts.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm whitespace-nowrap">
              <thead className="da-thead text-xs uppercase tracking-wider">
                <tr>
                  <th className="px-5 py-4 text-left">#</th>
                  <th className="px-5 py-4 text-left">Contact</th>
                  <th className="px-5 py-4 text-left">Company</th>
                  <th className="px-5 py-4 text-left">Mobile</th>
                  <th className="px-5 py-4 text-left">Status</th>
                  <th className="px-5 py-4 text-left">Channel</th>
                  <th className="px-5 py-4 text-left">Time</th>
                  <th className="px-5 py-4 text-left">By</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {contacts.map((c, i) => {
                  const iconKey = CHANNEL_ICON_KEY[c.channel]
                  return (
                    <tr
                      key={`${c.id}-${i}`}
                      className="da-row cursor-pointer transition-colors"
                      onClick={() => navigate(`/contacts/${c.id}`)}
                    >
                      <td className="px-5 py-4 text-gray-400 font-mono text-xs">{c.id}</td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className="da-avatar">{initials(c.full_name)}</div>
                          <div className="min-w-0">
                            <div className="font-semibold text-gray-900">{c.full_name}</div>
                            {c.designation && <div className="text-xs text-gray-500">{c.designation}</div>}
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <div className="text-gray-800">{c.company || '—'}</div>
                        {c.city && <div className="text-xs text-gray-500">{c.city}</div>}
                      </td>
                      <td className="px-5 py-4 text-gray-700 font-mono text-xs whitespace-nowrap">{fmtMobile(c.mobile)}</td>
                      <td className="px-5 py-4">
                        <StatusBadge status={c.status_after} />
                      </td>
                      <td className="px-5 py-4 text-gray-600">
                        <span className="inline-flex items-center gap-1.5">
                          {iconKey && <Icon d={CHANNEL_ICONS[iconKey]} />}
                          {c.channel}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-gray-600 whitespace-nowrap">{fmtTime(c.followup_at, isRange)}</td>
                      <td className="px-5 py-4">
                        <span className="da-by" title={c.contacted_by}>{initials(c.contacted_by)}</span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {!loading && contacts.length === 0 && (
          <div className="text-center py-16 text-gray-400">
            <div className="text-5xl mb-3">📭</div>
            <div className="text-lg font-medium">No outbound contacts {isRange ? 'in this period' : 'on this date'}</div>
            <div className="text-sm mt-1">Try a different date or check if follow-ups were logged.</div>
          </div>
        )}
      </div>
    </div>
  )
}

import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getContactsByDate } from '../api'
import StatusBadge from '../components/StatusBadge'

function toInputDate(d: Date) {
  return d.toISOString().slice(0, 10)
}

function fmtDateTime(val: string | null | undefined) {
  if (!val) return ''
  try {
    const d = new Date(val)
    const day = String(d.getDate()).padStart(2, '0')
    const mon = String(d.getMonth() + 1).padStart(2, '0')
    const hrs = String(d.getHours()).padStart(2, '0')
    const min = String(d.getMinutes()).padStart(2, '0')
    return `${day}-${mon}-${d.getFullYear()} ${hrs}:${min}`
  } catch { return val ?? '' }
}

interface DailyContact {
  id: number; full_name: string; company?: string; mobile?: string
  designation?: string; city?: string; sector?: string; current_status: string
  followup_at: string; channel: string; contacted_by: string; our_notes?: string
}

export default function DailyActivity() {
  const navigate = useNavigate()
  const today = toInputDate(new Date())
  const [date, setDate] = useState(today)
  const [data, setData] = useState<{ count: number; contacts: DailyContact[] } | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    getContactsByDate(date)
      .then(r => { if (!cancelled) { setData(r); setLoading(false) } })
      .catch(() => { if (!cancelled) { setData({ count: 0, contacts: [] }); setLoading(false) } })
    return () => { cancelled = true }
  }, [date])

  function goToday() { setDate(today) }
  function goYesterday() {
    const d = new Date(); d.setDate(d.getDate() - 1); setDate(toInputDate(d))
  }
  function shift(delta: number) {
    const d = new Date(date + 'T00:00:00'); d.setDate(d.getDate() + delta); setDate(toInputDate(d))
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Daily Activity</h1>
        <p className="text-sm text-gray-500 mt-1">See all outbound contacts made on any specific date.</p>
      </div>

      {/* Date picker row */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <button onClick={() => shift(-1)}
          className="px-3 py-2 rounded-lg border border-gray-300 hover:bg-gray-100 text-sm font-medium"
          title="Previous day">← Prev
        </button>

        <input
          type="date"
          value={date}
          max={today}
          onChange={e => setDate(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
        />

        <button onClick={() => shift(1)}
          disabled={date >= today}
          className="px-3 py-2 rounded-lg border border-gray-300 hover:bg-gray-100 text-sm font-medium disabled:opacity-40"
          title="Next day">Next →
        </button>

        <button onClick={goToday}
          className="px-3 py-2 rounded-lg bg-purple-600 text-white text-sm font-medium hover:bg-purple-700">
          Today
        </button>
        <button onClick={goYesterday}
          className="px-3 py-2 rounded-lg border border-gray-300 text-sm font-medium hover:bg-gray-100">
          Yesterday
        </button>
      </div>

      {/* Count badge */}
      {!loading && data && (
        <div className={`inline-flex items-center gap-2 px-5 py-3 rounded-xl text-white font-semibold text-lg mb-6 shadow ${data.count === 0 ? 'bg-gray-400' : 'bg-purple-600'}`}>
          <span className="text-3xl font-bold">{data.count}</span>
          <span>{data.count === 1 ? 'contact' : 'contacts'} reached on {date}</span>
        </div>
      )}
      {loading && (
        <div className="text-gray-400 text-sm mb-6">Loading…</div>
      )}

      {/* Table */}
      {!loading && data && data.contacts.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-xs uppercase">
              <tr>
                <th className="px-4 py-3 text-left">#</th>
                <th className="px-4 py-3 text-left">Name</th>
                <th className="px-4 py-3 text-left">Company</th>
                <th className="px-4 py-3 text-left">Mobile</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Channel</th>
                <th className="px-4 py-3 text-left">Time</th>
                <th className="px-4 py-3 text-left">By</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {data.contacts.map((c, i) => (
                <tr
                  key={`${c.id}-${i}`}
                  className="hover:bg-purple-50 dark:hover:bg-gray-700 cursor-pointer transition-colors"
                  onClick={() => navigate(`/contacts/${c.id}`)}
                >
                  <td className="px-4 py-3 text-gray-400 font-mono text-xs">{c.id}</td>
                  <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">
                    {c.full_name}
                    {c.designation && <div className="text-xs text-gray-400">{c.designation}</div>}
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300">
                    {c.company || '—'}
                    {c.city && <div className="text-xs text-gray-400">{c.city}</div>}
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300 font-mono text-xs">{c.mobile || '—'}</td>
                  <td className="px-4 py-3"><StatusBadge status={c.current_status} /></td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{c.channel}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">{fmtDateTime(c.followup_at)}</td>
                  <td className="px-4 py-3 text-gray-400 text-xs">{c.contacted_by}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && data && data.contacts.length === 0 && (
        <div className="text-center py-16 text-gray-400">
          <div className="text-5xl mb-3">📭</div>
          <div className="text-lg font-medium">No outbound contacts on this date</div>
          <div className="text-sm mt-1">Try a different date or check if follow-ups were logged.</div>
        </div>
      )}
    </div>
  )
}

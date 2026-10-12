import React, { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, LabelList
} from 'recharts'
import { getStats } from '../api'
import StatusBadge, { STATUS_COLORS } from '../components/StatusBadge'

function fmtDate(val: string | null | undefined) {
  if (!val) return ''
  try {
    const d = new Date(val)
    const day = String(d.getDate()).padStart(2, '0')
    const mon = String(d.getMonth() + 1).padStart(2, '0')
    return `${day}-${mon}-${d.getFullYear()}`
  } catch { return val ?? '' }
}

interface KPIs {
  total: number
  due_today: number
  overdue: number
  contacted_week: number
  converted: number
}

interface ChartItem { name: string; value: number }
interface ChartData {
  by_sector: ChartItem[]
}

const STATUSES = [
  "New","Attempted - No Answer","Contacted","Interested","Follow-up Scheduled",
  "Demo Scheduled","Proposal Sent","Negotiation","Converted","Not Interested",
  "Invalid / Wrong Number","Do Not Contact"
]
const CLOSED_STATUSES = new Set(['Converted', 'Not Interested', 'Invalid / Wrong Number', 'Do Not Contact'])

// True while dark mode is on; follows the sidebar toggle live (it flips the "dark" class on <html>)
function useIsDark() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'))
  useEffect(() => {
    const el = document.documentElement
    const obs = new MutationObserver(() => setDark(el.classList.contains('dark')))
    obs.observe(el, { attributes: true, attributeFilter: ['class'] })
    return () => obs.disconnect()
  }, [])
  return dark
}

// Hover card for the bar charts: colour dot, name, count and share of all contacts
function ChartTooltip({ active, payload, total, color }: {
  active?: boolean
  payload?: { payload: { name: string; value: number; color?: string } }[]
  total: number
  color?: string
}) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  const share = total ? Math.round((d.value / total) * 100) : 0
  return (
    <div className="chart-tip">
      <div className="chart-tip-name">
        <span className="pipe-dot" style={{ backgroundColor: d.color ?? color }} />
        {d.name}
      </div>
      <div className="chart-tip-value">{d.value} <span>contacts · {share}%</span></div>
    </div>
  )
}

export default function Dashboard() {
  const navigate = useNavigate()
  const location = useLocation()
  const isDark = useIsDark()
  const [animKey, setAnimKey] = useState(0)
  const [kpis, setKpis] = useState<KPIs | null>(null)
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({})
  const [chartData, setChartData] = useState<ChartData | null>(null)
  const [loading, setLoading] = useState(true)

  // Refetch on every visit / Dashboard click (location.key changes), then replay the chart animation.
  // The previous numbers stay on screen meanwhile, so nothing flashes.
  useEffect(() => {
    getStats().then(d => {
      setKpis(d.kpis)
      setStatusCounts(d.status_counts)
      setChartData(d.chart_data ?? null)
      setAnimKey(k => k + 1)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [location.key])

  if (loading) return (
    <div className="p-8 flex items-center justify-center">
      <div className="text-gray-400 text-lg">Loading dashboard...</div>
    </div>
  )

  const statusChartData = STATUSES
    .map(s => ({ name: s, value: statusCounts[s] ?? 0, color: STATUS_COLORS[s] }))
    .filter(s => s.value > 0)
    .sort((a, b) => b.value - a.value)
  const sectorData = [...(chartData?.by_sector ?? [])].sort((a, b) => b.value - a.value)

  // Chart ink per theme (text stays in neutral ink, never the series colour)
  const ink = isDark
    ? { label: '#cbd5e1', value: '#f1f5f9', cursor: 'rgb(148 163 184 / 0.10)', sector: '#22D3C5' }
    : { label: '#374151', value: '#111827', cursor: 'rgb(139 90 43 / 0.08)', sector: '#8B5A2B' }

  return (
    <div className="dashboard-page p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800">Dashboard</h1>
        <div className="flex gap-2">
          <button
            onClick={() => navigate('/contacts')}
            className="btn-brown px-4 py-2 rounded-lg text-sm font-semibold"
          >
            View Contacts
          </button>
          <button
            onClick={() => navigate('/import')}
            className="btn-gold px-4 py-2 rounded-lg text-sm font-semibold"
          >
            Import Excel
          </button>
        </div>
      </div>

      {/* KPI Cards — each is clickable and filters contacts */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[
          { label: 'Total Contacts', value: kpis?.total ?? 0, tone: '', sub: 'in the pipeline', link: '/contacts',
            icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z' },
          { label: 'Due Today', value: kpis?.due_today ?? 0, tone: 'is-today', sub: 'follow-ups scheduled today', link: '/contacts?next_followup_filter=Today',
            icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z' },
          { label: 'Overdue', value: kpis?.overdue ?? 0, tone: 'is-overdue', sub: 'past their follow-up date', link: '/contacts?next_followup_filter=Overdue',
            title: 'Contacts with a next follow-up date in the past (excluding closed contacts)',
            icon: 'M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
          { label: 'Activity This Week', value: kpis?.contacted_week ?? 0, tone: '', sub: 'any follow-up logged Mon–today', link: '/contacts?last_followup_filter=This+week',
            title: 'Contacts where ANY follow-up (call, WhatsApp, meeting, etc.) was logged Mon–today. Their current status may have changed — use this to see who your team has been in touch with this week.',
            icon: 'M3 12h4l3-8 4 16 3-8h4' },
          { label: 'Converted', value: kpis?.converted ?? 0, tone: 'is-won', sub: 'contacts won', link: '/contacts?statuses=Converted',
            title: 'Contacts whose current status is "Converted"',
            icon: 'M8 21h8m-4-4v4M7 4h10v5a5 5 0 01-10 0V4zM7 6H4v2a3 3 0 003 3m10-5h3v2a3 3 0 01-3 3' },
        ].map(card => (
          <div
            key={card.label}
            onClick={() => navigate(card.link)}
            title={card.title}
            className={`kpi-card ${card.tone}`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="sum-label">{card.label}</div>
              <div className="kpi-icon">
                <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d={card.icon} />
                </svg>
              </div>
            </div>
            <div className="kpi-value">{card.value}</div>
            <div className="kpi-sub">{card.sub}</div>
          </div>
        ))}
      </div>

      {/* Charts: replayed (fast grow-in) every time Dashboard is opened or clicked */}
      <div key={animKey} className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Status ranking */}
        <div className="bg-white rounded-xl shadow p-5">
          <h2 className="text-base font-semibold text-gray-700">Contacts by Status</h2>
          <p className="text-xs text-gray-500 mt-0.5 mb-3">Largest first · click a bar to open those contacts</p>
          {statusChartData.length === 0 ? (
            <p className="text-gray-400 text-sm">No data yet</p>
          ) : (
            <ResponsiveContainer width="100%" height={statusChartData.length * 28 + 16}>
              <BarChart data={statusChartData} layout="vertical" margin={{ left: 0, right: 44, top: 4, bottom: 4 }} barCategoryGap={6}>
                <XAxis type="number" hide domain={[0, 'dataMax']} />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={150}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 12, fill: ink.label }}
                  tickFormatter={v => v.length > 22 ? v.slice(0, 21) + '…' : v}
                />
                <Tooltip cursor={{ fill: ink.cursor }} content={<ChartTooltip total={kpis?.total ?? 0} />} />
                <Bar
                  dataKey="value"
                  barSize={16}
                  radius={[0, 4, 4, 0]}
                  animationDuration={500}
                  animationEasing="ease-out"
                  cursor="pointer"
                  onClick={(d: { name?: string }) => d?.name && navigate(`/contacts?statuses=${encodeURIComponent(d.name)}`)}
                >
                  {statusChartData.map(entry => (
                    <Cell key={entry.name} fill={entry.color} stroke={isDark ? 'rgb(255 255 255 / 0.25)' : 'none'} />
                  ))}
                  <LabelList dataKey="value" position="right" offset={8} style={{ fontSize: 12, fontWeight: 700, fill: ink.value }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Sector ranking: one series -> one colour */}
        <div className="bg-white rounded-xl shadow p-5">
          <h2 className="text-base font-semibold text-gray-700">Contacts by Sector</h2>
          <p className="text-xs text-gray-500 mt-0.5 mb-3">Top 10 sectors by number of contacts</p>
          {!sectorData.length ? (
            <p className="text-gray-400 text-sm">No sector data</p>
          ) : (
            <ResponsiveContainer width="100%" height={sectorData.length * 28 + 16}>
              <BarChart data={sectorData} layout="vertical" margin={{ left: 0, right: 44, top: 4, bottom: 4 }} barCategoryGap={6}>
                <XAxis type="number" hide domain={[0, 'dataMax']} />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={140}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 12, fill: ink.label }}
                  tickFormatter={v => v.length > 20 ? v.slice(0, 19) + '…' : v}
                />
                <Tooltip cursor={{ fill: ink.cursor }} content={<ChartTooltip total={kpis?.total ?? 0} color={ink.sector} />} />
                <Bar dataKey="value" barSize={16} radius={[0, 4, 4, 0]} fill={ink.sector} animationDuration={500} animationEasing="ease-out">
                  <LabelList dataKey="value" position="right" offset={8} style={{ fontSize: 12, fontWeight: 700, fill: ink.value }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Pipeline overview: one clickable tile per status, grouped into active vs closed */}
      <div className="bg-white rounded-xl shadow p-5 space-y-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-base font-semibold text-gray-700">Pipeline Overview</h2>
            <p className="text-xs text-gray-500 mt-0.5">Click a status to see those contacts</p>
          </div>
          <span className="pipe-total">{(kpis?.total ?? 0).toLocaleString()} contacts</span>
        </div>
        {[
          { title: 'Active pipeline', statuses: STATUSES.filter(s => !CLOSED_STATUSES.has(s)) },
          { title: 'Closed', statuses: STATUSES.filter(s => CLOSED_STATUSES.has(s)) },
        ].map(group => (
          <div key={group.title} className="space-y-2">
            <div className="sum-label">{group.title}</div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {group.statuses.map(s => {
                const count = statusCounts[s] ?? 0
                const share = kpis?.total ? (count / kpis.total) * 100 : 0
                return (
                  <div
                    key={s}
                    className="pipe-tile"
                    onClick={() => navigate(`/contacts?statuses=${encodeURIComponent(s)}`)}
                    title={`See the ${count} contacts with status "${s}"`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="pipe-name">
                        <span className="pipe-dot" style={{ backgroundColor: STATUS_COLORS[s] }} />
                        {s}
                      </span>
                      <span className="pipe-count">{count}</span>
                    </div>
                    <div className="pipe-track">
                      <div className="pipe-fill" style={{ width: `${share}%`, backgroundColor: STATUS_COLORS[s] }} />
                    </div>
                    <div className="pipe-share">{share.toFixed(share > 0 && share < 1 ? 1 : 0)}% of contacts</div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

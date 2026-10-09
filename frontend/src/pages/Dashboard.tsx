import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
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
  by_company_type: ChartItem[]
  by_city: ChartItem[]
  by_msme: ChartItem[]
}

const COMPANY_TYPE_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6']
const CITY_COLORS = ['#06b6d4', '#84cc16', '#f97316', '#ec4899', '#a78bfa']
const MSME_COLORS = ['#3b82f6', '#10b981', '#f59e0b']

const STATUSES = [
  "New","Attempted - No Answer","Contacted","Interested","Follow-up Scheduled",
  "Demo Scheduled","Proposal Sent","Negotiation","Converted","Not Interested",
  "Invalid / Wrong Number","Do Not Contact"
]

export default function Dashboard() {
  const navigate = useNavigate()
  const [kpis, setKpis] = useState<KPIs | null>(null)
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({})
  const [chartData, setChartData] = useState<ChartData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getStats().then(d => {
      setKpis(d.kpis)
      setStatusCounts(d.status_counts)
      setChartData(d.chart_data ?? null)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  if (loading) return (
    <div className="p-8 flex items-center justify-center">
      <div className="text-gray-400 text-lg">Loading dashboard...</div>
    </div>
  )

  const statusChartData = STATUSES
    .map(s => ({ name: s, value: statusCounts[s] ?? 0, color: STATUS_COLORS[s] }))
    .filter(s => s.value > 0)

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800">Dashboard</h1>
        <div className="flex gap-2">
          <button
            onClick={() => navigate('/contacts')}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700"
          >
            View Contacts
          </button>
          <button
            onClick={() => navigate('/import')}
            className="bg-gray-700 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-800"
          >
            Import Excel
          </button>
        </div>
      </div>

      {/* KPI Cards — each is clickable and filters contacts */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[
          { label: 'Total Contacts', value: kpis?.total ?? 0, color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-200', icon: '👥', link: '/contacts' },
          { label: 'Due Today', value: kpis?.due_today ?? 0, color: 'text-yellow-600', bg: 'bg-yellow-50', border: 'border-yellow-200', icon: '📅', link: '/contacts?next_followup_filter=Today' },
          { label: 'Overdue', value: kpis?.overdue ?? 0, color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-200', icon: '🔴', link: '/contacts?next_followup_filter=Overdue' },
          { label: 'Activity This Week', value: kpis?.contacted_week ?? 0, color: 'text-indigo-600', bg: 'bg-indigo-50', border: 'border-indigo-200', icon: '✅', link: '/contacts?last_followup_filter=This+week' },
          { label: 'Converted', value: kpis?.converted ?? 0, color: 'text-green-700', bg: 'bg-green-50', border: 'border-green-200', icon: '🏆', link: '/contacts?statuses=Converted' },
        ].map(card => (
          <div
            key={card.label}
            onClick={() => navigate(card.link)}
            title={
              card.label === 'Activity This Week'
                ? 'Contacts where ANY follow-up (call, WhatsApp, meeting, etc.) was logged Mon–today. Their current status may have changed — use this to see who your team has been in touch with this week.'
                : card.label === 'Converted'
                ? 'Contacts whose current status is "Converted"'
                : card.label === 'Overdue'
                ? 'Contacts with a next follow-up date in the past (excluding closed contacts)'
                : undefined
            }
            className={`${card.bg} border ${card.border} rounded-xl p-4 flex flex-col items-center shadow-sm cursor-pointer hover:shadow-md hover:scale-105 transition-all`}
          >
            <div className="text-2xl mb-1">{card.icon}</div>
            <div className={`text-3xl font-bold ${card.color}`}>{card.value}</div>
            <div className="text-xs text-gray-500 mt-1 text-center font-medium">{card.label}</div>
            {card.label === 'Activity This Week' && (
              <div className="text-xs text-indigo-400 mt-0.5 text-center">any follow-up logged</div>
            )}
          </div>
        ))}
      </div>

      {/* Charts Row 1: Status breakdown + Sector */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Status Bar Chart */}
        <div className="bg-white rounded-xl shadow p-5">
          <h2 className="text-base font-semibold text-gray-700 mb-4">Contacts by Status</h2>
          {statusChartData.length === 0 ? (
            <p className="text-gray-400 text-sm">No data yet</p>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={statusChartData} layout="vertical" margin={{ left: 10, right: 30, top: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={145}
                  tick={{ fontSize: 10 }}
                  tickFormatter={v => v.length > 20 ? v.slice(0, 19) + '…' : v}
                />
                <Tooltip
                  formatter={(value) => [value, 'Contacts']}
                  contentStyle={{ fontSize: 12 }}
                />
                <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                  {statusChartData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Sector Bar Chart */}
        <div className="bg-white rounded-xl shadow p-5">
          <h2 className="text-base font-semibold text-gray-700 mb-4">Contacts by Sector (Top 10)</h2>
          {!chartData?.by_sector?.length ? (
            <p className="text-gray-400 text-sm">No sector data</p>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={chartData.by_sector} layout="vertical" margin={{ left: 10, right: 30, top: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={130}
                  tick={{ fontSize: 10 }}
                  tickFormatter={v => v.length > 18 ? v.slice(0, 17) + '…' : v}
                />
                <Tooltip formatter={(value) => [value, 'Contacts']} contentStyle={{ fontSize: 12 }} />
                <Bar dataKey="value" fill="#3b82f6" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Charts Row 2: Company Type Pie + City Bar + MSME Pie */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

        {/* Company Type Pie */}
        <div className="bg-white rounded-xl shadow p-5">
          <h2 className="text-base font-semibold text-gray-700 mb-4">Company Type</h2>
          {!chartData?.by_company_type?.length ? (
            <p className="text-gray-400 text-sm">No data</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={chartData.by_company_type}
                  cx="50%"
                  cy="45%"
                  outerRadius={75}
                  dataKey="value"
                  label={({ name, value }) => `${name}: ${value}`}
                  labelLine={true}
                >
                  {chartData.by_company_type.map((_, i) => (
                    <Cell key={i} fill={COMPANY_TYPE_COLORS[i % COMPANY_TYPE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => [value, 'Contacts']} contentStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* City Bar */}
        <div className="bg-white rounded-xl shadow p-5">
          <h2 className="text-base font-semibold text-gray-700 mb-4">Contacts by City</h2>
          {!chartData?.by_city?.length ? (
            <p className="text-gray-400 text-sm">No city data</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={chartData.by_city} margin={{ left: 0, right: 10, top: 0, bottom: 30 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} angle={-20} textAnchor="end" />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(value) => [value, 'Contacts']} contentStyle={{ fontSize: 12 }} />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {chartData.by_city.map((_, i) => (
                    <Cell key={i} fill={CITY_COLORS[i % CITY_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* MSME Type Pie */}
        <div className="bg-white rounded-xl shadow p-5">
          <h2 className="text-base font-semibold text-gray-700 mb-4">MSME Type</h2>
          {!chartData?.by_msme?.length ? (
            <p className="text-gray-400 text-sm">No MSME data</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={chartData.by_msme}
                  cx="50%"
                  cy="45%"
                  outerRadius={75}
                  dataKey="value"
                  label={({ name, value }) => `${name}: ${value}`}
                >
                  {chartData.by_msme.map((_, i) => (
                    <Cell key={i} fill={MSME_COLORS[i % MSME_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => [value, 'Contacts']} contentStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Status Grid (clickable) */}
      <div className="bg-white rounded-xl shadow p-5">
        <h2 className="text-base font-semibold text-gray-700 mb-4">Pipeline Overview — click any status to filter contacts</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {STATUSES.map(s => (
            <div
              key={s}
              className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 rounded-lg p-2 border border-transparent hover:border-gray-200 transition"
              onClick={() => navigate(`/contacts?statuses=${encodeURIComponent(s)}`)}
            >
              <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: STATUS_COLORS[s] }} />
              <span className="text-sm text-gray-700 flex-1 truncate">{s}</span>
              <span
                className="text-sm font-bold px-2 py-0.5 rounded-full text-white"
                style={{ backgroundColor: STATUS_COLORS[s] }}
              >
                {statusCounts[s] ?? 0}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

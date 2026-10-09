import React, { useEffect, useState, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { getContacts, getStats } from '../api'
import StatusBadge, { STATUS_COLORS } from '../components/StatusBadge'

const STATUSES = [
  "New","Attempted - No Answer","Contacted","Interested","Follow-up Scheduled",
  "Demo Scheduled","Proposal Sent","Negotiation","Converted","Not Interested",
  "Invalid / Wrong Number","Do Not Contact"
]

function fmtDate(val: string | null | undefined) {
  if (!val) return ''
  try {
    const d = new Date(val)
    const day = String(d.getDate()).padStart(2, '0')
    const mon = String(d.getMonth() + 1).padStart(2, '0')
    return `${day}-${mon}-${d.getFullYear()}`
  } catch { return val ?? '' }
}

function isOverdue(val: string | null | undefined, status: string) {
  if (!val) return false
  const closed = new Set(["Converted","Not Interested","Invalid / Wrong Number","Do Not Contact"])
  if (closed.has(status)) return false
  return new Date(val) < new Date(new Date().toDateString())
}

interface Contact {
  id: number; sr_no: number; full_name: string; designation?: string; company?: string
  mobile?: string; email?: string; sector?: string; company_type?: string; msme_type?: string
  city?: string; current_status: string; last_followup_at?: string; last_outcome?: string
  next_followup_at?: string; followup_count: number; assigned_to?: string; possible_duplicate_of?: number
}

interface FilterOptions {
  company_type: string[]; sector: string[]; msme_type: string[]; city: string[]
  designation: string[]; assigned_to: string[]; priority: string[]
  interest_level: string[]; last_channel: string[]
}

const PAGE_SIZES = [25, 50, 100, 200]

export default function Contacts() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  // Read initial filters from URL params (e.g. from Dashboard KPI card clicks)
  const initStatuses = searchParams.get('statuses') ? [searchParams.get('statuses')!] : []
  const initLastFollowupFilter = searchParams.get('last_followup_filter') ?? ''

  const [contacts, setContacts] = useState<Contact[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(100)
  const [sortBy, setSortBy] = useState('id')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({})
  const [filterOptions, setFilterOptions] = useState<FilterOptions>({
    company_type:[], sector:[], msme_type:[], city:[], designation:[],
    assigned_to:[], priority:[], interest_level:[], last_channel:[]
  })
  const [loading, setLoading] = useState(true)
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>(initStatuses)
  const [search, setSearch] = useState('')
  const [idSearch, setIdSearch] = useState('')
  const [nextFollowupFilter, setNextFollowupFilter] = useState('')
  const [lastFollowupFilter, setLastFollowupFilter] = useState(initLastFollowupFilter)
  const [company_types, setCompanyTypes] = useState<string[]>([])
  const [sectors, setSectors] = useState<string[]>([])
  const [cities, setCities] = useState<string[]>([])
  const [assignedTos, setAssignedTos] = useState<string[]>([])
  const [priorities, setPriorities] = useState<string[]>([])
  const [showFilters, setShowFilters] = useState(false)

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  const buildFilters = useCallback(() => {
    const f: Record<string, string> = {}
    if (selectedStatuses.length) f.statuses = selectedStatuses.join(',')
    if (search) f.search = search
    if (idSearch) f.id_search = idSearch
    if (nextFollowupFilter) f.next_followup_filter = nextFollowupFilter
    if (lastFollowupFilter) f.last_followup_filter = lastFollowupFilter
    if (company_types.length) f.company_types = company_types.join(',')
    if (sectors.length) f.sectors = sectors.join(',')
    if (cities.length) f.cities = cities.join(',')
    if (assignedTos.length) f.assigned_tos = assignedTos.join(',')
    if (priorities.length) f.priorities = priorities.join(',')
    f.sort_by = sortBy
    f.sort_dir = sortDir
    return f
  }, [selectedStatuses, search, idSearch, nextFollowupFilter, lastFollowupFilter, company_types, sectors, cities, assignedTos, priorities, sortBy, sortDir])

  useEffect(() => {
    getStats().then(d => {
      setStatusCounts(d.status_counts)
      setFilterOptions(d.filter_options)
    })
  }, [])

  useEffect(() => {
    setLoading(true)
    getContacts(buildFilters(), page, pageSize).then(d => {
      setContacts(d.items)
      setTotal(d.total)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [buildFilters, page, pageSize])

  // Reset to page 1 whenever filters change
  useEffect(() => { setPage(1) }, [buildFilters, pageSize])

  function handleSort(col: string) {
    if (sortBy === col) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(col)
      setSortDir('asc')
    }
    setPage(1)
  }

  function SortIcon({ col }: { col: string }) {
    if (sortBy !== col) return <span className="ml-1 text-gray-300 text-xs">↕</span>
    return <span className="ml-1 text-blue-600 text-xs">{sortDir === 'asc' ? '↑' : '↓'}</span>
  }

  function toggleStatus(s: string) {
    setSelectedStatuses(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s])
  }

  function toggleMulti(val: string, arr: string[], setArr: (a: string[]) => void) {
    setArr(arr.includes(val) ? arr.filter(x => x !== val) : [...arr, val])
  }

  function clearFilters() {
    setSelectedStatuses([])
    setSearch('')
    setIdSearch('')
    setNextFollowupFilter('')
    setLastFollowupFilter('')
    setCompanyTypes([])
    setSectors([])
    setCities([])
    setAssignedTos([])
    setPriorities([])
    setPage(1)
  }

  const hasActiveFilters = selectedStatuses.length > 0 || search || idSearch ||
    nextFollowupFilter || lastFollowupFilter || company_types.length > 0 ||
    sectors.length > 0 || cities.length > 0 || assignedTos.length > 0 || priorities.length > 0

  const start = total === 0 ? 0 : (page - 1) * pageSize + 1
  const end = Math.min(page * pageSize, total)

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-2xl font-bold text-gray-800 whitespace-nowrap">
          Contacts{' '}
          <span className="text-gray-400 text-lg font-normal">
            {loading ? '…' : total > 0 ? `${start}–${end} of ${total}` : '0 results'}
          </span>
        </h1>
        {/* Always-visible search bar */}
        <div className="flex-1 min-w-[220px] max-w-lg">
          <input
            type="text"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1) }}
            placeholder="🔍  Search name, company, mobile, email…"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
          />
        </div>
        <div className="flex items-center gap-2">
          {hasActiveFilters && (
            <button onClick={clearFilters} className="text-xs text-red-500 border border-red-300 px-3 py-1.5 rounded hover:bg-red-50">
              ✕ Clear filters
            </button>
          )}
          <button
            onClick={() => setShowFilters(f => !f)}
            className={`border px-3 py-1.5 rounded text-sm whitespace-nowrap ${showFilters ? 'bg-blue-50 border-blue-300 text-blue-700' : 'border-gray-300 text-gray-700 hover:bg-gray-50'}`}
          >
            {showFilters ? '✕ Hide Filters' : '☰ Filters'}
            {hasActiveFilters && !showFilters && <span className="ml-1 bg-blue-600 text-white rounded-full px-1.5 py-0.5 text-xs">●</span>}
          </button>
        </div>
      </div>

      {/* Active filter chips */}
      {lastFollowupFilter && (
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">Active filter:</span>
            <span className="inline-flex items-center gap-1 bg-indigo-100 text-indigo-700 text-xs font-semibold px-2 py-0.5 rounded-full">
              📞 Had activity: {lastFollowupFilter}
              <button onClick={() => setLastFollowupFilter('')} className="ml-1 hover:text-indigo-900">✕</button>
            </span>
          </div>
          <div className="bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-2 text-xs text-indigo-700">
            <strong>ℹ️ Note:</strong> This shows contacts where <em>any follow-up was logged</em> {lastFollowupFilter === 'This week' ? 'this week (Mon–today)' : lastFollowupFilter.toLowerCase()}.
            Their <strong>current status</strong> may be anything (Interested, Follow-up Scheduled, etc.) — it's not limited to "Contacted".
            To filter by status, use the coloured pills below.
          </div>
        </div>
      )}

      {/* Status Pills — counts are global totals, not filtered */}
      <div className="flex flex-wrap gap-2">
        {STATUSES.map(s => {
          const selected = selectedStatuses.includes(s)
          const count = statusCounts[s] ?? 0
          return (
            <button
              key={s}
              onClick={() => toggleStatus(s)}
              title={`${count} total contacts with status "${s}"`}
              style={selected
                ? { backgroundColor: STATUS_COLORS[s], color: '#fff', border: `2px solid ${STATUS_COLORS[s]}` }
                : { backgroundColor: '#f9fafb', color: '#374151', border: `2px solid ${STATUS_COLORS[s]}` }
              }
              className="px-3 py-1 rounded-full text-xs font-semibold transition-all hover:opacity-90"
            >
              <span style={!selected ? { color: STATUS_COLORS[s] } : {}} className="mr-1">●</span>
              {s}
              <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-xs ${selected ? 'bg-white bg-opacity-30 text-white' : 'bg-gray-200 text-gray-600'}`}>
                {count}
              </span>
            </button>
          )
        })}
        {selectedStatuses.length > 0 && (
          <button onClick={() => setSelectedStatuses([])} className="px-3 py-1 rounded-full text-xs text-red-600 border border-red-300 hover:bg-red-50">
            ✕ Clear status filter
          </button>
        )}
      </div>

      <div className="flex gap-4">
        {/* Filter Panel */}
        {showFilters && (
          <div className="w-64 flex-shrink-0 bg-white rounded-xl shadow p-4 space-y-4 self-start">
            <p className="text-xs font-bold text-gray-700 uppercase tracking-wide">Filters</p>

            {/* ID Search */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Jump to Contact ID</label>
              <input
                type="number"
                value={idSearch}
                onChange={e => { setIdSearch(e.target.value); setPage(1) }}
                placeholder="e.g. 42"
                className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
              />
            </div>

            {/* Next Follow-up */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Next Follow-up</label>
              <select
                value={nextFollowupFilter}
                onChange={e => { setNextFollowupFilter(e.target.value); setPage(1) }}
                className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
              >
                <option value="">All</option>
                <option>Overdue</option>
                <option>Today</option>
                <option>This week</option>
                <option>Not scheduled</option>
              </select>
            </div>

            {/* Last Follow-up */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">📞 Had Activity (any follow-up logged)</label>
              <select
                value={lastFollowupFilter}
                onChange={e => { setLastFollowupFilter(e.target.value); setPage(1) }}
                className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
              >
                <option value="">All time</option>
                <option value="Today">Today</option>
                <option value="This week">This week (Mon–today)</option>
                <option value="Never">Never had activity</option>
              </select>
            </div>

            {/* Multi-select filters */}
            {[
              { label: 'Company Type', opts: filterOptions.company_type, val: company_types, set: setCompanyTypes },
              { label: 'Sector', opts: filterOptions.sector, val: sectors, set: setSectors },
              { label: 'City', opts: filterOptions.city, val: cities, set: setCities },
              { label: 'Assigned To', opts: filterOptions.assigned_to, val: assignedTos, set: setAssignedTos },
              { label: 'Priority', opts: filterOptions.priority, val: priorities, set: setPriorities },
            ].map(({ label, opts, val, set }) => (
              <div key={label}>
                <label className="block text-xs font-semibold text-gray-500 mb-1">{label}</label>
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {opts.length === 0 && <p className="text-xs text-gray-400 italic">No options</p>}
                  {opts.map(o => (
                    <label key={o} className="flex items-center gap-1.5 text-xs cursor-pointer hover:bg-gray-50 rounded px-1">
                      <input type="checkbox" checked={val.includes(o)} onChange={() => { toggleMulti(o, val, set); setPage(1) }} />
                      {o}
                    </label>
                  ))}
                </div>
              </div>
            ))}

            <button onClick={clearFilters} className="w-full text-xs text-red-500 border border-red-200 rounded py-1 hover:bg-red-50">
              Clear all filters
            </button>
          </div>
        )}

        {/* Table + Pagination */}
        <div className="flex-1 min-w-0 space-y-2">
          {/* Page size + pagination controls (top) */}
          <div className="flex items-center justify-between bg-white rounded-lg px-4 py-2 shadow-sm flex-wrap gap-2">
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <span>Rows per page:</span>
              <select
                value={pageSize}
                onChange={e => { setPageSize(Number(e.target.value)); setPage(1) }}
                className="border border-gray-300 rounded px-2 py-0.5 text-sm"
              >
                {PAGE_SIZES.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <span className="text-gray-500">{loading ? 'Loading…' : total === 0 ? '0 results' : `${start}–${end} of ${total}`}</span>
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
                className="px-2 py-1 rounded border border-gray-300 disabled:opacity-40 hover:bg-gray-50 text-sm">‹</button>
              <span className="font-medium text-xs">Page {page} / {totalPages}</span>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
                className="px-2 py-1 rounded border border-gray-300 disabled:opacity-40 hover:bg-gray-50 text-sm">›</button>
            </div>
          </div>

          {/* Table */}
          <div className="bg-white rounded-xl shadow overflow-auto">
            {loading ? (
              <div className="p-12 text-center text-gray-400">
                <div className="inline-block animate-spin text-3xl mb-2">⟳</div>
                <div>Loading contacts…</div>
              </div>
            ) : contacts.length === 0 ? (
              <div className="p-12 text-center text-gray-400">
                <div className="text-4xl mb-2">🔍</div>
                <div className="font-medium">No contacts found</div>
                {hasActiveFilters && (
                  <button onClick={clearFilters} className="mt-3 text-blue-600 text-sm underline">Clear all filters</button>
                )}
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 sticky top-0 z-10">
                  <tr>
                    {[
                      { label: '#ID', col: 'id' },
                      { label: 'Name', col: 'full_name' },
                      { label: 'Designation', col: null },
                      { label: 'Company', col: 'company' },
                      { label: 'Mobile', col: 'mobile' },
                      { label: 'Sector', col: null },
                      { label: 'City', col: null },
                      { label: 'Status', col: 'current_status' },
                      { label: 'Last Follow-up', col: 'last_followup_at' },
                      { label: 'Outcome', col: null },
                      { label: 'Next Follow-up', col: 'next_followup_at' },
                      { label: 'Calls', col: 'followup_count' },
                      { label: 'Assigned To', col: null },
                      { label: '', col: null },
                    ].map(({ label, col }) => (
                      col ? (
                        <th
                          key={label}
                          onClick={() => handleSort(col)}
                          className="px-3 py-2.5 text-left text-xs font-semibold text-gray-600 whitespace-nowrap border-b border-gray-200 cursor-pointer select-none hover:bg-gray-100 hover:text-blue-700"
                        >
                          {label}<SortIcon col={col} />
                        </th>
                      ) : (
                        <th key={label} className="px-3 py-2.5 text-left text-xs font-semibold text-gray-600 whitespace-nowrap border-b border-gray-200">{label}</th>
                      )
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {contacts.map((c, i) => (
                    <tr
                      key={c.id}
                      onClick={() => navigate(`/contacts/${c.id}`)}
                      className={`border-t border-gray-100 hover:bg-blue-50 cursor-pointer transition-colors group ${i % 2 === 1 ? 'bg-gray-50/50' : 'bg-white'}`}
                    >
                      {/* Unique sequential ID */}
                      <td className="px-3 py-2.5 text-gray-400 text-xs font-mono font-bold">#{c.id}</td>
                      <td className="px-3 py-2.5 font-medium text-gray-900 whitespace-nowrap">
                        {c.full_name}
                        {c.possible_duplicate_of && (
                          <span className="ml-1 text-yellow-500 text-xs" title={`Possible duplicate of #${c.possible_duplicate_of}`}>⚠</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-gray-600 max-w-[120px] truncate">{c.designation ?? ''}</td>
                      <td className="px-3 py-2.5 text-gray-600 whitespace-nowrap max-w-[150px] truncate">{c.company ?? ''}</td>
                      <td className="px-3 py-2.5 text-gray-600 font-mono text-xs">{c.mobile ?? ''}</td>
                      <td className="px-3 py-2.5 text-gray-600 max-w-[120px] truncate">{c.sector ?? ''}</td>
                      <td className="px-3 py-2.5 text-gray-600">{c.city ?? ''}</td>
                      <td className="px-3 py-2.5">
                        <StatusBadge status={c.current_status} />
                      </td>
                      <td className="px-3 py-2.5 text-gray-500 whitespace-nowrap text-xs">{fmtDate(c.last_followup_at)}</td>
                      <td className="px-3 py-2.5 text-gray-600 max-w-[160px] truncate text-xs" title={c.last_outcome ?? ''}>{c.last_outcome ?? ''}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        {isOverdue(c.next_followup_at, c.current_status)
                          ? <span className="text-red-600 font-medium text-xs">🔴 {fmtDate(c.next_followup_at)}</span>
                          : <span className="text-gray-500 text-xs">{fmtDate(c.next_followup_at)}</span>
                        }
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        {c.followup_count > 0
                          ? <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold">{c.followup_count}</span>
                          : <span className="text-gray-300 text-xs">—</span>
                        }
                      </td>
                      <td className="px-3 py-2.5 text-gray-600 text-xs">{c.assigned_to ?? ''}</td>
                      <td className="px-3 py-2.5">
                        <button
                          onClick={e => { e.stopPropagation(); navigate(`/contacts/${c.id}`) }}
                          className="opacity-0 group-hover:opacity-100 transition-opacity bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-3 py-1 rounded-lg whitespace-nowrap shadow"
                        >
                          View →
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Bottom pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-1 bg-white rounded-lg px-4 py-2 shadow-sm flex-wrap">
              <button onClick={() => setPage(1)} disabled={page <= 1} className="px-2 py-1 text-xs rounded border border-gray-300 disabled:opacity-40 hover:bg-gray-50">«</button>
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} className="px-3 py-1 text-sm rounded border border-gray-300 disabled:opacity-40 hover:bg-gray-50">‹ Prev</button>
              {Array.from({ length: Math.min(7, totalPages) }, (_, i) => {
                let p: number
                if (totalPages <= 7) p = i + 1
                else if (page <= 4) p = i + 1
                else if (page >= totalPages - 3) p = totalPages - 6 + i
                else p = page - 3 + i
                return (
                  <button
                    key={p}
                    onClick={() => setPage(p)}
                    className={`px-3 py-1 text-sm rounded border ${p === page ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300 hover:bg-gray-50'}`}
                  >{p}</button>
                )
              })}
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="px-3 py-1 text-sm rounded border border-gray-300 disabled:opacity-40 hover:bg-gray-50">Next ›</button>
              <button onClick={() => setPage(totalPages)} disabled={page >= totalPages} className="px-2 py-1 text-xs rounded border border-gray-300 disabled:opacity-40 hover:bg-gray-50">»</button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

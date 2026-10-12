import React, { useEffect, useState, useCallback, useRef } from 'react'
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
  const initNextFollowupFilter = searchParams.get('next_followup_filter') ?? ''

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
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [idSearch, setIdSearch] = useState('')
  const [nextFollowupFilter, setNextFollowupFilter] = useState(initNextFollowupFilter)
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
    if (debouncedSearch) f.search = debouncedSearch
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
  }, [selectedStatuses, debouncedSearch, idSearch, nextFollowupFilter, lastFollowupFilter, company_types, sectors, cities, assignedTos, priorities, sortBy, sortDir])

  useEffect(() => {
    getStats().then(d => {
      setStatusCounts(d.status_counts)
      setFilterOptions(d.filter_options)
    })
  }, [])

  // Only fire the search request once typing pauses
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300)
    return () => clearTimeout(t)
  }, [search])

  const filterKey = JSON.stringify(buildFilters())
  const lastFilterKey = useRef(filterKey)

  useEffect(() => {
    // Filters changed while on a later page: jump to page 1 and let that run do the fetch
    if (lastFilterKey.current !== filterKey) {
      lastFilterKey.current = filterKey
      if (page !== 1) { setPage(1); return }
    }
    // Cancel the previous request so a slow, outdated response can't overwrite newer results
    const controller = new AbortController()
    setLoading(true)
    getContacts(JSON.parse(filterKey), page, pageSize, controller.signal).then(d => {
      setContacts(d.items)
      setTotal(d.total)
      setLoading(false)
    }).catch(() => {
      if (!controller.signal.aborted) setLoading(false)
    })
    return () => controller.abort()
  }, [filterKey, page, pageSize])

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
    if (sortBy !== col) return <span className="sort-ico">↕</span>
    return <span className="sort-ico is-active">{sortDir === 'asc' ? '↑' : '↓'}</span>
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
    setDebouncedSearch('')
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

  const activeFilterCount = [
    selectedStatuses.length > 0, !!search, !!idSearch, !!nextFollowupFilter, !!lastFollowupFilter,
    company_types.length > 0, sectors.length > 0, cities.length > 0, assignedTos.length > 0, priorities.length > 0,
  ].filter(Boolean).length

  const pageButtons = Array.from({ length: Math.min(7, totalPages) }, (_, i) => {
    if (totalPages <= 7) return i + 1
    if (page <= 4) return i + 1
    if (page >= totalPages - 3) return totalPages - 6 + i
    return page - 3 + i
  })

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-gray-800 whitespace-nowrap">Contacts</h1>
          <span className="pipe-total">
            {loading ? '…' : total > 0 ? `${start}–${end} of ${total.toLocaleString()}` : '0 results'}
          </span>
        </div>

        {/* Always-visible search bar */}
        <div className="search-box flex-1 min-w-[240px] max-w-lg">
          <svg viewBox="0 0 24 24" className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1) }}
            placeholder="Search name, company, mobile, email…"
            aria-label="Search contacts"
          />
          {search && (
            <button type="button" onClick={() => { setSearch(''); setPage(1) }} className="search-clear" aria-label="Clear search">✕</button>
          )}
        </div>

        <div className="flex items-center gap-2">
          {hasActiveFilters && (
            <button onClick={clearFilters} className="ghost-btn">✕ Clear filters</button>
          )}
          <button
            onClick={() => setShowFilters(f => !f)}
            aria-pressed={showFilters}
            className="btn-brown inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold whitespace-nowrap"
          >
            <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d={showFilters ? 'M6 18L18 6M6 6l12 12' : 'M3 4h18l-7 8v6l-4 2v-8L3 4z'} />
            </svg>
            {showFilters ? 'Hide Filters' : 'Filters'}
            {activeFilterCount > 0 && !showFilters && <span className="filter-count">{activeFilterCount}</span>}
          </button>
        </div>
      </div>

      {/* Active "had activity" filter explanation */}
      {lastFollowupFilter && (
        <div className="info-note">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="info-chip">
              📞 Had activity: {lastFollowupFilter}
              <button onClick={() => setLastFollowupFilter('')} aria-label="Remove filter">✕</button>
            </span>
          </div>
          <p className="mt-1.5">
            Shows contacts where <em>any follow-up was logged</em> {lastFollowupFilter === 'This week' ? 'this week (Mon–today)' : lastFollowupFilter.toLowerCase()}.
            Their current status may be anything — to filter by status, use the pills below.
          </p>
        </div>
      )}

      {/* Status pills — counts are global totals, not filtered */}
      <div className="flex flex-wrap gap-2">
        {STATUSES.map(s => {
          const selected = selectedStatuses.includes(s)
          const count = statusCounts[s] ?? 0
          return (
            <button
              key={s}
              onClick={() => toggleStatus(s)}
              title={`${count} total contacts with status "${s}"`}
              aria-pressed={selected}
              style={selected
                ? { backgroundColor: STATUS_COLORS[s], color: '#fff', borderColor: STATUS_COLORS[s] }
                : { borderColor: STATUS_COLORS[s] }
              }
              className={`status-pill status-badge${selected ? ' is-on' : ''}`}
            >
              <span className="pipe-dot" style={{ backgroundColor: selected ? '#fff' : STATUS_COLORS[s] }} />
              {s}
              <span className="pill-count">{count}</span>
            </button>
          )
        })}
        {selectedStatuses.length > 0 && (
          <button onClick={() => setSelectedStatuses([])} className="ghost-btn">✕ Clear status filter</button>
        )}
      </div>

      <div className="flex gap-4">
        {/* Filter panel */}
        {showFilters && (
          <div className="filter-panel w-64 flex-shrink-0 self-start">
            <div className="sum-label">Filters</div>

            <div>
              <label className="fp-label" htmlFor="fp-id">Jump to Contact ID</label>
              <input
                id="fp-id"
                type="number"
                value={idSearch}
                onChange={e => { setIdSearch(e.target.value); setPage(1) }}
                placeholder="e.g. 42"
                className="ctl"
              />
            </div>

            <div>
              <label className="fp-label" htmlFor="fp-next">Next Follow-up</label>
              <select
                id="fp-next"
                value={nextFollowupFilter}
                onChange={e => { setNextFollowupFilter(e.target.value); setPage(1) }}
                className="ctl"
              >
                <option value="">All</option>
                <option>Overdue</option>
                <option>Today</option>
                <option>This week</option>
                <option>Not scheduled</option>
              </select>
            </div>

            <div>
              <label className="fp-label" htmlFor="fp-last">Had Activity (any follow-up logged)</label>
              <select
                id="fp-last"
                value={lastFollowupFilter}
                onChange={e => { setLastFollowupFilter(e.target.value); setPage(1) }}
                className="ctl"
              >
                <option value="">All time</option>
                <option value="Today">Today</option>
                <option value="This week">This week (Mon–today)</option>
                <option value="Never">Never had activity</option>
              </select>
            </div>

            {[
              { label: 'Company Type', opts: filterOptions.company_type, val: company_types, set: setCompanyTypes },
              { label: 'Sector', opts: filterOptions.sector, val: sectors, set: setSectors },
              { label: 'City', opts: filterOptions.city, val: cities, set: setCities },
              { label: 'Assigned To', opts: filterOptions.assigned_to, val: assignedTos, set: setAssignedTos },
              { label: 'Priority', opts: filterOptions.priority, val: priorities, set: setPriorities },
            ].map(({ label, opts, val, set }) => (
              <div key={label}>
                <div className="fp-label">{label}{val.length > 0 && <span className="fp-badge">{val.length}</span>}</div>
                <div className="fp-options">
                  {opts.length === 0 && <p className="text-xs text-gray-400 italic">No options</p>}
                  {opts.map(o => (
                    <label key={o} className="fp-option">
                      <input type="checkbox" checked={val.includes(o)} onChange={() => { toggleMulti(o, val, set); setPage(1) }} />
                      {o}
                    </label>
                  ))}
                </div>
              </div>
            ))}

            <button onClick={clearFilters} className="ghost-btn w-full justify-center">Clear all filters</button>
          </div>
        )}

        {/* Table + pagination */}
        <div className="flex-1 min-w-0 space-y-3">
          {/* Page size + pagination (top) */}
          <div className="table-bar">
            <label className="flex items-center gap-2 text-sm text-gray-600">
              Rows per page
              <select
                value={pageSize}
                onChange={e => { setPageSize(Number(e.target.value)); setPage(1) }}
                className="ctl ctl-sm"
              >
                {PAGE_SIZES.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <span className="text-gray-500">{loading ? 'Loading…' : total === 0 ? '0 results' : `${start}–${end} of ${total}`}</span>
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} className="page-btn" aria-label="Previous page">‹</button>
              <span className="font-semibold text-xs whitespace-nowrap">Page {page} / {totalPages}</span>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="page-btn" aria-label="Next page">›</button>
            </div>
          </div>

          {/* Table */}
          <div className="table-card">
            {loading ? (
              <div className="p-12 flex flex-col items-center gap-3 text-gray-500">
                <div className="drop-spinner" />
                <div className="text-sm">Loading contacts…</div>
              </div>
            ) : contacts.length === 0 ? (
              <div className="p-12 flex flex-col items-center gap-2 text-center">
                <div className="drop-icon">
                  <svg viewBox="0 0 24 24" className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z" />
                  </svg>
                </div>
                <div className="font-semibold text-gray-700">No contacts found</div>
                <div className="text-sm text-gray-500">Try a different search or fewer filters.</div>
                {hasActiveFilters && (
                  <button onClick={clearFilters} className="edit-btn mt-2">Clear all filters</button>
                )}
              </div>
            ) : (
              <table className="contacts-table w-full text-sm">
                <thead>
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
                        <th key={label} onClick={() => handleSort(col)} className={`is-sortable${sortBy === col ? ' is-sorted' : ''}`}>
                          {label}<SortIcon col={col} />
                        </th>
                      ) : (
                        <th key={label || 'actions'}>{label}</th>
                      )
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {contacts.map(c => (
                    <tr key={c.id} onClick={() => navigate(`/contacts/${c.id}`)} className="group">
                      <td><span className="id-chip">#{c.id}</span></td>
                      <td className="font-semibold text-gray-900 whitespace-nowrap">
                        {c.full_name}
                        {c.possible_duplicate_of && (
                          <span className="ml-1 text-yellow-500 text-xs" title={`Possible duplicate of #${c.possible_duplicate_of}`}>⚠</span>
                        )}
                      </td>
                      <td className="text-gray-600 max-w-[120px] truncate">{c.designation ?? ''}</td>
                      <td className="text-gray-600 whitespace-nowrap max-w-[150px] truncate">{c.company ?? ''}</td>
                      <td className="text-gray-600 font-mono text-xs">{c.mobile ?? ''}</td>
                      <td className="text-gray-600 max-w-[120px] truncate">{c.sector ?? ''}</td>
                      <td className="text-gray-600">{c.city ?? ''}</td>
                      <td><StatusBadge status={c.current_status} /></td>
                      <td className="text-gray-500 whitespace-nowrap text-xs">{fmtDate(c.last_followup_at)}</td>
                      <td className="text-gray-600 max-w-[160px] truncate text-xs" title={c.last_outcome ?? ''}>{c.last_outcome ?? ''}</td>
                      <td className="whitespace-nowrap">
                        {isOverdue(c.next_followup_at, c.current_status)
                          ? <span className="due-pill is-overdue text-xs">{fmtDate(c.next_followup_at)}</span>
                          : <span className="text-gray-500 text-xs">{fmtDate(c.next_followup_at)}</span>
                        }
                      </td>
                      <td className="text-center">
                        {c.followup_count > 0
                          ? <span className="calls-chip">{c.followup_count}</span>
                          : <span className="text-gray-300 text-xs">—</span>
                        }
                      </td>
                      <td className="text-gray-600 text-xs">{c.assigned_to ?? ''}</td>
                      <td>
                        <button
                          onClick={e => { e.stopPropagation(); navigate(`/contacts/${c.id}`) }}
                          className="edit-btn row-view opacity-0 group-hover:opacity-100"
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
            <div className="table-bar justify-center">
              <button onClick={() => setPage(1)} disabled={page <= 1} className="page-btn" aria-label="First page">«</button>
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} className="page-btn">‹ Prev</button>
              {pageButtons.map(p => (
                <button key={p} onClick={() => setPage(p)} className={`page-btn${p === page ? ' is-current' : ''}`} aria-current={p === page ? 'page' : undefined}>{p}</button>
              ))}
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="page-btn">Next ›</button>
              <button onClick={() => setPage(totalPages)} disabled={page >= totalPages} className="page-btn" aria-label="Last page">»</button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

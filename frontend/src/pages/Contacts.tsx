import React, { useEffect, useState, useCallback, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { getContacts, getStats, deleteContact, deleteContacts } from '../api'
import ConfirmDialog from '../components/ConfirmDialog'
import RowMenu from '../components/RowMenu'
import Select from '../components/Select'
import { useToast } from '../components/Toast'
import StatusBadge, { STATUS_COLORS } from '../components/StatusBadge'
import { fmtDate, isOverdue } from '../utils/ist'

const STATUSES = [
  "New","Attempted - No Answer","Contacted","Interested","Follow-up Scheduled",
  "Demo Scheduled","Proposal Sent","Negotiation","Converted","Not Interested",
  "Invalid / Wrong Number","Do Not Contact"
]

// Shorter names so every tile fits icon, name and count on one line (full name on hover)
const TILE_LABELS: Record<string, string> = {
  'Attempted - No Answer': 'No Answer',
  'Demo Scheduled': 'Demo',
  'Follow-up Scheduled': 'Follow-up',
  'Invalid / Wrong Number': 'Wrong Number',
}

// Status tiles: New first, then the rest alphabetically
const TILE_STATUSES = ['New', ...STATUSES.filter(s => s !== 'New').sort((a, b) => a.localeCompare(b))]

// Icon path (24×24, stroked) shown on each status tile
const CIRCLE = 'M2 12a10 10 0 1 0 20 0a10 10 0 1 0-20 0'
const PHONE = 'M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z'
const STATUS_ICONS: Record<string, string> = {
  "New": 'M12 5v14M5 12h14',
  "Attempted - No Answer": PHONE + 'M16 2l6 6M22 2l-6 6',
  "Contacted": PHONE,
  "Interested": 'M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8z',
  "Follow-up Scheduled": CIRCLE + 'M12 6v6l4 2',
  "Demo Scheduled": 'M3 4h18v12H3zM8 20h8M12 16v4',
  "Proposal Sent": 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13h8M8 17h5',
  "Negotiation": 'M7 10l-4 4 4 4M3 14h13M17 4l4 4-4 4M21 8H8',
  "Converted": 'M22 11.1V12a10 10 0 1 1-5.9-9.1M22 4L12 14l-3-3',
  "Not Interested": CIRCLE + 'M15 9l-6 6M9 9l6 6',
  "Invalid / Wrong Number": 'M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h16.9a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01',
  "Do Not Contact": CIRCLE + 'M4.9 4.9l14.2 14.2',
}

interface Contact {
  id: number; sr_no: number; full_name: string; designation?: string; company?: string
  mobile?: string; email?: string; sector?: string; company_type?: string; msme_type?: string
  city?: string; current_status: string; last_followup_at?: string; last_outcome?: string
  next_followup_at?: string; followup_count: number; assigned_to?: string; possible_duplicate_of?: number
  serial: number // 1 = oldest contact, counted by date added
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
  // 'default' = status New first, then the rest, each oldest added first; clicking a column header sorts by that column
  const [sortBy, setSortBy] = useState('default')
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
  // Bumped after a delete so the list and the status counts reload
  const [reloadKey, setReloadKey] = useState(0)
  const [pendingDelete, setPendingDelete] = useState<Contact | null>(null)
  const [deleting, setDeleting] = useState(false)
  // Select mode (turned on from a row's ⋮ menu) shows checkboxes for "Delete selected"
  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [bulkConfirm, setBulkConfirm] = useState(false)
  const toast = useToast()
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
  }, [reloadKey])

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
  }, [filterKey, page, pageSize, reloadKey])

  // A new page, filter or reload shows different rows, so drop the selection
  useEffect(() => { setSelected(new Set()) }, [filterKey, page, pageSize, reloadKey])

  const allOnPageSelected = contacts.length > 0 && contacts.every(c => selected.has(c.id))
  const someOnPageSelected = !allOnPageSelected && contacts.some(c => selected.has(c.id))
  const selectAllRef = useRef<HTMLInputElement>(null)
  useEffect(() => { if (selectAllRef.current) selectAllRef.current.indeterminate = someOnPageSelected }, [someOnPageSelected])

  function toggleSelected(id: number) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }
  function toggleSelectAll() {
    setSelected(allOnPageSelected ? new Set() : new Set(contacts.map(c => c.id)))
  }

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

  // One status at a time: clicking a tag selects only it, clicking it again clears it
  function toggleStatus(s: string) {
    setSelectedStatuses(prev => prev.length === 1 && prev[0] === s ? [] : [s])
  }

  // One option per filter group: picking another replaces it, picking the same one clears it
  function toggleOne(val: string, arr: string[], setArr: (a: string[]) => void) {
    setArr(arr.length === 1 && arr[0] === val ? [] : [val])
  }

  async function confirmDelete() {
    if (!pendingDelete) return
    setDeleting(true)
    try {
      await deleteContact(pendingDelete.id)
      toast.success('Contact deleted', `${pendingDelete.full_name} and their follow-up history were removed.`)
      // If that was the last row on a later page, step back a page
      if (contacts.length === 1 && page > 1) setPage(p => p - 1)
      setReloadKey(k => k + 1)
    } catch (e) {
      const detail = (e as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail
      toast.error('Contact not deleted', typeof detail === 'string' ? detail : 'Please try again.')
    } finally {
      setDeleting(false)
      setPendingDelete(null)
    }
  }

  async function confirmBulkDelete() {
    const ids = [...selected]
    setDeleting(true)
    try {
      const { deleted } = await deleteContacts(ids)
      toast.success(`${deleted} contact${deleted === 1 ? '' : 's'} deleted`, 'Their follow-up history was removed too.')
      // If the whole page was deleted, step back a page
      if (ids.length >= contacts.length && page > 1) setPage(p => p - 1)
      setReloadKey(k => k + 1)
    } catch (e) {
      const detail = (e as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail
      toast.error('Contacts not deleted', typeof detail === 'string' ? detail : 'Please try again.')
    } finally {
      setDeleting(false)
      setBulkConfirm(false)
      setSelectMode(false)
    }
  }

  function exitSelectMode() {
    setSelectMode(false)
    setSelected(new Set())
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
    // Back to the default order: status New first, then the rest
    setSortBy('default')
    setSortDir('desc')
    setPage(1)
  }

  const hasActiveFilters = selectedStatuses.length > 0 || search || idSearch ||
    nextFollowupFilter || lastFollowupFilter || company_types.length > 0 ||
    sectors.length > 0 || cities.length > 0 || assignedTos.length > 0 || priorities.length > 0

  const start = total === 0 ? 0 : (page - 1) * pageSize + 1
  const end = Math.min(page * pageSize, total)

  // Status and search live on the page itself, so only count what's tucked in the filter panel
  const activeFilterCount = [
    !!idSearch, !!nextFollowupFilter, !!lastFollowupFilter,
    company_types.length > 0, sectors.length > 0, cities.length > 0, assignedTos.length > 0, priorities.length > 0,
  ].filter(Boolean).length

  const pageButtons = Array.from({ length: Math.min(7, totalPages) }, (_, i) => {
    if (totalPages <= 7) return i + 1
    if (page <= 4) return i + 1
    if (page >= totalPages - 3) return totalPages - 6 + i
    return page - 3 + i
  })

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Header */}
      {/* Count and buttons share one row, also on phones (shorter button labels there) */}
      <div className="flex items-center justify-between gap-2 md:gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <h1 className="hidden md:block text-2xl font-bold text-gray-800 whitespace-nowrap">Contacts</h1>
          <span className="pipe-total whitespace-nowrap">
            {loading ? '…' : total > 0 ? `${start}–${end} of ${total.toLocaleString()}` : '0 results'}
          </span>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {hasActiveFilters && (
            <button onClick={clearFilters} className="ct-btn-outline" aria-label="Clear filters">
              ✕ Clear<span className="hidden sm:inline">&nbsp;filters</span>
            </button>
          )}
          <button
            onClick={() => setShowFilters(f => !f)}
            aria-pressed={showFilters}
            className="ct-btn"
          >
            <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d={showFilters ? 'M6 18L18 6M6 6l12 12' : 'M3 4h18l-7 8v6l-4 2v-8L3 4z'} />
            </svg>
            <span className="hidden sm:inline">{showFilters ? 'Hide Filters' : 'Show Filters'}</span>
            <span className="sm:hidden">{showFilters ? 'Hide' : 'Filters'}</span>
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
            Their current status may be anything — to filter by status, use the status cards.
          </p>
        </div>
      )}

      {/* Status tiles — counts are global totals, not filtered. One at a time; click again to clear */}
      {/* Phones: one Status dropdown instead of the 12 tiles */}
      <div className="status-select">
        <label htmlFor="status-select" className="status-select-label">Status</label>
        <Select
          id="status-select"
          className="flex-1"
          value={selectedStatuses[0] ?? ''}
          onChange={v => setSelectedStatuses(v ? [v] : [])}
          options={[
            { value: '', label: `All statuses (${Object.values(statusCounts).reduce((a, b) => a + b, 0)})`, color: '' },
            ...TILE_STATUSES.map(st => ({ value: st, label: `${st} (${statusCounts[st] ?? 0})`, color: STATUS_COLORS[st] })),
          ]}
        />
      </div>

      <div className="status-tiles">
        {TILE_STATUSES.map(st => {
          const selected = selectedStatuses.includes(st)
          return (
            <button
              key={st}
              type="button"
              onClick={() => toggleStatus(st)}
              aria-pressed={selected}
              title={selected ? `${st} — click again to show all statuses` : `${st}: ${statusCounts[st] ?? 0} contacts`}
              className={`status-tile${selected ? ' is-on' : ''}`}
              style={{ '--c': STATUS_COLORS[st] } as React.CSSProperties}
            >
              {/* One line: icon · name · count */}
              <span className="st-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d={STATUS_ICONS[st]} />
                </svg>
              </span>
              <span className="st-label">{TILE_LABELS[st] ?? st}</span>
              <span className="st-num">{statusCounts[st] ?? 0}</span>
            </button>
          )
        })}
      </div>

      <div className="flex flex-col lg:flex-row gap-4">
        {/* Filter panel */}
        {showFilters && (
          <div className="filter-panel w-full lg:w-64 flex-shrink-0 lg:self-start">
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
              <Select
                id="fp-next"
                className="w-full"
                value={nextFollowupFilter}
                onChange={v => { setNextFollowupFilter(v); setPage(1) }}
                options={[{ value: '', label: 'All' }, ...['Overdue', 'Today', 'This week', 'Not scheduled'].map(v => ({ value: v, label: v }))]}
              />
            </div>

            <div>
              <label className="fp-label" htmlFor="fp-last">Had Activity (any follow-up logged)</label>
              <Select
                id="fp-last"
                className="w-full"
                value={lastFollowupFilter}
                onChange={v => { setLastFollowupFilter(v); setPage(1) }}
                options={[
                  { value: '', label: 'All time' },
                  { value: 'Today', label: 'Today' },
                  { value: 'This week', label: 'This week (Mon–today)' },
                  { value: 'Never', label: 'Never had activity' },
                ]}
              />
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
                      <input type="checkbox" checked={val.includes(o)} onChange={() => { toggleOne(o, val, set); setPage(1) }} />
                      {o}
                    </label>
                  ))}
                </div>
              </div>
            ))}

            <button onClick={clearFilters} className="ct-btn-outline w-full justify-center">Clear all filters</button>
          </div>
        )}

        {/* Table + pagination */}
        <div className="flex-1 min-w-0 space-y-3">
          {/* Page size, search and pagination (top) */}
          <div className="table-bar">
            <label className="flex items-center gap-2 text-sm text-gray-600">
              Rows per page
              <Select
                size="sm"
                ariaLabel="Rows per page"
                value={String(pageSize)}
                onChange={v => { setPageSize(Number(v)); setPage(1) }}
                options={PAGE_SIZES.map(n => ({ value: String(n), label: String(n) }))}
              />
            </label>
            <div className="search-box table-bar-search">
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
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <span className="text-gray-500">{loading ? 'Loading…' : total === 0 ? '0 results' : `${start}–${end} of ${total}`}</span>
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} className="page-btn" aria-label="Previous page">‹</button>
              <span className="font-semibold text-xs whitespace-nowrap">Page {page} / {totalPages}</span>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="page-btn" aria-label="Next page">›</button>
            </div>
          </div>

          {/* Bulk actions for ticked rows */}
          {selectMode && (
            <div className="bulk-bar" role="region" aria-label="Selected contacts">
              <span className="font-semibold">{selected.size} selected</span>
              <button type="button" onClick={toggleSelectAll} className="ct-btn-outline ct-btn-sm">
                {allOnPageSelected ? 'Unselect all' : 'Select all on page'}
              </button>
              <button type="button" onClick={exitSelectMode} className="ct-btn-outline ct-btn-sm">Done</button>
              <button type="button" onClick={() => setBulkConfirm(true)} disabled={selected.size === 0} className="bulk-delete-btn">
                <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                Delete selected
              </button>
            </div>
          )}

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
                  <button onClick={clearFilters} className="ct-btn mt-2">Clear filters</button>
                )}
              </div>
            ) : (
              <table className="contacts-table w-full text-sm">
                <thead>
                  <tr>
                    {selectMode && <th className="sel-col">
                      <input
                        ref={selectAllRef}
                        type="checkbox"
                        className="sel-box"
                        checked={allOnPageSelected}
                        onChange={toggleSelectAll}
                        aria-label="Select all contacts on this page"
                      />
                    </th>}
                    {[
                      // Number by date added: oldest contact = 1 (real IDs have gaps after deletes)
                      { label: 'ID', col: null },
                      { label: 'Name', col: 'full_name' },
                      { label: 'Designation', col: null },
                      { label: 'Company', col: 'company' },
                      { label: 'Mobile', col: 'mobile' },
                      { label: 'Sector', col: null },
                      { label: 'City', col: null },
                      { label: 'Status', col: null },
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
                    <tr
                      key={c.id}
                      // In select mode a row click ticks it instead of opening the contact
                      onClick={() => selectMode ? toggleSelected(c.id) : navigate(`/contacts/${c.id}`)}
                      className={`group${selected.has(c.id) ? ' is-selected' : ''}`}
                    >
                      {selectMode && <td className="sel-col" onClick={e => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          className="sel-box"
                          checked={selected.has(c.id)}
                          onChange={() => toggleSelected(c.id)}
                          aria-label={`Select ${c.full_name}`}
                        />
                      </td>}
                      <td><span className="id-chip" title={`Contact ID #${c.id}`}>{c.serial}</span></td>
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
                        <div className="flex justify-end" onClick={e => e.stopPropagation()}>
                          <RowMenu
                            label={`Actions for ${c.full_name}`}
                            items={[
                              { label: 'Edit', icon: 'M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z', onSelect: () => navigate(`/contacts/${c.id}?edit=1`) },
                              { label: 'Select', icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z', onSelect: () => { setSelectMode(true); setSelected(prev => new Set(prev).add(c.id)) } },
                              { label: 'Delete', icon: 'M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16', onSelect: () => setPendingDelete(c), danger: true },
                            ]}
                          />
                        </div>
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
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} className="page-btn" aria-label="Previous page">‹<span className="hidden sm:inline"> Prev</span></button>
              {pageButtons.map(p => (
                <button key={p} onClick={() => setPage(p)} className={`page-btn${p === page ? ' is-current' : ''}`} aria-current={p === page ? 'page' : undefined}>{p}</button>
              ))}
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="page-btn" aria-label="Next page"><span className="hidden sm:inline">Next </span>›</button>
              <button onClick={() => setPage(totalPages)} disabled={page >= totalPages} className="page-btn" aria-label="Last page">»</button>
            </div>
          )}
        </div>
      </div>
      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete this contact?"
        message={pendingDelete && (
          <>
            <strong>{pendingDelete.full_name}</strong>
            {pendingDelete.company ? ` (${pendingDelete.company})` : ''} will be removed
            {pendingDelete.followup_count > 0
              ? <> along with <strong>{pendingDelete.followup_count} follow-up{pendingDelete.followup_count === 1 ? '' : 's'}</strong></>
              : null}. This can't be undone.
          </>
        )}
        confirmLabel="Delete contact"
        busy={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
      <ConfirmDialog
        open={bulkConfirm}
        title={`Delete ${selected.size} contact${selected.size === 1 ? '' : 's'}?`}
        message={(() => {
          const rows = contacts.filter(c => selected.has(c.id))
          const calls = rows.reduce((n, c) => n + (c.followup_count || 0), 0)
          const names = rows.slice(0, 3).map(c => c.full_name).join(', ') + (rows.length > 3 ? ` and ${rows.length - 3} more` : '')
          return (
            <>
              <strong>{names}</strong> will be removed
              {calls > 0 ? <> along with <strong>{calls} follow-up{calls === 1 ? '' : 's'}</strong></> : null}. This can't be undone.
            </>
          )
        })()}
        confirmLabel={`Delete ${selected.size}`}
        busy={deleting}
        onConfirm={confirmBulkDelete}
        onCancel={() => setBulkConfirm(false)}
      />
    </div>
  )
}

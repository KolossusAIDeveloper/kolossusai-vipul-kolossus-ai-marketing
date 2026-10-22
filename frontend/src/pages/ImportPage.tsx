import React, { useState, useRef } from 'react'
import { importExcel } from '../api'
import { useToast } from '../components/Toast'

interface ImportResult {
  rows_read: number
  inserted: number
  updated: number
  skipped: number
  duplicates: number
  quality_flags: number
}

// Column order the importer expects on "Sheet1" (row 1 = headers)
const COLUMNS = [
  'Sr No', 'Name', 'Designation', 'Company', 'Mobile', 'Email', 'Social Status',
  'Gender', 'MSME', 'Udyam Aadhaar', 'Sector', 'Category Type', 'Company Address',
]

const RESULT_TILES: { key: keyof ImportResult; label: string; hint: string; tone: string }[] = [
  { key: 'rows_read', label: 'Rows read', hint: 'rows found in the sheet', tone: '' },
  { key: 'inserted', label: 'Inserted', hint: 'new contacts added', tone: 'is-good' },
  { key: 'updated', label: 'Updated', hint: 'existing contacts refreshed', tone: 'is-info' },
  { key: 'skipped', label: 'Skipped', hint: 'rows without a name or Sr No', tone: '' },
  { key: 'duplicates', label: 'Duplicates', hint: 'mobile already exists — flagged', tone: 'is-warn' },
  { key: 'quality_flags', label: 'Quality flags', hint: 'emails that look mistyped', tone: 'is-bad' },
]

function apiError(e: unknown) {
  const detail = (e as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail
  return typeof detail === 'string' ? detail : 'Import failed. Please check the file format.'
}

export default function ImportPage() {
  const [dragging, setDragging] = useState(false)
  const [loading, setLoading] = useState(false)
  const [fileName, setFileName] = useState('')
  const [result, setResult] = useState<ImportResult | null>(null)
  const [error, setError] = useState('')
  const [showColumns, setShowColumns] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const toast = useToast()

  async function handleFile(file: File) {
    setFileName(file.name)
    if (!file.name.toLowerCase().endsWith('.xlsx')) {
      setError('Only .xlsx files are supported')
      toast.error('Import failed', `${file.name} is not an .xlsx file.`)
      setResult(null)
      return
    }
    setError('')
    setResult(null)
    setLoading(true)
    try {
      const r: ImportResult = await importExcel(file)
      setResult(r)
      toast.success('Excel imported', `${r.inserted} added · ${r.updated} updated · ${r.skipped} skipped`)
      if (r.duplicates > 0) toast.warning('Possible duplicates', `${r.duplicates} contact${r.duplicates === 1 ? '' : 's'} share a mobile number with an existing contact.`)
    } catch (e: unknown) {
      setError(apiError(e))
      toast.error(`Couldn't import ${file.name}`, apiError(e))
    } finally {
      setLoading(false)
      if (inputRef.current) inputRef.current.value = '' // allow picking the same file again
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  function onFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
  }

  return (
    <div className="p-4 md:p-6 min-h-full flex flex-col">
      <div className="import-shell rounded-2xl p-4 md:p-6 space-y-4 flex-1 flex flex-col">
        <div>
          <h1 className="hidden md:block text-2xl font-bold text-gray-900">Import Excel</h1>
          <p className="import-muted text-sm mt-1">Add or update contacts in bulk from an .xlsx file.</p>
        </div>

        {/* Drop zone */}
        <div className="bg-white rounded-2xl import-card p-5 flex-1 flex flex-col">
          <div
            className={`drop-zone import-drop flex-1 justify-center${dragging ? ' is-dragging' : ''}${loading ? ' is-busy' : ''}`}
            onDragOver={e => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            onClick={() => !loading && inputRef.current?.click()}
          >
            <div className="drop-icon import-drop-icon">
              <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 19V5m0 0l-6 6m6-6l6 6" />
              </svg>
            </div>
            <p className="text-sm font-bold text-gray-900">
              {loading ? 'Importing…' : dragging ? 'Drop it here' : 'Drag & drop your .xlsx file here'}
            </p>
            <p className="import-muted text-xs">{loading ? fileName : 'or browse from your device'}</p>
            {!loading && (
              <button
                type="button"
                onClick={e => { e.stopPropagation(); inputRef.current?.click() }}
                className="import-btn mt-2"
              >
                Choose file
              </button>
            )}
            {loading && <div className="drop-spinner" aria-label="Importing" />}
            <input ref={inputRef} type="file" accept=".xlsx" className="hidden" onChange={onFileInput} />
          </div>

          {error && (
            <div className="import-alert mt-4">
              <svg viewBox="0 0 24 24" className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              </svg>
              <div>
                <div className="font-semibold">{fileName ? `Couldn't import ${fileName}` : 'Import failed'}</div>
                <div className="text-sm opacity-90">{error}</div>
              </div>
            </div>
          )}
        </div>

        {/* Result */}
        {result && (
          <div className="bg-white rounded-2xl import-card p-5 space-y-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <h2 className="font-bold text-gray-900">Import summary</h2>
              <span className="import-muted text-xs">{fileName}</span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {RESULT_TILES.map(t => (
                <div key={t.key} className={`sum-stat import-stat ${t.tone}`}>
                  <div className="sum-label">{t.label}</div>
                  <div className="sum-big">{result[t.key]}</div>
                  <div className="sum-sub">{t.hint}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Expected format */}
        <div className="bg-white rounded-2xl import-card p-5">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <div className="font-bold text-gray-900">Required Excel format</div>
              <div className="import-muted text-xs mt-1">Sheet1 · {COLUMNS.length} columns · headers in row 1</div>
            </div>
            <button
              type="button"
              onClick={() => setShowColumns(v => !v)}
              className="import-btn-soft"
              aria-expanded={showColumns}
            >
              {showColumns ? 'Hide column names' : 'Show column names'}
            </button>
          </div>
          {showColumns && (
            <div className="mt-4 space-y-3">
              <div className="flex flex-wrap gap-2">
                {COLUMNS.map((c, i) => (
                  <span key={c} className="col-chip"><span className="col-chip-n">{i + 1}</span>{c}</span>
                ))}
              </div>
              <p className="import-muted text-xs">
                Keep the columns in this order. Re-uploading the same file updates contacts instead of duplicating them.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

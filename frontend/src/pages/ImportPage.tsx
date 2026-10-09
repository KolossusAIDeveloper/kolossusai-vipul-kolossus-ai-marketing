import React, { useState, useRef } from 'react'
import { importExcel } from '../api'

interface ImportResult {
  rows_read: number
  inserted: number
  updated: number
  skipped: number
  duplicates: number
  quality_flags: number
}

export default function ImportPage() {
  const [dragging, setDragging] = useState(false)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleFile(file: File) {
    if (!file.name.endsWith('.xlsx')) {
      setError('Only .xlsx files are supported')
      return
    }
    setError('')
    setResult(null)
    setLoading(true)
    try {
      const r = await importExcel(file)
      setResult(r)
    } catch (e: unknown) {
      setError('Import failed. Please check the file format.')
    } finally {
      setLoading(false)
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
    <div className="p-6 max-w-xl">
      <h1 className="text-2xl font-bold text-gray-800 mb-6">Import Excel</h1>

      <div
        className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${dragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-blue-400 hover:bg-gray-50'}`}
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
      >
        <div className="text-4xl mb-3">📂</div>
        <p className="text-gray-600 text-sm">Drag & drop your <strong>.xlsx</strong> file here, or click to browse</p>
        <input ref={inputRef} type="file" accept=".xlsx" className="hidden" onChange={onFileInput} />
      </div>

      {loading && <div className="mt-4 text-blue-600 text-sm">Importing...</div>}
      {error && <div className="mt-4 text-red-500 text-sm">{error}</div>}

      {result && (
        <div className="mt-6 bg-white rounded-xl shadow p-5 space-y-3">
          <h2 className="font-semibold text-gray-700 text-lg">Import Summary</h2>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Rows Read', value: result.rows_read },
              { label: 'Inserted', value: result.inserted, color: 'text-green-600' },
              { label: 'Updated', value: result.updated, color: 'text-blue-600' },
              { label: 'Skipped', value: result.skipped, color: 'text-gray-500' },
              { label: 'Duplicates Found', value: result.duplicates, color: 'text-yellow-600' },
              { label: 'Quality Flags', value: result.quality_flags, color: 'text-red-500' },
            ].map(item => (
              <div key={item.label} className="bg-gray-50 rounded p-3">
                <div className={`text-2xl font-bold ${item.color ?? 'text-gray-800'}`}>{item.value}</div>
                <div className="text-xs text-gray-500">{item.label}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

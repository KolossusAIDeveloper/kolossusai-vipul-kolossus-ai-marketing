import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { createContact } from '../api'
import FormField, { FieldIcon, FieldStatus } from '../components/FormField'
import { useToast } from '../components/Toast'
import Select, { opts } from '../components/Select'

type Form = Record<string, string>

// Same fields and order as the Profile edit form on a contact's page
const TEXT_FIELDS: [string, string, string, FieldIcon][] = [
  ['designation', 'Designation', 'text', 'briefcase'],
  ['company', 'Company', 'text', 'building'],
]
const TEXT_FIELDS_2: [string, string, string, FieldIcon][] = [
  ['sector', 'Sector', 'text', 'grid'],
  ['company_type', 'Company Type', 'text', 'tag'],
  ['address', 'Address', 'text', 'home'],
  ['city', 'City', 'text', 'pin'],
  ['assigned_to', 'Assigned To', 'text', 'userCheck'],
  ['notes', 'Notes', 'text', 'pencil'],
]

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function mobileStatus(v: string): FieldStatus {
  if (!v.trim()) return null
  return /^(\+?91)?[6-9]\d{9}$/.test(v.replace(/[\s-]/g, '')) ? 'ok' : 'bad'
}

function apiError(e: unknown) {
  const detail = (e as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail
  return typeof detail === 'string' ? detail : 'Could not save the contact. Please try again.'
}

export default function AddContact() {
  const navigate = useNavigate()
  const toast = useToast()
  const [form, setForm] = useState<Form>({ priority: 'Medium' })
  const [touched, setTouched] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(prev => ({ ...prev, [field]: e.target.value }))

  const name = form.full_name ?? ''
  const email = form.email ?? ''
  const nameStatus: FieldStatus = name.trim() ? 'ok' : touched ? 'bad' : null
  const mobStatus = mobileStatus(form.mobile ?? '')
  const emailStatus: FieldStatus = !email.trim() ? null : EMAIL_RE.test(email.trim()) ? 'ok' : 'bad'

  function validate() {
    if (!name.trim()) return 'Full Name is required'
    if (mobStatus === 'bad') return 'Mobile must be a 10-digit Indian number'
    if (emailStatus === 'bad') return 'Email address looks incorrect'
    return ''
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setTouched(true)
    const msg = validate()
    setError(msg)
    if (msg) { toast.error('Contact not saved', msg); return }
    setSaving(true)
    try {
      const mobile = (form.mobile ?? '').replace(/\D/g, '').replace(/^91(?=\d{10}$)/, '')
      const created = await createContact({ ...form, mobile, email: email.trim().toLowerCase() })
      toast.success('Contact added', `${created.full_name} was added with status New.`)
      if (created.possible_duplicate_of) toast.warning('Possible duplicate', `This mobile number already belongs to contact #${created.possible_duplicate_of}.`)
      navigate(`/contacts/${created.id}`, { replace: true })
    } catch (err) {
      setError(apiError(err))
      toast.error('Contact not saved', apiError(err))
      setSaving(false)
    }
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div
        className="name-bar brand-gradient textured flex items-center gap-4 rounded-xl px-5 py-4 shadow text-white"
        style={{ background: 'linear-gradient(90deg, #4E148C 0%, #02C3BD 100%)' }}
      >
        <button
          onClick={() => navigate(-1)}
          className="text-sm text-white px-3 py-1 rounded-lg bg-white/15 hover:bg-white/25 transition-colors"
        >
          &larr; Back
        </button>
        <h1 className="hidden md:block text-2xl font-bold text-white" style={{ textShadow: '0 1px 2px rgb(0 0 0 / 0.2)' }}>Add Contact</h1>
      </div>

      <form onSubmit={save} noValidate className="bg-white rounded-xl shadow p-5 space-y-4">
        <div>
          <h2 className="font-bold text-gray-900">Contact details</h2>
          <p className="text-xs text-gray-500 mt-0.5">Only Full Name is required. New contacts start with status “New”.</p>
        </div>

        <div className="pf-edit space-y-3 text-sm">
          <FormField icon="user" label="Full Name" htmlFor="ac-full_name" required status={nameStatus}>
            <input id="ac-full_name" type="text" value={name} onChange={set('full_name')} className="fu-control" autoFocus />
          </FormField>

          {TEXT_FIELDS.map(([field, label, type, icon]) => (
            <FormField key={field} icon={icon} label={label} htmlFor={`ac-${field}`}>
              <input id={`ac-${field}`} type={type} value={form[field] ?? ''} onChange={set(field)} className="fu-control" />
            </FormField>
          ))}

          <FormField icon="phone" label="Mobile" htmlFor="ac-mobile" status={mobStatus}>
            <input id="ac-mobile" type="tel" inputMode="numeric" value={form.mobile ?? ''} onChange={set('mobile')} placeholder="10-digit number" className="fu-control" />
          </FormField>
          <FormField icon="mail" label="Email" htmlFor="ac-email" status={emailStatus}>
            <input id="ac-email" type="email" value={email} onChange={set('email')} className="fu-control" />
          </FormField>

          {TEXT_FIELDS_2.map(([field, label, type, icon]) => (
            <FormField key={field} icon={icon} label={label} htmlFor={`ac-${field}`}>
              <input id={`ac-${field}`} type={type} value={form[field] ?? ''} onChange={set(field)} className="fu-control" />
            </FormField>
          ))}

          <FormField icon="flag" label="Priority" htmlFor="ac-priority">
            <Select id="ac-priority" value={form.priority} onChange={v => setForm(prev => ({ ...prev, priority: v }))} options={opts(['High', 'Medium', 'Low'])} />
          </FormField>
          <FormField icon="fire" label="Interest Level" htmlFor="ac-interest_level">
            <Select
              id="ac-interest_level"
              value={form.interest_level ?? ''}
              onChange={v => setForm(prev => ({ ...prev, interest_level: v }))}
              options={[{ value: '', label: 'None' }, ...opts(['Hot', 'Warm', 'Cold'])]}
            />
          </FormField>
        </div>

        {error && <div className="text-red-600 text-sm text-center" role="alert">{error}</div>}

        <div className="flex justify-center gap-3 pt-1">
          <button type="button" onClick={() => navigate(-1)} className="edit-btn is-cancel">Cancel</button>
          <button
            type="submit"
            disabled={saving}
            className="fu-submit brand-gradient textured px-12 py-2.5 rounded-full text-white text-sm font-semibold shadow-md transition hover:shadow-lg hover:brightness-110 disabled:opacity-50"
            style={{ background: 'linear-gradient(90deg, #4E148C 0%, #02C3BD 100%)' }}
          >
            <span>{saving ? 'Saving…' : 'Save Contact'}</span>
          </button>
        </div>
      </form>
    </div>
  )
}

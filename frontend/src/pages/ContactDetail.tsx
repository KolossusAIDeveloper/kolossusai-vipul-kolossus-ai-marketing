import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getContact, updateContact, getFollowups, addFollowup, updateFollowup, deleteFollowup } from '../api'
import StatusBadge from '../components/StatusBadge'
import FormField, { FieldStatus } from '../components/FormField'

const STATUSES = [
  "New","Attempted - No Answer","Contacted","Interested","Follow-up Scheduled",
  "Demo Scheduled","Proposal Sent","Negotiation","Converted","Not Interested",
  "Invalid / Wrong Number","Do Not Contact"
]
const CHANNELS = ["Call","WhatsApp","Email","SMS","Meeting","Video Call","Visit","LinkedIn","Other"]
const CALL_RESULTS = ["Connected","No Answer","Busy","Switched Off","Wrong Number","Replied","Not Replied"]
const CLOSED = new Set(["Converted","Not Interested","Invalid / Wrong Number","Do Not Contact"])

// Readable message from a failed API call (uses the backend's "detail" when present)
function apiError(e: unknown, fallback: string) {
  const detail = (e as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail
  return typeof detail === 'string' ? detail : fallback
}

// Current local time as "YYYY-MM-DDTHH:MM" for datetime-local inputs (toISOString() would give UTC)
function nowLocal() {
  const d = new Date()
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}

function fmtDate(val: string | null | undefined) {
  if (!val) return ''
  try {
    const d = new Date(val)
    const day = String(d.getDate()).padStart(2, '0')
    const mon = String(d.getMonth() + 1).padStart(2, '0')
    const yr = d.getFullYear()
    return `${day}-${mon}-${yr}`
  } catch { return val ?? '' }
}

function fmtDateTime(val: string | null | undefined) {
  if (!val) return ''
  try {
    const d = new Date(val)
    const day = String(d.getDate()).padStart(2, '0')
    const mon = String(d.getMonth() + 1).padStart(2, '0')
    const yr = d.getFullYear()
    let h = d.getHours()
    const m = String(d.getMinutes()).padStart(2, '0')
    const ampm = h >= 12 ? 'PM' : 'AM'
    h = h % 12 || 12
    return `${day}-${mon}-${yr} ${h}:${m} ${ampm}`
  } catch { return val ?? '' }
}

const CHANNEL_ICONS: Record<string, string> = {
  Call: '📞', WhatsApp: '💬', Email: '✉️', SMS: '💬', Meeting: '🤝',
  'Video Call': '🎥', Visit: '🏢', LinkedIn: '💼', Other: '📋'
}

interface Contact {
  id: number
  sr_no: number
  full_name: string
  designation?: string
  company?: string
  company_type?: string
  mobile?: string
  email?: string
  social_category?: string
  gender?: string
  msme_type?: string
  udyam_aadhaar?: string
  sector?: string
  address?: string
  city?: string
  current_status: string
  last_followup_at?: string
  last_channel?: string
  last_outcome?: string
  next_followup_at?: string
  followup_count: number
  assigned_to?: string
  priority?: string
  interest_level?: string
  lead_source?: string
  notes?: string
  possible_duplicate_of?: number
  data_quality_flag?: string
}

interface Followup {
  id: number
  user_id: number
  followup_at: string
  channel: string
  direction: string
  call_result?: string
  duration_min?: number
  contacted_by: string
  spoke_with?: string
  customer_said?: string
  our_notes?: string
  status_before?: string
  status_after: string
  next_action?: string
  next_followup_at?: string
  created_at: string
}

export default function ContactDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [contact, setContact] = useState<Contact | null>(null)
  const [followups, setFollowups] = useState<Followup[]>([])
  const [loading, setLoading] = useState(true)
  const [showAadhaar, setShowAadhaar] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [editData, setEditData] = useState<Partial<Contact>>({})
  const [saving, setSaving] = useState(false)
  const [showAddFollowup, setShowAddFollowup] = useState(true)
  const [fpData, setFpData] = useState({
    followup_at: nowLocal(),
    channel: 'Call',
    direction: 'Outbound',
    call_result: '',
    duration_min: '',
    contacted_by: '',
    spoke_with: '',
    customer_said: '',
    our_notes: '',
    status_after: '',
    next_action: '',
    next_followup_at: '',
  })
  const [fpError, setFpError] = useState('')
  const [fpTried, setFpTried] = useState(false)
  const [fpSaving, setFpSaving] = useState(false)
  const [editFollowupId, setEditFollowupId] = useState<number | null>(null)
  const [editFpData, setEditFpData] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!id) return
    Promise.all([getContact(Number(id)), getFollowups(Number(id))]).then(([c, f]) => {
      setContact(c)
      setFollowups(f)
      setFpData(prev => ({ ...prev, status_after: c.current_status }))
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [id])

  function maskAadhaar(val: string | undefined) {
    if (!val) return ''
    const digits = val.replace(/\D/g, '')
    if (digits.length === 12) return `XXXX-XXXX-${digits.slice(-4)}`
    return val
  }

  async function saveEdit() {
    if (!contact) return
    setSaving(true)
    try {
      const updated = await updateContact(contact.id, editData)
      setContact(updated)
      setEditMode(false)
    } catch (e) {
      window.alert(apiError(e, 'Could not save changes. Please try again.'))
    } finally {
      setSaving(false)
    }
  }

  function validateFollowup() {
    if (!fpData.channel) return 'Channel is required'
    if (!fpData.status_after) return 'Status is required'
    if (!fpData.contacted_by) return 'Contacted by is required'
    if (['Connected', 'Replied'].includes(fpData.call_result) && !fpData.customer_said) return 'Customer said is required when Connected/Replied'
    if (!fpData.followup_at) return 'Date & Time is required'
    if (fpData.followup_at > nowLocal()) return 'Date & Time cannot be in the future'
    // Next follow-up is optional; if set it must be after the follow-up and after now
    if (!CLOSED.has(fpData.status_after) && fpData.next_followup_at) {
      if (fpData.next_followup_at <= fpData.followup_at) return 'Next follow-up must be after the follow-up Date & Time'
      if (fpData.next_followup_at <= nowLocal()) return 'Next follow-up must be after the current date and time'
    }
    return ''
  }

  async function submitFollowup() {
    const err = validateFollowup()
    if (err) { setFpError(err); setFpTried(true); return }
    setFpError('')
    setFpSaving(true)
    try {
      await addFollowup(Number(id), {
        ...fpData,
        duration_min: fpData.duration_min ? Number(fpData.duration_min) : null,
        call_result: fpData.call_result || null,
        next_followup_at: CLOSED.has(fpData.status_after) ? null : (fpData.next_followup_at || null),
        status_before: contact?.current_status,
      })
      const [c, f] = await Promise.all([getContact(Number(id)), getFollowups(Number(id))])
      setContact(c)
      setFollowups(f)
      setShowAddFollowup(true)
      setFpTried(false)
      setFpData(prev => ({
        ...prev,
        followup_at: nowLocal(),
        channel: 'Call',
        direction: 'Outbound',
        call_result: '',
        duration_min: '',
        contacted_by: '',
        spoke_with: '',
        customer_said: '',
        our_notes: '',
        status_after: c.current_status,
        next_action: '',
        next_followup_at: '',
      }))
    } catch (e) {
      setFpError(apiError(e, 'Could not save the follow-up. Please try again.'))
    } finally {
      setFpSaving(false)
    }
  }

  async function handleDeleteFollowup(fid: number) {
    if (!window.confirm('Delete this follow-up entry?')) return
    try {
      await deleteFollowup(fid)
      const [c, f] = await Promise.all([getContact(Number(id)), getFollowups(Number(id))])
      setContact(c)
      setFollowups(f)
    } catch (e) {
      window.alert(apiError(e, 'Could not delete the follow-up. Please try again.'))
    }
  }

  async function saveEditFollowup(fid: number) {
    if (editFpData.followup_at !== undefined) {
      if (!editFpData.followup_at) { window.alert('Date & Time is required'); return }
      if (editFpData.followup_at > nowLocal()) { window.alert('Date & Time cannot be in the future'); return }
    }
    try {
      await updateFollowup(fid, editFpData)
      const [c, f] = await Promise.all([getContact(Number(id)), getFollowups(Number(id))])
      setContact(c)
      setFollowups(f)
      setEditFollowupId(null)
    } catch (e) {
      window.alert(apiError(e, 'Could not save the follow-up. Please try again.'))
    }
  }

  // ✓ / ✕ for each follow-up field (same rules as validateFollowup)
  const nowStr = nowLocal()
  const nextLocked = !fpData.followup_at || CLOSED.has(fpData.status_after)
  const needSaid = ['Connected', 'Replied'].includes(fpData.call_result)
  function mark(required: boolean, filled: boolean, valid = true): FieldStatus {
    if (filled) return valid ? 'ok' : 'bad'
    return required && fpTried ? 'bad' : null
  }
  const fs = {
    followup_at: mark(true, !!fpData.followup_at, fpData.followup_at <= nowStr),
    channel: mark(true, !!fpData.channel),
    direction: mark(false, !!fpData.direction),
    call_result: mark(false, !!fpData.call_result),
    duration_min: mark(false, fpData.duration_min !== '', Number(fpData.duration_min) >= 0),
    contacted_by: mark(true, !!fpData.contacted_by),
    spoke_with: mark(false, !!fpData.spoke_with.trim()),
    status_after: mark(true, !!fpData.status_after),
    customer_said: mark(needSaid, !!fpData.customer_said.trim()),
    our_notes: mark(false, !!fpData.our_notes.trim()),
    next_action: mark(false, !!fpData.next_action.trim()),
    next_followup_at: nextLocked ? null : mark(false, !!fpData.next_followup_at,
      fpData.next_followup_at > fpData.followup_at && fpData.next_followup_at > nowStr),
  }

  if (loading) return <div className="p-8 text-gray-400">Loading...</div>
  if (!contact) return <div className="p-8 text-red-500">Contact not found</div>

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div
        className="brand-gradient textured flex items-center gap-4 rounded-xl px-5 py-4 shadow text-white"
        style={{ background: 'linear-gradient(90deg, #4E148C 0%, #02C3BD 100%)' }}
      >
        <button
          onClick={() => navigate('/contacts')}
          className="text-sm text-white px-3 py-1 rounded-lg bg-white/15 hover:bg-white/25 transition-colors"
        >
          &larr; Back
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold text-white" style={{ textShadow: '0 1px 2px rgb(0 0 0 / 0.2)' }}>{contact.full_name}</h1>
            <StatusBadge status={contact.current_status} />
            {contact.possible_duplicate_of && (
              <span className="text-yellow-800 text-sm bg-white/90 px-2 py-0.5 rounded">
                ⚠ Possible duplicate of #{contact.possible_duplicate_of}
              </span>
            )}
            {contact.data_quality_flag && (
              <span className="text-orange-700 text-sm bg-white/90 px-2 py-0.5 rounded">
                ⚠ {contact.data_quality_flag}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Profile Card */}
        <div className="bg-white rounded-xl shadow p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-gray-700">Profile</h2>
            <button
              onClick={() => { setEditMode(!editMode); setEditData({}) }}
              className="text-sm text-blue-600 hover:underline"
            >
              {editMode ? 'Cancel' : 'Edit Details'}
            </button>
          </div>

          {editMode ? (
            <div className="space-y-3 text-sm">
              {([
                ['full_name','Full Name','text'],
                ['designation','Designation','text'],
                ['company','Company','text'],
                ['mobile','Mobile','text'],
                ['email','Email','email'],
                ['sector','Sector','text'],
                ['company_type','Company Type','text'],
                ['address','Address','text'],
                ['city','City','text'],
                ['assigned_to','Assigned To','text'],
                ['notes','Notes','text'],
              ] as [string, string, string][]).map(([field, label, type]) => (
                <div key={field}>
                  <label className="block text-xs text-gray-500 mb-0.5">{label}</label>
                  <input
                    type={type}
                    defaultValue={(contact as unknown as Record<string, unknown>)[field] as string ?? ''}
                    onChange={e => setEditData(prev => ({ ...prev, [field]: e.target.value }))}
                    className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
                  />
                </div>
              ))}
              <div>
                <label className="block text-xs text-gray-500 mb-0.5">Priority</label>
                <select
                  defaultValue={contact.priority ?? 'Medium'}
                  onChange={e => setEditData(prev => ({ ...prev, priority: e.target.value }))}
                  className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
                >
                  {['High','Medium','Low'].map(p => <option key={p}>{p}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-0.5">Interest Level</label>
                <select
                  defaultValue={contact.interest_level ?? ''}
                  onChange={e => setEditData(prev => ({ ...prev, interest_level: e.target.value || null } as Partial<Contact>))}
                  className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
                >
                  <option value="">None</option>
                  {['Hot','Warm','Cold'].map(p => <option key={p}>{p}</option>)}
                </select>
              </div>
              <button
                onClick={saveEdit}
                disabled={saving}
                className="bg-blue-600 text-white px-4 py-1.5 rounded text-sm hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          ) : (
            <dl className="text-sm space-y-2">
              {([
                ['Sr #', contact.sr_no],
                ['Mobile', contact.mobile ? (
                  <span className="flex items-center gap-2">
                    <a href={`tel:${contact.mobile}`} className="text-blue-600 hover:underline">{contact.mobile}</a>
                    <a href={`https://wa.me/91${contact.mobile?.replace(/\D/g,'')}`} target="_blank" rel="noreferrer" className="text-green-600 text-xs hover:underline">WhatsApp</a>
                  </span>
                ) : '—'],
                ['Email', contact.email ? <a href={`mailto:${contact.email}`} className="text-blue-600 hover:underline">{contact.email}</a> : '—'],
                ['Designation', contact.designation ?? '—'],
                ['Company', contact.company ?? '—'],
                ['Company Type', contact.company_type ?? '—'],
                ['Sector', contact.sector ?? '—'],
                ['MSME Type', contact.msme_type ?? '—'],
                ['Gender', contact.gender ?? '—'],
                ['Social Category', contact.social_category ?? '—'],
                ['City', contact.city ?? '—'],
                ['Address', contact.address ?? '—'],
                ['Lead Source', contact.lead_source ?? '—'],
                ['Priority', contact.priority ?? '—'],
                ['Interest Level', contact.interest_level ?? '—'],
                ['Assigned To', contact.assigned_to ?? '—'],
              ] as [string, React.ReactNode][]).map(([label, value]) => (
                <div key={label as string} className="flex gap-2">
                  <dt className="text-gray-500 w-36 flex-shrink-0">{label}</dt>
                  <dd className="text-gray-900">{value}</dd>
                </div>
              ))}
              <div className="flex gap-2">
                <dt className="text-gray-500 w-36 flex-shrink-0">Udyam/Aadhaar</dt>
                <dd className="text-gray-900 flex items-center gap-2">
                  {showAadhaar ? (contact.udyam_aadhaar ?? '—') : maskAadhaar(contact.udyam_aadhaar)}
                  {contact.udyam_aadhaar && (
                    <button onClick={() => setShowAadhaar(s => !s)} className="text-xs text-blue-500 hover:underline">
                      {showAadhaar ? 'Hide' : 'Show'}
                    </button>
                  )}
                </dd>
              </div>
              {contact.notes && (
                <div className="flex gap-2">
                  <dt className="text-gray-500 w-36 flex-shrink-0">Notes</dt>
                  <dd className="text-gray-900">{contact.notes}</dd>
                </div>
              )}
            </dl>
          )}
        </div>

        {/* Follow-up Summary + Add */}
        <div className="space-y-4">
          <div className="bg-white rounded-xl shadow p-5 space-y-2 text-sm">
            <h2 className="font-semibold text-gray-700 mb-2">Follow-up Summary</h2>
            <div className="grid grid-cols-2 gap-2">
              <div><span className="text-gray-500">Status</span><div><StatusBadge status={contact.current_status} /></div></div>
              <div><span className="text-gray-500">Total Follow-ups</span><div className="font-bold text-lg">{contact.followup_count}</div></div>
              <div><span className="text-gray-500">Last Follow-up</span><div>{fmtDate(contact.last_followup_at) || '—'}</div></div>
              <div><span className="text-gray-500">Last Channel</span><div>{contact.last_channel ?? '—'}</div></div>
              <div><span className="text-gray-500">Next Follow-up</span><div>{fmtDate(contact.next_followup_at) || '—'}</div></div>
              <div><span className="text-gray-500">Last Outcome</span><div>{contact.last_outcome ?? '—'}</div></div>
            </div>
          </div>

          {/* Add Follow-up */}
          <div className="bg-white border border-gray-200 rounded-xl shadow-lg p-5">
            <div className="flex items-center justify-between mb-4 cursor-pointer" onClick={() => setShowAddFollowup(s => !s)}>
              <div className="flex items-center gap-2">
                <span className="text-xl">➕</span>
                <h2 className="font-bold text-gray-800 text-base">Add Follow-up</h2>
              </div>
              <span className="text-gray-500 text-sm">{showAddFollowup ? '▲ Collapse' : '▼ Expand'}</span>
            </div>
            {showAddFollowup && (
              <div className="space-y-3 text-sm">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <FormField icon="calendar" label="Date & Time" htmlFor="fu-at" required status={fs.followup_at}>
                    <input id="fu-at" type="datetime-local" max={nowLocal()} value={fpData.followup_at} onChange={e => setFpData(p => ({ ...p, followup_at: e.target.value, next_followup_at: e.target.value ? p.next_followup_at : '' }))} className="fu-control" />
                  </FormField>
                  <FormField icon="chat" label="Channel" htmlFor="fu-channel" required status={fs.channel}>
                    <select id="fu-channel" value={fpData.channel} onChange={e => setFpData(p => ({ ...p, channel: e.target.value }))} className="fu-control">
                      {CHANNELS.map(c => <option key={c}>{c}</option>)}
                    </select>
                  </FormField>
                  <FormField icon="arrows" label="Direction" htmlFor="fu-direction" status={fs.direction}>
                    <select id="fu-direction" value={fpData.direction} onChange={e => setFpData(p => ({ ...p, direction: e.target.value }))} className="fu-control">
                      <option>Outbound</option>
                      <option>Inbound</option>
                    </select>
                  </FormField>
                  <FormField icon="phone" label="Call Result" htmlFor="fu-result" status={fs.call_result}>
                    <select id="fu-result" value={fpData.call_result} onChange={e => setFpData(p => ({ ...p, call_result: e.target.value }))} className="fu-control">
                      <option value="">None</option>
                      {CALL_RESULTS.map(r => <option key={r}>{r}</option>)}
                    </select>
                  </FormField>
                  <FormField icon="clock" label="Duration (min)" htmlFor="fu-duration" status={fs.duration_min}>
                    <input id="fu-duration" type="number" min="0" value={fpData.duration_min} onChange={e => setFpData(p => ({ ...p, duration_min: e.target.value }))} className="fu-control" />
                  </FormField>
                  <FormField icon="user" label="Contacted By" htmlFor="fu-by" required status={fs.contacted_by}>
                    <input id="fu-by" type="text" value={fpData.contacted_by} onChange={e => setFpData(p => ({ ...p, contacted_by: e.target.value }))} className="fu-control" />
                  </FormField>
                  <FormField icon="users" label="Spoke With" htmlFor="fu-spoke" status={fs.spoke_with}>
                    <input id="fu-spoke" type="text" value={fpData.spoke_with} onChange={e => setFpData(p => ({ ...p, spoke_with: e.target.value }))} className="fu-control" />
                  </FormField>
                  <FormField icon="flag" label="Status After" htmlFor="fu-status" required status={fs.status_after}>
                    <select id="fu-status" value={fpData.status_after} onChange={e => setFpData(p => ({ ...p, status_after: e.target.value, next_followup_at: CLOSED.has(e.target.value) ? '' : p.next_followup_at }))} className="fu-control">
                      <option value="">Select...</option>
                      {STATUSES.map(s => <option key={s}>{s}</option>)}
                    </select>
                  </FormField>
                </div>
                <FormField icon="quote" label="Customer Said" htmlFor="fu-said" required={needSaid} status={fs.customer_said}>
                  <textarea id="fu-said" rows={2} value={fpData.customer_said} onChange={e => setFpData(p => ({ ...p, customer_said: e.target.value }))} className="fu-control" />
                </FormField>
                <FormField icon="pencil" label="Our Notes" htmlFor="fu-notes" status={fs.our_notes}>
                  <textarea id="fu-notes" rows={2} value={fpData.our_notes} onChange={e => setFpData(p => ({ ...p, our_notes: e.target.value }))} className="fu-control" />
                </FormField>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <FormField icon="arrowRight" label="Next Action" htmlFor="fu-next-action" status={fs.next_action}>
                    <input id="fu-next-action" type="text" value={fpData.next_action} onChange={e => setFpData(p => ({ ...p, next_action: e.target.value }))} className="fu-control" />
                  </FormField>
                  <FormField
                    icon="calendar"
                    label="Next Follow-up Date (optional)"
                    htmlFor="fu-next"
                    status={fs.next_followup_at}
                    disabled={nextLocked}
                    title={CLOSED.has(fpData.status_after)
                      ? `No next follow-up for "${fpData.status_after}"`
                      : !fpData.followup_at ? 'Fill in Date & Time first' : undefined}
                  >
                    <input
                      id="fu-next"
                      type="datetime-local"
                      disabled={nextLocked}
                      min={nowLocal()}
                      value={fpData.next_followup_at}
                      onChange={e => setFpData(p => ({ ...p, next_followup_at: e.target.value }))}
                      className="fu-control"
                    />
                  </FormField>
                </div>
                {fpError && <div className="text-red-500 text-xs">{fpError}</div>}
                <div className="flex justify-center pt-1">
                  <button
                    onClick={submitFollowup}
                    disabled={fpSaving}
                    className="brand-gradient px-12 py-2.5 rounded-full text-white text-sm font-extrabold uppercase tracking-[0.18em] shadow-md transition hover:shadow-lg hover:brightness-110 disabled:opacity-50"
                    style={{ background: 'linear-gradient(90deg, #4E148C 0%, #02C3BD 100%)' }}
                  >
                    <span>{fpSaving ? 'Saving...' : 'Add Follow-up'}</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Follow-up History */}
      <div className="bg-white rounded-xl shadow p-5">
        <h2 className="font-semibold text-gray-700 mb-4">Follow-up History ({followups.length})</h2>
        {followups.length === 0 ? (
          <p className="text-gray-400 text-sm">No follow-ups yet</p>
        ) : (
          <div className="space-y-4">
            {followups.map(f => (
              <div key={f.id} className="border border-gray-200 rounded-lg p-4 space-y-2">
                {editFollowupId === f.id ? (
                  <div className="space-y-2 text-sm">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs text-gray-500">Date & Time</label>
                        <input type="datetime-local" max={nowLocal()} defaultValue={f.followup_at?.slice(0,16)} onChange={e => setEditFpData(p => ({ ...p, followup_at: e.target.value }))} className="w-full border border-gray-300 rounded px-2 py-1 text-xs" />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500">Channel</label>
                        <select defaultValue={f.channel} onChange={e => setEditFpData(p => ({ ...p, channel: e.target.value }))} className="w-full border border-gray-300 rounded px-2 py-1 text-xs">
                          {CHANNELS.map(c => <option key={c}>{c}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500">Call Result</label>
                        <select defaultValue={f.call_result ?? ''} onChange={e => setEditFpData(p => ({ ...p, call_result: e.target.value }))} className="w-full border border-gray-300 rounded px-2 py-1 text-xs">
                          <option value="">None</option>
                          {CALL_RESULTS.map(r => <option key={r}>{r}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500">Contacted By</label>
                        <input defaultValue={f.contacted_by} onChange={e => setEditFpData(p => ({ ...p, contacted_by: e.target.value }))} className="w-full border border-gray-300 rounded px-2 py-1 text-xs" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500">Customer Said</label>
                      <textarea defaultValue={f.customer_said ?? ''} onChange={e => setEditFpData(p => ({ ...p, customer_said: e.target.value }))} rows={2} className="w-full border border-gray-300 rounded px-2 py-1 text-xs" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500">Our Notes</label>
                      <textarea defaultValue={f.our_notes ?? ''} onChange={e => setEditFpData(p => ({ ...p, our_notes: e.target.value }))} rows={2} className="w-full border border-gray-300 rounded px-2 py-1 text-xs" />
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => saveEditFollowup(f.id)} className="bg-blue-600 text-white px-3 py-1 rounded text-xs hover:bg-blue-700">Save</button>
                      <button onClick={() => setEditFollowupId(null)} className="text-gray-500 text-xs hover:underline">Cancel</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <span>{CHANNEL_ICONS[f.channel] ?? '📋'} <strong>{f.channel}</strong></span>
                        <span className="text-gray-400">·</span>
                        <span>{fmtDateTime(f.followup_at)}</span>
                        <span className="text-gray-400">·</span>
                        <span>{f.direction}</span>
                        {f.call_result && <><span className="text-gray-400">·</span><span>{f.call_result}</span></>}
                        {f.duration_min && <><span className="text-gray-400">·</span><span>{f.duration_min} min</span></>}
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => { setEditFollowupId(f.id); setEditFpData({}) }} className="text-blue-500 text-xs hover:underline">Edit</button>
                        <button onClick={() => handleDeleteFollowup(f.id)} className="text-red-500 text-xs hover:underline">Delete</button>
                      </div>
                    </div>
                    <div className="text-xs text-gray-500">By <strong>{f.contacted_by}</strong>{f.spoke_with ? ` · Spoke with: ${f.spoke_with}` : ''}</div>
                    {f.customer_said && (
                      <div className="bg-blue-50 border-l-4 border-blue-400 px-3 py-2 text-sm">
                        <span className="text-xs font-semibold text-blue-600">They said: </span>
                        {f.customer_said}
                      </div>
                    )}
                    {f.our_notes && (
                      <div className="bg-gray-50 border-l-4 border-gray-300 px-3 py-2 text-sm text-gray-700">
                        <span className="text-xs font-semibold text-gray-500">Our notes: </span>
                        {f.our_notes}
                      </div>
                    )}
                    <div className="flex items-center gap-3 text-xs text-gray-500">
                      <span>
                        Status: {f.status_before ? <><StatusBadge status={f.status_before} /> → </> : ''}<StatusBadge status={f.status_after} />
                      </span>
                      {f.next_action && <span>· Next: {f.next_action}</span>}
                      {f.next_followup_at && <span>· Follow-up: {fmtDate(f.next_followup_at)}</span>}
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getContact, updateContact, getFollowups, addFollowup, updateFollowup, deleteFollowup } from '../api'
import StatusBadge from '../components/StatusBadge'
import FormField, { FieldIcon, FieldStatus } from '../components/FormField'
import ProfileTile from '../components/ProfileTile'
import { fmtDate, fmtDateTime, fmtNice, nowIST, daysFromToday, lastContactText, nextDue } from '../utils/ist'

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


// Label + colour for the next follow-up pill

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
    followup_at: nowIST(),
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
    if (fpData.followup_at > nowIST()) return 'Date & Time cannot be in the future'
    // Next follow-up is optional; if set it must be after the follow-up and after now
    if (!CLOSED.has(fpData.status_after) && fpData.next_followup_at) {
      if (fpData.next_followup_at <= fpData.followup_at) return 'Next follow-up must be after the follow-up Date & Time'
      if (fpData.next_followup_at <= nowIST()) return 'Next follow-up must be after the current date and time'
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
        followup_at: nowIST(),
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
      if (editFpData.followup_at > nowIST()) { window.alert('Date & Time cannot be in the future'); return }
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
  const nowStr = nowIST()
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
        className="name-bar brand-gradient textured flex items-center gap-4 rounded-xl px-5 py-4 shadow text-white"
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
        <div className={`${editMode ? 'bg-white' : 'bg-gray-50'} rounded-xl shadow p-5 space-y-3`}>
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-gray-900">Profile</h2>
            <button
              onClick={() => { setEditMode(!editMode); setEditData({}) }}
              className={`edit-btn${editMode ? ' is-cancel' : ''}`}
            >
              <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d={editMode
                  ? 'M6 18L18 6M6 6l12 12'
                  : 'M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z'} />
              </svg>
              {editMode ? 'Cancel' : 'Edit Details'}
            </button>
          </div>

          {editMode ? (
            <div className="pf-edit space-y-3 text-sm">
              {([
                ['full_name','Full Name','text','user'],
                ['designation','Designation','text','briefcase'],
                ['company','Company','text','building'],
                ['mobile','Mobile','text','phone'],
                ['email','Email','email','mail'],
                ['sector','Sector','text','grid'],
                ['company_type','Company Type','text','tag'],
                ['address','Address','text','home'],
                ['city','City','text','pin'],
                ['assigned_to','Assigned To','text','userCheck'],
                ['notes','Notes','text','pencil'],
              ] as [string, string, string, FieldIcon][]).map(([field, label, type, icon]) => (
                <FormField key={field} icon={icon} label={label} htmlFor={`pf-${field}`}>
                  <input
                    id={`pf-${field}`}
                    type={type}
                    defaultValue={(contact as unknown as Record<string, unknown>)[field] as string ?? ''}
                    onChange={e => setEditData(prev => ({ ...prev, [field]: e.target.value }))}
                    className="fu-control"
                  />
                </FormField>
              ))}
              <FormField icon="flag" label="Priority" htmlFor="pf-priority">
                <select
                  id="pf-priority"
                  defaultValue={contact.priority ?? 'Medium'}
                  onChange={e => setEditData(prev => ({ ...prev, priority: e.target.value }))}
                  className="fu-control"
                >
                  {['High','Medium','Low'].map(p => <option key={p}>{p}</option>)}
                </select>
              </FormField>
              <FormField icon="fire" label="Interest Level" htmlFor="pf-interest">
                <select
                  id="pf-interest"
                  defaultValue={contact.interest_level ?? ''}
                  onChange={e => setEditData(prev => ({ ...prev, interest_level: e.target.value || null } as Partial<Contact>))}
                  className="fu-control"
                >
                  <option value="">None</option>
                  {['Hot','Warm','Cold'].map(p => <option key={p}>{p}</option>)}
                </select>
              </FormField>
              <div className="flex justify-center pt-1">
                <button
                  onClick={saveEdit}
                  disabled={saving}
                  className="fu-submit brand-gradient textured px-12 py-2.5 rounded-full text-white text-sm shadow-md transition hover:shadow-lg hover:brightness-110 disabled:opacity-50"
                  style={{ background: 'linear-gradient(90deg, #4E148C 0%, #02C3BD 100%)' }}
                >
                  <span>{saving ? 'Saving...' : 'Save Changes'}</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <ProfileTile label="Mobile" icon="phone">
                {contact.mobile ? (
                  <span className="flex items-center gap-2 flex-wrap">
                    <a href={`tel:${contact.mobile}`} className="text-blue-600 hover:underline">{contact.mobile}</a>
                    <a href={`https://wa.me/91${contact.mobile?.replace(/\D/g,'')}`} target="_blank" rel="noreferrer" className="text-green-600 text-xs hover:underline">WhatsApp</a>
                  </span>
                ) : '—'}
              </ProfileTile>
              <ProfileTile label="Email" icon="mail">
                {contact.email ? <a href={`mailto:${contact.email}`} className="text-blue-600 hover:underline">{contact.email}</a> : '—'}
              </ProfileTile>
              <ProfileTile label="Designation" icon="briefcase">{contact.designation ?? '—'}</ProfileTile>
              <ProfileTile label="Company" icon="building">{contact.company ?? '—'}</ProfileTile>
              <ProfileTile label="Company Type" icon="tag">{contact.company_type ?? '—'}</ProfileTile>
              <ProfileTile label="Sector" icon="grid">{contact.sector ?? '—'}</ProfileTile>
              <ProfileTile label="MSME Type" icon="chart">{contact.msme_type ?? '—'}</ProfileTile>
              <ProfileTile label="Gender" icon="user">{contact.gender ?? '—'}</ProfileTile>
              <ProfileTile label="Social Category" icon="users">{contact.social_category ?? '—'}</ProfileTile>
              <ProfileTile label="City" icon="pin">{contact.city ?? '—'}</ProfileTile>
              <ProfileTile label="Address" icon="home" wide>{contact.address ?? '—'}</ProfileTile>
              <ProfileTile label="Priority" icon="flag">{contact.priority ?? '—'}</ProfileTile>
              <ProfileTile label="Interest Level" icon="fire">{contact.interest_level ?? '—'}</ProfileTile>
              <ProfileTile label="Assigned To" icon="userCheck">{contact.assigned_to ?? '—'}</ProfileTile>
              <ProfileTile label="Udyam / Aadhaar" icon="idCard">
                <span className="flex items-center gap-2 flex-wrap">
                  {showAadhaar ? (contact.udyam_aadhaar ?? '—') : (maskAadhaar(contact.udyam_aadhaar) || '—')}
                  {contact.udyam_aadhaar && (
                    <button onClick={() => setShowAadhaar(s => !s)} className="text-xs text-blue-500 hover:underline">
                      {showAadhaar ? 'Hide' : 'Show'}
                    </button>
                  )}
                </span>
              </ProfileTile>
              <ProfileTile label="Lead Source" icon="link">{contact.lead_source ?? '—'}</ProfileTile>
              <ProfileTile label="Sr #" icon="hash">{contact.sr_no ?? '—'}</ProfileTile>
              {contact.notes && <ProfileTile label="Notes" icon="pencil" wide>{contact.notes}</ProfileTile>}
            </div>
          )}
        </div>

        {/* Follow-up Summary + Add */}
        <div className="space-y-4">
          <div className="bg-white rounded-xl shadow p-5 space-y-4 text-sm">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-bold text-gray-900">Follow-up Summary</h2>
              <StatusBadge status={contact.current_status} />
            </div>
            {(() => {
              const due = nextDue(contact.next_followup_at, contact.current_status)
              return (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sum-stat">
                    <div className="sum-label">Follow-ups</div>
                    <div className="sum-big">{contact.followup_count}</div>
                    <div className="sum-sub">{contact.followup_count === 1 ? 'interaction logged' : 'interactions logged'}</div>
                  </div>
                  <div className="sum-stat">
                    <div className="sum-label">Last contact</div>
                    {contact.last_followup_at ? (
                      <>
                        <div className="sum-value">{lastContactText(contact.last_followup_at)}</div>
                        <div className="sum-sub">{fmtNice(contact.last_followup_at)}</div>
                        {contact.last_channel && (
                          <div className="sum-sub">{CHANNEL_ICONS[contact.last_channel] ?? '📋'} {contact.last_channel}</div>
                        )}
                      </>
                    ) : (
                      <div className="sum-value text-gray-400">Never contacted</div>
                    )}
                  </div>
                  <div className="sum-stat">
                    <div className="sum-label">Next follow-up</div>
                    <div><span className={`due-pill is-${due.tone}`}>{due.text}</span></div>
                    {contact.next_followup_at && !CLOSED.has(contact.current_status) && (
                      <div className="sum-sub">{fmtNice(contact.next_followup_at)}</div>
                    )}
                  </div>
                </div>
              )
            })()}
            <div className="sum-outcome">
              <div className="sum-label">Last outcome</div>
              <div className="sum-quote">{contact.last_outcome ?? 'No outcome recorded yet'}</div>
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
                    <input id="fu-at" type="datetime-local" max={nowIST()} value={fpData.followup_at} onChange={e => setFpData(p => ({ ...p, followup_at: e.target.value, next_followup_at: e.target.value ? p.next_followup_at : '' }))} className="fu-control" />
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
                      min={nowIST()}
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
                    className="fu-submit brand-gradient textured px-12 py-2.5 rounded-full text-white text-sm font-semibold shadow-md transition hover:shadow-lg hover:brightness-110 disabled:opacity-50"
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
        <h2 className="font-bold text-gray-900 mb-4">Follow-up History ({followups.length})</h2>
        {followups.length === 0 ? (
          <p className="text-gray-400 text-sm">No follow-ups yet</p>
        ) : (
          <div className="fh-list">
            {followups.map(f => (
              <div key={f.id} className="fh-item">
                <div className="fh-dot" aria-hidden="true">{CHANNEL_ICONS[f.channel] ?? '📋'}</div>
                <div className="fh-card">
                  {editFollowupId === f.id ? (
                    <div className="pf-edit space-y-3 text-sm">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <FormField icon="calendar" label="Date & Time" htmlFor={`fh-at-${f.id}`}>
                          <input id={`fh-at-${f.id}`} type="datetime-local" max={nowIST()} defaultValue={f.followup_at?.slice(0,16)} onChange={e => setEditFpData(p => ({ ...p, followup_at: e.target.value }))} className="fu-control" />
                        </FormField>
                        <FormField icon="chat" label="Channel" htmlFor={`fh-channel-${f.id}`}>
                          <select id={`fh-channel-${f.id}`} defaultValue={f.channel} onChange={e => setEditFpData(p => ({ ...p, channel: e.target.value }))} className="fu-control">
                            {CHANNELS.map(c => <option key={c}>{c}</option>)}
                          </select>
                        </FormField>
                        <FormField icon="phone" label="Call Result" htmlFor={`fh-result-${f.id}`}>
                          <select id={`fh-result-${f.id}`} defaultValue={f.call_result ?? ''} onChange={e => setEditFpData(p => ({ ...p, call_result: e.target.value }))} className="fu-control">
                            <option value="">None</option>
                            {CALL_RESULTS.map(r => <option key={r}>{r}</option>)}
                          </select>
                        </FormField>
                        <FormField icon="user" label="Contacted By" htmlFor={`fh-by-${f.id}`}>
                          <input id={`fh-by-${f.id}`} defaultValue={f.contacted_by} onChange={e => setEditFpData(p => ({ ...p, contacted_by: e.target.value }))} className="fu-control" />
                        </FormField>
                      </div>
                      <FormField icon="quote" label="Customer Said" htmlFor={`fh-said-${f.id}`}>
                        <textarea id={`fh-said-${f.id}`} rows={2} defaultValue={f.customer_said ?? ''} onChange={e => setEditFpData(p => ({ ...p, customer_said: e.target.value }))} className="fu-control" />
                      </FormField>
                      <FormField icon="pencil" label="Our Notes" htmlFor={`fh-notes-${f.id}`}>
                        <textarea id={`fh-notes-${f.id}`} rows={2} defaultValue={f.our_notes ?? ''} onChange={e => setEditFpData(p => ({ ...p, our_notes: e.target.value }))} className="fu-control" />
                      </FormField>
                      <div className="flex justify-end gap-2 pt-1">
                        <button onClick={() => setEditFollowupId(null)} className="edit-btn is-cancel">
                          <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 18L18 6M6 6l12 12" /></svg>
                          Cancel
                        </button>
                        <button onClick={() => saveEditFollowup(f.id)} className="edit-btn is-save">
                          <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 13l4 4L19 7" /></svg>
                          Save
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="fh-title">{f.channel}</span>
                            <span className="fh-chip">{f.direction}</span>
                          </div>
                          <div className="fh-time">{fmtDateTime(f.followup_at)}</div>
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => { setEditFollowupId(f.id); setEditFpData({}) }} className="edit-btn is-sm">
                            <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                            Edit
                          </button>
                          <button onClick={() => handleDeleteFollowup(f.id)} className="edit-btn is-sm is-danger">
                            <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                            Delete
                          </button>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <span className="fh-meta">👤 By <strong>{f.contacted_by}</strong></span>
                        {f.spoke_with && <span className="fh-meta">🗣 Spoke with <strong>{f.spoke_with}</strong></span>}
                        {f.call_result && <span className="fh-meta">📞 {f.call_result}</span>}
                        {f.duration_min && <span className="fh-meta">⏱ {f.duration_min} min</span>}
                      </div>
                      {f.customer_said && (
                        <div className="fh-quote is-said">
                          <div className="sum-label">They said</div>
                          <div>{f.customer_said}</div>
                        </div>
                      )}
                      {f.our_notes && (
                        <div className="fh-quote is-notes">
                          <div className="sum-label">Our notes</div>
                          <div>{f.our_notes}</div>
                        </div>
                      )}
                      <div className="fh-footer">
                        <span className="flex items-center gap-1.5">
                          {f.status_before && <><StatusBadge status={f.status_before} /><span className="text-gray-400">→</span></>}
                          <StatusBadge status={f.status_after} />
                        </span>
                        {f.next_action && <span>➡ Next: <strong>{f.next_action}</strong></span>}
                        {f.next_followup_at && <span>📅 Follow-up: <strong>{fmtDate(f.next_followup_at)}</strong></span>}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

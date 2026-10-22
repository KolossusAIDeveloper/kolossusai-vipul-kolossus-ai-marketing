import axios from 'axios'

const api = axios.create({ baseURL: '/api' })

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

export async function login(username: string, password: string) {
  const res = await api.post('/login', { username, password })
  return res.data
}

export async function getMe() {
  const res = await api.get('/me')
  return res.data as { username: string }
}

export async function getStats() {
  const res = await api.get('/stats')
  return res.data
}

export async function getContacts(filters: Record<string, string> = {}, page = 1, pageSize = 100, signal?: AbortSignal) {
  const params = new URLSearchParams()
  Object.entries(filters).forEach(([k, v]) => { if (v) params.set(k, v) })
  params.set('page', String(page))
  params.set('page_size', String(pageSize))
  const res = await api.get('/contacts?' + params.toString(), { signal })
  return res.data as { items: Contact[]; total: number; page: number; page_size: number }
}

interface Contact {
  id: number; sr_no: number; full_name: string; designation?: string; company?: string
  mobile?: string; email?: string; sector?: string; company_type?: string; msme_type?: string
  city?: string; current_status: string; last_followup_at?: string; last_outcome?: string
  next_followup_at?: string; followup_count: number; assigned_to?: string; possible_duplicate_of?: number
  serial: number // 1 = oldest contact, counted by date added
}

export async function getContact(id: number) {
  const res = await api.get(`/contacts/${id}`)
  return res.data
}

export async function createContact(data: Record<string, unknown>) {
  const res = await api.post('/contacts', data)
  return res.data
}

export async function updateContact(id: number, data: Record<string, unknown>) {
  const res = await api.put(`/contacts/${id}`, data)
  return res.data
}

export async function getFollowups(id: number) {
  const res = await api.get(`/contacts/${id}/followups`)
  return res.data
}

export async function addFollowup(id: number, data: Record<string, unknown>) {
  const res = await api.post(`/contacts/${id}/followups`, data)
  return res.data
}

export async function updateFollowup(id: number, data: Record<string, unknown>) {
  const res = await api.put(`/followups/${id}`, data)
  return res.data
}

export async function deleteContact(id: number) {
  const res = await api.delete(`/contacts/${id}`)
  return res.data
}

export async function deleteContacts(ids: number[]) {
  const res = await api.post('/contacts/bulk-delete', { ids })
  return res.data as { deleted: number }
}

export async function deleteFollowup(id: number) {
  const res = await api.delete(`/followups/${id}`)
  return res.data
}

export async function getContactsByDate(date: string, end?: string) {
  const res = await api.get('/contacts/by-date', { params: end ? { date, end } : { date } })
  return res.data as { date: string; end: string; count: number; contacts: DailyContact[] }
}

interface DailyContact {
  id: number; full_name: string; company?: string; mobile?: string
  designation?: string; city?: string; sector?: string; current_status: string
  followup_at: string; channel: string; contacted_by: string; our_notes?: string
  call_result?: string; status_after: string
}

export async function importExcel(file: File) {
  const form = new FormData()
  form.append('file', file)
  const res = await api.post('/import', form, { headers: { 'Content-Type': 'multipart/form-data' } })
  return res.data
}


export default api

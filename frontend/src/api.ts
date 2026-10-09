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

export async function getStats() {
  const res = await api.get('/stats')
  return res.data
}

export async function getContacts(filters: Record<string, string> = {}, page = 1, pageSize = 100) {
  const params = new URLSearchParams()
  Object.entries(filters).forEach(([k, v]) => { if (v) params.set(k, v) })
  params.set('page', String(page))
  params.set('page_size', String(pageSize))
  const res = await api.get('/contacts?' + params.toString())
  return res.data as { items: Contact[]; total: number; page: number; page_size: number }
}

interface Contact {
  id: number; sr_no: number; full_name: string; designation?: string; company?: string
  mobile?: string; email?: string; sector?: string; company_type?: string; msme_type?: string
  city?: string; current_status: string; last_followup_at?: string; last_outcome?: string
  next_followup_at?: string; followup_count: number; assigned_to?: string; possible_duplicate_of?: number
}

export async function getContact(id: number) {
  const res = await api.get(`/contacts/${id}`)
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

export async function deleteFollowup(id: number) {
  const res = await api.delete(`/followups/${id}`)
  return res.data
}

export async function importExcel(file: File) {
  const form = new FormData()
  form.append('file', file)
  const res = await api.post('/import', form, { headers: { 'Content-Type': 'multipart/form-data' } })
  return res.data
}

export async function exportCsv(filters: Record<string, string> = {}) {
  const params = new URLSearchParams()
  Object.entries(filters).forEach(([k, v]) => { if (v) params.set(k, v) })
  const token = localStorage.getItem('token')
  const res = await fetch('/api/export-csv?' + params.toString(), {
    headers: { Authorization: `Bearer ${token}` }
  })
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'contacts.csv'
  a.click()
  URL.revokeObjectURL(url)
}

export default api

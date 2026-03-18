const API_URL = process.env.NEXT_PUBLIC_API_URL || ''
const BASE = `${API_URL}/api`

function buildQuery(params?: Record<string, any>): string {
  if (!params) return ''
  const filtered = Object.fromEntries(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '')
  )
  const q = new URLSearchParams(filtered as Record<string, string>).toString()
  return q ? `?${q}` : ''
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    // FastAPI validation errors return detail as array
    const detail = err.detail
    if (Array.isArray(detail)) {
      throw new Error(detail.map((d: any) => d.msg || JSON.stringify(d)).join(', '))
    }
    throw new Error(typeof detail === 'string' ? detail : JSON.stringify(detail) || 'Erreur réseau')
  }
  return res.json()
}

// ─── DASHBOARD ───────────────────────────────────────────────

export const getDashboard = () => request<DashboardData>('/dashboard')

// ─── CLIENTS ─────────────────────────────────────────────────

export const getClients = (params?: { status?: string; search?: string }) =>
  request<Client[]>(`/clients${buildQuery(params)}`)

export const getClient = (id: number) => request<ClientDetail>(`/clients/${id}`)

export const createClient = (data: ClientCreate) =>
  request<Client>('/clients', { method: 'POST', body: JSON.stringify(data) })

export const updateClient = (id: number, data: Partial<ClientCreate>) =>
  request<Client>(`/clients/${id}`, { method: 'PUT', body: JSON.stringify(data) })

export const deleteClient = (id: number) =>
  request<{ message: string }>(`/clients/${id}`, { method: 'DELETE' })

export const createContact = (data: ContactCreate) =>
  request<{ id: number; name: string }>('/contacts', {
    method: 'POST',
    body: JSON.stringify(data),
  })

// ─── PROJETS ─────────────────────────────────────────────────

export const getProjects = (params?: { status?: string; client_id?: number; search?: string }) =>
  request<Project[]>(`/projects${buildQuery(params)}`)

export const getProject = (id: number) => request<Project>(`/projects/${id}`)

export const createProject = (data: ProjectCreate) =>
  request<Project>('/projects', { method: 'POST', body: JSON.stringify(data) })

export const updateProject = (id: number, data: Partial<ProjectCreate>) =>
  request<Project>(`/projects/${id}`, { method: 'PUT', body: JSON.stringify(data) })

export const deleteProject = (id: number) =>
  request<{ message: string }>(`/projects/${id}`, { method: 'DELETE' })

// ─── FACTURES ────────────────────────────────────────────────

export const getInvoices = (params?: { client_id?: number; status?: string }) =>
  request<Invoice[]>(`/invoices${buildQuery(params)}`)

export const createInvoice = (data: InvoiceCreate) =>
  request<{ id: number; number: string }>('/invoices', {
    method: 'POST',
    body: JSON.stringify(data),
  })

export const updateInvoiceStatus = (id: number, status: string) =>
  request<{ id: number; status: string }>(`/invoices/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  })

// ─── CRM — PIPELINE ─────────────────────────────────────

export const getPipeline = () => request<Record<string, Client[]>>('/pipeline')

export const updatePipelineStage = (clientId: number, pipeline_stage: string) =>
  request<{ id: number; pipeline_stage: string }>(`/clients/${clientId}/pipeline`, {
    method: 'PATCH',
    body: JSON.stringify({ pipeline_stage }),
  })

// ─── CRM — ACTIVITÉS ────────────────────────────────────

export const getActivities = (params?: { client_id?: number; limit?: number }) =>
  request<Activity[]>(`/activities${buildQuery(params)}`)

export const createActivity = (data: ActivityCreate) =>
  request<Activity>('/activities', { method: 'POST', body: JSON.stringify(data) })

export const deleteActivity = (id: number) =>
  request<{ message: string }>(`/activities/${id}`, { method: 'DELETE' })

// ─── CRM — TÂCHES ───────────────────────────────────────

export const getTasks = (params?: { status?: string; client_id?: number }) =>
  request<Task[]>(`/tasks${buildQuery(params)}`)

export const createTask = (data: TaskCreate) =>
  request<Task>('/tasks', { method: 'POST', body: JSON.stringify(data) })

export const updateTaskStatus = (id: number, status: string) =>
  request<Task>(`/tasks/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) })

export const deleteTask = (id: number) =>
  request<{ message: string }>(`/tasks/${id}`, { method: 'DELETE' })

// ─── DIAGNOSTICS ────────────────────────────────────────────

export const getDiagnostics = (params?: { client_id?: number; type?: string; status?: string }) =>
  request<DiagnosticItem[]>(`/diagnostics${buildQuery(params)}`)

export const getDiagnostic = (id: number) => request<DiagnosticItem>(`/diagnostics/${id}`)

export const createDiagnostic = (data: DiagnosticCreate) =>
  request<DiagnosticItem>('/diagnostics', { method: 'POST', body: JSON.stringify(data) })

export const updateDiagnostic = (id: number, data: DiagnosticUpdateData) =>
  request<DiagnosticItem>(`/diagnostics/${id}`, { method: 'PUT', body: JSON.stringify(data) })

export const deleteDiagnostic = (id: number) =>
  request<{ message: string }>(`/diagnostics/${id}`, { method: 'DELETE' })

export const getSharedDiagnostic = (token: string) =>
  request<DiagnosticItem>(`/diagnostics/share/${token}`)

export const getDiagnosticPdfUrl = (id: number) =>
  `${BASE}/diagnostics/${id}/pdf`

export const regenerateShareToken = (id: number) =>
  request<{ id: number; share_token: string }>(`/diagnostics/${id}/regenerate-token`, { method: 'POST' })

// ─── FICHIERS ────────────────────────────────────────────────

export const browseRoot = () => request<FileItem[]>('/files')

export const browseDir = (path: string) =>
  request<FileItem[]>(`/files/browse?path=${encodeURIComponent(path)}`)

export const readFile = (path: string) =>
  request<{ content: string; path: string }>(`/files/read?path=${encodeURIComponent(path)}`)

// ─── TYPES ───────────────────────────────────────────────────

export interface DashboardData {
  kpis: {
    total_clients: number
    active_clients: number
    prospects: number
    total_projects: number
    active_projects: number
    ca_total: number
    ca_pending: number
    pipeline: number
  }
  phase_distribution: { phase: number; count: number }[]
  recent_projects: Project[]
  recent_clients: Client[]
}

export interface Client {
  id: number
  name: string
  slug: string
  type: string
  sector?: string
  status: string
  pipeline_stage?: string
  contact_name?: string
  contact_email?: string
  contact_phone?: string
  website?: string
  budget_range?: string
  folder_path?: string
  projects_count: number
  created_at?: string
  updated_at?: string
}

export interface ClientDetail extends Client {
  address?: string
  siret?: string
  source?: string
  notes?: string
  projects: Project[]
  contacts: Contact[]
}

export interface ClientCreate {
  name: string
  type?: string
  sector?: string
  contact_name?: string
  contact_email?: string
  contact_phone?: string
  address?: string
  website?: string
  siret?: string
  status?: string
  source?: string
  budget_range?: string
  notes?: string
}

export interface ContactCreate {
  client_id: number
  name: string
  email?: string
  phone?: string
  role?: string
  is_primary?: boolean
}

export interface Contact {
  id: number
  name: string
  email?: string
  phone?: string
  role?: string
  is_primary: boolean
}

export interface Project {
  id: number
  code: string
  name: string
  client_id: number
  client_name?: string
  type: string
  status: string
  phase: number
  description?: string
  budget?: number
  contract_signed: boolean
  gdpr_done: boolean
  folder_path?: string
  start_date?: string
  end_date?: string
  notes?: string
  created_at?: string
  updated_at?: string
}

export interface ProjectCreate {
  name: string
  client_id: number
  type?: string
  status?: string
  phase?: number
  description?: string
  start_date?: string
  end_date?: string
  budget?: number
  contract_signed?: boolean
  gdpr_done?: boolean
  notes?: string
}

export interface Invoice {
  id: number
  number: string
  client_id: number
  client_name?: string
  project_id?: number
  amount_ht: number
  amount_ttc: number
  tva_rate: number
  status: string
  issued_date?: string
  due_date?: string
  paid_date?: string
  notes?: string
  created_at?: string
}

export interface InvoiceCreate {
  client_id: number
  project_id?: number
  amount_ht: number
  tva_rate?: number
  status?: string
  issued_date?: string
  due_date?: string
  notes?: string
}

export interface Task {
  id: number
  title: string
  description?: string
  client_id?: number
  project_id?: number
  type: string
  priority: string
  status: string
  due_date?: string
  completed_at?: string
  created_at?: string
}

export interface Activity {
  id: number
  title: string
  description?: string
  client_id: number
  project_id?: number
  contact_id?: number
  type: string
  date?: string
  duration_minutes?: number
  created_at?: string
}

export interface ActivityCreate {
  client_id: number
  project_id?: number
  contact_id?: number
  type: string
  title: string
  description?: string
  date?: string
  duration_minutes?: number
}

export interface TaskCreate {
  client_id?: number
  project_id?: number
  title: string
  description?: string
  type?: string
  priority?: string
  due_date?: string
}

export interface DiagnosticItem {
  id: number
  client_id: number
  client_name?: string
  type: 'cyber' | 'ia'
  title: string
  status: 'en_cours' | 'termine'
  share_token: string
  company_info?: Record<string, any>
  answers?: Record<string, any>
  results?: DiagnosticResults
  report_path?: string
  created_at?: string
  updated_at?: string
}

export interface DiagnosticResults {
  global_score: number
  sections: DiagnosticSectionResult[]
}

export interface DiagnosticSectionResult {
  id: string
  title: string
  score_pct: number
  preconisations: string[]
}

export interface DiagnosticCreate {
  client_id: number
  type: 'cyber' | 'ia'
  title: string
  company_info?: Record<string, any>
}

export interface DiagnosticUpdateData {
  title?: string
  status?: string
  company_info?: Record<string, any>
  answers?: Record<string, any>
  results?: Record<string, any>
}

export interface FileItem {
  name: string
  path: string
  is_dir: boolean
  size?: number
  modified: string
  extension?: string
}

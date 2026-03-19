import {
  DEMO_DASHBOARD, DEMO_CLIENTS, DEMO_CLIENT_DETAILS, DEMO_PROJECTS,
  DEMO_INVOICES, DEMO_ACTIVITIES, DEMO_TASKS, DEMO_DIAGNOSTICS, DEMO_PIPELINE,
  DEMO_QUOTES, DEMO_TIME_ENTRIES, DEMO_ALERTS, DEMO_REPORTING,
} from './demo-data'

const API_URL = process.env.NEXT_PUBLIC_API_URL || ''
const BASE = `${API_URL}/api`

// ─── MODE DÉMO ───────────────────────────────────────────────

export const DEMO_KEY = 'sensia_demo'

export const isDemoMode = (): boolean =>
  typeof window !== 'undefined' && localStorage.getItem(DEMO_KEY) === '1'

export const enableDemoMode = () => {
  if (typeof window !== 'undefined') localStorage.setItem(DEMO_KEY, '1')
}

export const disableDemoMode = () => {
  if (typeof window !== 'undefined') localStorage.removeItem(DEMO_KEY)
}

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

export const getDashboard = () =>
  isDemoMode() ? Promise.resolve(DEMO_DASHBOARD) : request<DashboardData>('/dashboard')

// ─── CLIENTS ─────────────────────────────────────────────────

export const getClients = (params?: { status?: string; search?: string }) => {
  if (isDemoMode()) {
    let list = [...DEMO_CLIENTS]
    if (params?.status) list = list.filter(c => c.status === params.status)
    if (params?.search) {
      const q = params.search.toLowerCase()
      list = list.filter(c => c.name.toLowerCase().includes(q) || c.sector?.toLowerCase().includes(q))
    }
    return Promise.resolve(list)
  }
  return request<Client[]>(`/clients${buildQuery(params)}`)
}

export const getClient = (id: number) =>
  isDemoMode()
    ? Promise.resolve(DEMO_CLIENT_DETAILS[id] ?? { ...DEMO_CLIENTS.find(c => c.id === id)!, projects: [], contacts: [] } as ClientDetail)
    : request<ClientDetail>(`/clients/${id}`)

export const createClient = (data: ClientCreate) =>
  isDemoMode()
    ? Promise.resolve({ id: 99, slug: 'demo-new', projects_count: 0, status: 'prospect', type: 'entreprise', ...data } as Client)
    : request<Client>('/clients', { method: 'POST', body: JSON.stringify(data) })

export const updateClient = (id: number, data: Partial<ClientCreate>) =>
  isDemoMode()
    ? Promise.resolve({ ...DEMO_CLIENTS.find(c => c.id === id)!, ...data } as Client)
    : request<Client>(`/clients/${id}`, { method: 'PUT', body: JSON.stringify(data) })

export const deleteClient = (id: number) =>
  isDemoMode()
    ? Promise.resolve({ message: 'Suppression désactivée en mode démo' })
    : request<{ message: string }>(`/clients/${id}`, { method: 'DELETE' })

export const createContact = (data: ContactCreate) =>
  isDemoMode()
    ? Promise.resolve({ id: 99, name: data.name })
    : request<{ id: number; name: string }>('/contacts', {
        method: 'POST',
        body: JSON.stringify(data),
      })

// ─── PROJETS ─────────────────────────────────────────────────

export const getProjects = (params?: { status?: string; client_id?: number; search?: string }) => {
  if (isDemoMode()) {
    let list = [...DEMO_PROJECTS]
    if (params?.status) list = list.filter(p => p.status === params.status)
    if (params?.client_id) list = list.filter(p => p.client_id === params.client_id)
    if (params?.search) {
      const q = params.search.toLowerCase()
      list = list.filter(p => p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q))
    }
    return Promise.resolve(list)
  }
  return request<Project[]>(`/projects${buildQuery(params)}`)
}

export const getProject = (id: number) =>
  isDemoMode()
    ? Promise.resolve(DEMO_PROJECTS.find(p => p.id === id) ?? DEMO_PROJECTS[0])
    : request<Project>(`/projects/${id}`)

export const createProject = (data: ProjectCreate) =>
  isDemoMode()
    ? Promise.resolve({ id: 99, code: 'PRJ-DEMO-099', contract_signed: false, gdpr_done: false, phase: 1, status: 'en_cours', type: 'ia', ...data } as Project)
    : request<Project>('/projects', { method: 'POST', body: JSON.stringify(data) })

export const updateProject = (id: number, data: Partial<ProjectCreate>) =>
  isDemoMode()
    ? Promise.resolve({ ...DEMO_PROJECTS.find(p => p.id === id)!, ...data } as Project)
    : request<Project>(`/projects/${id}`, { method: 'PUT', body: JSON.stringify(data) })

export const deleteProject = (id: number) =>
  isDemoMode()
    ? Promise.resolve({ message: 'Suppression désactivée en mode démo' })
    : request<{ message: string }>(`/projects/${id}`, { method: 'DELETE' })

// ─── FACTURES ────────────────────────────────────────────────

export const getInvoices = (params?: { client_id?: number; status?: string }) => {
  if (isDemoMode()) {
    let list = [...DEMO_INVOICES]
    if (params?.client_id) list = list.filter(i => i.client_id === params.client_id)
    if (params?.status) list = list.filter(i => i.status === params.status)
    return Promise.resolve(list)
  }
  return request<Invoice[]>(`/invoices${buildQuery(params)}`)
}

export const createInvoice = (data: InvoiceCreate) =>
  isDemoMode()
    ? Promise.resolve({ id: 99, number: 'FAC-DEMO-099' })
    : request<{ id: number; number: string }>('/invoices', {
        method: 'POST',
        body: JSON.stringify(data),
      })

export const updateInvoiceStatus = (id: number, status: string) =>
  isDemoMode()
    ? Promise.resolve({ id, status })
    : request<{ id: number; status: string }>(`/invoices/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      })

// ─── CRM — PIPELINE ─────────────────────────────────────

export const getPipeline = () =>
  isDemoMode() ? Promise.resolve(DEMO_PIPELINE) : request<Record<string, Client[]>>('/pipeline')

export const updatePipelineStage = (clientId: number, pipeline_stage: string) =>
  isDemoMode()
    ? Promise.resolve({ id: clientId, pipeline_stage })
    : request<{ id: number; pipeline_stage: string }>(`/clients/${clientId}/pipeline`, {
        method: 'PATCH',
        body: JSON.stringify({ pipeline_stage }),
      })

// ─── CRM — ACTIVITÉS ────────────────────────────────────

export const getActivities = (params?: { client_id?: number; limit?: number }) => {
  if (isDemoMode()) {
    let list = [...DEMO_ACTIVITIES]
    if (params?.client_id) list = list.filter(a => a.client_id === params.client_id)
    if (params?.limit) list = list.slice(0, params.limit)
    return Promise.resolve(list)
  }
  return request<Activity[]>(`/activities${buildQuery(params)}`)
}

export const createActivity = (data: ActivityCreate) =>
  isDemoMode()
    ? Promise.resolve({ id: 99, created_at: new Date().toISOString(), ...data, type: data.type || 'appel' } as Activity)
    : request<Activity>('/activities', { method: 'POST', body: JSON.stringify(data) })

export const deleteActivity = (id: number) =>
  isDemoMode()
    ? Promise.resolve({ message: 'Suppression désactivée en mode démo' })
    : request<{ message: string }>(`/activities/${id}`, { method: 'DELETE' })

// ─── CRM — TÂCHES ───────────────────────────────────────

export const getTasks = (params?: { status?: string; client_id?: number }) => {
  if (isDemoMode()) {
    let list = [...DEMO_TASKS]
    if (params?.status) list = list.filter(t => t.status === params.status)
    if (params?.client_id) list = list.filter(t => t.client_id === params.client_id)
    return Promise.resolve(list)
  }
  return request<Task[]>(`/tasks${buildQuery(params)}`)
}

export const createTask = (data: TaskCreate) =>
  isDemoMode()
    ? Promise.resolve({ id: 99, type: 'autre', priority: 'normale', status: 'a_faire', created_at: new Date().toISOString(), ...data } as Task)
    : request<Task>('/tasks', { method: 'POST', body: JSON.stringify(data) })

export const updateTaskStatus = (id: number, status: string) =>
  isDemoMode()
    ? Promise.resolve({ ...DEMO_TASKS.find(t => t.id === id)!, status } as Task)
    : request<Task>(`/tasks/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) })

export const deleteTask = (id: number) =>
  isDemoMode()
    ? Promise.resolve({ message: 'Suppression désactivée en mode démo' })
    : request<{ message: string }>(`/tasks/${id}`, { method: 'DELETE' })

// ─── DIAGNOSTICS ────────────────────────────────────────────

export const getDiagnostics = (params?: { client_id?: number; type?: string; status?: string }) => {
  if (isDemoMode()) {
    let list = [...DEMO_DIAGNOSTICS]
    if (params?.client_id) list = list.filter(d => d.client_id === params.client_id)
    if (params?.type) list = list.filter(d => d.type === params.type)
    if (params?.status) list = list.filter(d => d.status === params.status)
    return Promise.resolve(list)
  }
  return request<DiagnosticItem[]>(`/diagnostics${buildQuery(params)}`)
}

export const getDiagnostic = (id: number) =>
  isDemoMode()
    ? Promise.resolve(DEMO_DIAGNOSTICS.find(d => d.id === id) ?? DEMO_DIAGNOSTICS[0])
    : request<DiagnosticItem>(`/diagnostics/${id}`)

export const createDiagnostic = (data: DiagnosticCreate) =>
  isDemoMode()
    ? Promise.resolve({ id: 99, status: 'en_cours', share_token: 'demo-token-new', created_at: new Date().toISOString(), ...data } as DiagnosticItem)
    : request<DiagnosticItem>('/diagnostics', { method: 'POST', body: JSON.stringify(data) })

export const updateDiagnostic = (id: number, data: DiagnosticUpdateData) =>
  isDemoMode()
    ? Promise.resolve({ ...DEMO_DIAGNOSTICS.find(d => d.id === id)!, ...data } as DiagnosticItem)
    : request<DiagnosticItem>(`/diagnostics/${id}`, { method: 'PUT', body: JSON.stringify(data) })

export const deleteDiagnostic = (id: number) =>
  isDemoMode()
    ? Promise.resolve({ message: 'Suppression désactivée en mode démo' })
    : request<{ message: string }>(`/diagnostics/${id}`, { method: 'DELETE' })

export const getSharedDiagnostic = (token: string) =>
  isDemoMode()
    ? Promise.resolve(DEMO_DIAGNOSTICS.find(d => d.share_token === token) ?? DEMO_DIAGNOSTICS[0])
    : request<DiagnosticItem>(`/diagnostics/share/${token}`)

export const getDiagnosticPdfUrl = (id: number) =>
  `${BASE}/diagnostics/${id}/pdf`

export const regenerateShareToken = (id: number) =>
  isDemoMode()
    ? Promise.resolve({ id, share_token: 'demo-token-regenerated' })
    : request<{ id: number; share_token: string }>(`/diagnostics/${id}/regenerate-token`, { method: 'POST' })

// ─── FICHIERS ────────────────────────────────────────────────

const DEMO_FILES: FileItem[] = [
  { name: 'Clients', path: 'Clients', is_dir: true, modified: '2026-03-01T10:00:00Z' },
  { name: 'TechVision SAS', path: 'Clients/TechVision SAS', is_dir: true, modified: '2026-02-15T10:00:00Z' },
  { name: 'Cabinet Dupont', path: 'Clients/Cabinet Dupont', is_dir: true, modified: '2025-11-20T10:00:00Z' },
  { name: 'MedConnect', path: 'Clients/MedConnect', is_dir: true, modified: '2026-01-10T10:00:00Z' },
  { name: 'Projets', path: 'Projets', is_dir: true, modified: '2026-03-10T10:00:00Z' },
  { name: 'PRJ-2025-001_TechVision_IA', path: 'Projets/PRJ-2025-001', is_dir: true, modified: '2026-03-10T10:00:00Z' },
  { name: 'PRJ-2025-002_Dupont_Cyber', path: 'Projets/PRJ-2025-002', is_dir: true, modified: '2025-10-15T10:00:00Z' },
  { name: 'Templates', path: 'Templates', is_dir: true, modified: '2025-08-01T10:00:00Z' },
  { name: 'Contrat_type_ACCESSIA_v2.docx', path: 'Templates/Contrat_type_ACCESSIA_v2.docx', is_dir: false, size: 45200, modified: '2025-08-01T10:00:00Z', extension: 'docx' },
  { name: 'Proposition_commerciale_IA.pptx', path: 'Templates/Proposition_commerciale_IA.pptx', is_dir: false, size: 2340000, modified: '2025-12-10T10:00:00Z', extension: 'pptx' },
]

export const browseRoot = () =>
  isDemoMode() ? Promise.resolve(DEMO_FILES.filter(f => !f.path.includes('/'))) : request<FileItem[]>('/files')

export const browseDir = (path: string) =>
  isDemoMode()
    ? Promise.resolve(DEMO_FILES.filter(f => f.path.startsWith(path + '/') && f.path.split('/').length === path.split('/').length + 1))
    : request<FileItem[]>(`/files/browse?path=${encodeURIComponent(path)}`)

export const readFile = (path: string) =>
  isDemoMode()
    ? Promise.resolve({ content: `# Fichier de démonstration\n\nCe fichier fait partie des données de démo ACCESSIA Pro.\n\nChemin : ${path}`, path })
    : request<{ content: string; path: string }>(`/files/read?path=${encodeURIComponent(path)}`)

// ─── ALERTES ─────────────────────────────────────────────────

export const getAlerts = () =>
  isDemoMode() ? Promise.resolve(DEMO_ALERTS) : request<AlertsData>('/alerts')

// ─── REPORTING ───────────────────────────────────────────────

export const getReporting = (params?: { period?: string; year?: number; month?: number }) =>
  isDemoMode() ? Promise.resolve(DEMO_REPORTING) : request<ReportingData>(`/reporting${buildQuery(params)}`)

// ─── DEVIS ───────────────────────────────────────────────────

export const getQuotes = (params?: { client_id?: number; status?: string }) => {
  if (isDemoMode()) {
    let list = [...DEMO_QUOTES]
    if (params?.client_id) list = list.filter(q => q.client_id === params.client_id)
    if (params?.status) list = list.filter(q => q.status === params.status)
    return Promise.resolve(list)
  }
  return request<Quote[]>(`/quotes${buildQuery(params)}`)
}

export const createQuote = (data: QuoteCreate) =>
  isDemoMode()
    ? Promise.resolve({ id: 99, number: 'ACC-DEV-2026-099', amount_ttc: data.amount_ht * 1.2, ...data } as Quote)
    : request<Quote>('/quotes', { method: 'POST', body: JSON.stringify(data) })

export const updateQuote = (id: number, data: QuoteCreate) =>
  isDemoMode()
    ? Promise.resolve({ ...DEMO_QUOTES.find(q => q.id === id)!, ...data } as Quote)
    : request<Quote>(`/quotes/${id}`, { method: 'PUT', body: JSON.stringify(data) })

export const updateQuoteStatus = (id: number, status: string) =>
  isDemoMode()
    ? Promise.resolve({ id, status })
    : request<{ id: number; status: string }>(`/quotes/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) })

export const convertQuoteToInvoice = (id: number) =>
  isDemoMode()
    ? Promise.resolve({ invoice_id: 99, invoice_number: 'ACC-2026-099' })
    : request<{ invoice_id: number; invoice_number: string }>(`/quotes/${id}/convert`, { method: 'POST' })

export const deleteQuote = (id: number) =>
  isDemoMode()
    ? Promise.resolve({ message: 'Suppression désactivée en mode démo' })
    : request<{ message: string }>(`/quotes/${id}`, { method: 'DELETE' })

// ─── SUIVI DU TEMPS ──────────────────────────────────────────

export const getTimeEntries = (params?: { project_id?: number; client_id?: number }) => {
  if (isDemoMode()) {
    let list = [...DEMO_TIME_ENTRIES]
    if (params?.project_id) list = list.filter(e => e.project_id === params.project_id)
    if (params?.client_id) list = list.filter(e => e.client_id === params.client_id)
    return Promise.resolve(list)
  }
  return request<TimeEntry[]>(`/time-entries${buildQuery(params)}`)
}

export const createTimeEntry = (data: TimeEntryCreate) =>
  isDemoMode()
    ? Promise.resolve({ id: 99, project_name: '', client_name: '', created_at: new Date().toISOString(), ...data } as TimeEntry)
    : request<TimeEntry>('/time-entries', { method: 'POST', body: JSON.stringify(data) })

export const deleteTimeEntry = (id: number) =>
  isDemoMode()
    ? Promise.resolve({ message: 'Suppression désactivée en mode démo' })
    : request<{ message: string }>(`/time-entries/${id}`, { method: 'DELETE' })

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

export interface Quote {
  id: number
  number: string
  client_id: number
  client_name?: string
  project_id?: number
  project_name?: string
  title: string
  amount_ht: number
  amount_ttc: number
  tva_rate: number
  status: string
  valid_until?: string
  description?: string
  notes?: string
  created_at?: string
  updated_at?: string
}

export interface QuoteCreate {
  client_id: number
  project_id?: number
  title: string
  amount_ht: number
  tva_rate?: number
  status?: string
  valid_until?: string
  description?: string
  notes?: string
}

export interface TimeEntry {
  id: number
  project_id: number
  project_name?: string
  client_id: number
  client_name?: string
  date?: string
  duration_minutes: number
  description?: string
  created_at?: string
}

export interface TimeEntryCreate {
  project_id: number
  client_id: number
  date?: string
  duration_minutes: number
  description?: string
}

export interface AlertsData {
  overdue_invoices: { id: number; number: string; client_name: string; amount_ttc: number; due_date?: string; days_late: number }[]
  overdue_tasks: { id: number; title: string; client_name: string; due_date?: string; days_late: number; priority: string }[]
  silent_clients: { id: number; name: string; pipeline_stage: string; last_activity_date?: string; days_silent: number }[]
  upcoming_deadlines: { type: string; id: number; title: string; due_date?: string; days_left: number }[]
}

export interface ReportingData {
  ca_by_month: { month: number; ca_ht: number; ca_ttc: number; nb_invoices: number }[]
  ca_by_client: { client_name: string; ca_ht: number; nb_projects: number }[]
  ca_by_type: { type: string; ca_ht: number }[]
  top_clients: { client_name: string; ca_ht: number; nb_projects: number }[]
}

import {
  DEMO_DASHBOARD, DEMO_CLIENTS, DEMO_CLIENT_DETAILS, DEMO_PROJECTS,
  DEMO_INVOICES, DEMO_ACTIVITIES, DEMO_TASKS, DEMO_DIAGNOSTICS, DEMO_PIPELINE,
  DEMO_QUOTES, DEMO_TIME_ENTRIES, DEMO_ALERTS, DEMO_REPORTING, DEMO_COMPANY_SEARCH,
} from './demo-data'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
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
  const method = (options?.method || 'GET').toUpperCase()
  const isGet = method === 'GET'
  const isFormData = typeof FormData !== 'undefined' && options?.body instanceof FormData
  const headers = new Headers(options?.headers || {})
  if (!isFormData && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  const setOfflineState = (next: boolean) => {
    isOffline = next
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('accessia-offline-status', { detail: { offline: next } }))
    }
  }

  if (isGet && typeof navigator !== 'undefined' && !navigator.onLine) {
    const cached = cacheGet<T>(path)
    if (cached) {
      setOfflineState(true)
      return cached
    }
  }

  try {
    const res = await fetch(`${BASE}${path}`, {
      ...options,
      headers,
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }))
      const detail = err.detail
      if (Array.isArray(detail)) {
        throw new Error(detail.map((d: any) => d.msg || JSON.stringify(d)).join(', '))
      }
      throw new Error(typeof detail === 'string' ? detail : JSON.stringify(detail) || 'Erreur réseau')
    }
    const data = await res.json()
    if (isGet) {
      cacheSet(path, data)
      setOfflineState(false)
    }
    return data
  } catch (error) {
    if (isGet) {
      const cached = cacheGet<T>(path)
      if (cached) {
        setOfflineState(true)
        return cached
      }
    }
    throw error
  }
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
  // Racine
  { name: '01_COMMERCIAL', path: '01_COMMERCIAL', is_dir: true, modified: '2026-03-15T10:00:00Z' },
  { name: '02_COMPTABILITE', path: '02_COMPTABILITE', is_dir: true, modified: '2026-03-01T10:00:00Z' },
  { name: '03_JURIDIQUE', path: '03_JURIDIQUE', is_dir: true, modified: '2026-01-20T10:00:00Z' },
  { name: '04_MARKETING', path: '04_MARKETING', is_dir: true, modified: '2026-02-10T10:00:00Z' },
  { name: '05_PROJETS', path: '05_PROJETS', is_dir: true, modified: '2026-03-18T10:00:00Z' },
  { name: '06_FORMATION', path: '06_FORMATION', is_dir: true, modified: '2025-12-01T10:00:00Z' },
  { name: '07_ADMINISTRATIF', path: '07_ADMINISTRATIF', is_dir: true, modified: '2026-01-05T10:00:00Z' },
  { name: 'CATALOGUE_OFFRES.md', path: 'CATALOGUE_OFFRES.md', is_dir: false, size: 3200, modified: '2026-03-20T10:00:00Z', extension: '.md' },
  // 01_COMMERCIAL
  { name: 'Clients', path: '01_COMMERCIAL/Clients', is_dir: true, modified: '2026-03-15T10:00:00Z' },
  { name: 'Prospects', path: '01_COMMERCIAL/Prospects', is_dir: true, modified: '2026-03-10T10:00:00Z' },
  { name: 'Partenaires', path: '01_COMMERCIAL/Partenaires', is_dir: true, modified: '2026-01-15T10:00:00Z' },
  // 01_COMMERCIAL/Clients
  { name: 'TechVision SAS', path: '01_COMMERCIAL/Clients/TechVision SAS', is_dir: true, modified: '2026-02-15T10:00:00Z' },
  { name: 'Cabinet Dupont', path: '01_COMMERCIAL/Clients/Cabinet Dupont', is_dir: true, modified: '2025-11-20T10:00:00Z' },
  { name: 'MedConnect', path: '01_COMMERCIAL/Clients/MedConnect', is_dir: true, modified: '2026-01-10T10:00:00Z' },
  { name: 'PROFIL_CLIENT.md', path: '01_COMMERCIAL/Clients/TechVision SAS/PROFIL_CLIENT.md', is_dir: false, size: 1850, modified: '2026-02-15T10:00:00Z', extension: '.md' },
  { name: 'Contrats', path: '01_COMMERCIAL/Clients/TechVision SAS/Contrats', is_dir: true, modified: '2026-02-15T10:00:00Z' },
  { name: 'Factures', path: '01_COMMERCIAL/Clients/TechVision SAS/Factures', is_dir: true, modified: '2026-02-15T10:00:00Z' },
  // 01_COMMERCIAL/Prospects
  { name: 'Agence Nord Conseil', path: '01_COMMERCIAL/Prospects/Agence Nord Conseil', is_dir: true, modified: '2026-03-10T10:00:00Z' },
  { name: 'BioTech Innov', path: '01_COMMERCIAL/Prospects/BioTech Innov', is_dir: true, modified: '2026-03-05T10:00:00Z' },
  // 02_COMPTABILITE
  { name: 'Factures', path: '02_COMPTABILITE/Factures', is_dir: true, modified: '2026-03-01T10:00:00Z' },
  { name: 'Devis', path: '02_COMPTABILITE/Devis', is_dir: true, modified: '2026-02-20T10:00:00Z' },
  { name: 'ACC-2026-001.md', path: '02_COMPTABILITE/Factures/ACC-2026-001.md', is_dir: false, size: 980, modified: '2026-01-15T10:00:00Z', extension: '.md' },
  { name: 'ACC-2026-002.md', path: '02_COMPTABILITE/Factures/ACC-2026-002.md', is_dir: false, size: 1020, modified: '2026-02-10T10:00:00Z', extension: '.md' },
  // 03_JURIDIQUE
  { name: 'Contrats', path: '03_JURIDIQUE/Contrats', is_dir: true, modified: '2026-01-20T10:00:00Z' },
  { name: 'RGPD', path: '03_JURIDIQUE/RGPD', is_dir: true, modified: '2026-01-20T10:00:00Z' },
  { name: 'Contrat_TechVision_2025.md', path: '03_JURIDIQUE/Contrats/Contrat_TechVision_2025.md', is_dir: false, size: 5400, modified: '2025-10-01T10:00:00Z', extension: '.md' },
  // 04_MARKETING
  { name: 'Templates', path: '04_MARKETING/Templates', is_dir: true, modified: '2026-02-10T10:00:00Z' },
  { name: 'Propositions', path: '04_MARKETING/Propositions', is_dir: true, modified: '2026-03-01T10:00:00Z' },
  // 05_PROJETS
  { name: '_TEMPLATE_PROJET', path: '05_PROJETS/_TEMPLATE_PROJET', is_dir: true, modified: '2025-08-01T10:00:00Z' },
  { name: 'PRJ-2025-001_TechVision_IA', path: '05_PROJETS/PRJ-2025-001_TechVision_IA', is_dir: true, modified: '2026-03-10T10:00:00Z' },
  { name: 'PRJ-2025-002_Dupont_Cyber', path: '05_PROJETS/PRJ-2025-002_Dupont_Cyber', is_dir: true, modified: '2025-10-15T10:00:00Z' },
  { name: 'README.md', path: '05_PROJETS/PRJ-2025-001_TechVision_IA/README.md', is_dir: false, size: 2100, modified: '2026-03-10T10:00:00Z', extension: '.md' },
]

export const browseRoot = () =>
  isDemoMode() ? Promise.resolve(DEMO_FILES.filter(f => !f.path.includes('/'))) : request<FileItem[]>('/files')

export const browseDir = (path: string) =>
  isDemoMode()
    ? Promise.resolve(DEMO_FILES.filter(f => f.path.startsWith(path + '/') && f.path.split('/').length === path.split('/').length + 1))
    : request<FileItem[]>(`/files/browse?path=${encodeURIComponent(path)}`)

export const searchFiles = (q: string, path?: string) =>
  isDemoMode()
    ? Promise.resolve(DEMO_FILES.filter(f => f.name.toLowerCase().includes(q.toLowerCase())).slice(0, 20))
    : request<FileItem[]>(`/files/search${buildQuery({ q, path })}`)

export const readFile = (path: string) =>
  isDemoMode()
    ? Promise.resolve({ content: `# Fichier de démonstration\n\nCe fichier fait partie des données de démo ACCESSIA Pro.\n\nChemin : ${path}`, path })
    : request<{ content: string; path: string }>(`/files/read?path=${encodeURIComponent(path)}`)

export const writeFile = (path: string, content: string) =>
  isDemoMode()
    ? Promise.resolve({ ok: true })
    : request<{ ok: boolean }>('/files/write', { method: 'POST', body: JSON.stringify({ path, content }) })

export const createFolder = (path: string | null, name: string) =>
  isDemoMode()
    ? Promise.resolve({ ok: true, item: { name, path: [path, name].filter(Boolean).join('/'), is_dir: true, modified: new Date().toISOString() } as FileItem })
    : request<FileMutationResult>('/files/mkdir', { method: 'POST', body: JSON.stringify({ path, name }) })

export const renameFilePath = (path: string, new_name: string) =>
  isDemoMode()
    ? Promise.resolve({ ok: true })
    : request<FileMutationResult>('/files/rename', { method: 'PATCH', body: JSON.stringify({ path, new_name }) })

export const deleteFilePath = (path: string) =>
  isDemoMode()
    ? Promise.resolve({ ok: true })
    : request<{ ok: boolean }>('/files/delete', { method: 'DELETE', body: JSON.stringify({ path }) })

export const uploadFileToPath = (path: string | null, file: File) => {
  if (isDemoMode()) {
    return Promise.resolve({
      ok: true,
      item: {
        name: file.name,
        path: [path, file.name].filter(Boolean).join('/'),
        is_dir: false,
        size: file.size,
        modified: new Date().toISOString(),
        extension: file.name.includes('.') ? `.${file.name.split('.').pop()}` : undefined,
      } as FileItem,
    })
  }
  const body = new FormData()
  if (path) body.append('path', path)
  body.append('upload', file)
  return request<FileMutationResult>('/files/upload', { method: 'POST', body })
}
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
    ? Promise.resolve({ id: 99, number: 'ACC-DEV-2026-099', amount_ttc: (data.amount_ht ?? 0) * 1.2, ...data } as Quote)
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
  address?: string
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
  type: 'cyber' | 'ia' | 'rgpd'
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
  type: 'cyber' | 'ia' | 'rgpd'
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

export interface FileMutationResult {
  ok: boolean
  item?: FileItem
}

export interface QuoteItem {
  name: string
  qty: number
  unit_price: number
  description?: string
}

export interface Quote {
  id: number
  number: string
  client_id: number
  client_name?: string
  client_address?: string
  project_id?: number
  project_name?: string
  title: string
  items: QuoteItem[]
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
  items?: QuoteItem[]
  amount_ht?: number
  tva_rate?: number
  status?: string
  valid_until?: string
  description?: string
  notes?: string
}

export interface TimeEntry {
  id: number
  project_id: number
  project_code?: string
  project_name?: string
  client_id?: number
  client_name?: string
  date?: string
  duration_minutes: number
  description?: string
  billable?: boolean
  cost?: number
  created_at?: string
}

export interface TimeEntryCreate {
  project_id: number
  client_id?: number
  date?: string
  duration_minutes: number
  description?: string
  billable?: boolean
  hourly_rate?: number
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

// ─── RECHERCHE ENTREPRISE ─────────────────────────────────────

export interface GrantInfo {
  id: string
  name: string
  description: string
  eligible: boolean
  confidence: 'high' | 'medium' | 'low'
  amount_label: string
  amount_max: number
  conditions_ok: string[]
  conditions_missing: string[]
  url: string
  deadline?: string | null
}

export interface CompanySearchResult {
  siren: string
  siret_siege: string
  name: string
  naf_code: string
  naf_label: string
  effectif_code: string
  effectif_label: string
  categorie: string
  status: 'actif' | 'cessé'
  date_creation: string | null
  address: string
  postal_code: string
  city: string
  region: string
  grants: GrantInfo[]
}

export const searchCompany = (q: string): Promise<{ results: CompanySearchResult[]; total: number }> =>
  isDemoMode()
    ? Promise.resolve(DEMO_COMPANY_SEARCH)
    : request<{ results: CompanySearchResult[]; total: number }>(`/search-company?q=${encodeURIComponent(q)}`)

// ─── PRESTATIONS ─────────────────────────────────────────────

export interface Prestation {
  id: string
  name: string
  category: string
  price_ht: number | null
  price_max?: number | null
  duration: string
  target: string
  active: boolean
  description: string
  deliverables?: string[]
  financing?: string[]
}

const DEMO_PRESTATIONS: Prestation[] = [
  { id: 'diag_standard', name: 'Diagnostic IA — Formule Standard', category: 'Diagnostic', price_ht: 3900, duration: '3 jours', target: 'Dirigeants, DSI, responsables opérationnels', active: true, description: "Rapport de diagnostic 15–20 pages : cartographie des processus, 5 opportunités IA prioritaires, évaluation maturité IA, roadmap 12–18 mois. Bonus : analyse RGPD + liste des aides (BPI, OPCO, France Num)." },
  { id: 'diag_approfondi', name: 'Diagnostic IA — Formule Approfondie', category: 'Diagnostic', price_ht: 7800, duration: '6 jours', target: 'Dirigeants, DSI, équipes dirigeantes', active: true, description: "Tout ce que comprend la Formule Standard + benchmark concurrents, étude de faisabilité technique, rencontres avec 3–5 parties prenantes, atelier de priorisation, fiche de projet N°1 prête à lancer." },
  { id: 'integration_starter', name: 'Intégration IA — Starter', category: 'Intégration', price_ht: 15000, duration: '6 à 10 semaines', target: 'PME avec cas d\'usage identifié, budget 15k–30k€', active: true, description: "Solution développée et déployée (RAG, chatbot, automatisation), documentation, formation (2h admins + 2h utilisateurs), 1 mois de support. Stack : Mistral local, VPS sécurisé 1ère année incluse." },
  { id: 'integration_professional', name: 'Intégration IA — Professional', category: 'Intégration', price_ht: 30000, duration: '10 à 20 semaines', target: 'PME avec projet IA complexe, budget 30k–80k€', active: true, description: "Tout Starter + architecture robuste, intégrations API (CRM/ERP), interface personnalisée, tableau de bord admin, formation avancée, 3 mois de support, audit sécurité OWASP." },
  { id: 'integration_enterprise', name: 'Intégration IA — Enterprise', category: 'Intégration', price_ht: 80000, duration: '20 à 40 semaines', target: 'Grands groupes, projets business-critical', active: true, description: "Projets complexes : multi-tenant, fine-tuning sur données propriétaires, intégration écosystème IT complet, gestion du changement. Proposition sur mesure après diagnostic." },
  { id: 'formation_a', name: 'Formation A — Sensibilisation IA Dirigeants & Managers', category: 'Formation', price_ht: 2500, duration: '1 jour (7h) — max 10 pers.', target: 'Dirigeants, managers', active: true, description: "Comprendre l'IA en 2026 sans jargon, vrais cas PME, enjeux RGPD et EU AI Act, identifier les 3 premières opportunités, feuille de route personnalisée. Financement OPCO/CPF." },
  { id: 'formation_b', name: 'Formation B — IA Pratique pour Collaborateurs', category: 'Formation', price_ht: 3500, duration: '2 jours (14h) — max 12 pers.', target: 'Collaborateurs opérationnels, équipes métier', active: true, description: "Jour 1 : outils IA du quotidien (LLMs, prompt engineering, RGPD, automatisation no-code). Jour 2 : cas pratiques sectoriels, atelier d'automatisation, plan d'action individuel. Financement OPCO." },
  { id: 'formation_c', name: 'Formation C — IA Technique pour Développeurs', category: 'Formation', price_ht: 5500, duration: '3 jours (21h) — max 8 dév.', target: 'Développeurs Python', active: true, description: "Jour 1 : LLM et API (Mistral, Ollama, LangChain). Jour 2 : RAG — système de recherche documentaire IA. Jour 3 : mise en production, sécurité, monitoring LLM." },
  { id: 'formation_d', name: 'Formation D — RGPD & IA pour les Équipes', category: 'Formation', price_ht: 1500, duration: '1/2 journée (3h30) — max 15 pers.', target: 'Toutes équipes, DPO', active: true, description: "Obligations RGPD dans le contexte IA, ce qu'on peut faire avec les données, procédures internes, exercices pratiques sur cas concrets." },
  { id: 'mco_essentiel', name: 'MCO Essentiel', category: 'Maintenance', price_ht: 500, duration: 'Abonnement mensuel (500–800 €/mois)', target: 'Solutions IA simples, budget limité', active: true, description: "Monitoring 24/7, mises à jour sécurité mensuelles, vérification sauvegardes, rapport mensuel, 4h de support/mois. SLA : incidents critiques en 4h (jours ouvrés)." },
  { id: 'mco_standard', name: 'MCO Standard', category: 'Maintenance', price_ht: 800, duration: 'Abonnement mensuel (800–1 500 €/mois)', target: 'Solutions IA en production active', active: true, description: "Tout MCO Essentiel + mises à jour applicatives, optimisation perf semestrielle, MAJ modèles IA, revue RGPD annuelle, accès Grafana, 8h de support/mois. SLA : critiques 2h, majeurs 8h." },
  { id: 'mco_premium', name: 'MCO Premium', category: 'Maintenance', price_ht: 1500, duration: 'Abonnement mensuel (1 500–3 000 €/mois)', target: 'Solutions business-critical, secteurs réglementés', active: true, description: "Tout MCO Standard + 2j de développement d'évolutions/mois, revue sécurité semestrielle, veille EU AI Act/RGPD, rapport trimestriel, réunion bilan trimestielle, 16h support/mois. SLA : critiques 1h (y compris J7)." },
  { id: 'pack_a', name: 'Pack PME IA Start A — Assistant IA sur vos Documents', category: 'Pack PME', price_ht: 4900, duration: '2–3 semaines', target: 'TPE, artisans, micro-entrepreneurs, petites PME', active: true, description: "RAG sur votre serveur ou cloud souverain, interface web, indexation jusqu'à 500 documents (PDF, Word, Excel), Mistral local, formation 1/2 journée, 3 mois de support. Vos données restent chez vous." },
  { id: 'pack_b', name: 'Pack PME IA Start B — Automatisation d\'une Tâche Répétitive', category: 'Pack PME', price_ht: 3900, duration: '2–3 semaines', target: 'TPE, artisans, micro-entrepreneurs, petites PME', active: true, description: "Automatiser une tâche précise : trier emails, extraire données de devis/factures, générer réponses clients récurrentes. Inclus : analyse et conception, développement, formation, 2 mois de support." },
  { id: 'pack_c', name: 'Pack PME IA Start C — Audit IA & Démarrage', category: 'Pack PME', price_ht: 1900, duration: '1 journée', target: 'TPE, artisans qui découvrent l\'IA', active: true, description: "Journée intensive : matin diagnostic et identification des opportunités, après-midi configuration d'outils IA gratuits (Ollama, Open WebUI, n8n). Livrable : plan d'action IA personnalisé 3 pages." },
]

export const getPrestations = () =>
  isDemoMode()
    ? Promise.resolve(DEMO_PRESTATIONS)
    : request<Prestation[]>('/prestations')

export const savePrestations = (items: Prestation[]) =>
  isDemoMode()
    ? Promise.resolve({ ok: true, count: items.length })
    : request<{ ok: boolean; count: number }>('/prestations', { method: 'PUT', body: JSON.stringify(items) })

export const getQuotePdfUrl = (id: number) => `${BASE}/quotes/${id}/pdf`

// ─── SAUVEGARDE ───────────────────────────────────────────────

export interface BackupInfo {
  name: string
  size: number
  created_at: string
}

export const createBackup = () =>
  isDemoMode()
    ? Promise.resolve({ timestamp: new Date().toISOString(), files: [], count: 0 })
    : request<{ timestamp: string; files: string[]; count: number }>('/backup/create', { method: 'POST' })

export const listBackups = () =>
  isDemoMode()
    ? Promise.resolve({ backups: [] as BackupInfo[], last_backup: null as string | null })
    : request<{ backups: BackupInfo[]; last_backup: string | null }>('/backup/list')

export const restoreBackup = (filename: string) =>
  request<{ message: string }>(`/backup/restore/${filename}`, { method: 'POST' })

// ─── MISE À JOUR ──────────────────────────────────────────────

export interface UpdateStatus {
  up_to_date: boolean
  commits_behind: number
  latest_message: string | null
  error?: string
}

export const checkUpdate = () =>
  isDemoMode()
    ? Promise.resolve({ up_to_date: true, commits_behind: 0, latest_message: null } as UpdateStatus)
    : request<UpdateStatus>('/update/check')

export const applyUpdate = () =>
  request<{ message: string; output: string }>('/update/apply', { method: 'POST' })

// ─── NOTIFICATIONS ─────────────────────────────────────────────

export interface NotificationItem {
  id: number
  type: string
  severity: 'critical' | 'warning' | 'info'
  entity_type?: string
  entity_id?: number
  title: string
  message?: string
  is_read: boolean
  created_at?: string
  updated_at?: string
  read_at?: string
}

export interface NotificationSummary {
  total: number
  unread: number
  critical: number
  warning: number
  info: number
}

export const getNotifications = (params?: { unread_only?: boolean; severity?: string; type?: string; limit?: number }) =>
  isDemoMode()
    ? Promise.resolve([] as NotificationItem[])
    : request<NotificationItem[]>(`/notifications${buildQuery(params)}`)

export const getNotificationSummary = () =>
  isDemoMode()
    ? Promise.resolve({ total: 0, unread: 0, critical: 0, warning: 0, info: 0 } as NotificationSummary)
    : request<NotificationSummary>('/notifications/summary')

export const checkNotifications = () =>
  isDemoMode()
    ? Promise.resolve({ count: 0 })
    : request<{ count: number }>('/notifications/check', { method: 'POST' })

export const markNotificationRead = (id: number) =>
  isDemoMode()
    ? Promise.resolve({ id })
    : request<{ id: number }>(`/notifications/${id}/read`, { method: 'PATCH' })

export const markAllNotificationsRead = () =>
  isDemoMode()
    ? Promise.resolve({ count: 0 })
    : request<{ count: number }>('/notifications/mark-all-read', { method: 'PATCH' })

export const deleteNotification = (id: number) =>
  isDemoMode()
    ? Promise.resolve({ message: 'OK' })
    : request<{ message: string }>(`/notifications/${id}`, { method: 'DELETE' })

// ─── MAINTENANCE ──────────────────────────────────────────────

export interface MaintenanceOverview {
  version: string
  paths: {
    base_dir: string
    repo_dir: string
    db_path: string
    catalogue_path: string
    backup_dir: string
  }
  counts: {
    clients: number
    projects: number
    quotes: number
    invoices: number
    tasks_open: number
    notifications_unread: number
    backups: number
  }
  last_backup: string | null
  last_backup_at: string | null
  git_repo_available: boolean
}

export const getMaintenanceOverview = () =>
  isDemoMode()
    ? Promise.resolve({
        version: '1.2.0',
        paths: { base_dir: '/', repo_dir: '/', db_path: '/tmp/demo.db', catalogue_path: '/tmp/CATALOGUE_OFFRES.md', backup_dir: '/tmp/backups' },
        counts: { clients: 0, projects: 0, quotes: 0, invoices: 0, tasks_open: 0, notifications_unread: 0, backups: 0 },
        last_backup: null,
        last_backup_at: null,
        git_repo_available: false,
      } as MaintenanceOverview)
    : request<MaintenanceOverview>('/maintenance/overview')

// ─── PORTAIL CLIENT ────────────────────────────────────────────

export interface ClientPortalData {
  client_name: string
  sector?: string
  projects: Array<{
    code: string
    name: string
    status: string
    phase_label: string
    phase: number
    progress_pct: number
    start_date?: string
    end_date?: string
  }>
  invoices: Array<{
    number: string
    amount_ttc: number
    status: string
    issued_date?: string
    due_date?: string
  }>
  diagnostics: Array<{
    type: 'cyber' | 'ia'
    title: string
    share_token: string
    global_score?: number
    created_at?: string
  }>
}

export const getClientPortal = (token: string) =>
  isDemoMode()
    ? Promise.resolve({ client_name: 'Client Démo', sector: 'PME', projects: [], invoices: [], diagnostics: [] } as ClientPortalData)
    : request<ClientPortalData>(`/portal/${token}`)

// ─── RGPD ──────────────────────────────────────────────────────

export interface RgpdDashboardData {
  stats: {
    total_projects: number
    conforme: number
    en_cours: number
    non_conforme: number
    taux_conformite: number
  }
  registre: Array<{
    project_id: number
    project_code: string
    project_name: string
    project_status: string
    client_name?: string
    rgpd_status: 'conforme' | 'en_cours' | 'non_conforme'
    gdpr_done: boolean
    gdpr_file_exists: boolean
  }>
}

export const getRgpdDashboard = () =>
  isDemoMode()
    ? Promise.resolve({ stats: { total_projects: 0, conforme: 0, en_cours: 0, non_conforme: 0, taux_conformite: 0 }, registre: [] } as RgpdDashboardData)
    : request<RgpdDashboardData>('/rgpd-dashboard')

// ─── TIME TRACKING (SUMMARY) ───────────────────────────────────

export interface TimeEntrySummary {
  project_id: number
  project_code: string
  project_name: string
  client_name?: string
  budget?: number
  total_hours: number
  billable_hours: number
  total_cost: number
  budget_consumed_pct: number
}

export const getTimeEntriesSummary = () =>
  isDemoMode()
    ? Promise.resolve([] as TimeEntrySummary[])
    : request<TimeEntrySummary[]>('/time-entries/summary')

// ─── SIGNATURE DEVIS ─────────────────────────────────────────

export interface QuoteSignData {
  id: number
  number: string
  title: string
  client_name: string
  amount_ht: number
  tva_rate: number
  amount_ttc: number
  description?: string
  items: Array<{ label: string; qty: number; unit_price: number; total?: number }>
  status: string
  valid_until?: string
  signed_at?: string
  signed_by?: string
  already_signed: boolean
}

export const getQuoteForSign = (token: string) =>
  request<QuoteSignData>(`/quotes/sign/${token}`)

export const signQuote = (token: string, signed_by: string) =>
  request<{ message: string; signed_by: string; signed_at: string }>(`/quotes/sign/${token}`, {
    method: 'POST',
    body: JSON.stringify({ signed_by }),
  })

// ─── TEMPLATES DEVIS ─────────────────────────────────────────

export const getQuoteTemplates = () =>
  request<Quote[]>('/quote-templates')

export const saveQuoteAsTemplate = (id: number, template_name: string) =>
  request<{ message: string; template_name: string }>(`/quotes/${id}/save-template`, {
    method: 'POST',
    body: JSON.stringify({ template_name }),
  })

// ─── TEMPLATES PROJET ────────────────────────────────────────

export interface ProjectTemplate {
  id: number
  name: string
  description?: string
  phases_json?: string
  created_at?: string
}

export const getProjectTemplates = () =>
  request<ProjectTemplate[]>('/project-templates')

export const createProjectTemplate = (data: { name: string; description?: string; phases_json?: string }) =>
  request<{ id: number }>('/project-templates', { method: 'POST', body: JSON.stringify(data) })

export const deleteProjectTemplate = (id: number) =>
  request<void>(`/project-templates/${id}`, { method: 'DELETE' })

// ─── FACTURATION RÉCURRENTE ───────────────────────────────────

export interface RecurringInvoice {
  id: number
  client_id: number
  client_name: string
  project_id?: number
  amount_ht: number
  tva_rate: number
  frequency: string
  next_billing_date: string
  active: boolean
  description?: string
  created_at?: string
}

export const getRecurringInvoices = () =>
  request<RecurringInvoice[]>('/recurring-invoices')

export const createRecurringInvoice = (data: {
  client_id: number
  project_id?: number
  amount_ht: number
  tva_rate?: number
  frequency: string
  next_billing_date: string
  description?: string
}) => request<{ id: number }>('/recurring-invoices', { method: 'POST', body: JSON.stringify(data) })

export const updateRecurringInvoice = (id: number, data: Partial<RecurringInvoice>) =>
  request<{ id: number; active: boolean }>(`/recurring-invoices/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  })

export const deleteRecurringInvoice = (id: number) =>
  request<void>(`/recurring-invoices/${id}`, { method: 'DELETE' })

// ─── NPS ─────────────────────────────────────────────────────

export interface NpsSurveyData {
  id: number
  project_name: string
  client_name: string
  score?: number
  comment?: string
  answered_at?: string
  already_answered: boolean
}

export interface NpsEntry {
  id: number
  project_id: number
  project_name: string
  client_name: string
  score?: number
  comment?: string
  share_token: string
  answered_at?: string
  created_at?: string
}

export interface NpsAverage {
  average?: number
  nps_score?: number
  count: number
  promoters: number
  detractors: number
  passives: number
}

export const getNpsSurvey = (token: string) =>
  request<NpsSurveyData>(`/nps/${token}`)

export const submitNps = (token: string, score: number, comment?: string) =>
  request<{ message: string }>(`/nps/${token}`, {
    method: 'POST',
    body: JSON.stringify({ score, comment }),
  })

export const getNpsList = () =>
  request<NpsEntry[]>('/nps')

export const getNpsAverage = () =>
  request<NpsAverage>('/nps/average')

// ─── EXPORT / IMPORT ─────────────────────────────────────────

export const exportClientsCsv = () => `${BASE}/export/clients`
export const exportInvoicesCsv = () => `${BASE}/export/invoices`
export const exportProjectsCsv = () => `${BASE}/export/projects`
export const exportCalendarIcs = () => `${BASE}/export/calendar`

export const importClientsCsv = async (file: File) => {
  const form = new FormData()
  form.append('file', file)
  const res = await fetch(`${BASE}/import/clients`, { method: 'POST', body: form })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || 'Erreur import')
  }
  return res.json() as Promise<{ created: number; errors: string[] }>
}

export const getCashflow = () =>
  request<{
    monthly_forecast: Array<{ month: string; label: string; encaisse: number; prevu: number }>
    margin_by_category: Array<{ type: string; ca: number }>
    rolling_12m_ca: number
  }>('/reporting/cashflow')

// ─── WEBHOOKS ────────────────────────────────────────────────

export interface WebhookItem {
  id: number
  url: string
  events: string[]
  active: boolean
  created_at?: string
}

export const getWebhooks = () =>
  request<WebhookItem[]>('/webhooks')

export const createWebhook = (data: { url: string; events: string[]; secret?: string }) =>
  request<{ id: number }>('/webhooks', { method: 'POST', body: JSON.stringify(data) })

export const updateWebhook = (id: number, data: { active?: boolean; events?: string[] }) =>
  request<{ id: number; active: boolean }>(`/webhooks/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  })

export const deleteWebhook = (id: number) =>
  request<void>(`/webhooks/${id}`, { method: 'DELETE' })

// ─── RECHERCHE GLOBALE ────────────────────────────────────────

export interface SearchResults {
  clients: Array<{ id: number; name: string; sector?: string; status: string }>
  projects: Array<{ id: number; code: string; name: string; client_name: string }>
  quotes: Array<{ id: number; number: string; title: string; client_name: string; status: string }>
  tasks: Array<{ id: number; title: string; status: string; priority: string; client_id?: number; project_id?: number }>
  diagnostics: Array<{ id: number; title: string; type: string; status: string; client_name?: string }>
  files: FileItem[]
}

export const globalSearch = (q: string) =>
  request<SearchResults>(`/search?q=${encodeURIComponent(q)}`)

// ─── CACHE / MODE HORS-LIGNE ──────────────────────────────────

const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

export let isOffline = false

function cacheKey(path: string) {
  return `accessia_cache_${path}`
}

function cacheGet<T>(path: string): T | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(cacheKey(path))
    if (!raw) return null
    const { data, ts } = JSON.parse(raw)
    if (Date.now() - ts > CACHE_TTL) return null
    return data as T
  } catch {
    return null
  }
}

function cacheSet(path: string, data: unknown) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(cacheKey(path), JSON.stringify({ data, ts: Date.now() }))
  } catch {
    // storage full — ignore
  }
}

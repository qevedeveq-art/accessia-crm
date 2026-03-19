'use client'

import { useEffect, useState } from 'react'
import {
  getPipeline, updatePipelineStage, getActivities, createActivity,
  getTasks, createTask, updateTaskStatus, deleteTask, deleteActivity,
  getClients, getInvoices, Client, Activity, Task, Invoice, ActivityCreate, TaskCreate,
} from '@/lib/api'
import Link from 'next/link'
import {
  Phone, Mail, Users2, StickyNote, Plus, X, Trash2,
  CheckCircle2, Clock, AlertTriangle, ArrowRight,
} from 'lucide-react'

// ─── CONSTANTES ──────────────────────────────────────────

const STAGES = [
  { key: 'nouveau', label: 'Nouveau', color: 'bg-gray-100 border-gray-200', dot: 'bg-gray-400' },
  { key: 'qualifie', label: 'Qualifié', color: 'bg-blue-50 border-blue-200', dot: 'bg-blue-500' },
  { key: 'proposition', label: 'Proposition', color: 'bg-violet-50 border-violet-200', dot: 'bg-violet-500' },
  { key: 'negociation', label: 'Négociation', color: 'bg-amber-50 border-amber-200', dot: 'bg-amber-500' },
  { key: 'gagne', label: 'Gagné', color: 'bg-green-50 border-green-200', dot: 'bg-green-500' },
  { key: 'perdu', label: 'Perdu', color: 'bg-red-50 border-red-200', dot: 'bg-red-400' },
]

const ACTIVITY_TYPES = [
  { key: 'appel', label: 'Appel', icon: Phone, color: 'text-blue-500' },
  { key: 'email', label: 'Email', icon: Mail, color: 'text-green-500' },
  { key: 'reunion', label: 'Réunion', icon: Users2, color: 'text-violet-500' },
  { key: 'note', label: 'Note', icon: StickyNote, color: 'text-amber-500' },
]

const PRIORITY_COLORS: Record<string, string> = {
  basse: 'bg-gray-100 text-gray-600',
  normal: 'bg-blue-100 text-blue-700',
  haute: 'bg-orange-100 text-orange-700',
  urgente: 'bg-red-100 text-red-700',
}

type Tab = 'pipeline' | 'activities' | 'tasks' | 'relances'

// ─── COMPOSANT PRINCIPAL ─────────────────────────────────

export default function CrmPage() {
  const [tab, setTab] = useState<Tab>('pipeline')
  const [pipeline, setPipeline] = useState<Record<string, Client[]>>({})
  const [activities, setActivities] = useState<Activity[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  // Modals
  const [showActivity, setShowActivity] = useState(false)
  const [showTask, setShowTask] = useState(false)

  const loadAll = async () => {
    setLoading(true)
    try {
      const [p, a, t, c] = await Promise.all([
        getPipeline().catch(() => ({})),
        getActivities({ limit: 50 }).catch(() => []),
        getTasks().catch(() => []),
        getClients().catch(() => []),
      ])
      setPipeline(p)
      setActivities(a)
      setTasks(t)
      setClients(c)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadAll() }, [])

  const moveClient = async (clientId: number, newStage: string) => {
    try {
      await updatePipelineStage(clientId, newStage)
      loadAll()
    } catch (e: any) { setError(e.message) }
  }

  if (loading) return <div className="p-8 text-gray-400 animate-pulse">Chargement du CRM…</div>

  const pendingTasks = tasks.filter(t => t.status !== 'fait')
  const doneTasks = tasks.filter(t => t.status === 'fait')

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">CRM</h1>
          <p className="text-sm text-gray-500 mt-0.5">Pipeline, activités & relances</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowActivity(true)}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-accessia-600 border border-accessia-200 rounded-lg hover:bg-accessia-50">
            <Plus size={14} /> Activité
          </button>
          <button onClick={() => setShowTask(true)}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium bg-accessia-600 text-white rounded-lg hover:bg-accessia-700">
            <Plus size={14} /> Tâche
          </button>
        </div>
      </div>

      {error && <div className="bg-red-50 text-red-700 border border-red-200 px-4 py-3 rounded-lg text-sm">{error}</div>}

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
        {([
          { key: 'pipeline' as Tab, label: 'Pipeline', count: clients.length },
          { key: 'activities' as Tab, label: 'Activités', count: activities.length },
          { key: 'tasks' as Tab, label: 'Tâches', count: pendingTasks.length },
          { key: 'relances' as Tab, label: 'Relances', count: null },
        ]).map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
              tab === t.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}>
            {t.label} {t.count !== null && <span className="ml-1 text-xs text-gray-400">{t.count}</span>}
          </button>
        ))}
      </div>

      {/* Pipeline Kanban */}
      {tab === 'pipeline' && (
        <div className="flex gap-3 overflow-x-auto pb-4">
          {STAGES.map(stage => {
            const stageClients = pipeline[stage.key] || []
            return (
              <div key={stage.key} className={`min-w-[220px] w-[220px] shrink-0 rounded-xl border p-3 ${stage.color}`}>
                <div className="flex items-center gap-2 mb-3">
                  <div className={`w-2.5 h-2.5 rounded-full ${stage.dot}`} />
                  <span className="text-sm font-semibold text-gray-700">{stage.label}</span>
                  <span className="ml-auto text-xs bg-white/80 text-gray-500 px-1.5 py-0.5 rounded-full">{stageClients.length}</span>
                </div>
                <div className="space-y-2">
                  {stageClients.map(c => (
                    <div key={c.id} className="bg-white rounded-lg p-3 shadow-sm border border-white hover:shadow-md transition-shadow group">
                      <Link href={`/clients/${c.id}`} className="block">
                        <p className="text-sm font-medium text-gray-900 truncate">{c.name}</p>
                        <p className="text-[11px] text-gray-400 mt-0.5">{c.type?.toUpperCase()} · {c.projects_count} projet(s)</p>
                        {c.budget_range && <p className="text-[11px] text-gray-400">{c.budget_range}</p>}
                      </Link>
                      {/* Move buttons */}
                      <div className="flex gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        {STAGES.filter(s => s.key !== stage.key).slice(0, 3).map(s => (
                          <button key={s.key} onClick={() => moveClient(c.id, s.key)}
                            title={`Déplacer vers ${s.label}`}
                            className="flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] rounded border border-gray-200 text-gray-500 hover:bg-gray-50">
                            <ArrowRight size={9} /> {s.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                  {stageClients.length === 0 && (
                    <div className="text-center py-6 text-xs text-gray-400">Aucun client</div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Activities Timeline */}
      {tab === 'activities' && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
          {activities.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <StickyNote size={40} className="mx-auto mb-3 opacity-40" />
              <p>Aucune activité enregistrée</p>
              <button onClick={() => setShowActivity(true)} className="mt-3 text-sm text-accessia-600 hover:underline">
                Ajouter une activité
              </button>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {activities.map(a => {
                const typeInfo = ACTIVITY_TYPES.find(t => t.key === a.type) || ACTIVITY_TYPES[3]
                const Icon = typeInfo.icon
                const clientName = clients.find(c => c.id === a.client_id)?.name || '—'
                return (
                  <div key={a.id} className="flex items-start gap-4 px-5 py-4 hover:bg-gray-50 group">
                    <div className={`mt-0.5 w-8 h-8 rounded-lg flex items-center justify-center bg-gray-50 ${typeInfo.color}`}>
                      <Icon size={15} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900">{a.title}</p>
                      {a.description && <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{a.description}</p>}
                      <div className="flex items-center gap-3 mt-1.5 text-[11px] text-gray-400">
                        <span>{a.date ? new Date(a.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}</span>
                        <span>·</span>
                        <span>{clientName}</span>
                        {a.duration_minutes && <><span>·</span><span>{a.duration_minutes} min</span></>}
                      </div>
                    </div>
                    <button onClick={async () => { await deleteActivity(a.id); loadAll() }}
                      className="opacity-0 group-hover:opacity-100 p-1.5 text-gray-300 hover:text-red-500 rounded">
                      <Trash2 size={13} />
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Tasks */}
      {tab === 'tasks' && (
        <div className="space-y-4">
          {/* Pending tasks */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
            <div className="px-5 py-3 border-b border-gray-100">
              <h3 className="text-sm font-semibold text-gray-700">À faire ({pendingTasks.length})</h3>
            </div>
            {pendingTasks.length === 0 ? (
              <div className="text-center py-10 text-gray-400 text-sm">Aucune tâche en cours</div>
            ) : (
              <div className="divide-y divide-gray-50">
                {pendingTasks.map(t => {
                  const isOverdue = t.due_date && new Date(t.due_date) < new Date() && t.status !== 'fait'
                  const clientName = clients.find(c => c.id === t.client_id)?.name
                  return (
                    <div key={t.id} className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50 group">
                      <button onClick={async () => { await updateTaskStatus(t.id, 'fait'); loadAll() }}
                        className="w-5 h-5 rounded-full border-2 border-gray-300 hover:border-green-500 hover:bg-green-50 shrink-0 transition-colors"
                        title="Marquer comme fait" />
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-medium ${isOverdue ? 'text-red-700' : 'text-gray-900'}`}>{t.title}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          {t.due_date && (
                            <span className={`text-[11px] flex items-center gap-0.5 ${isOverdue ? 'text-red-500' : 'text-gray-400'}`}>
                              {isOverdue && <AlertTriangle size={10} />}
                              {new Date(t.due_date).toLocaleDateString('fr-FR')}
                            </span>
                          )}
                          {clientName && <span className="text-[11px] text-gray-400">· {clientName}</span>}
                          <span className="text-[11px] text-gray-400">· {t.type}</span>
                        </div>
                      </div>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${PRIORITY_COLORS[t.priority] || PRIORITY_COLORS.normal}`}>
                        {t.priority}
                      </span>
                      <button onClick={async () => { await deleteTask(t.id); loadAll() }}
                        className="opacity-0 group-hover:opacity-100 p-1 text-gray-300 hover:text-red-500">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Completed tasks */}
          {doneTasks.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
              <div className="px-5 py-3 border-b border-gray-100">
                <h3 className="text-sm font-semibold text-gray-400">Terminées ({doneTasks.length})</h3>
              </div>
              <div className="divide-y divide-gray-50">
                {doneTasks.slice(0, 10).map(t => (
                  <div key={t.id} className="flex items-center gap-3 px-5 py-3 opacity-60 group">
                    <CheckCircle2 size={18} className="text-green-500 shrink-0" />
                    <div className="flex-1">
                      <p className="text-sm text-gray-500 line-through">{t.title}</p>
                    </div>
                    <button onClick={async () => { await deleteTask(t.id); loadAll() }}
                      className="opacity-0 group-hover:opacity-100 p-1 text-gray-300 hover:text-red-500">
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Relances */}
      {tab === 'relances' && <RelancesTab />}

      {/* Modal: Nouvelle Activité */}
      {showActivity && (
        <ActivityModal clients={clients} onClose={() => setShowActivity(false)} onSave={() => { setShowActivity(false); loadAll() }} />
      )}

      {/* Modal: Nouvelle Tâche */}
      {showTask && (
        <TaskModal clients={clients} onClose={() => setShowTask(false)} onSave={() => { setShowTask(false); loadAll() }} />
      )}
    </div>
  )
}

// ─── ONGLET RELANCES ─────────────────────────────────────

function RelancesTab() {
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [pipeline, setPipeline] = useState<Record<string, import('@/lib/api').Client[]>>({})
  const [loading, setLoading] = useState(true)
  const [confirmations, setConfirmations] = useState<Record<string, string>>({})

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const [inv, t, p] = await Promise.all([
        getInvoices({ status: 'envoyee' }).catch(() => []),
        getTasks().catch(() => []),
        getPipeline().catch(() => ({})),
      ])
      setInvoices(inv)
      setTasks(t)
      setPipeline(p)
      setLoading(false)
    }
    load()
  }, [])

  const confirm = (key: string, msg: string) => {
    setConfirmations(prev => ({ ...prev, [key]: msg }))
    setTimeout(() => setConfirmations(prev => { const next = { ...prev }; delete next[key]; return next }), 3000)
  }

  if (loading) return <div className="py-12 text-center text-gray-400 animate-pulse text-sm">Chargement des relances…</div>

  const now = new Date()
  const daysAgo = (dateStr: string) => Math.floor((now.getTime() - new Date(dateStr).getTime()) / 86400000)

  // Section 1: Factures impayées
  const overdueInvoices = invoices.filter(inv => inv.due_date && new Date(inv.due_date) < now)

  // Section 2: Tâches en retard
  const overdueTasks = tasks.filter(t => t.status !== 'fait' && t.due_date && new Date(t.due_date) < now)

  // Section 3: Leads silencieux
  const silentStages = ['gagne', 'perdu']
  const silentLeads = Object.entries(pipeline)
    .filter(([stage]) => !silentStages.includes(stage))
    .flatMap(([, clients]) => clients)

  return (
    <div className="space-y-6">
      {/* Section 1: Factures impayées */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
          <AlertTriangle size={15} className="text-red-500" />
          <h3 className="text-sm font-semibold text-gray-700">Factures impayées ({overdueInvoices.length})</h3>
        </div>
        {overdueInvoices.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-gray-400">Aucune facture en retard</div>
        ) : (
          <div className="divide-y divide-gray-50">
            {overdueInvoices.map(inv => {
              const days = daysAgo(inv.due_date!)
              const key = `inv-${inv.id}`
              return (
                <div key={inv.id} className="flex items-center gap-4 px-5 py-3 hover:bg-gray-50">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900">{inv.client_name || `Client #${inv.client_id}`}</p>
                    <div className="flex items-center gap-2 mt-0.5 text-[11px] text-gray-400">
                      <span>{inv.number}</span>
                      <span>·</span>
                      <span className="font-medium text-gray-700">{inv.amount_ttc.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}</span>
                      <span>·</span>
                      <span className="text-red-500 font-medium">{days} jour{days > 1 ? 's' : ''} de retard</span>
                    </div>
                  </div>
                  {confirmations[key] ? (
                    <span className="text-xs text-green-600 font-medium">{confirmations[key]}</span>
                  ) : (
                    <button
                      onClick={async () => {
                        await createActivity({ client_id: inv.client_id, type: 'email', title: `Relance ${inv.number}`, date: new Date().toISOString() })
                        confirm(key, 'Relance enregistrée')
                      }}
                      className="shrink-0 px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 hover:border-gray-300">
                      Enregistrer relance
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Section 2: Tâches en retard */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
          <Clock size={15} className="text-orange-500" />
          <h3 className="text-sm font-semibold text-gray-700">Tâches en retard ({overdueTasks.length})</h3>
        </div>
        {overdueTasks.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-gray-400">Aucune tâche en retard</div>
        ) : (
          <div className="divide-y divide-gray-50">
            {overdueTasks.map(t => {
              const days = daysAgo(t.due_date!)
              const key = `task-${t.id}`
              return (
                <div key={t.id} className="flex items-center gap-4 px-5 py-3 hover:bg-gray-50">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900">{t.title}</p>
                    <div className="flex items-center gap-2 mt-0.5 text-[11px] text-gray-400">
                      {t.client_id && <span>Client #{t.client_id}</span>}
                      {t.client_id && <span>·</span>}
                      <span className={`px-1.5 py-0.5 rounded font-medium ${PRIORITY_COLORS[t.priority] || PRIORITY_COLORS.normal}`}>{t.priority}</span>
                      <span>·</span>
                      <span className="text-orange-500 font-medium">{days} jour{days > 1 ? 's' : ''} de retard</span>
                    </div>
                  </div>
                  {confirmations[key] ? (
                    <span className="text-xs text-green-600 font-medium">{confirmations[key]}</span>
                  ) : (
                    <button
                      onClick={async () => {
                        await updateTaskStatus(t.id, 'fait')
                        setTasks(prev => prev.filter(task => task.id !== t.id))
                        confirm(key, 'Marquée comme faite')
                      }}
                      className="shrink-0 px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 hover:border-gray-300">
                      Marquer fait
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Section 3: Leads silencieux */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
          <StickyNote size={15} className="text-violet-500" />
          <h3 className="text-sm font-semibold text-gray-700">Leads silencieux ({silentLeads.length})</h3>
        </div>
        {silentLeads.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-gray-400">Aucun lead silencieux</div>
        ) : (
          <div className="divide-y divide-gray-50">
            {silentLeads.map(c => {
              const key = `lead-${c.id}`
              const stageLabel = STAGES.find(s => s.key === c.pipeline_stage)?.label || c.pipeline_stage || '—'
              const dueDate = new Date(now.getTime() + 7 * 86400000).toISOString().slice(0, 10)
              return (
                <div key={c.id} className="flex items-center gap-4 px-5 py-3 hover:bg-gray-50">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900">{c.name}</p>
                    <div className="flex items-center gap-2 mt-0.5 text-[11px] text-gray-400">
                      <span>{stageLabel}</span>
                      <span>·</span>
                      <span>Dernier contact : inconnu</span>
                    </div>
                  </div>
                  {confirmations[key] ? (
                    <span className="text-xs text-green-600 font-medium">{confirmations[key]}</span>
                  ) : (
                    <button
                      onClick={async () => {
                        await createTask({ client_id: c.id, title: `Reprendre contact avec ${c.name}`, type: 'relance', due_date: dueDate })
                        confirm(key, 'Contact programmé')
                      }}
                      className="shrink-0 px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 hover:border-gray-300">
                      Programmer contact
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── MODAL ACTIVITÉ ─────────────────────────────────────

function ActivityModal({ clients, onClose, onSave }: { clients: Client[]; onClose: () => void; onSave: () => void }) {
  const [form, setForm] = useState<ActivityCreate>({ client_id: 0, type: 'appel', title: '' })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const set = (k: keyof ActivityCreate, v: any) => setForm(f => ({ ...f, [k]: v }))

  const submit = async () => {
    if (!form.client_id) { setErr('Sélectionnez un client'); return }
    if (!form.title.trim()) { setErr('Titre requis'); return }
    setSaving(true); setErr('')
    try {
      await createActivity(form)
      onSave()
    } catch (e: any) { setErr(e.message) } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="p-5 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-lg font-bold">Nouvelle activité</h2>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-700"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-4">
          {err && <div className="bg-red-50 text-red-700 border border-red-200 px-3 py-2 rounded-lg text-sm">{err}</div>}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Client *</label>
            <select value={form.client_id} onChange={e => set('client_id', Number(e.target.value))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-accessia-300 outline-none">
              <option value={0}>— Sélectionner —</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
            <div className="flex gap-2">
              {ACTIVITY_TYPES.map(t => (
                <button key={t.key} onClick={() => set('type', t.key)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm border transition-colors ${
                    form.type === t.key ? 'border-accessia-300 bg-accessia-50 text-accessia-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}>
                  <t.icon size={13} /> {t.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Titre *</label>
            <input value={form.title} onChange={e => set('title', e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-accessia-300 outline-none"
              placeholder="Ex: Appel de suivi proposition" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea value={form.description || ''} onChange={e => set('description', e.target.value)} rows={2}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-accessia-300 outline-none resize-none"
              placeholder="Résumé de l'échange…" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
              <input type="datetime-local" value={form.date?.slice(0, 16) || ''} onChange={e => set('date', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-accessia-300 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Durée (min)</label>
              <input type="number" value={form.duration_minutes || ''} onChange={e => set('duration_minutes', Number(e.target.value))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-accessia-300 outline-none"
                placeholder="30" />
            </div>
          </div>
        </div>
        <div className="p-5 border-t border-gray-100 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">Annuler</button>
          <button onClick={submit} disabled={saving}
            className="px-5 py-2 bg-accessia-600 text-white rounded-lg text-sm font-medium hover:bg-accessia-700 disabled:opacity-60">
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── MODAL TÂCHE ────────────────────────────────────────

function TaskModal({ clients, onClose, onSave }: { clients: Client[]; onClose: () => void; onSave: () => void }) {
  const [form, setForm] = useState<TaskCreate>({ title: '', type: 'relance', priority: 'normal' })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const set = (k: keyof TaskCreate, v: any) => setForm(f => ({ ...f, [k]: v }))

  const submit = async () => {
    if (!form.title.trim()) { setErr('Titre requis'); return }
    setSaving(true); setErr('')
    try {
      await createTask(form)
      onSave()
    } catch (e: any) { setErr(e.message) } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="p-5 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-lg font-bold">Nouvelle tâche</h2>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-700"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-4">
          {err && <div className="bg-red-50 text-red-700 border border-red-200 px-3 py-2 rounded-lg text-sm">{err}</div>}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Titre *</label>
            <input value={form.title} onChange={e => set('title', e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-accessia-300 outline-none"
              placeholder="Ex: Relancer TechCorp pour proposition" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Client (optionnel)</label>
            <select value={form.client_id || 0} onChange={e => set('client_id', Number(e.target.value) || undefined)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-accessia-300 outline-none">
              <option value={0}>— Aucun —</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
              <select value={form.type} onChange={e => set('type', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-accessia-300 outline-none">
                <option value="relance">Relance</option>
                <option value="rappel">Rappel</option>
                <option value="tache">Tâche</option>
                <option value="suivi">Suivi</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Priorité</label>
              <select value={form.priority} onChange={e => set('priority', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-accessia-300 outline-none">
                <option value="basse">Basse</option>
                <option value="normal">Normale</option>
                <option value="haute">Haute</option>
                <option value="urgente">Urgente</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Échéance</label>
            <input type="date" value={form.due_date?.slice(0, 10) || ''} onChange={e => set('due_date', e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-accessia-300 outline-none" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea value={form.description || ''} onChange={e => set('description', e.target.value)} rows={2}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-accessia-300 outline-none resize-none"
              placeholder="Détails supplémentaires…" />
          </div>
        </div>
        <div className="p-5 border-t border-gray-100 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">Annuler</button>
          <button onClick={submit} disabled={saving}
            className="px-5 py-2 bg-accessia-600 text-white rounded-lg text-sm font-medium hover:bg-accessia-700 disabled:opacity-60">
            {saving ? 'Création…' : 'Créer la tâche'}
          </button>
        </div>
      </div>
    </div>
  )
}

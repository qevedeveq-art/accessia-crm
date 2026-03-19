'use client'

import { useEffect, useState } from 'react'
import {
  getClient, updateClient, ClientDetail,
  getActivities, getInvoices, getProjects, getDiagnostics,
  Activity, Invoice, Project, DiagnosticItem,
} from '@/lib/api'
import Link from 'next/link'
import { ArrowLeft, ExternalLink, Folder, Edit2, Check, X } from 'lucide-react'

const PHASE_LABELS = [
  'Découverte', 'Diagnostic', 'Proposition', 'Setup RGPD',
  'Développement', 'Tests', 'Déploiement', 'MCO',
]

function StatusBadge({ v }: { v: string }) {
  const cls: Record<string, string> = {
    prospect: 'badge-prospect', active: 'badge-active', inactive: 'badge-inactive',
    en_cours: 'badge-en_cours', termine: 'badge-termine',
  }
  return <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${cls[v] ?? 'bg-gray-100 text-gray-600'}`}>{v.replace('_', ' ')}</span>
}

type ClientTab = 'infos' | 'timeline'

export default function ClientPage({ params }: { params: { id: string } }) {
  const [client, setClient] = useState<ClientDetail | null>(null)
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState<Partial<ClientDetail>>({})
  const [saving, setSaving] = useState(false)
  const [tab, setTab] = useState<ClientTab>('infos')

  const load = () => getClient(Number(params.id)).then(c => { setClient(c); setForm(c) })
  useEffect(() => { load() }, [params.id])

  const save = async () => {
    setSaving(true)
    await updateClient(Number(params.id), form)
    setSaving(false)
    setEditing(false)
    load()
  }

  if (!client) return <div className="p-8 text-gray-400 animate-pulse">Chargement…</div>

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))
  const field = (k: keyof ClientDetail, label: string, placeholder = '') => (
    <div>
      <p className="text-xs text-gray-400 font-medium mb-1">{label}</p>
      {editing ? (
        <input
          value={(form[k] as string) ?? ''}
          onChange={e => set(k, e.target.value)}
          placeholder={placeholder}
          className="w-full text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-accessia-300 outline-none"
        />
      ) : (
        <p className="text-sm text-gray-800">{(client[k] as string) || <span className="text-gray-400">—</span>}</p>
      )}
    </div>
  )

  return (
    <div className="p-6 max-w-5xl">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 mb-6">
        <Link href="/clients" className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900">
          <ArrowLeft size={14} /> Clients
        </Link>
        <span className="text-gray-300">/</span>
        <span className="text-sm font-medium text-gray-800">{client.name}</span>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-accessia-100 text-accessia-700 flex items-center justify-center text-xl font-bold">
            {client.name[0].toUpperCase()}
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{client.name}</h1>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xs text-gray-500 uppercase font-medium">{client.type}</span>
              {client.sector && <span className="text-xs text-gray-400">· {client.sector}</span>}
              <StatusBadge v={client.status} />
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {client.folder_path && (
            <button
              title="Ouvrir le dossier"
              className="p-2 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <Folder size={16} />
            </button>
          )}
          {editing ? (
            <>
              <button onClick={() => { setEditing(false); setForm(client) }}
                className="flex items-center gap-1 px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 rounded-lg hover:bg-gray-100">
                <X size={14} /> Annuler
              </button>
              <button onClick={save} disabled={saving}
                className="flex items-center gap-1 px-3 py-1.5 bg-accessia-600 text-white rounded-lg text-sm hover:bg-accessia-700 disabled:opacity-60">
                <Check size={14} /> {saving ? 'Enregistrement…' : 'Enregistrer'}
              </button>
            </>
          ) : (
            <button onClick={() => setEditing(true)}
              className="flex items-center gap-1 px-3 py-1.5 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">
              <Edit2 size={14} /> Modifier
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit mb-6">
        {([
          { key: 'infos' as ClientTab, label: 'Informations' },
          { key: 'timeline' as ClientTab, label: 'Timeline 360°' },
        ]).map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
              tab === t.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'infos' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Infos */}
          <div className="lg:col-span-2 space-y-4">
            <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
              <h2 className="font-semibold text-gray-800 mb-4">Informations</h2>
              <div className="grid grid-cols-2 gap-4">
                {field('contact_name', 'Contact principal')}
                {field('contact_email', 'Email', 'contact@société.fr')}
                {field('contact_phone', 'Téléphone', '06 00 00 00 00')}
                {field('website', 'Site web', 'https://…')}
                {field('siret', 'SIRET', '123 456 789 00012')}
                {field('address', 'Adresse', '1 rue …')}
                {field('source', 'Source')}
                {field('budget_range', 'Budget estimé')}
              </div>
              {(editing || client.notes) && (
                <div className="mt-4">
                  <p className="text-xs text-gray-400 font-medium mb-1">Notes</p>
                  {editing ? (
                    <textarea
                      value={(form.notes as string) ?? ''}
                      onChange={e => set('notes', e.target.value)}
                      rows={3}
                      className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-accessia-300 outline-none resize-none"
                    />
                  ) : (
                    <p className="text-sm text-gray-700 whitespace-pre-wrap">{client.notes}</p>
                  )}
                </div>
              )}
            </div>

            {/* Contacts */}
            {client.contacts.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
                <h2 className="font-semibold text-gray-800 mb-4">Contacts ({client.contacts.length})</h2>
                <div className="space-y-3">
                  {client.contacts.map(c => (
                    <div key={c.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                      <div>
                        <p className="text-sm font-medium">{c.name}</p>
                        <p className="text-xs text-gray-400">{c.role || '—'} · {c.email || '—'}</p>
                      </div>
                      {c.is_primary && (
                        <span className="text-xs bg-accessia-50 text-accessia-700 px-2 py-0.5 rounded border border-accessia-200">Principal</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Sidebar droite */}
          <div className="space-y-4">
            {/* Projets */}
            <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-semibold text-gray-800">Projets ({client.projects.length})</h2>
                <Link href={`/projects?client_id=${client.id}`} className="text-xs text-accessia-500 hover:underline">Voir tout</Link>
              </div>
              {client.projects.length === 0 && (
                <p className="text-sm text-gray-400">Aucun projet</p>
              )}
              {client.projects.map(p => (
                <Link key={p.id} href={`/projects/${p.id}`}
                  className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0 hover:bg-gray-50 -mx-2 px-2 rounded">
                  <div>
                    <p className="text-sm font-medium">{p.name}</p>
                    <p className="text-xs text-gray-400">{p.code} · Phase {p.phase}</p>
                  </div>
                  <StatusBadge v={p.status} />
                </Link>
              ))}
            </div>

            {/* Dossier */}
            {client.folder_path && (
              <div className="bg-gray-50 rounded-xl border border-gray-100 p-4">
                <p className="text-xs font-medium text-gray-500 mb-1.5">Dossier client</p>
                <p className="text-xs text-gray-600 break-all font-mono">{client.folder_path}</p>
                <Link href={`/files?path=${encodeURIComponent(client.folder_path)}`}
                  className="mt-2 flex items-center gap-1 text-xs text-accessia-600 hover:underline">
                  <ExternalLink size={11} /> Ouvrir dans l'explorateur
                </Link>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'timeline' && (
        <TimelineTab clientId={Number(params.id)} />
      )}
    </div>
  )
}

// ─── TIMELINE 360° ───────────────────────────────────────

interface TimelineEvent {
  date: string
  type: string
  title: string
  icon: string
  color: string
}

function activityIcon(type: string): string {
  if (type === 'appel') return '📞'
  if (type === 'email') return '📧'
  if (type === 'reunion') return '🤝'
  return '📝'
}

function invoiceColor(status: string): string {
  if (status === 'payee') return 'border-green-300'
  if (status === 'envoyee') return 'border-blue-300'
  return 'border-gray-300'
}

function TimelineTab({ clientId }: { clientId: number }) {
  const [events, setEvents] = useState<TimelineEvent[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const [activities, invoices, projects, diagnostics] = await Promise.all([
        getActivities({ client_id: clientId }).catch((): Activity[] => []),
        getInvoices({ client_id: clientId }).catch((): Invoice[] => []),
        getProjects({ client_id: clientId }).catch((): Project[] => []),
        getDiagnostics({ client_id: clientId }).catch((): DiagnosticItem[] => []),
      ])

      const merged: TimelineEvent[] = [
        ...activities.map(a => ({
          date: a.date || a.created_at || '',
          type: 'activity',
          title: a.title,
          icon: activityIcon(a.type),
          color: 'border-blue-300',
        })),
        ...invoices.map(inv => ({
          date: inv.issued_date || inv.created_at || '',
          type: 'invoice',
          title: `Facture ${inv.number} — ${inv.amount_ttc.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })} (${inv.status})`,
          icon: '💰',
          color: invoiceColor(inv.status),
        })),
        ...projects.map(p => ({
          date: p.start_date || p.created_at || '',
          type: 'project',
          title: `Projet ${p.name} (${p.status.replace('_', ' ')})`,
          icon: '📁',
          color: 'border-violet-300',
        })),
        ...diagnostics.map(d => ({
          date: d.created_at || '',
          type: 'diagnostic',
          title: `Diagnostic ${d.type.toUpperCase()} — ${d.title}`,
          icon: '📋',
          color: 'border-orange-300',
        })),
      ]

      merged.sort((a, b) => {
        if (!a.date) return 1
        if (!b.date) return -1
        return new Date(b.date).getTime() - new Date(a.date).getTime()
      })

      setEvents(merged)
      setLoading(false)
    }
    load()
  }, [clientId])

  if (loading) return <div className="py-12 text-center text-gray-400 animate-pulse text-sm">Chargement de la timeline…</div>

  if (events.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-100 p-10 text-center shadow-sm">
        <p className="text-gray-400 text-sm">Aucun événement enregistré pour ce client</p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-6 shadow-sm">
      <h2 className="font-semibold text-gray-800 mb-6">Timeline 360° ({events.length} événements)</h2>
      <div className="space-y-0">
        {events.map((ev, i) => (
          <div key={i} className="flex gap-3 pb-4 border-l-2 border-gray-100 ml-3 pl-4 relative">
            <span className="absolute -left-2 w-4 h-4 rounded-full bg-white border-2 border-gray-200 flex items-center justify-center text-xs">{ev.icon}</span>
            <div>
              <p className="text-sm font-medium text-gray-800">{ev.title}</p>
              <p className="text-xs text-gray-400">
                {ev.date
                  ? new Date(ev.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
                  : 'Date inconnue'}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

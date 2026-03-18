'use client'

import { useEffect, useState } from 'react'
import { getClient, updateClient, ClientDetail } from '@/lib/api'
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

export default function ClientPage({ params }: { params: { id: string } }) {
  const [client, setClient] = useState<ClientDetail | null>(null)
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState<Partial<ClientDetail>>({})
  const [saving, setSaving] = useState(false)

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
          className="w-full text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-sensia-300 outline-none"
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
          <div className="w-14 h-14 rounded-full bg-sensia-100 text-sensia-700 flex items-center justify-center text-xl font-bold">
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
                className="flex items-center gap-1 px-3 py-1.5 bg-sensia-600 text-white rounded-lg text-sm hover:bg-sensia-700 disabled:opacity-60">
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
                    className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-sensia-300 outline-none resize-none"
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
                      <span className="text-xs bg-sensia-50 text-sensia-700 px-2 py-0.5 rounded border border-sensia-200">Principal</span>
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
              <Link href={`/projects?client_id=${client.id}`} className="text-xs text-sensia-500 hover:underline">Voir tout</Link>
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
                className="mt-2 flex items-center gap-1 text-xs text-sensia-600 hover:underline">
                <ExternalLink size={11} /> Ouvrir dans l'explorateur
              </Link>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}

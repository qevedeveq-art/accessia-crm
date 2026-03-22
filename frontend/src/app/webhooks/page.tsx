'use client'

import { useEffect, useState } from 'react'
import { getWebhooks, createWebhook, updateWebhook, deleteWebhook } from '@/lib/api'
import { Webhook, Plus, Trash2, CheckCircle2, XCircle } from 'lucide-react'

const AVAILABLE_EVENTS = [
  'quote.accepted',
  'invoice.paid',
  'project.created',
  'client.created',
]

export default function WebhooksPage() {
  const [hooks, setHooks] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [newUrl, setNewUrl] = useState('')
  const [newEvents, setNewEvents] = useState<string[]>(['quote.accepted'])
  const [newSecret, setNewSecret] = useState('')
  const [saving, setSaving] = useState(false)

  const load = () => getWebhooks().then(setHooks).finally(() => setLoading(false))
  useEffect(() => { load() }, [])

  const handleCreate = async () => {
    if (!newUrl.trim() || newEvents.length === 0) return
    setSaving(true)
    try {
      await createWebhook({ url: newUrl.trim(), events: newEvents, secret: newSecret.trim() || undefined })
      await load()
      setNewUrl(''); setNewEvents(['quote.accepted']); setNewSecret(''); setShowCreate(false)
    } finally {
      setSaving(false)
    }
  }

  const handleToggle = async (id: number, active: boolean) => {
    await updateWebhook(id, { active: !active })
    setHooks(prev => prev.map(h => h.id === id ? { ...h, active: !active } : h))
  }

  const handleDelete = async (id: number) => {
    if (!confirm('Supprimer ce webhook ?')) return
    await deleteWebhook(id)
    setHooks(prev => prev.filter(h => h.id !== id))
  }

  const toggleEvent = (e: string) =>
    setNewEvents(prev => prev.includes(e) ? prev.filter(x => x !== e) : [...prev, e])

  if (loading) return <div className="p-8 text-gray-500">Chargement...</div>

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Webhook size={24} className="text-blue-600" />
          <h1 className="text-2xl font-bold text-gray-900">Webhooks</h1>
        </div>
        <button onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
          <Plus size={16} /> Nouveau webhook
        </button>
      </div>

      {showCreate && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-5 mb-6">
          <h3 className="font-medium text-gray-900 mb-4">Créer un webhook</h3>
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">URL *</label>
              <input value={newUrl} onChange={e => setNewUrl(e.target.value)} placeholder="https://example.com/webhook"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Événements *</label>
              <div className="flex flex-wrap gap-2">
                {AVAILABLE_EVENTS.map(ev => (
                  <button key={ev} onClick={() => toggleEvent(ev)}
                    className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${newEvents.includes(ev) ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400'}`}>
                    {ev}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Secret HMAC (optionnel)</label>
              <input value={newSecret} onChange={e => setNewSecret(e.target.value)} placeholder="secret_key"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button onClick={handleCreate} disabled={saving}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
              {saving ? 'Création...' : 'Créer'}
            </button>
            <button onClick={() => setShowCreate(false)}
              className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">Annuler</button>
          </div>
        </div>
      )}

      {hooks.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <Webhook size={48} className="mx-auto mb-3 opacity-30" />
          <p>Aucun webhook configuré.</p>
          <p className="text-sm mt-1">Les webhooks permettent de notifier vos outils externes en temps réel.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {hooks.map(h => (
            <div key={h.id} className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    {h.active ? (
                      <CheckCircle2 size={14} className="text-green-500 flex-shrink-0" />
                    ) : (
                      <XCircle size={14} className="text-gray-400 flex-shrink-0" />
                    )}
                    <p className="text-sm font-mono text-gray-700 truncate">{h.url}</p>
                  </div>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {(h.events || []).map((ev: string) => (
                      <span key={ev} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{ev}</span>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button onClick={() => handleToggle(h.id, h.active)}
                    className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${h.active ? 'bg-gray-100 text-gray-600 hover:bg-gray-200' : 'bg-green-100 text-green-700 hover:bg-green-200'}`}>
                    {h.active ? 'Désactiver' : 'Activer'}
                  </button>
                  <button onClick={() => handleDelete(h.id)}
                    className="text-gray-400 hover:text-red-500 transition-colors">
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

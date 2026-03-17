'use client'

import { useEffect, useState } from 'react'
import { getInvoices, createInvoice, updateInvoiceStatus, getClients, Invoice, Client, InvoiceCreate } from '@/lib/api'
import { Plus, TrendingUp, Clock, CheckCircle } from 'lucide-react'

const STATUS_OPTS = ['brouillon', 'envoyee', 'payee', 'annulee']

function Badge({ v }: { v: string }) {
  const cls: Record<string, string> = {
    brouillon: 'badge-brouillon', envoyee: 'badge-envoyee', payee: 'badge-payee',
    annulee: 'badge-annule',
  }
  return <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${cls[v] ?? 'bg-gray-100 text-gray-600'}`}>{v}</span>
}

const fmt = (n: number) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)

const EMPTY: InvoiceCreate = { client_id: 0, amount_ht: 0, tva_rate: 20, status: 'brouillon' }

export default function FinancesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<InvoiceCreate>(EMPTY)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const load = () => getInvoices().then(setInvoices).catch(e => setError(e.message))
  useEffect(() => { load(); getClients().then(setClients).catch(e => setError(e.message)) }, [])

  const set = (k: keyof InvoiceCreate, v: string | number) => setForm(f => ({ ...f, [k]: v }))

  const submit = async () => {
    if (!form.client_id) { setError('Sélectionner un client'); return }
    if (!form.amount_ht)  { setError('Montant requis'); return }
    setSaving(true); setError('')
    try {
      await createInvoice(form)
      setOpen(false); setForm(EMPTY); load()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const changeStatus = async (id: number, newStatus: string) => {
    try {
      await updateInvoiceStatus(id, newStatus)
      load()
    } catch (e: any) {
      setError(e.message)
    }
  }

  const caTotal   = invoices.filter(i => i.status === 'payee').reduce((s, i) => s + i.amount_ht, 0)
  const caPending = invoices.filter(i => i.status === 'envoyee').reduce((s, i) => s + i.amount_ht, 0)
  const caTotal_ttc = invoices.filter(i => i.status === 'payee').reduce((s, i) => s + i.amount_ttc, 0)

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Finances</h1>
          <p className="text-sm text-gray-500 mt-0.5">Facturation & trésorerie</p>
        </div>
        <button onClick={() => { setOpen(true); setError('') }}
          className="flex items-center gap-2 bg-sensia-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-sensia-700 transition-colors">
          <Plus size={16} /> Nouvelle facture
        </button>
      </div>

      {/* Erreur API */}
      {error && !open && (
        <div className="bg-red-50 text-red-700 border border-red-200 px-4 py-3 rounded-lg text-sm mb-4 flex items-center gap-2">
          <span>Impossible de joindre l'API : {error}</span>
          <button onClick={() => { setError(''); load() }} className="ml-auto text-xs underline hover:text-red-900">Réessayer</button>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: 'CA encaissé HT', value: fmt(caTotal), sub: `${fmt(caTotal_ttc)} TTC`, icon: CheckCircle, color: 'bg-emerald-500' },
          { label: 'En attente', value: fmt(caPending), sub: `${invoices.filter(i => i.status === 'envoyee').length} facture(s)`, icon: Clock, color: 'bg-amber-500' },
          { label: 'Total facturé', value: fmt(caTotal + caPending), sub: `${invoices.length} facture(s)`, icon: TrendingUp, color: 'bg-sensia-500' },
        ].map(({ label, value, sub, icon: Icon, color }) => (
          <div key={label} className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-gray-500">{label}</p>
                <p className="text-2xl font-bold mt-1 text-gray-900">{value}</p>
                <p className="text-xs text-gray-400 mt-0.5">{sub}</p>
              </div>
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${color}`}>
                <Icon size={20} className="text-white" />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              {['Numéro', 'Client', 'Montant HT', 'TTC', 'Statut', 'Échéance', 'Actions'].map(h => (
                <th key={h} className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {invoices.length === 0 && (
              <tr><td colSpan={7} className="text-center py-10 text-gray-400">Aucune facture</td></tr>
            )}
            {invoices.map(inv => (
              <tr key={inv.id} className="border-b border-gray-50 hover:bg-gray-50">
                <td className="px-4 py-3 font-mono text-xs text-sensia-600">{inv.number}</td>
                <td className="px-4 py-3 font-medium">{inv.client_name}</td>
                <td className="px-4 py-3">{fmt(inv.amount_ht)}</td>
                <td className="px-4 py-3 text-gray-500">{fmt(inv.amount_ttc)}</td>
                <td className="px-4 py-3"><Badge v={inv.status} /></td>
                <td className="px-4 py-3 text-gray-500">{inv.due_date ? new Date(inv.due_date).toLocaleDateString('fr-FR') : '—'}</td>
                <td className="px-4 py-3">
                  <select
                    value={inv.status}
                    onChange={e => changeStatus(inv.id, e.target.value)}
                    className="text-xs border border-gray-200 rounded px-2 py-1 focus:ring-1 focus:ring-sensia-300 outline-none"
                  >
                    {STATUS_OPTS.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {open && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="p-6 border-b border-gray-100">
              <h2 className="text-lg font-bold">Nouvelle facture</h2>
            </div>
            <div className="p-6 space-y-4">
              {error && <div className="bg-red-50 text-red-700 border border-red-200 px-4 py-3 rounded-lg text-sm">{error}</div>}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Client *</label>
                <select value={form.client_id} onChange={e => set('client_id', Number(e.target.value))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-sensia-300 outline-none">
                  <option value={0}>— Sélectionner —</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Montant HT (€) *</label>
                  <input type="number" value={form.amount_ht || ''} onChange={e => set('amount_ht', Number(e.target.value))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-sensia-300 outline-none"
                    placeholder="0" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">TVA (%)</label>
                  <input type="number" value={form.tva_rate ?? 20} onChange={e => set('tva_rate', Number(e.target.value))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-sensia-300 outline-none" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Date d'échéance</label>
                <input type="date" value={form.due_date?.slice(0, 10) ?? ''} onChange={e => set('due_date', e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-sensia-300 outline-none" />
              </div>
              {form.amount_ht > 0 && (
                <div className="bg-gray-50 rounded-lg px-4 py-3 text-sm text-gray-600">
                  Total TTC : <strong className="text-gray-900">{fmt(form.amount_ht * (1 + (form.tva_rate ?? 20) / 100))}</strong>
                </div>
              )}
            </div>
            <div className="p-6 border-t border-gray-100 flex justify-end gap-3">
              <button onClick={() => setOpen(false)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">Annuler</button>
              <button onClick={submit} disabled={saving}
                className="px-5 py-2 bg-sensia-600 text-white rounded-lg text-sm font-medium hover:bg-sensia-700 disabled:opacity-60">
                {saving ? 'Création…' : 'Créer la facture'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

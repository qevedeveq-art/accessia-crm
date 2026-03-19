'use client'

import { useEffect, useState } from 'react'
import { getReporting, getInvoices, ReportingData, Invoice } from '@/lib/api'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie, Legend,
} from 'recharts'
import { Download, AlertCircle } from 'lucide-react'

const MONTH_NAMES = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc']

const COLORS = ['#2850ff', '#7c3aed', '#10b981', '#f59e0b', '#ef4444', '#06b6d4', '#84cc16', '#f97316']

function exportInvoicesToCSV(invoices: Invoice[]) {
  const headers = ['Numéro', 'Client', 'Montant HT', 'TVA %', 'Montant TTC', 'Statut', 'Date émission', 'Date échéance', 'Date paiement']
  const rows = invoices.map(inv => [
    inv.number,
    inv.client_name || '',
    inv.amount_ht,
    inv.tva_rate,
    inv.amount_ttc,
    inv.status,
    inv.issued_date?.slice(0, 10) || '',
    inv.due_date?.slice(0, 10) || '',
    inv.paid_date?.slice(0, 10) || '',
  ])
  const csv = [headers, ...rows].map(r => r.map(v => `"${v}"`).join(',')).join('\n')
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `factures_${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export default function ReportingPage() {
  const [data, setData] = useState<ReportingData | null>(null)
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    getReporting().then(setData).catch(e => setError(e.message))
    getInvoices().then(setInvoices).catch(() => {})
  }, [])

  const fmt = (n: number) =>
    new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)

  if (error) {
    return (
      <div className="p-8 flex items-center gap-3 text-red-600">
        <AlertCircle size={20} />
        <span>Erreur : {error}</span>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Reporting</h1>
          <p className="text-sm text-gray-500 mt-0.5">Analyse financière et activité commerciale</p>
        </div>
        <button
          onClick={() => exportInvoicesToCSV(invoices)}
          className="btn-primary flex items-center gap-2"
        >
          <Download size={16} />
          Exporter CSV
        </button>
      </div>

      {!data ? (
        <div className="text-gray-400 animate-pulse">Chargement…</div>
      ) : (
        <>
          {/* CA mensuel */}
          <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
            <h2 className="font-semibold text-gray-800 mb-4">Chiffre d'affaires mensuel</h2>
            {data.ca_by_month.length === 0 ? (
              <p className="text-sm text-gray-400">Aucune donnée</p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={data.ca_by_month} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                  <XAxis dataKey="month" tickFormatter={m => MONTH_NAMES[m - 1]} tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v: number) => [fmt(v), 'CA HT']} labelFormatter={m => MONTH_NAMES[Number(m) - 1]} />
                  <Bar dataKey="ca_ht" radius={[4, 4, 0, 0]} fill="#2850ff" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* CA par client */}
            <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
              <h2 className="font-semibold text-gray-800 mb-4">Top clients</h2>
              {data.ca_by_client.length === 0 ? (
                <p className="text-sm text-gray-400">Aucune donnée</p>
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart
                    layout="vertical"
                    data={data.ca_by_client.slice(0, 5)}
                    margin={{ top: 0, right: 16, left: 0, bottom: 0 }}
                  >
                    <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                    <YAxis type="category" dataKey="client_name" tick={{ fontSize: 11 }} width={100} />
                    <Tooltip formatter={(v: number) => [fmt(v), 'CA HT']} />
                    <Bar dataKey="ca_ht" radius={[0, 4, 4, 0]}>
                      {data.ca_by_client.slice(0, 5).map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* CA par type de mission */}
            <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
              <h2 className="font-semibold text-gray-800 mb-4">CA par type de mission</h2>
              {data.ca_by_type.length === 0 ? (
                <p className="text-sm text-gray-400">Aucune donnée</p>
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={data.ca_by_type}
                      dataKey="ca_ht"
                      nameKey="type"
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      label={({ type, percent }) => `${type} ${(percent * 100).toFixed(0)}%`}
                      labelLine={false}
                    >
                      {data.ca_by_type.map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: number) => fmt(v)} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Résumé factures */}
          <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-800">Résumé — {invoices.length} factures</h2>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
              {(['brouillon', 'envoyee', 'payee', 'annulee'] as const).map(s => {
                const list = invoices.filter(i => i.status === s)
                const total = list.reduce((sum, i) => sum + i.amount_ht, 0)
                return (
                  <div key={s} className="p-3 rounded-lg bg-gray-50">
                    <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">{s}</p>
                    <p className="text-lg font-bold text-gray-900">{list.length}</p>
                    <p className="text-xs text-gray-400">{fmt(total)}</p>
                  </div>
                )
              })}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

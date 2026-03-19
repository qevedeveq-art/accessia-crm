'use client'

import { useState, useRef, useEffect } from 'react'
import { searchCompany, CompanySearchResult, GrantInfo, ClientCreate } from '@/lib/api'
import {
  Search, Building2, MapPin, Users, Calendar, CheckCircle2, XCircle, AlertCircle,
  ExternalLink, ChevronDown, ChevronUp, ChevronRight, Plus, Loader2, Euro,
  Clock, Stethoscope, TrendingUp, Download, ArrowLeftRight, Bookmark, BookmarkCheck,
  Calculator, Bell, X,
} from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

// ─── Constants ────────────────────────────────────────────────

const HISTORY_KEY = 'accessia_search_history'
const SAVED_KEY   = 'accessia_saved_profiles'
const MAX_HISTORY = 6

// ─── LocalStorage helpers ──────────────────────────────────────

function getHistory(): string[] {
  if (typeof window === 'undefined') return []
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]') } catch { return [] }
}
function addToHistory(q: string) {
  const h = getHistory().filter(x => x !== q)
  localStorage.setItem(HISTORY_KEY, JSON.stringify([q, ...h].slice(0, MAX_HISTORY)))
}
function getSaved(): CompanySearchResult[] {
  if (typeof window === 'undefined') return []
  try { return JSON.parse(localStorage.getItem(SAVED_KEY) || '[]') } catch { return [] }
}
function persistSaved(list: CompanySearchResult[]) {
  localStorage.setItem(SAVED_KEY, JSON.stringify(list))
}

// ─── Budget simulation ─────────────────────────────────────────

// Lower-bound rates for grants that express coverage as a percentage
const GRANT_RATES: Record<string, number> = {
  ia_booster:    0.40, // 40–80 % → plancher 40 %
  cii:           0.20,
  cir:           0.30,
  aide_regionale: 0.30,
}

function simulateGrant(grant: GrantInfo, budget: number): number {
  if (!grant.eligible) return 0
  if ((grant.amount_max ?? 0) > 0) return grant.amount_max!
  const rate = GRANT_RATES[grant.id] ?? 0
  return Math.round(budget * rate)
}

// ─── Report generator (opens a printable window) ──────────────

function openReport(company: CompanySearchResult) {
  const eligible = company.grants.filter(g => g.eligible)
  const now = new Date().toLocaleDateString('fr-FR')

  const grantsHtml = eligible.map(g => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;font-weight:500">${g.name}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;color:#059669">${g.amount_label}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;color:#d97706;font-size:12px">${g.deadline ?? '—'}</td>
    </tr>`).join('')

  const nonEligibleHtml = company.grants.filter(g => !g.eligible).map(g => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #f9fafb;color:#9ca3af">${g.name}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f9fafb;color:#9ca3af;font-size:12px">${g.conditions_missing.slice(0, 2).join(' · ')}</td>
    </tr>`).join('')

  const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8">
  <title>Rapport Aides IA — ${company.name}</title>
  <style>
    @media print { .no-print { display:none!important; } body { margin:0; } }
    body { font-family:'Segoe UI',sans-serif; max-width:800px; margin:0 auto; padding:40px 30px; color:#1f2937; }
    h1 { color:#2850ff; font-size:20px; margin:0 0 4px; }
    h2 { font-size:14px; color:#374151; border-bottom:2px solid #e5e7eb; padding-bottom:6px; margin:24px 0 12px; }
    table { width:100%; border-collapse:collapse; font-size:13px; }
    th { background:#f9fafb; padding:8px 12px; text-align:left; font-size:11px; text-transform:uppercase; color:#6b7280; }
    .meta { color:#6b7280; font-size:13px; margin-bottom:24px; }
    .grid2 { display:grid; grid-template-columns:1fr 1fr; gap:12px; margin:16px 0; }
    .cell { background:#f9fafb; border-radius:8px; padding:10px 12px; }
    .cell-label { font-size:11px; color:#9ca3af; margin-bottom:3px; }
    .cell-value { font-size:13px; font-weight:600; color:#1f2937; }
    .summary { text-align:center; background:linear-gradient(135deg,#eff6ff,#f0fdf4); border-radius:12px; padding:24px; margin:20px 0; }
    .summary .num { font-size:40px; font-weight:700; color:#2850ff; }
    .btn { background:#2850ff; color:white; padding:8px 20px; border-radius:8px; font-size:13px; cursor:pointer; border:none; }
    footer { text-align:center; font-size:11px; color:#9ca3af; margin-top:40px; border-top:1px solid #e5e7eb; padding-top:16px; }
  </style></head><body>
  <div class="no-print" style="background:#f9fafb;border-bottom:1px solid #e5e7eb;padding:12px 30px;margin:-40px -30px 30px;display:flex;align-items:center;justify-content:space-between">
    <span style="font-size:13px;color:#6b7280">Rapport Aides IA — ACCESSIA Pro</span>
    <button class="btn" onclick="window.print()">📄 Imprimer / Télécharger PDF</button>
  </div>
  <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px">
    <div style="width:36px;height:36px;background:#2850ff;border-radius:8px;color:white;display:flex;align-items:center;justify-content:center;font-weight:700">A</div>
    <div><h1>Rapport d'éligibilité — Aides IA</h1><p style="margin:0;font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:1.5px">ACCESSIA Pro · Conseil IA PME</p></div>
  </div>
  <div class="meta"><strong>Entreprise :</strong> ${company.name} &nbsp;|&nbsp; <strong>SIREN :</strong> ${company.siren} &nbsp;|&nbsp; <strong>Date :</strong> ${now}</div>
  <h2>Informations officielles</h2>
  <div class="grid2">
    <div class="cell"><div class="cell-label">Secteur (NAF ${company.naf_code})</div><div class="cell-value">${company.naf_label}</div></div>
    <div class="cell"><div class="cell-label">Effectif</div><div class="cell-value">${company.effectif_label} — ${company.categorie}</div></div>
    <div class="cell"><div class="cell-label">Localisation</div><div class="cell-value">${company.city || ''} (${company.region || '—'})</div></div>
    <div class="cell"><div class="cell-label">Création</div><div class="cell-value">${company.date_creation ? new Date(company.date_creation).toLocaleDateString('fr-FR') : '—'}</div></div>
  </div>
  <div class="summary">
    <div style="font-size:13px;color:#6b7280;margin-bottom:4px">Aides éligibles identifiées</div>
    <div class="num">${eligible.length}/${company.grants.length}</div>
    <div style="font-size:13px;color:#6b7280;margin-top:4px">dispositifs IA confirmés pour ce profil</div>
  </div>
  ${eligible.length > 0 ? `<h2>Aides éligibles</h2>
  <table><thead><tr><th>Dispositif</th><th>Montant / Taux</th><th>Échéance</th></tr></thead>
  <tbody>${grantsHtml}</tbody></table>` : ''}
  ${nonEligibleHtml ? `<h2 style="color:#9ca3af">Aides non éligibles ou à vérifier</h2>
  <table><tbody>${nonEligibleHtml}</tbody></table>` : ''}
  <footer>Rapport généré par ACCESSIA Pro — ${now}<br>Ce document est confidentiel. Montants indicatifs, soumis à validation par les organismes.</footer>
  </body></html>`

  const w = window.open('', '_blank')
  if (w) { w.document.write(html); w.document.close() }
}

// ─── Helpers ───────────────────────────────────────────────────

function formatDate(d: string | null) {
  if (!d) return '—'
  try { return new Date(d).toLocaleDateString('fr-FR') } catch { return d }
}
function totalEligible(grants: GrantInfo[]) { return grants.filter(g => g.eligible).length }
function totalEstimated(grants: GrantInfo[]) {
  return grants.filter(g => g.eligible).reduce((s, g) => s + (g.amount_max || 0), 0)
}
function hasPercentGrants(grants: GrantInfo[]) {
  return grants.some(g => g.eligible && g.amount_max === 0)
}
function hasUpcomingDeadline(grants: GrantInfo[]) {
  return grants.some(g => g.eligible && g.deadline &&
    (g.deadline.toLowerCase().includes('avr') || g.deadline.toLowerCase().includes('avril')))
}

// ─── Grant Card ───────────────────────────────────────────────

function GrantCard({ grant }: { grant: GrantInfo }) {
  const [expanded, setExpanded] = useState(false)
  const icon = grant.eligible
    ? <CheckCircle2 size={16} className="text-green-500 shrink-0 mt-0.5" />
    : <XCircle size={16} className="text-red-400 shrink-0 mt-0.5" />
  const confidenceBadge = {
    high:   <span className="text-[10px] font-semibold bg-green-100 text-green-700 px-1.5 py-0.5 rounded">Éligible</span>,
    medium: <span className="text-[10px] font-semibold bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded">À vérifier</span>,
    low:    <span className="text-[10px] font-semibold bg-red-100 text-red-600 px-1.5 py-0.5 rounded">Peu éligible</span>,
  }[grant.eligible ? grant.confidence : 'low']

  return (
    <div className={`rounded-xl border p-4 transition-colors ${grant.eligible ? 'border-green-200 bg-green-50/40' : 'border-gray-200 bg-gray-50/40'}`}>
      <div className="flex items-start gap-2">
        {icon}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-semibold text-gray-900 leading-snug">{grant.name}</p>
            {confidenceBadge}
          </div>
          <p className="text-xs text-gray-500 mt-0.5">{grant.description}</p>
          {grant.eligible && <p className="text-sm font-semibold text-accessia-700 mt-1.5">{grant.amount_label}</p>}
          {grant.deadline && (
            <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
              <AlertCircle size={11} /> {grant.deadline}
            </p>
          )}
          <button
            onClick={() => setExpanded(e => !e)}
            className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 mt-2 transition-colors"
          >
            {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            {expanded ? 'Masquer les conditions' : 'Voir les conditions'}
          </button>
          {expanded && (
            <div className="mt-2 space-y-1.5">
              {grant.conditions_ok.map((c, i) => (
                <div key={i} className="flex items-start gap-1.5 text-xs text-green-700">
                  <CheckCircle2 size={11} className="shrink-0 mt-0.5" /> {c}
                </div>
              ))}
              {grant.conditions_missing.map((c, i) => (
                <div key={i} className="flex items-start gap-1.5 text-xs text-amber-600">
                  <AlertCircle size={11} className="shrink-0 mt-0.5" /> {c}
                </div>
              ))}
              <a href={grant.url} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-accessia-600 hover:underline mt-1">
                Plus d'infos <ExternalLink size={10} />
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Budget Simulator ─────────────────────────────────────────

function BudgetSimulator({ grants }: { grants: GrantInfo[] }) {
  const [open, setOpen] = useState(false)
  const [budget, setBudget] = useState('')
  const budgetVal = parseFloat(budget.replace(',', '.').replace(/\s/g, '')) || 0
  const eligible = grants.filter(g => g.eligible)
  const rows = eligible.map(g => ({ grant: g, saving: simulateGrant(g, budgetVal), isFixed: (g.amount_max ?? 0) > 0 }))
  const totalSavings = rows.reduce((s, r) => s + r.saving, 0)
  const netCost = budgetVal > 0 ? Math.max(0, budgetVal - totalSavings) : 0
  const coveragePct = budgetVal > 0 ? Math.min(100, Math.round((totalSavings / budgetVal) * 100)) : 0

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-sm"
      >
        <span className="flex items-center gap-2 font-medium text-gray-700">
          <Calculator size={14} /> Simuler un budget projet
        </span>
        {open ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
      </button>
      {open && (
        <div className="p-4 space-y-3">
          <div className="flex items-center gap-3">
            <label className="text-xs text-gray-500 shrink-0">Budget projet (€ HT)</label>
            <div className="relative flex-1">
              <Euro size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              <input
                type="number" value={budget} onChange={e => setBudget(e.target.value)}
                placeholder="ex. 50000"
                className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-accessia-300 focus:border-accessia-400 outline-none"
              />
            </div>
          </div>
          {budgetVal > 0 && (
            <>
              <div className="space-y-1.5">
                {rows.map((r, i) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <span className="text-gray-600 truncate flex-1 mr-2">{r.grant.name}</span>
                    <span className="text-green-600 font-semibold shrink-0">
                      {r.saving > 0 ? `− ${r.saving.toLocaleString('fr-FR')} €${!r.isFixed ? ' *' : ''}` : '—'}
                    </span>
                  </div>
                ))}
              </div>
              <div className="border-t border-gray-200 pt-3 space-y-1.5">
                <div className="flex items-center justify-between text-sm font-semibold">
                  <span className="text-gray-700">Économies totales</span>
                  <span className="text-green-600">− {totalSavings.toLocaleString('fr-FR')} €</span>
                </div>
                <div className="flex items-center justify-between text-sm font-bold">
                  <span className="text-gray-900">Coût net estimé</span>
                  <span className="text-accessia-700">{netCost.toLocaleString('fr-FR')} €</span>
                </div>
                {coveragePct > 0 && (
                  <div className="mt-2">
                    <div className="flex justify-between text-xs text-gray-400 mb-1">
                      <span>Couverture estimée</span><span>{coveragePct} %</span>
                    </div>
                    <div className="bg-gray-100 rounded-full h-2">
                      <div className="bg-green-500 h-2 rounded-full transition-all" style={{ width: `${coveragePct}%` }} />
                    </div>
                  </div>
                )}
                <p className="text-[10px] text-gray-400">* Aides en % estimées au taux plancher. Montants indicatifs.</p>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Company Card ─────────────────────────────────────────────

function CompanyCard({
  company, onImport, isSaved, onToggleSave,
}: {
  company: CompanySearchResult
  onImport: (c: CompanySearchResult) => void
  isSaved: boolean
  onToggleSave: (c: CompanySearchResult) => void
}) {
  const eligible  = totalEligible(company.grants)
  const estimated = totalEstimated(company.grants)
  const upcoming  = hasUpcomingDeadline(company.grants)

  return (
    <div className="grid md:grid-cols-2 gap-4 bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
      {/* Colonne gauche */}
      <div className="space-y-3">
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-xl bg-accessia-100 text-accessia-700 flex items-center justify-center font-bold text-lg shrink-0">
            {company.name[0]}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="font-bold text-gray-900 leading-snug">{company.name}</h3>
                <p className="text-xs text-gray-400 mt-0.5">SIREN : {company.siren}</p>
                <span className={`inline-block mt-1 text-[10px] font-semibold px-2 py-0.5 rounded ${company.status === 'actif' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                  {company.status === 'actif' ? '● Actif' : '● Cessé'}
                </span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {upcoming && (
                  <span className="text-[10px] font-semibold bg-orange-100 text-orange-700 px-2 py-0.5 rounded flex items-center gap-0.5">
                    <Bell size={9} /> Clôture proche
                  </span>
                )}
                <button
                  onClick={() => onToggleSave(company)}
                  title={isSaved ? 'Retirer de la veille' : 'Sauvegarder ce profil'}
                  className={`p-1.5 rounded-lg transition-colors ${isSaved ? 'text-accessia-600 bg-accessia-50 hover:bg-accessia-100' : 'text-gray-400 hover:text-accessia-600 hover:bg-accessia-50'}`}
                >
                  {isSaved ? <BookmarkCheck size={15} /> : <Bookmark size={15} />}
                </button>
                <button
                  onClick={() => openReport(company)}
                  title="Télécharger le rapport PDF"
                  className="p-1.5 text-gray-400 hover:text-accessia-600 hover:bg-accessia-50 rounded-lg transition-colors"
                >
                  <Download size={15} />
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="bg-gray-50 rounded-lg p-2.5">
            <p className="text-gray-400 mb-0.5">Secteur (NAF)</p>
            <p className="font-medium text-gray-800">{company.naf_label}</p>
            <p className="text-gray-400">{company.naf_code}</p>
          </div>
          <div className="bg-gray-50 rounded-lg p-2.5">
            <p className="text-gray-400 mb-0.5 flex items-center gap-1"><Users size={10} /> Effectif</p>
            <p className="font-medium text-gray-800">{company.effectif_label}</p>
            <p className="text-gray-400">{company.categorie}</p>
          </div>
          <div className="bg-gray-50 rounded-lg p-2.5">
            <p className="text-gray-400 mb-0.5 flex items-center gap-1"><MapPin size={10} /> Localisation</p>
            <p className="font-medium text-gray-800">{company.city || company.postal_code}</p>
            <p className="text-gray-400">{company.region}</p>
          </div>
          <div className="bg-gray-50 rounded-lg p-2.5">
            <p className="text-gray-400 mb-0.5 flex items-center gap-1"><Calendar size={10} /> Création</p>
            <p className="font-medium text-gray-800">{formatDate(company.date_creation)}</p>
            <p className="text-gray-400">SIRET : {company.siret_siege.slice(-5)}</p>
          </div>
        </div>

        {company.address && (
          <p className="text-xs text-gray-400 flex items-start gap-1">
            <MapPin size={11} className="shrink-0 mt-0.5" />
            {company.address}{company.postal_code ? ` — ${company.postal_code} ${company.city}` : ''}
          </p>
        )}

        {/* Résumé aides */}
        <div className="bg-accessia-50 border border-accessia-100 rounded-xl px-3 py-2.5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-accessia-500">Aides IA éligibles</p>
              <p className="text-lg font-bold text-accessia-700">{eligible} / {company.grants.length}</p>
            </div>
            <div className="text-right">
              {estimated > 0 ? (
                <>
                  <p className="text-xs text-accessia-500">Économies directes min.</p>
                  <p className="text-lg font-bold text-accessia-700 flex items-center gap-0.5 justify-end">
                    <Euro size={14} />{estimated.toLocaleString('fr-FR')}
                  </p>
                </>
              ) : eligible > 0 && (
                <>
                  <p className="text-xs text-accessia-500">Financement %</p>
                  <p className="text-sm font-bold text-accessia-700 flex items-center gap-1 justify-end">
                    <TrendingUp size={13} /> Jusqu'à 80 %
                  </p>
                </>
              )}
            </div>
          </div>
          {hasPercentGrants(company.grants) && (
            <p className="text-[10px] text-accessia-400 mt-1.5 flex items-center gap-1">
              <AlertCircle size={9} /> + aides en % du projet non incluses (IA Booster, CIR, régional)
            </p>
          )}
        </div>

        {/* Simulation budget */}
        <BudgetSimulator grants={company.grants} />

        <div className="flex gap-2">
          <button
            onClick={() => onImport(company)}
            className="flex-1 flex items-center justify-center gap-2 bg-accessia-600 text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-accessia-700 transition-colors"
          >
            <Plus size={15} /> Créer comme client
          </button>
          <Link
            href={`/diagnostics?new=ia&company=${encodeURIComponent(company.name)}`}
            className="flex items-center justify-center gap-1.5 border border-accessia-300 text-accessia-700 px-3 py-2.5 rounded-xl text-sm font-medium hover:bg-accessia-50 transition-colors shrink-0"
            title="Lancer un diagnostic IA"
          >
            <Stethoscope size={15} /> Diagnostiquer
          </Link>
        </div>
      </div>

      {/* Colonne droite — aides */}
      <div className="space-y-2.5 max-h-[520px] overflow-y-auto pr-1">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Aides & Financements IA</p>
        {company.grants.map(g => <GrantCard key={g.id} grant={g} />)}
      </div>
    </div>
  )
}

// ─── Compare Panel ────────────────────────────────────────────

function ComparePanel({
  companies, onClose,
}: {
  companies: [CompanySearchResult, CompanySearchResult]
  onClose: () => void
}) {
  const [a, b] = companies
  const allGrantIds = Array.from(new Set([...a.grants.map(g => g.id), ...b.grants.map(g => g.id)]))
  const getGrant = (c: CompanySearchResult, id: string) => c.grants.find(g => g.id === id)

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm mb-5 overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
        <h3 className="font-semibold text-gray-800 flex items-center gap-2">
          <ArrowLeftRight size={16} className="text-accessia-600" /> Comparaison des profils d'éligibilité
        </h3>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
          <X size={16} />
        </button>
      </div>

      {/* Headers entreprises */}
      <div className="grid grid-cols-3 border-b border-gray-100">
        <div className="p-4 border-r border-gray-100 bg-gray-50" />
        {[a, b].map((c, i) => (
          <div key={i} className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-8 h-8 rounded-lg bg-accessia-100 text-accessia-700 flex items-center justify-center font-bold text-sm shrink-0">
                {c.name[0]}
              </div>
              <p className="text-sm font-bold text-gray-900 leading-tight line-clamp-2">{c.name}</p>
            </div>
            <p className="text-xs text-gray-400">{c.categorie} · {c.effectif_label}</p>
            <p className="text-xs text-gray-400">{c.naf_label}</p>
            <div className="mt-2 flex items-center gap-2 flex-wrap">
              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${totalEligible(c.grants) >= 4 ? 'bg-green-100 text-green-700' : totalEligible(c.grants) >= 2 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-600'}`}>
                {totalEligible(c.grants)}/{c.grants.length} aides
              </span>
              {totalEstimated(c.grants) > 0 && (
                <span className="text-[10px] text-accessia-700 font-semibold">
                  +{totalEstimated(c.grants).toLocaleString('fr-FR')} €
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Infos générales */}
      {[
        { label: 'Secteur', fn: (c: CompanySearchResult) => c.naf_label },
        { label: 'Taille', fn: (c: CompanySearchResult) => `${c.effectif_label} (${c.categorie})` },
        { label: 'Région', fn: (c: CompanySearchResult) => c.region || '—' },
        { label: 'Création', fn: (c: CompanySearchResult) => formatDate(c.date_creation) },
      ].map(row => (
        <div key={row.label} className="grid grid-cols-3 border-b border-gray-50">
          <div className="px-4 py-2.5 bg-gray-50 text-xs font-medium text-gray-500 border-r border-gray-100">{row.label}</div>
          {[a, b].map((c, i) => <div key={i} className="px-4 py-2.5 text-xs text-gray-700">{row.fn(c)}</div>)}
        </div>
      ))}

      {/* Titre aides */}
      <div className="grid grid-cols-3 bg-gray-50 border-y border-gray-100">
        <div className="px-4 py-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wide border-r border-gray-100 col-span-1">Aide</div>
        <div className="px-4 py-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wide">{a.name.split(' ')[0]}</div>
        <div className="px-4 py-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wide">{b.name.split(' ')[0]}</div>
      </div>

      {allGrantIds.map(id => {
        const ga = getGrant(a, id)
        const gb = getGrant(b, id)
        return (
          <div key={id} className="grid grid-cols-3 border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
            <div className="px-4 py-2.5 bg-gray-50 text-xs text-gray-600 border-r border-gray-100 leading-snug">
              {ga?.name || gb?.name || id}
            </div>
            {[ga, gb].map((g, i) => (
              <div key={i} className={`px-4 py-2.5 flex items-center gap-1.5 text-xs ${g?.eligible ? 'text-green-700' : 'text-gray-400'}`}>
                {g?.eligible
                  ? <><CheckCircle2 size={11} className="shrink-0" />{g.amount_max && g.amount_max > 0 ? `${g.amount_max.toLocaleString('fr-FR')} €` : <span className="text-[10px] text-green-600">{g.amount_label.substring(0, 15)}</span>}</>
                  : g ? <><XCircle size={11} className="shrink-0" />Non éligible</> : <span className="text-gray-200">—</span>
                }
              </div>
            ))}
          </div>
        )
      })}
    </div>
  )
}

// ─── Saved Profiles Section ───────────────────────────────────

function SavedProfilesSection({
  saved, onRemove, onSearch,
}: {
  saved: CompanySearchResult[]
  onRemove: (siren: string) => void
  onSearch: (name: string) => void
}) {
  if (saved.length === 0) return null
  return (
    <div className="mt-6">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3 flex items-center gap-1">
        <Bookmark size={11} className="text-gray-400" /> Profils en veille ({saved.length})
      </p>
      <div className="grid sm:grid-cols-2 gap-3">
        {saved.map(c => {
          const eligible  = totalEligible(c.grants)
          const upcoming  = hasUpcomingDeadline(c.grants)
          const estimated = totalEstimated(c.grants)
          return (
            <div key={c.siren} className="bg-white border border-gray-200 rounded-xl p-3 flex items-start gap-3 hover:border-accessia-300 transition-colors">
              <div className="w-9 h-9 rounded-lg bg-accessia-100 text-accessia-700 flex items-center justify-center font-bold text-sm shrink-0">
                {c.name[0]}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900 truncate">{c.name}</p>
                <p className="text-xs text-gray-400">{c.categorie} · {c.naf_label}</p>
                <div className="flex items-center gap-2 flex-wrap mt-1.5">
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${eligible >= 4 ? 'bg-green-100 text-green-700' : eligible >= 2 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-600'}`}>
                    {eligible}/{c.grants.length} aides
                  </span>
                  {estimated > 0 && (
                    <span className="text-[10px] text-accessia-600 font-medium">+{estimated.toLocaleString('fr-FR')} €</span>
                  )}
                  {upcoming && (
                    <span className="text-[10px] font-semibold bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded flex items-center gap-0.5">
                      <Bell size={9} /> Clôture proche
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={() => onSearch(c.name)} title="Relancer la recherche"
                  className="p-1.5 text-gray-400 hover:text-accessia-600 hover:bg-accessia-50 rounded-lg transition-colors">
                  <Search size={13} />
                </button>
                <button onClick={() => onRemove(c.siren)} title="Retirer de la veille"
                  className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                  <X size={13} />
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Import Modal ─────────────────────────────────────────────

function ImportModal({ company, onClose }: { company: CompanySearchResult; onClose: () => void }) {
  const router = useRouter()
  const handleGo = () => {
    const params = new URLSearchParams({
      prefill: JSON.stringify({
        name: company.name,
        siret: company.siret_siege,
        address: company.address ? `${company.address}${company.postal_code ? ` ${company.postal_code} ${company.city}` : ''}` : '',
        type: company.categorie === 'GE' ? 'grand_compte' : company.categorie === 'ETI' ? 'eti' : company.categorie === 'PME' ? 'pme' : 'micro',
        status: 'prospect',
        source: 'BPI France',
      } as Partial<ClientCreate>),
    })
    router.push(`/clients?${params.toString()}`)
    onClose()
  }
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
        <h3 className="text-lg font-bold text-gray-900 mb-2">Créer ce client ?</h3>
        <p className="text-sm text-gray-500 mb-4">
          Les informations officielles de <strong>{company.name}</strong> seront pré-remplies.
        </p>
        <div className="bg-gray-50 rounded-xl p-3 space-y-1.5 text-sm mb-5">
          <div className="flex justify-between"><span className="text-gray-400">Nom</span><span className="font-medium">{company.name}</span></div>
          <div className="flex justify-between"><span className="text-gray-400">SIRET</span><span className="font-mono text-xs">{company.siret_siege}</span></div>
          <div className="flex justify-between"><span className="text-gray-400">Secteur</span><span>{company.naf_label}</span></div>
          <div className="flex justify-between"><span className="text-gray-400">Catégorie</span><span>{company.categorie}</span></div>
          <div className="flex justify-between"><span className="text-gray-400">Région</span><span>{company.region}</span></div>
        </div>
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 border border-gray-200 text-gray-600 px-4 py-2.5 rounded-xl text-sm hover:bg-gray-50 transition-colors">
            Annuler
          </button>
          <button onClick={handleGo} className="flex-1 bg-accessia-600 text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-accessia-700 transition-colors">
            Aller vers les clients
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Result Pick List ─────────────────────────────────────────

function ResultPickList({
  results, total, selected, onSelect, compareList, onToggleCompare,
}: {
  results: CompanySearchResult[]
  total: number
  selected: CompanySearchResult | null
  onSelect: (c: CompanySearchResult) => void
  compareList: CompanySearchResult[]
  onToggleCompare: (c: CompanySearchResult) => void
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm mb-5 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
        <p className="text-sm font-semibold text-gray-700">
          {results.length} résultat{results.length > 1 ? 's' : ''}
          {total > results.length && <span className="font-normal text-gray-400"> sur {total.toLocaleString('fr-FR')}</span>}
        </p>
        <div className="flex items-center gap-3">
          {compareList.length > 0 && (
            <span className="text-xs text-accessia-600 font-medium flex items-center gap-1">
              <ArrowLeftRight size={12} /> {compareList.length}/2 sélectionnés
            </span>
          )}
          <p className="text-xs text-gray-400 hidden sm:block">Cliquez pour voir · Comparer pour analyser côte à côte</p>
        </div>
      </div>
      <div className="divide-y divide-gray-50">
        {results.map(c => {
          const isSelected = selected?.siren === c.siren
          const inCompare  = compareList.some(x => x.siren === c.siren)
          const eligible   = totalEligible(c.grants)
          const canCompare = compareList.length < 2 || inCompare
          return (
            <div key={c.siren} className={`flex items-center gap-0 transition-colors ${isSelected ? 'bg-accessia-50 border-l-4 border-l-accessia-500' : 'border-l-4 border-l-transparent hover:bg-gray-50'}`}>
              <button onClick={() => onSelect(c)} className="flex items-center gap-4 flex-1 px-4 py-3.5 text-left min-w-0">
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center font-bold text-sm shrink-0 ${isSelected ? 'bg-accessia-600 text-white' : 'bg-accessia-100 text-accessia-700'}`}>
                  {c.name[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-semibold truncate ${isSelected ? 'text-accessia-800' : 'text-gray-900'}`}>{c.name}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    SIREN {c.siren} · {c.naf_label} · {c.city || c.postal_code} · {c.categorie}
                  </p>
                </div>
                <div className="text-right shrink-0 mr-2">
                  <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded ${c.status === 'actif' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                    {c.status}
                  </span>
                  <p className="text-xs text-gray-400 mt-1">{eligible}/{c.grants.length} aides</p>
                </div>
                <ChevronRight size={15} className={`shrink-0 mr-2 ${isSelected ? 'text-accessia-500' : 'text-gray-300'}`} />
              </button>
              {/* Bouton Comparer */}
              <button
                onClick={() => onToggleCompare(c)}
                disabled={!canCompare}
                title={inCompare ? 'Retirer de la comparaison' : 'Ajouter à la comparaison'}
                className={`mr-3 p-2 rounded-lg text-xs transition-colors ${inCompare ? 'bg-accessia-100 text-accessia-700' : canCompare ? 'bg-gray-100 text-gray-500 hover:bg-accessia-100 hover:text-accessia-600' : 'bg-gray-50 text-gray-300 cursor-not-allowed'}`}
              >
                <ArrowLeftRight size={13} />
              </button>
            </div>
          )
        })}
      </div>
      {compareList.length === 2 && (
        <div className="px-4 py-3 border-t border-accessia-100 bg-accessia-50 flex items-center justify-between">
          <p className="text-xs text-accessia-700 font-medium">
            Comparaison : <strong>{compareList[0].name.split(' ')[0]}</strong> vs <strong>{compareList[1].name.split(' ')[0]}</strong>
          </p>
          <span className="text-[10px] text-accessia-500">↓ Voir le tableau ci-dessous</span>
        </div>
      )}
    </div>
  )
}

// ─── Page principale ──────────────────────────────────────────

export default function RecherchePage() {
  const [query,       setQuery]       = useState('')
  const [results,     setResults]     = useState<CompanySearchResult[]>([])
  const [total,       setTotal]       = useState(0)
  const [loading,     setLoading]     = useState(false)
  const [error,       setError]       = useState('')
  const [searched,    setSearched]    = useState(false)
  const [selected,    setSelected]    = useState<CompanySearchResult | null>(null)
  const [importTarget,setImportTarget]= useState<CompanySearchResult | null>(null)
  const [history,     setHistory]     = useState<string[]>([])
  const [showHistory, setShowHistory] = useState(false)
  const [compareList, setCompareList] = useState<CompanySearchResult[]>([])
  const [saved,       setSaved]       = useState<CompanySearchResult[]>([])
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setHistory(getHistory())
    setSaved(getSaved())
  }, [])

  const doSearch = async (q: string) => {
    if (!q.trim() || q.trim().length < 2) return
    setLoading(true); setError(''); setSearched(true); setSelected(null)
    setShowHistory(false); setCompareList([])
    try {
      const data = await searchCompany(q.trim())
      setResults(data.results)
      setTotal(data.total)
      if (data.results.length === 1) setSelected(data.results[0])
      addToHistory(q.trim())
      setHistory(getHistory())
    } catch (e: any) {
      setError(e.message || 'Erreur lors de la recherche')
      setResults([])
    } finally {
      setLoading(false)
    }
  }

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') doSearch(query)
    if (e.key === 'Escape') setShowHistory(false)
  }

  const toggleCompare = (c: CompanySearchResult) => {
    setCompareList(prev => {
      const inList = prev.some(x => x.siren === c.siren)
      if (inList) return prev.filter(x => x.siren !== c.siren)
      if (prev.length >= 2) return prev
      return [...prev, c]
    })
  }

  const toggleSave = (c: CompanySearchResult) => {
    setSaved(prev => {
      const inList = prev.some(x => x.siren === c.siren)
      const next = inList ? prev.filter(x => x.siren !== c.siren) : [c, ...prev].slice(0, 10)
      persistSaved(next)
      return next
    })
  }

  const removeSaved = (siren: string) => {
    setSaved(prev => {
      const next = prev.filter(x => x.siren !== siren)
      persistSaved(next)
      return next
    })
  }

  const cleanQ  = query.replace(/[\s-]/g, '')
  const isSiren = /^\d{9}$/.test(cleanQ)
  const isSiret = /^\d{14}$/.test(cleanQ)

  const showCompare = compareList.length === 2

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Prospection IA</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Recherchez une entreprise pour estimer ses aides IA disponibles (BPI France, France Num, CIR, OPCO, régionales)
        </p>
      </div>

      {/* Barre de recherche */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-6">
        <div className="flex gap-3 relative">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <input
              ref={inputRef} value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={handleKey}
              onFocus={() => history.length > 0 && setShowHistory(true)}
              onBlur={() => setTimeout(() => setShowHistory(false), 150)}
              placeholder="Nom d'entreprise, SIREN (9 chiffres) ou SIRET (14 chiffres)…"
              className="w-full pl-10 pr-4 py-3 text-sm border border-gray-200 rounded-xl focus:ring-2 focus:ring-accessia-300 focus:border-accessia-400 outline-none transition-all"
              autoFocus
            />
            {/* Dropdown historique */}
            {showHistory && history.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-20 overflow-hidden">
                <p className="px-3 py-1.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wide border-b border-gray-100 flex items-center gap-1">
                  <Clock size={9} /> Recherches récentes
                </p>
                {history.map(h => (
                  <button key={h} onMouseDown={() => { setQuery(h); doSearch(h) }}
                    className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-left hover:bg-accessia-50 transition-colors">
                    <Clock size={12} className="text-gray-300 shrink-0" />
                    <span className="text-gray-700">{h}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            onClick={() => doSearch(query)}
            disabled={loading || query.trim().length < 2}
            className="flex items-center gap-2 bg-accessia-600 text-white px-5 py-3 rounded-xl text-sm font-medium hover:bg-accessia-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}
            Rechercher
          </button>
        </div>
        <div className="flex items-center justify-between mt-2.5">
          <p className="text-xs text-gray-400">
            Données officielles via{' '}
            <span className="font-medium text-gray-500">recherche-entreprises.api.gouv.fr</span>
            {' '}(INSEE · INPI · BODACC)
          </p>
          {(isSiren || isSiret) && (
            <span className="text-[10px] font-semibold bg-green-100 text-green-700 px-2 py-0.5 rounded">
              {isSiren ? 'SIREN détecté — recherche exacte' : 'SIRET détecté — recherche exacte'}
            </span>
          )}
        </div>
      </div>

      {/* Erreur */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm mb-5 flex items-center gap-2">
          <AlertCircle size={15} />{error}
        </div>
      )}

      {/* Chargement */}
      {loading && (
        <div className="flex flex-col items-center justify-center py-20 text-gray-400">
          <Loader2 size={32} className="animate-spin mb-3" />
          <p className="text-sm">Interrogation du Registre National des Entreprises…</p>
        </div>
      )}

      {/* Aucun résultat */}
      {!loading && searched && results.length === 0 && !error && (
        <div className="flex flex-col items-center justify-center py-20 text-gray-400">
          <Building2 size={40} className="mb-3 opacity-40" />
          <p className="text-sm">Aucune entreprise trouvée pour « {query} »</p>
          <p className="text-xs mt-1 text-gray-300">Essayez avec le SIREN (9 chiffres) pour une recherche exacte</p>
        </div>
      )}

      {/* Résultats */}
      {!loading && results.length > 0 && (
        <>
          {results.length > 1 && (
            <ResultPickList
              results={results} total={total}
              selected={selected} onSelect={setSelected}
              compareList={compareList} onToggleCompare={toggleCompare}
            />
          )}

          {/* Panneau comparaison */}
          {showCompare && (
            <ComparePanel
              companies={compareList as [CompanySearchResult, CompanySearchResult]}
              onClose={() => setCompareList([])}
            />
          )}

          {/* Détail entreprise sélectionnée */}
          {selected && !showCompare && (
            <CompanyCard
              company={selected}
              onImport={setImportTarget}
              isSaved={saved.some(x => x.siren === selected.siren)}
              onToggleSave={toggleSave}
            />
          )}
        </>
      )}

      {/* État initial */}
      {!loading && !searched && (
        <>
          <div className="grid sm:grid-cols-4 gap-4 mt-4">
            {[
              { icon: '🏢', title: 'Données officielles', desc: 'INSEE, INPI, BODACC en temps réel' },
              { icon: '💰', title: '7 aides calculées', desc: 'BPI France, CIR, France Num, OPCO, régionales' },
              { icon: '📊', title: 'Simulation budget', desc: 'Coût net estimé après déduction de toutes les aides' },
              { icon: '🔔', title: 'Alertes clôtures', desc: 'Sauvegardez un profil — soyez alerté des échéances' },
            ].map(card => (
              <div key={card.title} className="bg-white rounded-xl border border-gray-100 p-4 text-center">
                <div className="text-2xl mb-2">{card.icon}</div>
                <p className="text-sm font-semibold text-gray-800">{card.title}</p>
                <p className="text-xs text-gray-400 mt-1">{card.desc}</p>
              </div>
            ))}
          </div>
          {history.length > 0 && (
            <div className="mt-5">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-1">
                <Clock size={11} /> Recherches récentes
              </p>
              <div className="flex flex-wrap gap-2">
                {history.map(h => (
                  <button key={h} onClick={() => { setQuery(h); doSearch(h) }}
                    className="flex items-center gap-1.5 text-sm bg-white border border-gray-200 text-gray-600 px-3 py-1.5 rounded-full hover:border-accessia-300 hover:text-accessia-700 transition-colors">
                    <Clock size={11} className="text-gray-300" />{h}
                  </button>
                ))}
              </div>
            </div>
          )}
          <SavedProfilesSection
            saved={saved}
            onRemove={removeSaved}
            onSearch={q => { setQuery(q); doSearch(q) }}
          />
        </>
      )}

      {/* Modal import */}
      {importTarget && <ImportModal company={importTarget} onClose={() => setImportTarget(null)} />}
    </div>
  )
}

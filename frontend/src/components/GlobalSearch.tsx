'use client'

import { useEffect, useRef, useState } from 'react'
import { globalSearch, SearchResults } from '@/lib/api'
import {
  Bell,
  Building2,
  CheckSquare,
  ClipboardCheck,
  Clock,
  FileText,
  Folder,
  FolderKanban,
  Search,
  Sparkles,
  Users,
  Wrench,
  X,
} from 'lucide-react'
import { useRouter } from 'next/navigation'

type CommandGroup = 'action' | 'client' | 'project' | 'quote' | 'task' | 'diagnostic' | 'file' | 'time_entry'

type CommandItem = {
  id: string
  group: CommandGroup
  label: string
  secondary?: string
  badge?: string
  href: string
  icon: React.ElementType
}

const GROUP_LABELS: Record<CommandGroup, string> = {
  action: 'Actions rapides',
  client: 'Clients',
  project: 'Projets',
  quote: 'Devis',
  task: 'Tâches',
  diagnostic: 'Diagnostics',
  file: 'Fichiers',
  time_entry: 'Saisies de temps',
}

function parentPath(path: string) {
  const parts = path.split('/')
  parts.pop()
  return parts.join('/')
}

export default function GlobalSearch() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResults | null>(null)
  const [loading, setLoading] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen(prev => !prev)
      }
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 30)
    } else {
      setQuery('')
      setResults(null)
      setSelectedIndex(0)
    }
  }, [open])

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults(null)
      setLoading(false)
      return
    }
    const timer = setTimeout(() => {
      setLoading(true)
      globalSearch(query.trim())
        .then(setResults)
        .catch(() => setResults(null))
        .finally(() => setLoading(false))
    }, 220)
    return () => clearTimeout(timer)
  }, [query])

  const quickActions: CommandItem[] = [
    {
      id: 'action-clients',
      group: 'action',
      label: 'Ouvrir les clients',
      secondary: 'Accéder au carnet clients et prospects',
      href: '/clients',
      icon: Users,
    },
    {
      id: 'action-prospection',
      group: 'action',
      label: query.trim() ? `Prospecter "${query.trim()}"` : 'Nouvelle recherche prospection',
      secondary: 'Recherche entreprises et aides IA',
      href: query.trim() ? `/recherche?q=${encodeURIComponent(query.trim())}` : '/recherche',
      icon: Building2,
    },
    {
      id: 'action-notifications',
      group: 'action',
      label: 'Ouvrir les notifications',
      secondary: 'Alertes, relances et échéances',
      href: '/notifications',
      icon: Bell,
    },
    {
      id: 'action-maintenance',
      group: 'action',
      label: 'Ouvrir la maintenance',
      secondary: 'Sauvegardes, mises à jour et état système',
      href: '/maintenance',
      icon: Wrench,
    },
  ]

  const resultItems: CommandItem[] = results ? [
    ...results.clients.map(item => ({
      id: `client-${item.id}`,
      group: 'client' as const,
      label: item.name,
      secondary: item.sector || 'Client',
      badge: item.status,
      href: `/clients/${item.id}`,
      icon: Users,
    })),
    ...results.projects.map(item => ({
      id: `project-${item.id}`,
      group: 'project' as const,
      label: item.name,
      secondary: `${item.code} · ${item.client_name}`,
      href: `/projects/${item.id}`,
      icon: FolderKanban,
    })),
    ...results.quotes.map(item => ({
      id: `quote-${item.id}`,
      group: 'quote' as const,
      label: `${item.number} — ${item.title}`,
      secondary: item.amount_ttc != null
        ? `${item.amount_ttc.toLocaleString('fr-FR')} EUR TTC · ${item.status}`
        : item.status,
      href: `/devis?id=${item.id}`,
      icon: FileText,
    })),
    ...results.tasks.map(item => ({
      id: `task-${item.id}`,
      group: 'task' as const,
      label: item.title,
      secondary: item.status.replace('_', ' '),
      badge: item.priority,
      href: `/crm?focusTask=${item.id}`,
      icon: CheckSquare,
    })),
    ...results.diagnostics.map(item => ({
      id: `diagnostic-${item.id}`,
      group: 'diagnostic' as const,
      label: item.title,
      secondary: `${item.type.toUpperCase()} · ${item.client_name || 'Sans client'}`,
      badge: item.status,
      href: `/diagnostics/${item.id}`,
      icon: ClipboardCheck,
    })),
    ...results.files.map(item => ({
      id: `file-${item.path}`,
      group: 'file' as const,
      label: item.name,
      secondary: item.path,
      badge: item.is_dir ? 'dossier' : item.extension || 'fichier',
      href: item.is_dir
        ? `/files?path=${encodeURIComponent(item.path)}`
        : `/files?path=${encodeURIComponent(parentPath(item.path))}&file=${encodeURIComponent(item.path)}`,
      icon: Folder,
    })),
    ...(results.time_entries ?? []).map(item => ({
      id: `time-entry-${item.id}`,
      group: 'time_entry' as const,
      label: item.description ? (item.description.length > 60 ? `${item.description.slice(0, 60)}…` : item.description) : `Saisie #${item.id}`,
      secondary: [item.project_name, item.date ? new Date(item.date).toLocaleDateString('fr-FR') : null].filter(Boolean).join(' · '),
      href: item.project_id ? `/projets/${item.project_id}` : '/',
      icon: Clock,
    })),
  ] : []

  const items = query.trim().length >= 2 ? [...quickActions, ...resultItems] : quickActions
  const hasSearchResults = resultItems.length > 0

  useEffect(() => {
    setSelectedIndex(0)
  }, [query, results, open])

  const close = () => setOpen(false)

  const runItem = (item?: CommandItem) => {
    if (!item) return
    router.push(item.href)
    close()
  }

  const onInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!items.length) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex(idx => (idx + 1) % items.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex(idx => (idx - 1 + items.length) % items.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      runItem(items[selectedIndex])
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 bg-black/30 px-4 pt-20" onClick={close}>
      <div
        className="mx-auto w-full max-w-2xl overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-gray-100 px-5 py-4">
          <Search size={18} className="shrink-0 text-gray-400" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={onInputKeyDown}
            placeholder="Rechercher partout, ou lancer une action rapide..."
            className="flex-1 text-sm text-gray-900 outline-none placeholder:text-gray-400"
          />
          {query && (
            <button onClick={() => setQuery('')} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
              <X size={15} />
            </button>
          )}
          <div className="hidden items-center gap-2 sm:flex">
            <kbd className="rounded bg-gray-100 px-2 py-1 text-[10px] text-gray-500">↑↓</kbd>
            <kbd className="rounded bg-gray-100 px-2 py-1 text-[10px] text-gray-500">Entrée</kbd>
          </div>
        </div>

        <div className="max-h-[70vh] overflow-y-auto py-2">
          {loading && (
            <div className="px-5 py-8 text-center text-sm text-gray-400">Recherche en cours...</div>
          )}

          {!loading && items.length === 0 && (
            <div className="px-5 py-8 text-center text-sm text-gray-400">Aucun résultat</div>
          )}

          {!loading && items.length > 0 && (
            <>
              {(['action', 'client', 'project', 'quote', 'task', 'diagnostic', 'file', 'time_entry'] as CommandGroup[]).map(group => {
                const groupItems = items.filter(item => item.group === group)
                if (!groupItems.length) return null
                return (
                  <div key={group}>
                    <div className="px-5 py-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                      {GROUP_LABELS[group]}
                    </div>
                    {groupItems.map(item => {
                      const absoluteIndex = items.findIndex(entry => entry.id === item.id)
                      const Icon = item.icon
                      const active = absoluteIndex === selectedIndex
                      return (
                        <button
                          key={item.id}
                          onClick={() => runItem(item)}
                          onMouseEnter={() => setSelectedIndex(absoluteIndex)}
                          className={`flex w-full items-center gap-3 px-5 py-3 text-left transition-colors ${
                            active ? 'bg-accessia-50' : 'hover:bg-gray-50'
                          }`}
                        >
                          <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${active ? 'bg-accessia-100 text-accessia-700' : 'bg-gray-100 text-gray-500'}`}>
                            <Icon size={16} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-medium text-gray-900">{item.label}</div>
                            {item.secondary && <div className="truncate text-xs text-gray-400">{item.secondary}</div>}
                          </div>
                          {item.badge && (
                            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500">
                              {item.badge}
                            </span>
                          )}
                        </button>
                      )
                    })}
                  </div>
                )
              })}
            </>
          )}

          {!loading && query.trim().length >= 2 && !hasSearchResults && (
            <div className="border-t border-gray-100 px-5 py-4 text-xs text-gray-400">
              Aucun résultat métier. Les actions rapides restent disponibles.
            </div>
          )}

          {!query && (
            <div className="border-t border-gray-100 px-5 py-4 text-xs text-gray-400">
              <span className="inline-flex items-center gap-1">
                <Sparkles size={12} />
                Utilisez cette palette pour naviguer vite dans l’application et lancer les modules clés.
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

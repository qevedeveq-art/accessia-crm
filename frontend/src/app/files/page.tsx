'use client'

import { useEffect, useState, Suspense } from 'react'
import { browseRoot, browseDir, readFile, writeFile, FileItem } from '@/lib/api'
import { Folder, File, FileText, ChevronRight, Home, Eye, ArrowLeft, Pencil, Save, X, Loader2 } from 'lucide-react'
import { useSearchParams } from 'next/navigation'
import ReactMarkdown from 'react-markdown'

function FileIcon({ ext, isDir }: { ext?: string | null; isDir: boolean }) {
  if (isDir) return <Folder size={16} className="text-amber-500 shrink-0" />
  if (ext === '.md' || ext === '.txt') return <FileText size={16} className="text-accessia-500 shrink-0" />
  return <File size={16} className="text-gray-400 shrink-0" />
}

function fmtSize(n?: number | null) {
  if (!n) return ''
  if (n < 1024) return `${n} o`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} Ko`
  return `${(n / (1024 * 1024)).toFixed(1)} Mo`
}

const EDITABLE_EXTS = new Set(['.md', '.txt', '.csv', '.json', '.yml', '.yaml'])

function FilesPageInner() {
  const searchParams = useSearchParams()
  const initPath = searchParams.get('path')

  const [items, setItems] = useState<FileItem[]>([])
  const [path, setPath] = useState<string | null>(null)
  const [history, setHistory] = useState<string[]>([])
  const [content, setContent] = useState<{ path: string; fullPath: string; text: string } | null>(null)
  const [editing, setEditing] = useState(false)
  const [editText, setEditText] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveOk, setSaveOk] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const navigate = async (target: string | null) => {
    setLoading(true)
    setError('')
    setContent(null)
    setEditing(false)
    try {
      const data = target ? await browseDir(target) : await browseRoot()
      setItems(data)
      if (target && target !== path) {
        if (path) setHistory(h => [...h, path])
        setPath(target)
      } else if (!target) {
        setHistory([])
        setPath(null)
      }
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const back = () => {
    const prev = history[history.length - 1] ?? null
    setHistory(h => h.slice(0, -1))
    setPath(prev)
    setContent(null)
    setEditing(false)
    if (prev) browseDir(prev).then(setItems).catch(() => {})
    else browseRoot().then(setItems).catch(() => {})
  }

  const openFile = async (item: FileItem) => {
    if (!item.is_dir) {
      const ext = item.extension ?? ''
      if (EDITABLE_EXTS.has(ext) || !ext) {
        try {
          const data = await readFile(item.path)
          setContent({ path: item.name, fullPath: item.path, text: data.content })
          setEditing(false)
        } catch (e: any) {
          setError(e.message)
        }
      }
    } else {
      navigate(item.path)
    }
  }

  const startEdit = () => {
    if (!content) return
    setEditText(content.text)
    setEditing(true)
  }

  const cancelEdit = () => {
    setEditing(false)
    setEditText('')
  }

  const saveEdit = async () => {
    if (!content) return
    setSaving(true)
    setError('')
    try {
      await writeFile(content.fullPath, editText)
      setContent(c => c ? { ...c, text: editText } : c)
      setEditing(false)
      setSaveOk(true)
      setTimeout(() => setSaveOk(false), 2000)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  useEffect(() => {
    navigate(initPath ?? null)
  }, [])

  // Breadcrumb segments
  const crumbs: string[] = path
    ? ['ACCESSIA Pro', ...path.replace(/\\/g, '/').split('/').slice(-3)]
    : ['ACCESSIA Pro']

  const isMarkdown = content?.path.endsWith('.md')
  const canEdit = content && EDITABLE_EXTS.has('.' + (content.path.split('.').pop() ?? ''))

  return (
    <div className="p-6 h-[calc(100vh-0px)]">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Explorateur de fichiers</h1>

      {/* Breadcrumb */}
      <div className="flex items-center gap-1 text-sm text-gray-400 mb-4 overflow-x-auto">
        <button onClick={() => navigate(null)} className="flex items-center gap-1 hover:text-gray-700 transition-colors">
          <Home size={13} /> ACCESSIA Pro
        </button>
        {crumbs.slice(1).map((c, i) => (
          <span key={i} className="flex items-center gap-1">
            <ChevronRight size={12} />
            <span className="text-gray-600">{c}</span>
          </span>
        ))}
      </div>

      <div className="flex gap-4 h-[calc(100vh-180px)]">
        {/* Explorateur */}
        <div className="w-72 bg-white rounded-xl border border-gray-100 shadow-sm overflow-y-auto flex flex-col shrink-0">
          {history.length > 0 && (
            <button onClick={back} className="flex items-center gap-2 px-4 py-3 text-sm text-gray-500 hover:text-gray-900 hover:bg-gray-50 border-b border-gray-100 transition-colors">
              <ArrowLeft size={14} /> Dossier parent
            </button>
          )}
          {loading && <div className="p-4 text-gray-400 text-sm animate-pulse">Chargement…</div>}
          {error && <div className="p-4 text-red-500 text-sm">{error}</div>}
          {!loading && items.map(item => {
            const ext = item.extension ?? ''
            const readable = EDITABLE_EXTS.has(ext) || (!item.is_dir && !ext)
            return (
              <button
                key={item.path}
                onClick={() => openFile(item)}
                className={`flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 text-left border-b border-gray-50 last:border-0 group transition-colors ${content?.path === item.name ? 'bg-accessia-50 border-l-2 border-l-accessia-500' : ''}`}
              >
                <FileIcon ext={item.extension} isDir={item.is_dir} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-800 truncate">{item.name}</p>
                  {!item.is_dir && item.size != null && (
                    <p className="text-[10px] text-gray-400">{fmtSize(item.size)}</p>
                  )}
                </div>
                {readable && !item.is_dir && <Eye size={12} className="shrink-0 text-gray-300 group-hover:text-accessia-400" />}
                {item.is_dir && <ChevronRight size={12} className="shrink-0 text-gray-300" />}
              </button>
            )
          })}
        </div>

        {/* Visionneuse / Éditeur */}
        <div className="flex-1 bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden flex flex-col">
          {!content ? (
            <div className="flex items-center justify-center h-full text-gray-300">
              <div className="text-center">
                <FileText size={48} className="mx-auto mb-3 opacity-30" />
                <p className="text-sm">Cliquez sur un fichier texte pour le prévisualiser</p>
                <p className="text-xs text-gray-300 mt-1">.md .txt .json .csv .yml</p>
              </div>
            </div>
          ) : (
            <>
              {/* Toolbar */}
              <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 bg-gray-50/50 shrink-0">
                <p className="text-xs font-mono text-gray-500 truncate">{content.path}</p>
                <div className="flex items-center gap-2 shrink-0 ml-3">
                  {saveOk && <span className="text-xs text-green-600 font-medium">Enregistré ✓</span>}
                  {editing ? (
                    <>
                      <button onClick={cancelEdit} className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 border border-gray-200 px-2.5 py-1 rounded-lg transition-colors">
                        <X size={12} /> Annuler
                      </button>
                      <button
                        onClick={saveEdit}
                        disabled={saving}
                        className="flex items-center gap-1 text-xs bg-accessia-600 text-white px-2.5 py-1 rounded-lg hover:bg-accessia-700 disabled:opacity-50 transition-colors"
                      >
                        {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                        Enregistrer
                      </button>
                    </>
                  ) : canEdit ? (
                    <button onClick={startEdit} className="flex items-center gap-1 text-xs text-gray-500 hover:text-accessia-600 border border-gray-200 px-2.5 py-1 rounded-lg hover:border-accessia-300 transition-colors">
                      <Pencil size={12} /> Modifier
                    </button>
                  ) : null}
                </div>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto p-6">
                {editing ? (
                  <textarea
                    value={editText}
                    onChange={e => setEditText(e.target.value)}
                    className="w-full h-full text-sm font-mono text-gray-800 leading-relaxed resize-none outline-none border-0"
                    autoFocus
                  />
                ) : isMarkdown ? (
                  <div className="prose prose-sm max-w-none prose-headings:font-bold prose-headings:text-gray-900 prose-p:text-gray-700 prose-a:text-accessia-600 prose-code:bg-gray-100 prose-code:px-1 prose-code:rounded prose-table:text-xs prose-th:bg-gray-50">
                    <ReactMarkdown>{content.text}</ReactMarkdown>
                  </div>
                ) : (
                  <pre className="text-sm text-gray-800 whitespace-pre-wrap font-mono leading-relaxed">{content.text}</pre>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default function FilesPage() {
  return (
    <Suspense fallback={<div className="p-8 text-gray-400 animate-pulse">Chargement…</div>}>
      <FilesPageInner />
    </Suspense>
  )
}

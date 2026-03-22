'use client'

import { useEffect, useState } from 'react'
import { getQuoteTemplates, getProjectTemplates, createProjectTemplate, deleteProjectTemplate } from '@/lib/api'
import { LayoutTemplate, Plus, Trash2, FileText, FolderKanban } from 'lucide-react'

export default function TemplatesPage() {
  const [tab, setTab] = useState<'quotes' | 'projects'>('quotes')
  const [quoteTemplates, setQuoteTemplates] = useState<any[]>([])
  const [projectTemplates, setProjectTemplates] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreateProject, setShowCreateProject] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')

  useEffect(() => {
    Promise.all([getQuoteTemplates(), getProjectTemplates()])
      .then(([q, p]) => { setQuoteTemplates(q); setProjectTemplates(p) })
      .finally(() => setLoading(false))
  }, [])

  const handleCreateProjectTemplate = async () => {
    if (!newName.trim()) return
    await createProjectTemplate({ name: newName.trim(), description: newDesc.trim() || undefined })
    const updated = await getProjectTemplates()
    setProjectTemplates(updated)
    setNewName(''); setNewDesc(''); setShowCreateProject(false)
  }

  const handleDeleteProjectTemplate = async (id: number) => {
    if (!confirm('Supprimer ce template ?')) return
    await deleteProjectTemplate(id)
    setProjectTemplates(prev => prev.filter(t => t.id !== id))
  }

  if (loading) return <div className="p-8 text-gray-500">Chargement...</div>

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <LayoutTemplate size={24} className="text-blue-600" />
        <h1 className="text-2xl font-bold text-gray-900">Templates</h1>
      </div>

      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit mb-6">
        {(['quotes', 'projects'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${tab === t ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            {t === 'quotes' ? '📄 Modèles de devis' : '📁 Modèles de projet'}
          </button>
        ))}
      </div>

      {tab === 'quotes' && (
        <div>
          {quoteTemplates.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <FileText size={48} className="mx-auto mb-3 opacity-30" />
              <p>Aucun modèle de devis.</p>
              <p className="text-sm mt-1">Sauvegardez un devis comme modèle depuis la page Devis.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {quoteTemplates.map(qt => (
                <div key={qt.id} className="bg-white rounded-xl border border-gray-200 p-5">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-semibold text-gray-900">{qt.template_name || qt.title}</h3>
                      <p className="text-gray-400 text-sm mt-1">{qt.amount_ttc?.toLocaleString('fr-FR')} € TTC</p>
                    </div>
                    <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full">Modèle</span>
                  </div>
                  {qt.description && <p className="text-gray-500 text-sm mt-2 line-clamp-2">{qt.description}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'projects' && (
        <div>
          <div className="flex justify-end mb-4">
            <button onClick={() => setShowCreateProject(true)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
              <Plus size={16} /> Nouveau template
            </button>
          </div>

          {showCreateProject && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-4">
              <h3 className="font-medium text-gray-900 mb-3">Nouveau template de projet</h3>
              <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Nom du template *"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <textarea value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="Description (optionnel)" rows={2}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-3 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <div className="flex gap-2">
                <button onClick={handleCreateProjectTemplate}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">Créer</button>
                <button onClick={() => setShowCreateProject(false)}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">Annuler</button>
              </div>
            </div>
          )}

          {projectTemplates.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <FolderKanban size={48} className="mx-auto mb-3 opacity-30" />
              <p>Aucun template de projet.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {projectTemplates.map(t => (
                <div key={t.id} className="bg-white rounded-xl border border-gray-200 p-5">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-semibold text-gray-900">{t.name}</h3>
                      {t.description && <p className="text-gray-500 text-sm mt-1">{t.description}</p>}
                    </div>
                    <button onClick={() => handleDeleteProjectTemplate(t.id)}
                      className="text-gray-400 hover:text-red-500 transition-colors">
                      <Trash2 size={16} />
                    </button>
                  </div>
                  {t.created_at && <p className="text-gray-400 text-xs mt-3">{new Date(t.created_at).toLocaleDateString('fr-FR')}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

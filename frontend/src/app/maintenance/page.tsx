'use client'

import { useEffect, useState } from 'react'
import {
  applyUpdate,
  checkUpdate,
  createBackup,
  getMaintenanceOverview,
  listBackups,
  restoreBackup,
  type BackupInfo,
  type MaintenanceOverview,
  type UpdateStatus,
} from '@/lib/api'
import {
  Archive,
  Database,
  FolderTree,
  GitBranch,
  Loader2,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Wrench,
} from 'lucide-react'

export default function MaintenancePage() {
  const [overview, setOverview] = useState<MaintenanceOverview | null>(null)
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null)
  const [backups, setBackups] = useState<BackupInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const [notice, setNotice] = useState('')

  const load = async () => {
    setLoading(true)
    try {
      const [overviewData, updates, backupData] = await Promise.all([
        getMaintenanceOverview(),
        checkUpdate(),
        listBackups(),
      ])
      setOverview(overviewData)
      setUpdateStatus(updates)
      setBackups(backupData.backups)
    } catch (err: any) {
      setNotice(err.message || 'Impossible de charger le centre de maintenance.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const setTransientNotice = (message: string) => {
    setNotice(message)
    window.setTimeout(() => setNotice(''), 4000)
  }

  const handleBackup = async () => {
    setBusy('backup')
    try {
      const result = await createBackup()
      setTransientNotice(`Sauvegarde créée (${result.count} fichier(s)).`)
      await load()
    } catch (err: any) {
      setTransientNotice(err.message || 'Erreur de sauvegarde.')
    } finally {
      setBusy('')
    }
  }

  const handleRestore = async (filename: string) => {
    if (!window.confirm(`Restaurer la sauvegarde ${filename} ?`)) return
    setBusy(filename)
    try {
      const result = await restoreBackup(filename)
      setTransientNotice(result.message)
      await load()
    } catch (err: any) {
      setTransientNotice(err.message || 'Erreur de restauration.')
    } finally {
      setBusy('')
    }
  }

  const handleUpdateCheck = async () => {
    setBusy('update-check')
    try {
      const result = await checkUpdate()
      setUpdateStatus(result)
      setTransientNotice(result.error || (result.up_to_date ? 'L’application est à jour.' : `${result.commits_behind} mise(s) à jour disponible(s).`))
    } catch (err: any) {
      setTransientNotice(err.message || 'Erreur de vérification.')
    } finally {
      setBusy('')
    }
  }

  const handleUpdateApply = async () => {
    if (!window.confirm('Appliquer la mise à jour maintenant ?')) return
    setBusy('update-apply')
    try {
      const result = await applyUpdate()
      setTransientNotice(result.message)
      await load()
    } catch (err: any) {
      setTransientNotice(err.message || 'Erreur de mise à jour.')
    } finally {
      setBusy('')
    }
  }

  if (loading) {
    return <div className="p-8 text-center text-gray-400">Chargement du centre de maintenance...</div>
  }

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
            <Wrench size={24} className="text-accessia-600" />
            Centre de Maintenance
          </h1>
          <p className="mt-1 text-sm text-gray-500">État de l’application, sauvegardes, chemins et mises à jour.</p>
        </div>
        <button onClick={load} className="flex items-center gap-2 rounded-lg border px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">
          <RefreshCw size={15} />
          Rafraîchir
        </button>
      </div>

      {notice && (
        <div className="mb-4 rounded-xl border border-accessia-200 bg-accessia-50 px-4 py-3 text-sm text-accessia-700">
          {notice}
        </div>
      )}

      {overview && (
        <>
          <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-4">
            <InfoCard icon={Database} label="Clients" value={overview.counts.clients} />
            <InfoCard icon={FolderTree} label="Projets" value={overview.counts.projects} />
            <InfoCard icon={Archive} label="Sauvegardes" value={overview.counts.backups} />
            <InfoCard icon={ShieldCheck} label="Notifications non lues" value={overview.counts.notifications_unread} />
          </div>

          <div className="mb-6 grid gap-6 lg:grid-cols-[1.3fr_1fr]">
            <div className="rounded-2xl border bg-white p-5">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-900">Informations système</h2>
                <span className="rounded-full bg-accessia-50 px-2.5 py-1 text-xs font-medium text-accessia-700">
                  v{overview.version}
                </span>
              </div>
              <div className="space-y-3 text-sm">
                <PathRow label="Base de travail" value={overview.paths.base_dir} />
                <PathRow label="Répertoire applicatif" value={overview.paths.repo_dir} />
                <PathRow label="Base SQLite" value={overview.paths.db_path} />
                <PathRow label="Catalogue" value={overview.paths.catalogue_path} />
                <PathRow label="Sauvegardes" value={overview.paths.backup_dir} />
              </div>
            </div>

            <div className="rounded-2xl border bg-white p-5">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-900">Mises à jour</h2>
                <button
                  onClick={handleUpdateCheck}
                  disabled={busy === 'update-check'}
                  className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                >
                  {busy === 'update-check' ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                  Vérifier
                </button>
              </div>
              <div className="space-y-3 text-sm">
                <div className="rounded-xl bg-gray-50 p-3">
                  <p className="text-xs uppercase tracking-wide text-gray-400">Git</p>
                  <p className="mt-1 font-medium text-gray-800">
                    {overview.git_repo_available ? 'Dépôt disponible pour les mises à jour' : 'Dépôt Git indisponible'}
                  </p>
                </div>
                <div className="rounded-xl bg-gray-50 p-3">
                  <p className="text-xs uppercase tracking-wide text-gray-400">Statut</p>
                  <p className="mt-1 font-medium text-gray-800">
                    {updateStatus?.error
                      ? updateStatus.error
                      : updateStatus?.up_to_date
                      ? 'Application à jour'
                      : `${updateStatus?.commits_behind ?? 0} mise(s) à jour disponible(s)`}
                  </p>
                  {updateStatus?.latest_message && <p className="mt-1 text-xs text-gray-500">{updateStatus.latest_message}</p>}
                </div>
                <button
                  onClick={handleUpdateApply}
                  disabled={busy === 'update-apply' || Boolean(updateStatus?.error) || Boolean(updateStatus?.up_to_date)}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-accessia-600 px-4 py-2 text-sm font-medium text-white hover:bg-accessia-700 disabled:opacity-50"
                >
                  {busy === 'update-apply' ? <Loader2 size={14} className="animate-spin" /> : <GitBranch size={14} />}
                  Appliquer la mise à jour
                </button>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border bg-white p-5">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Sauvegardes</h2>
                <p className="text-sm text-gray-500">Dernière sauvegarde : {overview.last_backup_at ? new Date(overview.last_backup_at).toLocaleString('fr-FR') : 'aucune'}</p>
              </div>
              <button
                onClick={handleBackup}
                disabled={busy === 'backup'}
                className="flex items-center gap-2 rounded-lg bg-accessia-600 px-4 py-2 text-sm font-medium text-white hover:bg-accessia-700 disabled:opacity-50"
              >
                {busy === 'backup' ? <Loader2 size={14} className="animate-spin" /> : <Archive size={14} />}
                Créer une sauvegarde
              </button>
            </div>
            <div className="space-y-2">
              {backups.map(backup => (
                <div key={backup.name} className="flex items-center justify-between rounded-xl border border-gray-100 px-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{backup.name}</p>
                    <p className="text-xs text-gray-400">
                      {new Date(backup.created_at).toLocaleString('fr-FR')} · {(backup.size / 1024).toFixed(1)} Ko
                    </p>
                  </div>
                  <button
                    onClick={() => handleRestore(backup.name)}
                    disabled={busy === backup.name}
                    className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                  >
                    {busy === backup.name ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}
                    Restaurer
                  </button>
                </div>
              ))}
              {backups.length === 0 && <div className="py-8 text-center text-sm text-gray-400">Aucune sauvegarde disponible.</div>}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function InfoCard({ icon: Icon, label, value }: { icon: any; label: string; value: number }) {
  return (
    <div className="rounded-2xl border bg-white p-4">
      <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-accessia-50 text-accessia-700">
        <Icon size={18} />
      </div>
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-lg font-bold text-gray-900">{value}</p>
    </div>
  )
}

function PathRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-gray-50 p-3">
      <p className="text-xs uppercase tracking-wide text-gray-400">{label}</p>
      <p className="mt-1 break-all font-mono text-xs text-gray-700">{value}</p>
    </div>
  )
}

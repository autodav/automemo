import { useCallback } from 'react'
import { useStore } from '../store/AppStore'
import { useUi } from '../components/UiContext'
import { BACKUP_FORMAT, BackupError, parseBackup, type BackupFile } from '../lib/backup'
import { downloadText, readFileAsText } from '../lib/download'
import { getFile } from '../lib/db'
import { todayISO } from '../lib/dates'
import { navigate } from '../lib/router'

export function useImportBackup() {
  const { data, replaceAll } = useStore()
  const { toast, confirm } = useUi()
  return useCallback(async (file?: File) => {
    if (!file) return
    try {
      const text = await readFileAsText(file)
      const backup = parseBackup(text)
      const hasData = data.vehicles.length > 0
      const ok = !hasData || (await confirm({
        title: 'Ripristinare il backup?',
        message: `I dati attuali (${data.vehicles.length} veicoli) verranno sostituiti con quelli del backup (${backup.data.vehicles.length} veicoli, ${backup.data.records.length} interventi, ${backup.data.expenses.length} spese).`,
        confirmLabel: 'Sostituisci dati', danger: true,
      }))
      if (!ok) return
      backup.data.settings.theme = data.settings.theme
      await replaceAll(backup.data, backup.files)
      toast(`Backup ripristinato: ${backup.data.vehicles.length} veicoli`)
      navigate('/', true)
    } catch (e) {
      toast(e instanceof BackupError ? e.message : 'Impossibile importare il file.', 'error')
    }
  }, [data, replaceAll, toast, confirm])
}

export function useExportBackup() {
  const { data } = useStore()
  const { toast } = useUi()
  return useCallback(async (includePhotos = true) => {
    const files: Record<string, string> = {}
    if (includePhotos) {
      for (const r of data.records) {
        if (!r.attachmentId) continue
        const f = await getFile(r.attachmentId).catch(() => undefined)
        if (f) files[r.attachmentId] = f
      }
    }
    const backup: BackupFile = { format: BACKUP_FORMAT, version: 1, exportedAt: new Date().toISOString(), data, files }
    downloadText(`automemo-backup-${todayISO()}.json`, JSON.stringify(backup, null, 2), 'application/json')
    toast('Backup esportato. Conservalo in un posto sicuro: contiene i tuoi dati.')
  }, [data, toast])
}

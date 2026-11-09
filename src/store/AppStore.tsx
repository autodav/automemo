import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { AppData, Deadline, Expense, ServiceRecord, Settings, Vehicle } from '../types'
import { clearAll, deleteFile, loadState, saveFile, saveState } from '../lib/db'
import { DEFAULT_SETTINGS, emptyData } from '../lib/backup'
import { uid } from '../lib/id'
import { todayISO } from '../lib/dates'

export interface NextDeadlineInput {
  intervalMonths?: number
  intervalKm?: number
  fixedDate?: string
  reminderDays?: Deadline['reminderDays']
}

interface Store {
  data: AppData
  ready: boolean
  saveError: string | null
  activeVehicle?: Vehicle
  addVehicle: (v: Omit<Vehicle, 'id' | 'createdAt' | 'kmUpdatedAt'>) => string
  updateVehicle: (id: string, patch: Partial<Vehicle>) => void
  deleteVehicle: (id: string) => Promise<void>
  setActiveVehicle: (id: string) => void
  updateKm: (id: string, km: number) => void
  addRecord: (r: Omit<ServiceRecord, 'id' | 'createdAt'>, next?: NextDeadlineInput) => string
  updateRecord: (id: string, patch: Partial<ServiceRecord>) => void
  deleteRecord: (id: string) => Promise<void>
  upsertDeadline: (d: Omit<Deadline, 'id' | 'createdAt'> & { id?: string }) => string
  deleteDeadline: (id: string) => void
  addExpense: (e: Omit<Expense, 'id' | 'createdAt'>) => void
  updateExpense: (id: string, patch: Partial<Expense>) => void
  deleteExpense: (id: string) => void
  updateSettings: (patch: Partial<Settings>) => void
  dismissReminder: (key: string) => void
  replaceAll: (data: AppData, files: Record<string, string>) => Promise<void>
  resetAll: () => Promise<void>
}

const Ctx = createContext<Store | null>(null)

const sameKind = (d: Deadline, vehicleId: string, type: Deadline['type'], label?: string) =>
  d.vehicleId === vehicleId && d.type === type && (type !== 'personalizzata' || (d.customLabel || '').trim().toLowerCase() === (label || '').trim().toLowerCase())

export function AppStoreProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData>(emptyData)
  const [ready, setReady] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const loaded = useRef(false)
  const dataRef = useRef(data)
  dataRef.current = data

  useEffect(() => {
    loadState().then((stored) => {
      if (stored) setData({ ...emptyData(), ...stored, settings: { ...DEFAULT_SETTINGS, ...stored.settings } })
      loaded.current = true
      setReady(true)
    })
  }, [])

  useEffect(() => {
    if (!loaded.current) return
    saveState(data)
      .then(() => setSaveError(null))
      .catch(() => setSaveError('Impossibile salvare i dati su questo dispositivo. Lo spazio potrebbe essere esaurito o il browser potrebbe essere in modalità privata.'))
  }, [data])

  const update = useCallback((fn: (d: AppData) => AppData) => setData((d) => fn(d)), [])

  const addVehicle: Store['addVehicle'] = useCallback((v) => {
    const id = uid('v')
    const now = new Date().toISOString()
    update((d) => ({ ...d, vehicles: [...d.vehicles, { ...v, id, createdAt: now, kmUpdatedAt: todayISO() }], settings: { ...d.settings, activeVehicleId: id } }))
    return id
  }, [update])

  const updateVehicle: Store['updateVehicle'] = useCallback((id, patch) => {
    update((d) => ({ ...d, vehicles: d.vehicles.map((v) => (v.id === id ? { ...v, ...patch, ...(patch.km !== undefined && patch.km !== v.km ? { kmUpdatedAt: todayISO() } : {}) } : v)) }))
  }, [update])

  const deleteVehicle: Store['deleteVehicle'] = useCallback(async (id) => {
    const attachments = dataRef.current.records.filter((r) => r.vehicleId === id && r.attachmentId).map((r) => r.attachmentId!)
    update((d) => {
      const vehicles = d.vehicles.filter((v) => v.id !== id)
      return {
        ...d,
        vehicles,
        records: d.records.filter((r) => r.vehicleId !== id),
        deadlines: d.deadlines.filter((x) => x.vehicleId !== id),
        expenses: d.expenses.filter((x) => x.vehicleId !== id),
        settings: { ...d.settings, activeVehicleId: d.settings.activeVehicleId === id ? vehicles[0]?.id : d.settings.activeVehicleId },
      }
    })
    await Promise.all(attachments.map((a) => deleteFile(a).catch(() => undefined)))
  }, [update])

  const setActiveVehicle = useCallback((id: string) => update((d) => ({ ...d, settings: { ...d.settings, activeVehicleId: id } })), [update])
  const updateKm = useCallback((id: string, km: number) => updateVehicle(id, { km }), [updateVehicle])

  const addRecord: Store['addRecord'] = useCallback((r, next) => {
    const id = uid('r')
    update((d) => {
      const record: ServiceRecord = { ...r, id, createdAt: new Date().toISOString() }
      const vehicles = d.vehicles.map((v) => (v.id === r.vehicleId && r.km !== undefined && r.km > v.km ? { ...v, km: r.km, kmUpdatedAt: todayISO() } : v))
      let deadlines = d.deadlines
      const existing = d.deadlines.find((x) => sameKind(x, r.vehicleId, r.type, r.customLabel))
      const hasNext = next && (next.intervalMonths || next.intervalKm || next.fixedDate)
      if (existing) {
        const isNewer = !existing.lastDate || r.date >= existing.lastDate
        if (isNewer) {
          const intervalMonths = next?.intervalMonths ?? existing.intervalMonths
          const intervalKm = next?.intervalKm ?? existing.intervalKm
          let fixedDate = next?.fixedDate ?? existing.fixedDate
          if (!next?.fixedDate && (intervalMonths || (fixedDate && fixedDate <= r.date))) fixedDate = undefined
          let fixedKm = existing.fixedKm
          if (intervalKm || (fixedKm !== undefined && r.km !== undefined && fixedKm <= r.km)) fixedKm = undefined
          const updated: Deadline = {
            ...existing, lastDate: r.date, lastKm: r.km ?? existing.lastKm, intervalMonths, intervalKm, fixedDate, fixedKm,
            reminderDays: next?.reminderDays ?? existing.reminderDays,
          }
          deadlines = d.deadlines.map((x) => (x.id === existing.id ? updated : x))
        }
      } else if (hasNext) {
        deadlines = [...d.deadlines, {
          id: uid('d'), vehicleId: r.vehicleId, type: r.type, customLabel: r.customLabel, lastDate: r.date, lastKm: r.km,
          intervalMonths: next!.intervalMonths, intervalKm: next!.intervalKm, fixedDate: next!.fixedDate,
          reminderDays: next!.reminderDays ?? [30, 15, 7, 1], createdAt: new Date().toISOString(),
        }]
      }
      return { ...d, vehicles, records: [record, ...d.records], deadlines }
    })
    return id
  }, [update])

  const updateRecord: Store['updateRecord'] = useCallback((id, patch) => {
    update((d) => ({ ...d, records: d.records.map((r) => (r.id === id ? { ...r, ...patch } : r)) }))
  }, [update])

  const deleteRecord: Store['deleteRecord'] = useCallback(async (id) => {
    const att = dataRef.current.records.find((r) => r.id === id)?.attachmentId
    update((d) => ({ ...d, records: d.records.filter((r) => r.id !== id) }))
    if (att) await deleteFile(att).catch(() => undefined)
  }, [update])

  const upsertDeadline: Store['upsertDeadline'] = useCallback((dl) => {
    const id = dl.id ?? uid('d')
    update((d) => {
      const exists = d.deadlines.some((x) => x.id === id)
      const item: Deadline = { createdAt: new Date().toISOString(), ...(exists ? d.deadlines.find((x) => x.id === id) : {}), ...dl, id } as Deadline
      return { ...d, deadlines: exists ? d.deadlines.map((x) => (x.id === id ? item : x)) : [...d.deadlines, item] }
    })
    return id
  }, [update])

  const deleteDeadline = useCallback((id: string) => update((d) => ({ ...d, deadlines: d.deadlines.filter((x) => x.id !== id) })), [update])

  const addExpense: Store['addExpense'] = useCallback((e) => {
    update((d) => ({ ...d, expenses: [{ ...e, id: uid('e'), createdAt: new Date().toISOString() }, ...d.expenses] }))
  }, [update])
  const updateExpense: Store['updateExpense'] = useCallback((id, patch) => {
    update((d) => ({ ...d, expenses: d.expenses.map((e) => (e.id === id ? { ...e, ...patch } : e)) }))
  }, [update])
  const deleteExpense = useCallback((id: string) => update((d) => ({ ...d, expenses: d.expenses.filter((e) => e.id !== id) })), [update])

  const updateSettings = useCallback((patch: Partial<Settings>) => update((d) => ({ ...d, settings: { ...d.settings, ...patch } })), [update])
  const dismissReminder = useCallback((key: string) => update((d) => ({ ...d, settings: { ...d.settings, dismissedReminders: [...d.settings.dismissedReminders.slice(-300), key] } })), [update])

  const replaceAll: Store['replaceAll'] = useCallback(async (next, files) => {
    await clearAll()
    for (const [k, v] of Object.entries(files)) await saveFile(k, v)
    await saveState(next)
    setData(next)
  }, [])

  const resetAll = useCallback(async () => {
    await clearAll()
    const fresh = emptyData()
    fresh.settings.theme = data.settings.theme
    setData(fresh)
  }, [data.settings.theme])

  const activeVehicle = useMemo(
    () => data.vehicles.find((v) => v.id === data.settings.activeVehicleId) ?? data.vehicles[0],
    [data.vehicles, data.settings.activeVehicleId],
  )

  const value: Store = {
    data, ready, saveError, activeVehicle,
    addVehicle, updateVehicle, deleteVehicle, setActiveVehicle, updateKm,
    addRecord, updateRecord, deleteRecord, upsertDeadline, deleteDeadline,
    addExpense, updateExpense, deleteExpense, updateSettings, dismissReminder, replaceAll, resetAll,
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useStore(): Store {
  const s = useContext(Ctx)
  if (!s) throw new Error('useStore fuori dal provider')
  return s
}

import { useState } from 'react'
import { ArrowLeft, Lock, Trash2 } from 'lucide-react'
import type { Fuel } from '../types'
import { useStore } from '../store/AppStore'
import { useUi } from '../components/UiContext'
import { Button, Field, IconButton, Input, Notice, Select } from '../components/ui'
import { FUELS } from '../lib/constants'
import { parseKm } from '../lib/format'
import { navigate } from '../lib/router'

export function VehicleForm({ vehicleId }: { vehicleId?: string }) {
  const { data, addVehicle, updateVehicle, deleteVehicle } = useStore()
  const { toast, confirm } = useUi()
  const existing = vehicleId ? data.vehicles.find((v) => v.id === vehicleId) : undefined
  const [name, setName] = useState(existing?.name ?? '')
  const [year, setYear] = useState(existing ? String(existing.year) : '')
  const [fuel, setFuel] = useState<Fuel>(existing?.fuel ?? 'benzina')
  const [plate, setPlate] = useState(existing?.plate ?? '')
  const [km, setKm] = useState(existing ? String(existing.km) : '')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const thisYear = new Date().getFullYear()

  if (vehicleId && !existing) {
    return (
      <div className="p-6"><Notice tone="warning">Veicolo non trovato. Potrebbe essere stato eliminato.</Notice><Button className="mt-4" onClick={() => navigate('/')}>Torna alla home</Button></div>
    )
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const errs: Record<string, string> = {}
    const y = Number(year)
    const k = parseKm(km)
    const p = plate.trim().toUpperCase().replace(/\s+/g, '')
    if (name.trim().length < 2) errs.name = 'Inserisci marca e modello (es. Fiat Panda).'
    if (!Number.isInteger(y) || y < 1950 || y > thisYear + 1) errs.year = `Inserisci un anno tra 1950 e ${thisYear + 1}.`
    if (k === undefined || Number.isNaN(k) || k < 0 || k > 3_000_000) errs.km = 'Inserisci i chilometri attuali (es. 85000).'
    if (p && !/^[A-Z0-9]{4,10}$/.test(p)) errs.plate = 'La targa può contenere solo lettere e numeri.'
    setErrors(errs)
    if (Object.keys(errs).length) return
    const payload = { name: name.trim(), year: y, fuel, plate: p || undefined, km: k! }
    if (existing) {
      updateVehicle(existing.id, payload)
      toast('Dati dell’auto aggiornati')
      navigate('/impostazioni')
    } else {
      addVehicle(payload)
      toast('Auto aggiunta! Ora imposta le tue scadenze.')
      navigate('/', true)
    }
  }

  const remove = async () => {
    if (!existing) return
    const ok = await confirm({
      title: `Eliminare ${existing.name}?`,
      message: 'Verranno eliminati anche tutti gli interventi, le scadenze, le spese e le foto di questo veicolo. Se vuoi conservarli, esporta prima un backup.',
      confirmLabel: 'Elimina veicolo', danger: true,
    })
    if (!ok) return
    await deleteVehicle(existing.id)
    toast('Veicolo eliminato')
    navigate(data.vehicles.length > 1 ? '/impostazioni' : '/', true)
  }

  const canGoBack = data.vehicles.length > 0
  return (
    <div className="mx-auto max-w-lg px-5 pb-10 pt-4 safe-top animate-fade-in">
      <div className="mb-4 flex items-center gap-2">
        <IconButton label="Indietro" onClick={() => (canGoBack ? window.history.back() : navigate('/', true))}><ArrowLeft size={20} /></IconButton>
        <h1 className="text-xl font-extrabold">{existing ? 'Modifica auto' : 'Aggiungi la tua auto'}</h1>
      </div>
      <form onSubmit={submit} className="space-y-4" noValidate data-testid="vehicle-form">
        <Field label="Marca e modello" htmlFor="v-name" error={errors.name}>
          <Input id="v-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Es. Fiat Panda 1.2" autoComplete="off" invalid={!!errors.name} autoFocus={!existing} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Anno immatricolazione" htmlFor="v-year" error={errors.year}>
            <Input id="v-year" inputMode="numeric" value={year} onChange={(e) => setYear(e.target.value)} placeholder={String(thisYear - 5)} invalid={!!errors.year} />
          </Field>
          <Field label="Alimentazione" htmlFor="v-fuel">
            <Select id="v-fuel" value={fuel} onChange={(e) => setFuel(e.target.value as Fuel)}>
              {FUELS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
            </Select>
          </Field>
        </div>
        <Field label="Chilometraggio attuale" htmlFor="v-km" error={errors.km}>
          <Input id="v-km" inputMode="numeric" value={km} onChange={(e) => setKm(e.target.value)} placeholder="Es. 85000" invalid={!!errors.km} />
        </Field>
        <Field label="Targa (facoltativa)" htmlFor="v-plate" error={errors.plate} hint={<span className="inline-flex items-center gap-1"><Lock size={12} /> Resta solo su questo dispositivo e non viene usata per verifiche online.</span>}>
          <Input id="v-plate" value={plate} onChange={(e) => setPlate(e.target.value.toUpperCase())} placeholder="AA000AA" autoComplete="off" autoCapitalize="characters" invalid={!!errors.plate} />
        </Field>
        <Button type="submit" size="lg" className="w-full" data-testid="vehicle-save">{existing ? 'Salva modifiche' : 'Salva e continua'}</Button>
        {existing && (
          <Button variant="secondary" className="w-full text-red-600 dark:text-red-400" onClick={remove} data-testid="vehicle-delete"><Trash2 size={18} /> Elimina veicolo</Button>
        )}
      </form>
    </div>
  )
}

import { REMINDER_OPTIONS } from '../lib/constants'
import type { ReminderDay } from '../types'
import { cx } from './ui'

export function ReminderPicker({ value, onChange }: { value: ReminderDay[]; onChange: (v: ReminderDay[]) => void }) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Promemoria">
      {REMINDER_OPTIONS.map((d) => {
        const on = value.includes(d)
        return (
          <button key={d} type="button" aria-pressed={on} onClick={() => onChange(on ? value.filter((x) => x !== d) : [...value, d].sort((a, b) => b - a))}
            className={cx('rounded-full px-3.5 py-2 text-sm font-semibold ring-1 transition active:scale-95', on ? 'bg-electric-500 text-white ring-electric-500' : 'bg-transparent text-slate-600 ring-slate-300 dark:text-slate-300 dark:ring-night-600')}>
            {d === 1 ? '1 giorno' : `${d} giorni`}
          </button>
        )
      })}
    </div>
  )
}

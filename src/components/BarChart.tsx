import { MONTHS_SHORT } from '../lib/dates'
import { formatEuro } from '../lib/format'
import { cx } from './ui'

/** Grafico a barre SVG leggero (nessuna dipendenza esterna). */
export function MonthlyBarChart({ values, selected, onSelect }: { values: number[]; selected: number; onSelect: (m: number) => void }) {
  const max = Math.max(...values, 1)
  const W = 360, H = 160, pad = 18, bw = (W - pad * 2) / 12
  return (
    <div className="w-full" data-testid="expense-chart">
      <svg viewBox={`0 0 ${W} ${H + 22}`} className="w-full" role="img" aria-label="Spese mensili">
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <line key={f} x1={pad} x2={W - pad} y1={H - f * (H - 16)} y2={H - f * (H - 16)} className="stroke-slate-200 dark:stroke-night-700" strokeDasharray="3 4" />
        ))}
        {values.map((v, i) => {
          const h = v > 0 ? Math.max(4, (v / max) * (H - 16)) : 2
          const x = pad + i * bw + bw * 0.18
          const on = i === selected
          return (
            <g key={i} onClick={() => onSelect(i)} className="cursor-pointer">
              <rect x={pad + i * bw} y={0} width={bw} height={H + 22} fill="transparent" />
              <rect x={x} y={H - h} width={bw * 0.64} height={h} rx={5} className={cx('transition-all duration-500', on ? 'fill-electric-500' : v > 0 ? 'fill-electric-300 dark:fill-night-600' : 'fill-slate-200 dark:fill-night-700')}>
                <title>{`${MONTHS_SHORT[i]}: ${formatEuro(v)}`}</title>
              </rect>
              <text x={pad + i * bw + bw / 2} y={H + 16} textAnchor="middle" className={cx('text-[10px]', on ? 'fill-electric-600 font-bold dark:fill-electric-400' : 'fill-slate-400')}>{MONTHS_SHORT[i]}</text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

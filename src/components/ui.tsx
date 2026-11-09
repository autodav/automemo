import { useEffect, useId, type ButtonHTMLAttributes, type ComponentProps, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { X } from 'lucide-react'
import type { Status } from '../lib/deadlines'

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ')
export { cx }

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
export function Button({ variant = 'primary', size = 'md', className, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' | 'lg' }) {
  const base = 'inline-flex items-center justify-center gap-2 rounded-2xl font-semibold transition active:scale-[0.97] disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-electric-500'
  const sizes = { sm: 'h-9 px-3 text-sm', md: 'h-11 px-4 text-[15px]', lg: 'h-14 px-6 text-base' }
  const variants: Record<Variant, string> = {
    primary: 'bg-electric-500 text-white shadow-lg shadow-electric-500/25 hover:bg-electric-600',
    secondary: 'bg-white text-night-900 ring-1 ring-slate-200 hover:bg-slate-50 dark:bg-night-800 dark:text-slate-100 dark:ring-night-600 dark:hover:bg-night-700',
    ghost: 'text-electric-600 hover:bg-electric-500/10 dark:text-electric-400',
    danger: 'bg-red-500 text-white hover:bg-red-600 shadow-lg shadow-red-500/20',
  }
  return <button type="button" className={cx(base, sizes[size], variants[variant], className)} {...rest}>{children}</button>
}

export function IconButton({ label, className, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button type="button" aria-label={label} title={label} className={cx('relative inline-flex h-10 w-10 items-center justify-center rounded-full text-night-700 transition hover:bg-slate-200/70 active:scale-95 dark:text-slate-200 dark:hover:bg-night-700', className)} {...rest}>
      {children}
    </button>
  )
}

export function Card({ className, children, onClick, ...rest }: { className?: string; children: ReactNode; onClick?: () => void; 'data-testid'?: string }) {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag type={onClick ? 'button' : undefined} onClick={onClick} className={cx('block w-full rounded-3xl bg-white p-4 text-left shadow-sm ring-1 ring-slate-200/70 dark:bg-night-900 dark:ring-night-700', onClick && 'transition active:scale-[0.99] hover:ring-electric-400/50', className)} {...rest}>
      {children}
    </Tag>
  )
}

export function Field({ label, hint, error, children, htmlFor }: { label: string; hint?: ReactNode; error?: string; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-medium text-slate-600 dark:text-slate-300">{label}</label>
      {children}
      {error ? <p className="text-sm text-red-600 dark:text-red-400" role="alert">{error}</p> : hint ? <p className="text-xs text-slate-500 dark:text-slate-400">{hint}</p> : null}
    </div>
  )
}

const inputCls = 'w-full rounded-2xl border-0 bg-slate-100 px-4 py-3 text-[16px] text-night-900 ring-1 ring-transparent placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-electric-500 dark:bg-night-800 dark:text-slate-100 dark:focus:bg-night-800'
export function Input({ className, invalid, ...rest }: ComponentProps<'input'> & { invalid?: boolean }) {
  return <input className={cx(inputCls, invalid && 'ring-2 ring-red-400', className)} aria-invalid={invalid || undefined} {...rest} />
}
export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cx(inputCls, 'appearance-none', className)} {...rest}>{children}</select>
}
export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cx(inputCls, 'min-h-20 resize-y', className)} {...rest} />
}

export function Sheet({ open, onClose, title, children, footer, testId }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; testId?: string }) {
  const titleId = useId()
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev }
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-labelledby={titleId} data-testid={testId}>
      <div className="absolute inset-0 animate-fade-in bg-night-950/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative flex max-h-[92dvh] w-full max-w-lg animate-slide-up flex-col rounded-t-[2rem] bg-white shadow-2xl sm:animate-pop sm:rounded-[2rem] dark:bg-night-900">
        <div className="flex items-center justify-between px-5 pb-2 pt-4">
          <h2 id={titleId} className="text-lg font-bold">{title}</h2>
          <IconButton label="Chiudi" onClick={onClose}><X size={20} /></IconButton>
        </div>
        <div className="flex-1 overflow-y-auto px-5 pb-4">{children}</div>
        {footer && <div className="safe-bottom border-t border-slate-100 px-5 py-3 dark:border-night-700">{footer}</div>}
      </div>
    </div>
  )
}

export const STATUS_STYLES: Record<Status, { dot: string; text: string; bg: string; ring: string }> = {
  ok: { dot: 'bg-emerald-500', text: 'text-emerald-700 dark:text-emerald-400', bg: 'bg-emerald-500/10', ring: 'ring-emerald-500/30' },
  warning: { dot: 'bg-amber-400', text: 'text-amber-700 dark:text-amber-300', bg: 'bg-amber-400/15', ring: 'ring-amber-400/40' },
  overdue: { dot: 'bg-red-500', text: 'text-red-600 dark:text-red-400', bg: 'bg-red-500/10', ring: 'ring-red-500/40' },
  unset: { dot: 'bg-slate-400', text: 'text-slate-500 dark:text-slate-400', bg: 'bg-slate-400/10', ring: 'ring-slate-400/30' },
}

export function StatusBadge({ status, label }: { status: Status; label: string }) {
  const s = STATUS_STYLES[status]
  return (
    <span className={cx('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold', s.bg, s.text)} data-status={status}>
      <span className={cx('h-2 w-2 rounded-full', s.dot)} />
      {label}
    </span>
  )
}

export function EmptyState({ icon, title, text, action }: { icon: ReactNode; title: string; text: string; action?: ReactNode }) {
  return (
    <div className="flex animate-fade-in flex-col items-center rounded-3xl border border-dashed border-slate-300 px-6 py-10 text-center dark:border-night-600">
      <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-electric-500/10 text-electric-500">{icon}</div>
      <h3 className="font-bold">{title}</h3>
      <p className="mt-1 max-w-xs text-sm text-slate-500 dark:text-slate-400">{text}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function Segmented<T extends string>({ value, options, onChange, className }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; className?: string }) {
  return (
    <div className={cx('flex rounded-2xl bg-slate-200/70 p-1 dark:bg-night-800', className)} role="tablist">
      {options.map((o) => (
        <button key={o.value} type="button" role="tab" aria-selected={value === o.value} onClick={() => onChange(o.value)}
          className={cx('flex-1 rounded-xl px-3 py-2 text-sm font-semibold transition', value === o.value ? 'bg-white text-night-900 shadow dark:bg-night-600 dark:text-white' : 'text-slate-500 dark:text-slate-400')}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Notice({ tone = 'info', children, className }: { tone?: 'info' | 'warning' | 'danger'; children: ReactNode; className?: string }) {
  const tones = {
    info: 'bg-electric-500/10 text-night-800 dark:text-electric-300',
    warning: 'bg-amber-400/15 text-amber-900 dark:text-amber-200',
    danger: 'bg-red-500/10 text-red-700 dark:text-red-300',
  }
  return <div className={cx('rounded-2xl px-4 py-3 text-sm leading-relaxed', tones[tone], className)}>{children}</div>
}

export function PageHeader({ title, subtitle, right }: { title: string; subtitle?: string; right?: ReactNode }) {
  return (
    <div className="mb-4 flex items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">{title}</h1>
        {subtitle && <p className="text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>}
      </div>
      {right}
    </div>
  )
}

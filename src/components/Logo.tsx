export function LogoMark({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <linearGradient id="am-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#4DA8FF" />
          <stop offset="1" stopColor="#1C5FE0" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="18" fill="#0A1430" />
      <path d="M14 38l5-11a6 6 0 0 1 5.5-3.6h15A6 6 0 0 1 45 27l5 11v7a2 2 0 0 1-2 2h-3a2 2 0 0 1-2-2v-2H21v2a2 2 0 0 1-2 2h-3a2 2 0 0 1-2-2z" fill="url(#am-g)" />
      <circle cx="22" cy="37" r="3" fill="#0A1430" />
      <circle cx="42" cy="37" r="3" fill="#0A1430" />
      <path d="M26 30l4 3.5 8-7" stroke="#fff" strokeWidth="3.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function Logo({ size = 40 }: { size?: number }) {
  return (
    <div className="flex items-center gap-2.5">
      <LogoMark size={size} />
      <span className="text-xl font-extrabold tracking-tight">Auto<span className="text-electric-500">Memo</span></span>
    </div>
  )
}

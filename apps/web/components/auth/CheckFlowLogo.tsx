export function CheckFlowLogo() {
  return (
    <div className="flex items-center justify-center gap-2 mb-8">
      {/* Ícone checkmark bicolor */}
      <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
        <path d="M6 18 L14 26 L30 10" stroke="url(#grad)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>
        <defs>
          <linearGradient id="grad" x1="6" y1="18" x2="30" y2="10" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#F97316"/>
            <stop offset="100%" stopColor="#EC4899"/>
          </linearGradient>
        </defs>
      </svg>
      <span className="text-2xl font-bold text-gray-800 tracking-tight">checkflow</span>
      {/* Estrela sparkle */}
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <path d="M7 0L8.5 5.5L14 7L8.5 8.5L7 14L5.5 8.5L0 7L5.5 5.5L7 0Z" fill="#1e293b"/>
      </svg>
    </div>
  )
}

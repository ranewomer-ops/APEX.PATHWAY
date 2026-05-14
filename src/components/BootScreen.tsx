export function BootScreen() {
  return (
    <div className="boot-screen">
      <LogoMark />
      <p>Loading Apex Pathway</p>
    </div>
  );
}

export function LogoMark({ size = 120 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" aria-hidden>
      <defs>
        <linearGradient id="g1" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#3b82f6" />
          <stop offset="100%" stopColor="#22d3ee" />
        </linearGradient>
      </defs>
      <rect x="8" y="8" width="104" height="104" rx="24" fill="#12161c" stroke="url(#g1)" strokeWidth="3" />
      <path
        d="M38 78 L60 36 L82 78"
        fill="none"
        stroke="url(#g1)"
        strokeWidth="8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

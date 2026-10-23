export function LogoMark({ className = "h-7 w-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="var(--accent)" />
      <path
        d="M9 20.5c1.4 1.6 3.6 2.5 6.4 2.5 3.6 0 5.8-1.7 5.8-4.2 0-2.3-1.6-3.4-5-4.1l-1.6-.3c-1.7-.4-2.4-.9-2.4-1.8 0-1.1 1.1-1.8 2.8-1.8 1.7 0 3 .7 3.8 1.8"
        fill="none"
        stroke="white"
        strokeWidth="2.6"
        strokeLinecap="round"
      />
      <circle cx="23.5" cy="9" r="2" fill="white" />
    </svg>
  );
}

export function Logo() {
  return (
    <span className="flex items-center gap-2">
      <LogoMark />
      <span className="text-[1.05rem] font-semibold tracking-tight">
        Ski<span className="text-accent">Host</span>
      </span>
    </span>
  );
}

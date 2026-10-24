import Link from "next/link";
import { KeyRound, Palette, ShieldCheck } from "lucide-react";

const TABS = [
  { href: "/settings/tokens", label: "API tokens", icon: KeyRound },
  { href: "/settings/security", label: "Security & account", icon: ShieldCheck },
  { href: "/settings/appearance", label: "Appearance", icon: Palette },
] as const;

export function SettingsNav({ active }: { active: (typeof TABS)[number]["href"] }) {
  return (
    <nav className="mb-8 flex gap-1 border-b border-line text-sm" aria-label="Settings">
      {TABS.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          className={`-mb-px flex items-center gap-2 border-b-2 px-3 py-2.5 ${active === href ? "border-accent font-medium text-fg" : "border-transparent text-muted hover:text-fg"}`}
        >
          <Icon className="h-4 w-4" /> {label}
        </Link>
      ))}
    </nav>
  );
}

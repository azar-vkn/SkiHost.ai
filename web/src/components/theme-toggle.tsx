"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

type Choice = "system" | "light" | "dark";

/** Appearance setting: light, dark, or follow the operating system. Stored per browser. */
export function ThemeSettings() {
  const [choice, setChoice] = useState<Choice>("system");

  useEffect(() => {
    try {
      const saved = localStorage.getItem("skihost-theme");
      setChoice(saved === "light" || saved === "dark" ? saved : "system");
    } catch {}
  }, []);

  function apply(next: Choice) {
    setChoice(next);
    const resolved = next === "system" ? (window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark") : next;
    document.documentElement.dataset.theme = resolved;
    try {
      if (next === "system") localStorage.removeItem("skihost-theme");
      else localStorage.setItem("skihost-theme", next);
    } catch {}
  }

  const options: [Choice, string, string, typeof Sun][] = [
    ["system", "System", "Match your device's setting", Monitor],
    ["light", "Light", "Blue on white", Sun],
    ["dark", "Dark", "Blue on black", Moon],
  ];
  return (
    <div className="grid gap-3 sm:grid-cols-3" role="radiogroup" aria-label="Theme">
      {options.map(([value, label, hint, Icon]) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={choice === value}
          onClick={() => apply(value)}
          className={`card flex items-start gap-3 p-4 text-left transition ${choice === value ? "border-accent bg-accent-subtle" : "hover:border-accent-line"}`}
        >
          <Icon className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
          <span>
            <span className="block font-medium">{label}</span>
            <span className="block text-xs text-muted">{hint}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

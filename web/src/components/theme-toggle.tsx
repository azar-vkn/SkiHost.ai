"use client";

import { Moon, Sun } from "lucide-react";

/** Flips data-theme on <html>; the inline script in the layout applies the saved choice before paint. */
export function ThemeToggle() {
  function toggle() {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("skihost-theme", next);
    } catch {}
  }
  return (
    <button onClick={toggle} className="btn btn-ghost h-8 w-8 px-0" aria-label="Toggle color theme" title="Toggle theme">
      <Sun className="hidden h-4 w-4 dark:block" />
      <Moon className="h-4 w-4 dark:hidden" />
    </button>
  );
}

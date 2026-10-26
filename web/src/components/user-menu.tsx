"use client";

import Link from "next/link";
import { Boxes, ChevronDown, KeyRound, Lock, LogOut, Palette, Plus, ShieldAlert, User, UserPen } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { signOut } from "@/app/actions/auth";

export function UserMenu({ username, isAdmin = false }: { username: string; isAdmin?: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, []);

  const item = "flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm hover:bg-inset";
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(!open)} className="btn btn-ghost gap-1.5 px-1.5" aria-expanded={open} aria-haspopup="menu">
        <Avatar name={username} />
        <ChevronDown className="h-3.5 w-3.5 text-muted" />
      </button>
      {open && (
        // Close on link clicks only: closing on every click would unmount the sign-out form before the browser submits it.
        <div
          role="menu"
          className="card absolute right-0 z-50 mt-2 w-56 p-1.5 shadow-card"
          onClick={(e) => (e.target as HTMLElement).closest("a") && setOpen(false)}
        >
          <div className="px-2.5 py-2 text-xs text-muted">
            Signed in as <span className="font-semibold text-fg">{username}</span>
          </div>
          <div className="my-1 border-t border-line-muted" />
          <Link href={`/${username}`} className={item}>
            <User className="h-4 w-4" /> Your profile
          </Link>
          <Link href={`/${username}`} className={item}>
            <Boxes className="h-4 w-4" /> Your racks
          </Link>
          <Link href="/settings/profile" className={item}>
            <UserPen className="h-4 w-4" /> Edit profile
          </Link>
          <Link href="/new" className={item}>
            <Plus className="h-4 w-4" /> New rack
          </Link>
          <Link href="/settings/tokens" className={item}>
            <KeyRound className="h-4 w-4" /> API tokens
          </Link>
          <Link href="/settings/security" className={item}>
            <Lock className="h-4 w-4" /> Security
          </Link>
          <Link href="/settings/appearance" className={item}>
            <Palette className="h-4 w-4" /> Appearance
          </Link>
          {isAdmin && (
            <Link href="/admin" className={item}>
              <ShieldAlert className="h-4 w-4" /> Moderation
            </Link>
          )}
          <div className="my-1 border-t border-line-muted" />
          <form action={signOut}>
            <button className={`${item} w-full text-left`}>
              <LogOut className="h-4 w-4" /> Sign out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

export function Avatar({ name, size = 28 }: { name: string; size?: number }) {
  // Deterministic hue from the name keeps everyone's avatar in the blue family.
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % 360;
  const hue = 200 + (h % 50);
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white"
      style={{ width: size, height: size, fontSize: size * 0.42, background: `linear-gradient(135deg, hsl(${hue} 85% 55%), hsl(${hue + 20} 80% 35%))` }}
      aria-hidden="true"
    >
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

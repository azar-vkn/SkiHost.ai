"use client";

import Link from "next/link";
import { Star } from "lucide-react";
import { useState, useTransition } from "react";

export function StarButton({
  owner,
  name,
  initialStarred,
  initialCount,
  signedIn,
}: {
  owner: string;
  name: string;
  initialStarred: boolean;
  initialCount: number;
  signedIn: boolean;
}) {
  const [starred, setStarred] = useState(initialStarred);
  const [count, setCount] = useState(initialCount);
  const [pending, start] = useTransition();

  if (!signedIn) {
    return (
      <Link href={`/login?next=/${owner}/${name}`} className="btn">
        <Star className="h-4 w-4" /> Star <Count n={count} />
      </Link>
    );
  }

  function toggle() {
    const next = !starred;
    setStarred(next);
    setCount((c) => c + (next ? 1 : -1));
    start(async () => {
      const res = await fetch(`/api/v1/packages/${owner}/${name}/star`, { method: next ? "POST" : "DELETE" });
      if (res.ok) {
        const data = await res.json();
        setStarred(data.starred);
        setCount(data.stars);
      } else {
        setStarred(!next);
        setCount((c) => c + (next ? -1 : 1));
      }
    });
  }

  return (
    <button onClick={toggle} disabled={pending} className="btn" aria-pressed={starred}>
      <Star className={`h-4 w-4 ${starred ? "fill-warning text-warning" : ""}`} /> {starred ? "Starred" : "Star"} <Count n={count} />
    </button>
  );
}

function Count({ n }: { n: number }) {
  return <span className="rounded-full bg-inset px-1.5 text-xs text-muted">{n}</span>;
}

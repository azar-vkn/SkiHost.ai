import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-lg px-4 py-24 text-center">
      <p className="font-mono text-sm text-accent">404</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">This package wandered off-piste</h1>
      <p className="mt-3 text-muted">The page or package you&apos;re looking for doesn&apos;t exist, or it was deleted by its publisher.</p>
      <div className="mt-8 flex justify-center gap-3">
        <Link href="/explore" className="btn btn-primary">
          Explore packages
        </Link>
        <Link href="/agent" className="btn">
          Ask the agent
        </Link>
      </div>
    </div>
  );
}

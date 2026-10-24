import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { cache, Suspense } from "react";
import { BookOpen, Download, File, FileCode2, Folder, FolderGit2, History, ExternalLink, ShieldAlert, ShieldCheck, Scale, Bot, Tag, Upload } from "lucide-react";
import { createAnonClient } from "@/utils/supabase/server";
import { getPackage, isStarred, listFiles, pickVersion, getFile, type FileEntry, type PackageDetail } from "@/lib/registry";
import { installInfo } from "@/lib/install";
import { compactNumber, formatBytes, shortDate, timeAgo } from "@/lib/format";
import { getCurrentProfile } from "@/lib/session";
import { siteUrl } from "@/lib/db";
import { Markdown } from "@/components/markdown";
import { CodeView } from "@/components/code-view";
import { StarButton } from "@/components/star-button";
import { InstallPanel } from "@/components/install-panel";
import { VersionSelect } from "@/components/version-select";
import { TypeBadge, TypeIcon } from "@/components/type-badge";
import { CommandLine, CopyButton } from "@/components/copy-button";
import { RackAboutEditor } from "@/components/rack-settings";
import { GitHubSyncButton } from "@/components/github-sync";
import { ReportButton, YankButton } from "@/components/moderation";
import { RiskWarnings } from "@/components/risk-warnings";
import { setRackStatus } from "@/app/actions/admin";

type Params = Promise<{ owner: string; name: string }>;
type SP = Promise<{ tab?: string; v?: string; path?: string }>;

// Package data is public, so it is read without the session; cache() shares it between metadata and page.
const loadPackage = cache((owner: string, name: string) => getPackage(createAnonClient(), owner, name).catch(() => null));

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { owner, name } = await params;
  const pkg = await loadPackage(owner, name);
  return pkg ? { title: `${owner}/${name}`, description: pkg.description } : { title: "Not found" };
}

export default async function PackagePage({ params, searchParams }: { params: Params; searchParams: SP }) {
  const { owner, name } = await params;
  const sp = await searchParams;
  const mePromise = getCurrentProfile();
  const pkg = await loadPackage(owner, name);
  if (!pkg) notFound();

  const db = createAnonClient();
  if (!pkg.latest_version) {
    const [me, base] = await Promise.all([mePromise, siteUrl()]);
    return <EmptyRack pkg={pkg} isOwner={me?.username === owner} base={base} />;
  }
  const version = pickVersion(pkg, sp.v) ?? pickVersion(pkg)!;
  const tab = ["files", "versions"].includes(sp.tab ?? "") ? sp.tab! : sp.path ? "files" : "readme";
  // A file path is fetched alongside the listing rather than after it.
  const filePath = sp.path && !sp.path.endsWith("/") ? sp.path : null;
  const [me, base, files, openFile] = await Promise.all([
    mePromise,
    siteUrl(),
    listFiles(db, version.id),
    filePath ? getFile(db, version.id, filePath) : null,
  ]);
  const starred = me ? await isStarred(db, me.id, pkg.id) : false;
  const info = installInfo(base, owner, name, version.version, version.manifest);
  const m = version.manifest;
  const vq = version.version === pkg.latest_version ? "" : `&v=${version.version}`;
  const tabHref = (t: string) => `/${owner}/${name}?tab=${t}${vq}`;
  const isOwner = me?.username === owner;
  const isAdmin = me?.role === "admin";
  const disabled = pkg.status === "quarantined";

  return (
    <div>
      <div className="border-b border-line bg-subtle">
        <div className="mx-auto max-w-7xl px-4 pt-6 sm:px-6">
          <RackHeader pkg={pkg}>
            {isOwner && (
              <Link href={`/${owner}/${name}/upload`} className="btn">
                <Upload className="h-4 w-4" /> Push version
              </Link>
            )}
            {!isOwner && <ReportButton owner={owner} name={name} signedIn={!!me} />}
            <StarButton owner={owner} name={name} initialStarred={starred} initialCount={pkg.stars} signedIn={!!me} />
            {!disabled && (
              <a href={info.download_url} className="btn btn-primary">
                <Download className="h-4 w-4" /> Download
              </a>
            )}
          </RackHeader>
          <nav className="mt-5 -mb-px flex gap-1 overflow-x-auto text-sm" aria-label="Rack sections">
            <Tab href={`/${owner}/${name}${vq ? `?${vq.slice(1)}` : ""}`} active={tab === "readme"} icon={BookOpen} label="README" />
            <Tab href={tabHref("files")} active={tab === "files"} icon={FileCode2} label="Files" count={files.length} />
            <Tab href={tabHref("versions")} active={tab === "versions"} icon={History} label="Versions" count={pkg.versions.length} />
          </nav>
        </div>
      </div>

      <div className="mx-auto grid grid-cols-1 max-w-7xl gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[1fr_340px]">
        <div className="min-w-0 space-y-4">
          {disabled && (
            <div className="flex items-start gap-3 rounded-lg border border-danger/50 bg-danger/10 p-4 text-sm">
              <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-danger" />
              <div>
                <p className="font-semibold text-danger">This rack has been disabled by SkiHost moderators</p>
                <p className="mt-1 text-muted">
                  {pkg.status_reason ?? "It was reported and is under review."} It can&apos;t be downloaded or installed, and it&apos;s hidden from search.
                </p>
              </div>
            </div>
          )}
          {version.yanked_at && (
            <div className="rounded-md border border-warning/50 bg-warning/10 px-4 py-2.5 text-sm">
              <span className="font-semibold text-warning">v{version.version} was yanked</span>
              {version.yank_reason ? `: ${version.yank_reason}` : " by its publisher."} Use a newer version.
            </div>
          )}
          <RiskWarnings flags={version.risk_flags} />
          {version.version !== pkg.latest_version && !version.yanked_at && (
            <div className="mb-4 rounded-md border border-warning/40 bg-subtle px-4 py-2.5 text-sm">
              You&apos;re viewing <span className="font-mono">v{version.version}</span>. The latest is{" "}
              <Link href={`/${owner}/${name}`} className="font-mono text-accent hover:underline">
                v{pkg.latest_version}
              </Link>
              .
            </div>
          )}
          {tab === "readme" && <ReadmeTab readme={version.readme ?? pkg.readme} />}
          {tab === "files" && (
            <FilesTab owner={owner} name={name} files={files} path={sp.path ?? ""} file={openFile} vq={vq} pkgVersions={pkg.versions.map((v) => v.version)} current={version.version} latest={pkg.latest_version!} />
          )}
          {tab === "versions" && <VersionsTab owner={owner} name={name} pkg={pkg} canYank={isOwner || isAdmin} />}
        </div>

        <aside className="space-y-6">
          {isAdmin && (
            <section className="card space-y-3 border-danger/40 p-4 text-sm">
              <h2 className="flex items-center gap-1.5 font-semibold">
                <ShieldAlert className="h-4 w-4 text-danger" /> Moderation
              </h2>
              <form action={setRackStatus} className="space-y-2">
                <input type="hidden" name="owner" value={owner} />
                <input type="hidden" name="name" value={name} />
                <input type="hidden" name="status" value={disabled ? "active" : "quarantined"} />
                {!disabled && <input name="reason" className="input h-8 text-xs" placeholder="Reason shown on the page" maxLength={500} />}
                <button className={`btn h-8 w-full text-xs ${disabled ? "" : "border-danger/50 text-danger"}`}>{disabled ? "Restore rack" : "Disable rack"}</button>
              </form>
              <Link href="/admin" className="block text-xs text-accent hover:underline">
                Open the admin console
              </Link>
            </section>
          )}
          <section>
            <h2 className="mb-2 text-sm font-semibold">Install</h2>
            {disabled ? (
              <p className="card p-4 text-sm text-muted">Installing is disabled while this rack is under moderation.</p>
            ) : (
              <InstallPanel info={info} base={base} />
            )}
          </section>

          <section className="space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">About</h2>
              {isOwner && (
                <RackAboutEditor owner={owner} name={name} description={pkg.description} keywords={pkg.keywords} homepage={pkg.homepage} repository={pkg.repository} />
              )}
            </div>
            <p className="text-muted">{pkg.description}</p>
            {pkg.keywords.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {pkg.keywords.map((k) => (
                  <Link key={k} href={`/explore?q=${encodeURIComponent(k)}`} className="chip">
                    {k}
                  </Link>
                ))}
              </div>
            )}
            <ul className="space-y-2 text-muted">
              {pkg.homepage && <MetaLink icon={ExternalLink} href={pkg.homepage} />}
              {pkg.repository && <MetaLink icon={FileCode2} href={pkg.repository} />}
              {pkg.license && (
                <li className="flex items-center gap-2">
                  <Scale className="h-4 w-4" /> {pkg.license} license
                </li>
              )}
              {pkg.agents.length > 0 && (
                <li className="flex items-center gap-2">
                  <Bot className="h-4 w-4" /> Works with {pkg.agents.join(", ")}
                </li>
              )}
              {m.entry && (
                <li className="flex items-center gap-2">
                  <Tag className="h-4 w-4" /> Entry point <code className="text-fg">{m.entry}</code>
                </li>
              )}
            </ul>
            {m.source?.type === "github" && m.source.url.startsWith("https://github.com/") && (
              <div className="card space-y-2 p-3">
                <a href={m.source.url} target="_blank" rel="noopener noreferrer nofollow" className="flex items-start gap-2 text-accent hover:underline">
                  <FolderGit2 className="mt-0.5 h-4 w-4 shrink-0" />
                  <span className="min-w-0 break-words">
                    Imported from {m.source.repo}
                    {m.source.path && `/${m.source.path}`}
                  </span>
                </a>
                <p className="font-mono text-xs text-muted">
                  {m.source.ref}
                  {m.source.commit && ` @ ${m.source.commit.slice(0, 7)}`} · v{version.version}
                </p>
                {isOwner && <GitHubSyncButton rack={name} source={m.source} />}
              </div>
            )}
          </section>

          <section className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line text-sm">
            <Stat label="Downloads" value={compactNumber(pkg.downloads)} />
            <Stat label="Stars" value={compactNumber(pkg.stars)} />
            <Stat label="Versions" value={String(pkg.versions.length)} />
            <Stat label="Size" value={formatBytes(version.size)} />
            <Stat label="Files" value={String(version.file_count)} />
            <Stat label="Published" value={timeAgo(version.created_at)} />
          </section>

          {(m.requirements?.pip?.length || m.requirements?.npm?.length || m.requirements?.env?.length || m.requirements?.python || m.requirements?.node) && (
            <section className="text-sm">
              <h2 className="mb-2 font-semibold">Requirements</h2>
              <dl className="card divide-y divide-line-muted">
                {m.requirements.python && <Req k="Python" v={m.requirements.python} />}
                {m.requirements.node && <Req k="Node" v={m.requirements.node} />}
                {m.requirements.pip?.length ? <Req k="pip" v={m.requirements.pip.join(", ")} /> : null}
                {m.requirements.npm?.length ? <Req k="npm" v={m.requirements.npm.join(", ")} /> : null}
                {m.requirements.env?.length ? <Req k="Env vars" v={m.requirements.env.join(", ")} /> : null}
              </dl>
            </section>
          )}

          <section className="text-sm">
            <h2 className="mb-2 flex items-center gap-1.5 font-semibold">
              <ShieldCheck className="h-4 w-4 text-success" /> Integrity
            </h2>
            <div className="flex items-center gap-1 rounded-md border border-line-muted bg-code py-1 pr-1 pl-2.5 font-mono text-[0.7rem] text-muted">
              <span className="truncate">sha256:{version.sha256}</span>
              <CopyButton text={version.sha256} />
            </div>
          </section>

          <section className="text-sm">
            <h2 className="mb-2 font-semibold">Publisher</h2>
            <Link href={`/${owner}`} className="flex items-center gap-2 text-accent hover:underline">
              {pkg.owner_display_name ?? owner}
            </Link>
          </section>
        </aside>
      </div>
    </div>
  );
}

/** owner / name, type and version badges, description and the action buttons. */
function RackHeader({ pkg, children }: { pkg: PackageDetail; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2 text-xl">
          <TypeIcon type={pkg.type} className="h-5 w-5 text-muted" />
          <Link href={`/${pkg.owner}`} className="text-accent hover:underline">
            {pkg.owner}
          </Link>
          <span className="text-faint">/</span>
          <Link href={`/${pkg.owner}/${pkg.name}`} className="font-semibold text-accent hover:underline">
            {pkg.name}
          </Link>
          <TypeBadge type={pkg.type} />
          {pkg.latest_version ? (
            <span className="rounded-full border border-line px-2 py-px font-mono text-xs text-muted">v{pkg.latest_version}</span>
          ) : (
            <span className="rounded-full border border-warning/50 px-2 py-px text-xs text-warning">empty</span>
          )}
        </div>
        <p className="mt-2 max-w-3xl text-muted">{pkg.description}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

/** A freshly created rack: GitHub-style quick setup for the first push. */
function EmptyRack({ pkg, isOwner, base }: { pkg: PackageDetail; isOwner: boolean; base: string }) {
  const { owner, name, type } = pkg;
  const json = `curl -X POST ${base}/api/v1/publish \\
  -H "Authorization: Bearer $SKIHOST_TOKEN" -H "Content-Type: application/json" \\
  -d '{"manifest":{"name":"${name}","version":"0.1.0","type":"${type}"},"files":{"README.md":"# ${name}"}}'`;
  return (
    <div>
      <div className="border-b border-line bg-subtle">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
          <RackHeader pkg={pkg}>
            {isOwner && (
              <RackAboutEditor owner={owner} name={name} description={pkg.description} keywords={pkg.keywords} homepage={pkg.homepage} repository={pkg.repository} />
            )}
          </RackHeader>
        </div>
      </div>
      <div className="mx-auto max-w-4xl space-y-6 px-4 py-10 sm:px-6">
        <div className="card border-accent-line bg-accent-subtle p-5">
          <h2 className="font-semibold">{isOwner ? "Quick setup — push the first version" : "This rack is empty"}</h2>
          <p className="mt-1 text-sm text-muted">
            {isOwner
              ? `Your rack ${owner}/${name} is ready. Anything you push with the name "${name}" becomes a version of it.`
              : `${owner} created this rack but hasn't pushed anything to it yet.`}
          </p>
          {isOwner && (
            <div className="mt-4 flex flex-wrap gap-2">
              <Link href={`/${owner}/${name}/upload`} className="btn btn-primary">
                <Upload className="h-4 w-4" /> Upload files
              </Link>
              <Link href="/docs#racks" className="btn">
                How racks work
              </Link>
            </div>
          )}
        </div>
        {isOwner && (
          <>
            <SetupBlock title="…from a new folder on the command line">
              <CommandLine command={`mkdir ${name} && cd ${name}`} />
              <CommandLine command={`skihost init --name ${name} --type ${type} --yes`} />
              <CommandLine command="skihost push" />
            </SetupBlock>
            <SetupBlock title="…from a folder you already have">
              <p className="text-sm text-muted">
                Make sure its <code>skihost.json</code> (or <code>SKILL.md</code> front matter) has <code>&quot;name&quot;: &quot;{name}&quot;</code>, or push it here explicitly:
              </p>
              <CommandLine command={`skihost push --rack ${name}`} />
            </SetupBlock>
            <SetupBlock title="…from an agent, over HTTP">
              <pre className="overflow-x-auto rounded-md border border-line-muted bg-code p-3 font-mono text-[0.72rem] text-muted">{json}</pre>
              <p className="text-xs text-muted">
                Or call the MCP tool <code>publish_package</code> with <code>name: &quot;{name}&quot;</code>.
              </p>
            </SetupBlock>
          </>
        )}
      </div>
    </div>
  );
}

function SetupBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold">{title}</h3>
      {children}
    </section>
  );
}

function Tab({ href, active, icon: Icon, label, count }: { href: string; active: boolean; icon: typeof BookOpen; label: string; count?: number }) {
  return (
    <Link
      href={href}
      className={`flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 ${active ? "border-accent font-medium text-fg" : "border-transparent text-muted hover:border-line hover:text-fg"}`}
    >
      <Icon className="h-4 w-4" /> {label}
      {count !== undefined && <span className="rounded-full bg-inset px-1.5 text-xs text-muted">{count}</span>}
    </Link>
  );
}

function ReadmeTab({ readme }: { readme: string | null }) {
  return (
    <div className="card">
      <div className="flex items-center gap-2 border-b border-line px-5 py-3 text-sm font-medium">
        <BookOpen className="h-4 w-4 text-muted" /> README
      </div>
      <div className="p-6 sm:p-8">{readme ? <Markdown source={readme} /> : <p className="text-muted">This rack has no README.</p>}</div>
    </div>
  );
}

function FilesTab({
  owner,
  name,
  files,
  path,
  file,
  vq,
  pkgVersions,
  current,
  latest,
}: {
  owner: string;
  name: string;
  files: FileEntry[];
  path: string;
  file: FileEntry | null;
  vq: string;
  pkgVersions: string[];
  current: string;
  latest: string;
}) {
  const fileHref = (p: string) => `/${owner}/${name}?tab=files${vq}&path=${encodeURIComponent(p)}`;
  const isFile = !!file && files.some((f) => f.path === path);
  const crumbs = path.split("/").filter(Boolean);

  const header = (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <Suspense>
        <VersionSelect versions={pkgVersions} current={current} latest={latest} />
      </Suspense>
      <nav className="flex flex-wrap items-center gap-1 text-sm" aria-label="Breadcrumb">
        <Link href={fileHref("")} className="font-semibold text-accent hover:underline">
          {name}
        </Link>
        {crumbs.map((c, i) => {
          const p = crumbs.slice(0, i + 1).join("/") + (i < crumbs.length - 1 || !isFile ? "/" : "");
          return (
            <span key={p} className="flex items-center gap-1">
              <span className="text-faint">/</span>
              {i === crumbs.length - 1 ? <span className="font-semibold">{c}</span> : <Link href={fileHref(p)} className="text-accent hover:underline">{c}</Link>}
            </span>
          );
        })}
      </nav>
    </div>
  );

  if (isFile) {
    return (
      <div>
        {header}
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-line bg-subtle px-4 py-2 text-xs text-muted">
            <span>
              {file?.content ? `${file.content.split("\n").length} lines · ` : ""}
              {formatBytes(file?.size ?? 0)}
            </span>
            {file?.content && (
              <span className="flex items-center gap-1">
                <a href={`/api/v1/packages/${owner}/${name}/versions/${current}/files?path=${encodeURIComponent(path)}&raw=1`} className="btn h-7 px-2 text-xs">
                  Raw
                </a>
                <CopyButton text={file.content} label="Copy" />
              </span>
            )}
          </div>
          {file?.content == null ? (
            <p className="p-8 text-center text-sm text-muted">
              {file?.is_binary ? "Binary file not shown." : "File is too large to display."} Download the package to view it.
            </p>
          ) : path.toLowerCase().endsWith(".md") ? (
            <div className="p-6 sm:p-8">
              <Markdown source={file.content} />
            </div>
          ) : (
            <CodeView path={path} content={file.content} />
          )}
        </div>
      </div>
    );
  }

  // Directory listing: immediate children of `path`.
  const dir = path && !path.endsWith("/") ? path + "/" : path;
  const dirs = new Set<string>();
  const here: FileEntry[] = [];
  for (const f of files) {
    if (!f.path.startsWith(dir)) continue;
    const rest = f.path.slice(dir.length);
    if (rest.includes("/")) dirs.add(rest.split("/")[0]);
    else here.push(f);
  }
  return (
    <div>
      {header}
      <div className="card divide-y divide-line-muted overflow-hidden text-sm">
        {dir && (
          <Link href={fileHref(dir.split("/").slice(0, -2).join("/") + (dir.split("/").length > 2 ? "/" : ""))} className="block px-4 py-2 text-muted hover:bg-subtle">
            ..
          </Link>
        )}
        {[...dirs].sort().map((d) => (
          <Link key={d} href={fileHref(dir + d + "/")} className="flex items-center gap-3 px-4 py-2 hover:bg-subtle">
            <Folder className="h-4 w-4 fill-accent/30 text-accent" />
            <span className="flex-1">{d}</span>
          </Link>
        ))}
        {here.map((f) => (
          <Link key={f.path} href={fileHref(f.path)} className="flex items-center gap-3 px-4 py-2 hover:bg-subtle">
            <File className="h-4 w-4 text-muted" />
            <span className="flex-1 truncate">{f.path.slice(dir.length)}</span>
            <span className="text-xs text-faint">{formatBytes(f.size)}</span>
          </Link>
        ))}
        {dirs.size === 0 && here.length === 0 && <p className="px-4 py-6 text-center text-muted">No files here.</p>}
      </div>
    </div>
  );
}

function VersionsTab({
  owner,
  name,
  pkg,
  canYank,
}: {
  owner: string;
  name: string;
  pkg: NonNullable<Awaited<ReturnType<typeof getPackage>>>;
  canYank: boolean;
}) {
  return (
    <div className="card divide-y divide-line-muted">
      {pkg.versions.map((v) => (
        <div key={v.id} className="flex flex-wrap items-center gap-x-6 gap-y-2 px-5 py-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <Link href={`/${owner}/${name}${v.version === pkg.latest_version ? "" : `?v=${v.version}`}`} className="font-mono font-semibold text-accent hover:underline">
                v{v.version}
              </Link>
              {v.version === pkg.latest_version && <span className="chip">latest</span>}
              {v.yanked_at && <span className="rounded-full border border-warning/50 px-2 text-[0.7rem] text-warning">yanked</span>}
              {v.risk_flags.length > 0 && (
                <span className="rounded-full border border-warning/50 px-2 text-[0.7rem] text-warning" title={v.risk_flags.join(", ")}>
                  {v.risk_flags.length} warning{v.risk_flags.length > 1 ? "s" : ""}
                </span>
              )}
            </div>
            <p className="mt-1 text-xs text-muted">
              Published {shortDate(v.created_at)} · {v.file_count} files · {formatBytes(v.size)} · {compactNumber(v.downloads)} downloads
            </p>
            {v.changelog && <p className="mt-2 text-sm">{v.changelog}</p>}
            {v.yank_reason && <p className="mt-1 text-xs text-warning">Yanked: {v.yank_reason}</p>}
          </div>
          <div className="flex gap-2">
            {canYank && <YankButton owner={owner} name={name} version={v.version} yanked={!!v.yanked_at} />}
            <Link href={`/${owner}/${name}?tab=files&v=${v.version}`} className="btn h-7 px-2.5 text-xs">
              Browse files
            </Link>
            <a href={`/api/v1/packages/${owner}/${name}/download?version=${v.version}`} className="btn h-7 px-2.5 text-xs">
              <Download className="h-3.5 w-3.5" /> .zip
            </a>
          </div>
        </div>
      ))}
    </div>
  );
}

function MetaLink({ icon: Icon, href }: { icon: typeof BookOpen; href: string }) {
  // Manifest URLs are publisher-supplied: only ever link http(s).
  if (!/^https?:\/\//i.test(href)) return null;
  return (
    <li>
      <a href={href} target="_blank" rel="noopener noreferrer nofollow" className="flex items-center gap-2 truncate text-accent hover:underline">
        <Icon className="h-4 w-4 shrink-0" /> {href.replace(/^https?:\/\//, "")}
      </a>
    </li>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-surface px-3 py-2.5">
      <div className="text-xs text-muted">{label}</div>
      <div className="mt-0.5 font-semibold">{value}</div>
    </div>
  );
}

function Req({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex gap-3 px-3 py-2">
      <dt className="w-16 shrink-0 text-muted">{k}</dt>
      <dd className="min-w-0 font-mono text-xs break-words">{v}</dd>
    </div>
  );
}

import { baseUrl } from "@/lib/http";

/**
 * One-line installers for the CLI:
 *   curl -fsSL <host>/install.sh | sh
 *   irm <host>/install.ps1 | iex
 * Both download /cli/skihost.mjs into ~/.skihost/bin, add a `skihost` shim and point it at this registry.
 */
export async function GET(req: Request, { params }: { params: Promise<{ shell: string }> }) {
  const { shell } = await params;
  const b = baseUrl(req);
  const script =
    shell === "ps1"
      ? `$ErrorActionPreference = "Stop"
$bin = Join-Path $HOME ".skihost\\bin"
New-Item -ItemType Directory -Force -Path $bin | Out-Null
Invoke-WebRequest "${b}/cli/skihost.mjs" -OutFile (Join-Path $bin "skihost.mjs")
Set-Content -Path (Join-Path $bin "skihost.cmd") -Value '@node "%~dp0skihost.mjs" %*' -Encoding ascii
$path = [Environment]::GetEnvironmentVariable("Path", "User")
if ($path -notlike "*$bin*") { [Environment]::SetEnvironmentVariable("Path", "$path;$bin", "User"); $env:Path += ";$bin" }
node (Join-Path $bin "skihost.mjs") config set registry "${b}" | Out-Null
Write-Host "skihost installed to $bin. Open a new terminal, then run: skihost help"
`
      : `#!/bin/sh
set -e
BIN="$HOME/.skihost/bin"
mkdir -p "$BIN"
curl -fsSL "${b}/cli/skihost.mjs" -o "$BIN/skihost.mjs"
printf '#!/bin/sh\\nexec node "%s/skihost.mjs" "$@"\\n' "$BIN" > "$BIN/skihost"
chmod +x "$BIN/skihost"
node "$BIN/skihost.mjs" config set registry "${b}" >/dev/null
case ":$PATH:" in *":$BIN:"*) ;; *) echo "Add to your shell profile: export PATH=\\"$BIN:\\$PATH\\"";; esac
echo "skihost installed to $BIN. Run: skihost help"
`;
  return new Response(script, { headers: { "Content-Type": "text/plain; charset=utf-8", "Access-Control-Allow-Origin": "*" } });
}

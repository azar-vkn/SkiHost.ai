import hljs from "highlight.js/lib/common";
import { languageFor } from "@/lib/format";

/** Read-only source view with a line-number gutter, highlighted on the server. */
export function CodeView({ path, content }: { path: string; content: string }) {
  const lang = languageFor(path);
  let html: string | null = null;
  if (lang && lang !== "plaintext" && hljs.getLanguage(lang)) {
    try {
      html = hljs.highlight(content, { language: lang, ignoreIllegals: true }).value;
    } catch {}
  }
  const lines = content.endsWith("\n") ? content.split("\n").length - 1 : content.split("\n").length;
  return (
    <div className="flex overflow-x-auto bg-code font-mono text-[0.8rem] leading-[1.6rem]">
      <pre aria-hidden="true" className="sticky left-0 shrink-0 select-none border-r border-line-muted bg-code px-3 py-3 text-right text-faint">
        {Array.from({ length: Math.max(lines, 1) }, (_, i) => i + 1).join("\n")}
      </pre>
      {html !== null ? (
        <pre className="min-w-0 flex-1 px-4 py-3">
          <code dangerouslySetInnerHTML={{ __html: html }} />
        </pre>
      ) : (
        <pre className="min-w-0 flex-1 px-4 py-3">
          <code>{content}</code>
        </pre>
      )}
    </div>
  );
}

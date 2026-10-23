import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { Children, isValidElement, type ReactNode } from "react";
import { parseFrontmatter } from "@/lib/package-format";

/** GitHub-flavoured Markdown. Raw HTML in packages is not rendered. SKILL.md front matter becomes a table. */
export function Markdown({ source, anchors = false }: { source: string; anchors?: boolean }) {
  const { data, body } = parseFrontmatter(source);
  const meta = Object.entries(data);
  return (
    <div className="markdown-body">
      {meta.length > 0 && (
        <table>
          <tbody>
            {meta.map(([k, v]) => (
              <tr key={k}>
                <th className="text-left">{k}</th>
                <td>{Array.isArray(v) ? v.join(", ") : String(v)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeHighlight, { detect: false, ignoreMissing: true }]]}
        components={anchors ? headingAnchors : undefined}
      >
        {body}
      </ReactMarkdown>
    </div>
  );
}

/** `## Title {#custom-id}` sets an explicit anchor; otherwise the id is slugged from the text. */
function anchor(children: ReactNode): { id: string; content: ReactNode } {
  const m = textOf(children).match(/^(.*?)\s*\{#([\w-]+)\}$/);
  return m ? { id: m[2], content: m[1] } : { id: slug(children), content: children };
}

const headingAnchors: Components = {
  h2: ({ children }) => {
    const { id, content } = anchor(children);
    return (
      <h2 id={id} className="scroll-mt-20">
        {content}
      </h2>
    );
  },
  h3: ({ children }) => {
    const { id, content } = anchor(children);
    return (
      <h3 id={id} className="scroll-mt-20">
        {content}
      </h3>
    );
  },
};

export function slug(children: ReactNode): string {
  return textOf(children)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function textOf(node: ReactNode): string {
  return Children.toArray(node)
    .map((c) => (typeof c === "string" || typeof c === "number" ? String(c) : isValidElement<{ children?: ReactNode }>(c) ? textOf(c.props.children) : ""))
    .join("");
}

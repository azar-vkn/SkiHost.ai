import { randomUUID } from "node:crypto";
import { createAnonClient } from "@/utils/supabase/server";
import { baseUrl, CORS_HEADERS, preflight } from "@/lib/http";
import { llmBudgetAvailable, runMarketplaceAgent } from "@/lib/agent";
import { rateLimit } from "@/lib/rate-limit";
import { RegistryError } from "@/lib/registry";

/**
 * A2A JSON-RPC endpoint. A buyer agent sends `message/send` with what it needs;
 * the marketplace agent answers synchronously with a completed Task whose artifact
 * carries a Markdown answer and a machine-readable `data` part with the packages.
 */

export const OPTIONS = preflight;
export const maxDuration = 60;

type Part = { kind: "text"; text: string } | { kind: "data"; data: Record<string, unknown> } | { kind: string };
type A2AMessage = { role: string; parts: Part[]; messageId?: string; contextId?: string; taskId?: string; kind?: "message" };

const err = (id: unknown, code: number, message: string) =>
  Response.json({ jsonrpc: "2.0", id: id ?? null, error: { code, message } }, { headers: CORS_HEADERS });
const ok = (id: unknown, result: unknown) => Response.json({ jsonrpc: "2.0", id, result }, { headers: CORS_HEADERS });

export async function POST(req: Request) {
  let body: { jsonrpc?: string; id?: unknown; method?: string; params?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return err(null, -32700, "Parse error");
  }
  const { id, method, params = {} } = body;
  try {
    await rateLimit(req.headers, "a2a");
  } catch (e) {
    return Response.json(
      { jsonrpc: "2.0", id: id ?? null, error: { code: -32000, message: e instanceof RegistryError ? e.message : "Rate limited" } },
      { status: 429, headers: { ...CORS_HEADERS, "Retry-After": "60" } },
    );
  }
  const db = createAnonClient();
  const secret = process.env.SKIHOST_SERVER_SECRET;

  switch (method) {
    case "message/send": {
      const message = params.message as A2AMessage | undefined;
      if (!message?.parts?.length) return err(id, -32602, "params.message.parts is required");
      const text = messageText(message);
      if (!text) return err(id, -32005, "Send a text part, or a data part with a `query` field");

      const contextId = message.contextId ?? randomUUID();
      const taskId = randomUUID();
      const result = await runMarketplaceAgent(db, baseUrl(req), text.slice(0, 2000), { allowLlm: await llmBudgetAvailable(req.headers) });
      const userMessage = { ...message, kind: "message", messageId: message.messageId ?? randomUUID(), contextId, taskId };
      const agentMessage = {
        kind: "message",
        role: "agent",
        messageId: randomUUID(),
        contextId,
        taskId,
        parts: [{ kind: "text", text: result.reply }],
      };
      const task = {
        kind: "task",
        id: taskId,
        contextId,
        status: { state: "completed", timestamp: new Date().toISOString(), message: agentMessage },
        artifacts: [
          {
            artifactId: randomUUID(),
            name: "skihost-recommendations",
            description: "Recommended SkiHost packages with install commands",
            parts: [
              { kind: "text", text: result.reply },
              { kind: "data", data: { intent: result.intent, engine: result.engine, packages: result.packages } },
            ],
          },
        ],
        history: [userMessage, agentMessage],
      };
      // Persisting is best effort: the caller already gets the full task in this response.
      // Only the server (holder of the secret) may store tasks; the legacy call bridges until it's configured.
      if (secret) await db.rpc("save_a2a_task_v2", { p_secret: secret, p_id: taskId, p_context: contextId, p_task: task });
      else await db.rpc("save_a2a_task", { p_id: taskId, p_context: contextId, p_task: task });
      return ok(id, task);
    }
    case "tasks/get": {
      const taskId = String(params.id ?? "").slice(0, 64);
      const { data } = secret
        ? await db.rpc("get_a2a_task_v2", { p_secret: secret, p_id: taskId })
        : await db.rpc("get_a2a_task", { p_id: taskId });
      return data ? ok(id, data) : err(id, -32001, "Task not found");
    }
    case "tasks/cancel":
      return err(id, -32002, "Task cannot be canceled: tasks complete synchronously");
    case "message/stream":
    case "tasks/resubscribe":
      return err(id, -32004, "Streaming is not supported; use message/send");
    case "tasks/pushNotificationConfig/set":
    case "tasks/pushNotificationConfig/get":
      return err(id, -32003, "Push notifications are not supported");
    default:
      return err(id, -32601, `Method not found: ${method}`);
  }
}

function messageText(message: A2AMessage) {
  const chunks: string[] = [];
  for (const part of message.parts) {
    if (part.kind === "text" && "text" in part) chunks.push(part.text);
    if (part.kind === "data" && "data" in part) {
      const d = part.data;
      if (typeof d.query === "string") chunks.push(d.query);
      if (typeof d.type === "string") chunks.push(`${d.type}`);
      if (typeof d.id === "string") chunks.push(d.id);
    }
  }
  return chunks.join(" ").trim();
}

import { baseUrl, json } from "@/lib/http";
import { agentCard } from "@/lib/a2a";

export function GET(req: Request) {
  return json(agentCard(baseUrl(req)));
}

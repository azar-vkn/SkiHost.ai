import type { NextRequest } from "next/server";
import { updateSession } from "@/utils/supabase/middleware";

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  // Pages only: API routes, the MCP/A2A endpoints and static files skip the session refresh.
  matcher: ["/((?!api|_next/static|_next/image|cli|\\.well-known|llms.txt|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};

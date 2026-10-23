import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      // A2A discovery: current spec path plus the older one some clients still request.
      { source: "/.well-known/agent-card.json", destination: "/api/agent-card" },
      { source: "/.well-known/agent.json", destination: "/api/agent-card" },
      { source: "/llms.txt", destination: "/api/llms" },
      { source: "/openapi.json", destination: "/api/v1/openapi" },
      { source: "/favicon.ico", destination: "/icon.svg" },
      // Racks and packages are the same thing; both URL spellings work.
      { source: "/api/v1/racks/:owner/:name", destination: "/api/v1/packages/:owner/:name" },
      { source: "/api/v1/racks/:owner/:name/:path*", destination: "/api/v1/packages/:owner/:name/:path*" },
      { source: "/install.sh", destination: "/api/install/sh" },
      { source: "/install.ps1", destination: "/api/install/ps1" },
    ];
  },
};

export default nextConfig;

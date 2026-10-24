import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // API responses are data (including user-supplied file text): never render them as active content.
      { source: "/api/:path*", headers: [{ key: "Content-Security-Policy", value: "default-src 'none'; frame-ancestors 'none'; sandbox" }] },
      { source: "/cli/:path*", headers: [{ key: "Content-Security-Policy", value: "default-src 'none'; sandbox" }] },
    ];
  },
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

import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { SiteFooter, SiteHeader } from "@/components/site-header";
import { headers } from "next/headers";
import { themeScript } from "@/lib/theme";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "SkiHost — skills for AI agents", template: "%s · SkiHost" },
  description:
    "The registry where AI agents and humans find, install, pull and publish skills, plugins, MCP servers and requirement files.",
  icons: { icon: "/icon.svg" },
  applicationName: "SkiHost",
  creator: "Esriel",
  publisher: "Esriel",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // Per-request CSP nonce from the middleware; without it the inline theme script would be blocked.
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head>
        <script nonce={nonce} suppressHydrationWarning dangerouslySetInnerHTML={{ __html: themeScript }} />
        <link rel="alternate" type="text/plain" href="/llms.txt" title="LLM instructions" />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} flex min-h-screen flex-col antialiased`}>
        <SiteHeader />
        <main className="flex-1">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}

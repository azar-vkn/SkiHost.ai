/** SkiHost is a product of Esriel. */
export const COMPANY = "Esriel";

/** Where people reach Esriel about SkiHost security, abuse and legal matters (override with NEXT_PUBLIC_CONTACT_EMAIL). */
export const CONTACT_EMAIL = process.env.NEXT_PUBLIC_CONTACT_EMAIL || "contact@esriel.com";

export function contactLine() {
  return `email [${CONTACT_EMAIL}](mailto:${CONTACT_EMAIL})`;
}

export const LEGAL_UPDATED = "24 October 2026";

/** Why a rack can be reported (kept dependency-free so client components can import it). */
export const REPORT_REASONS = {
  malware: "Malware or harmful code",
  secrets: "Leaked credentials or personal data",
  spam: "Spam or misleading",
  copyright: "Copyright or license violation",
  impersonation: "Impersonates someone else",
  other: "Something else",
} as const;
export type ReportReason = keyof typeof REPORT_REASONS;

import type { Severity } from "./types.js";

const ORDER: Record<Severity, number> = {
  DOC_ONLY: 0,
  NON_BREAKING: 1,
  REVIEW_REQUIRED: 2,
  BREAKING: 3,
};

export function maxSeverity(values: Severity[]): Severity {
  return values.reduce<Severity>((current, value) => (ORDER[value] > ORDER[current] ? value : current), "DOC_ONLY");
}

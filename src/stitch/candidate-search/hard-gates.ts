import type { StitchCandidateAttempt } from "../../blueprint/types/blueprint.js";

export const HARD_GATE_ISSUE_CODES = new Set([
  "html_empty",
  "html_missing_visible_root",
  "html_missing_page_root_marker",
  "missing_primary_action",
  "missing_secondary_action",
  "missing_feedback_surface",
  "missing_recovery_surface",
  "invented_navigation",
  "undeclared_navigation_destination",
  "blank_rendered_page",
  "blocking_overlay",
  "console_runtime_error"
]);

export function collectHardGateIssues(issueCodes: readonly string[]): string[] {
  return [...new Set(issueCodes.filter((code) => HARD_GATE_ISSUE_CODES.has(code)))];
}

export function hasHardGateFailure(issueCodes: readonly string[]): boolean {
  return collectHardGateIssues(issueCodes).length > 0;
}

export function toHardGateResult(issueCodes: readonly string[]): "pass" | "fail" {
  return hasHardGateFailure(issueCodes) ? "fail" : "pass";
}

export function isCandidateAttemptEligible(attempt: Pick<StitchCandidateAttempt, "hardGateIssues" | "hardGateResult">): boolean {
  return attempt.hardGateResult === "pass" && attempt.hardGateIssues.length === 0;
}

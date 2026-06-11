import type { StitchCandidateAttempt } from "../../blueprint/types/blueprint.js";
import { isCandidateAttemptEligible } from "./hard-gates.js";

export const DEFAULT_SOFT_SCORE_KEYS = [
  "design_consistency",
  "information_hierarchy",
  "visual_polish",
  "density_fit",
  "enterprise_saas_fit",
  "component_clarity",
  "navigation_clarity"
] as const;

export type SoftScoreKey = typeof DEFAULT_SOFT_SCORE_KEYS[number];
export type CandidateSoftScores = Record<string, number>;

export function makeDeterministicSoftScores(
  partial: Partial<Record<SoftScoreKey, number>> = {}
): CandidateSoftScores {
  const scores: CandidateSoftScores = {};
  for (const key of DEFAULT_SOFT_SCORE_KEYS) {
    scores[key] = partial[key] ?? 0;
  }
  return scores;
}

export function totalSoftScore(scores: CandidateSoftScores | undefined): number {
  if (!scores) {
    return 0;
  }
  return Object.values(scores).reduce((sum, value) => sum + value, 0);
}

export function rankEligibleCandidateAttempts<T extends Pick<StitchCandidateAttempt, "attemptId" | "candidateIndex" | "hardGateIssues" | "hardGateResult" | "softScores">>(
  attempts: readonly T[]
): T[] {
  return attempts
    .filter((attempt) => isCandidateAttemptEligible(attempt))
    .slice()
    .sort((left, right) => {
      const scoreDelta = totalSoftScore(right.softScores) - totalSoftScore(left.softScores);
      if (scoreDelta !== 0) {
        return scoreDelta;
      }
      return left.candidateIndex - right.candidateIndex;
    });
}

import type { CandidateSoftScores, PageContract, SoftScoreKey, StitchCandidateAttempt } from "../../blueprint/types/blueprint.js";
import { findActionElements, findFeedbackSurfaces, findHeadings, findNavigationLinks, findRecoverySurfaces } from "../html/html-contract.js";
import { findElements, getStringProp } from "../html/html-ast-query.js";
import { parseStitchHtml } from "../html/parse-stitch-html.js";
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

export type CandidateSoftScoreSignals = {
  headingCount: number;
  sectionCount: number;
  semanticContainerCount: number;
  repeatedStructureGroupCount: number;
  consistentRepeatedStructureGroupCount: number;
  styledElementCount: number;
  totalElementCount: number;
  requiredActionCount: number;
  representedRequiredActionCount: number;
  requiredFeedbackSurfaceCount: number;
  representedFeedbackSurfaceCount: number;
  requiredRecoverySurfaceCount: number;
  representedRecoverySurfaceCount: number;
  allowedNavigationTargetCount: number;
  representedAllowedNavigationTargetCount: number;
  declaredNavigationElementCount: number;
  disallowedNavigationTargetCount: number;
  pageRole: "dashboard" | "form" | "detail" | "workflow" | "empty-state" | "unknown";
  approximateContentBlockCount: number;
};

const DENSITY_RANGES: Record<CandidateSoftScoreSignals["pageRole"], { min: number; max: number }> = {
  dashboard: { min: 6, max: 14 },
  form: { min: 3, max: 10 },
  detail: { min: 4, max: 12 },
  workflow: { min: 4, max: 12 },
  "empty-state": { min: 2, max: 6 },
  unknown: { min: 3, max: 12 }
};

const STYLED_ATTR_KEYS = ["class", "className", "style", "data-variant", "data-tone", "data-size"] as const;
const SEMANTIC_CONTAINER_TAGS = new Set(["main", "section", "article", "aside", "nav", "header", "footer", "form"]);
const CONTENT_BLOCK_TAGS = new Set(["section", "article", "aside", "nav", "form", "table", "ul", "ol", "dl", "fieldset", "main"]);

function clampBucket(value: number): 0 | 0.5 | 1 {
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }
  if (value >= 1) {
    return 1;
  }
  return 0.5;
}

function derivePageRole(pageContract: PageContract): CandidateSoftScoreSignals["pageRole"] {
  const purpose = `${pageContract.name} ${pageContract.purpose}`.toLowerCase();
  if (purpose.includes("dashboard")) {
    return "dashboard";
  }
  if (pageContract.confirmationOnly && pageContract.sections.length === 0) {
    return "empty-state";
  }
  const hasFormComponent = pageContract.componentRequirements.some((item) => item.type.toLowerCase().includes("form"));
  if (hasFormComponent || purpose.includes("form") || purpose.includes("submit") || !pageContract.readonly) {
    return "form";
  }
  if (pageContract.readonly && (purpose.includes("detail") || purpose.includes("result"))) {
    return "detail";
  }
  if (pageContract.supportsFlowIds.length > 0) {
    return "workflow";
  }
  return "unknown";
}

function expectedActionTexts(pageContract: PageContract): string[] {
  return [
    ...(pageContract.primaryAction ? [pageContract.primaryAction.label] : []),
    ...pageContract.secondaryActions.map((action) => action.label)
  ].map((item) => item.trim().toLowerCase());
}

function countRepresentedRequiredActions(pageContract: PageContract, actionTexts: string[]): number {
  const declared = expectedActionTexts(pageContract);
  return declared.filter((label) => actionTexts.includes(label)).length;
}

function countStyledElements(tree: ReturnType<typeof parseStitchHtml>): number {
  return findElements(tree, (node) => {
    return STYLED_ATTR_KEYS.some((key) => getStringProp(node, key)?.trim());
  }).length;
}

function analyzeRepeatedStructures(tree: ReturnType<typeof parseStitchHtml>): { groupCount: number; consistentGroupCount: number } {
  const elements = findElements(tree, (node) => ["section", "article", "li", "tr", "div"].includes(node.tagName));
  const groups = new Map<string, number[]>();

  for (const element of elements) {
    const key = [
      element.tagName,
      getStringProp(element.node, "class") ?? getStringProp(element.node, "className") ?? "",
      element.node.children.filter((child) => child.type === "element").map((child) => (child.type === "element" ? child.tagName : "")).join(",")
    ].join("|");
    groups.set(key, [...(groups.get(key) ?? []), element.node.children.length]);
  }

  let groupCount = 0;
  let consistentGroupCount = 0;
  for (const counts of groups.values()) {
    if (counts.length < 2) {
      continue;
    }
    groupCount += 1;
    if (new Set(counts).size === 1) {
      consistentGroupCount += 1;
    }
  }

  return { groupCount, consistentGroupCount };
}

function countContentBlocks(tree: ReturnType<typeof parseStitchHtml>): number {
  return findElements(tree, (node) => CONTENT_BLOCK_TAGS.has(node.tagName)).length;
}

export function extractSoftScoreSignals(input: {
  html: string;
  pageContract: PageContract;
  validationIssueCodes?: readonly string[];
}): CandidateSoftScoreSignals {
  const tree = parseStitchHtml(input.html);
  const headings = findHeadings(tree);
  const sections = findElements(tree, (node) => node.tagName === "section");
  const semanticContainers = findElements(tree, (node) => SEMANTIC_CONTAINER_TAGS.has(node.tagName));
  const actions = findActionElements(tree);
  const feedbackSurfaces = findFeedbackSurfaces(tree);
  const recoverySurfaces = findRecoverySurfaces(tree);
  const navigationLinks = findNavigationLinks(tree);
  const repeated = analyzeRepeatedStructures(tree);
  const totalElements = findElements(tree, () => true).length;
  const declaredRoutes = new Set(input.pageContract.secondaryActions.map((action) => action.targetPageId).filter(Boolean));
  const actionTexts = actions.map((action) => action.text.trim().toLowerCase()).filter(Boolean);
  const pageRole = derivePageRole(input.pageContract);

  let representedAllowedNavigationTargetCount = 0;
  let disallowedNavigationTargetCount = 0;
  let declaredNavigationElementCount = 0;
  const allowedNavigationTargets = new Set(
    input.pageContract.secondaryActions
      .map((action) => action.targetPageId)
      .filter((value): value is string => typeof value === "string" && value.length > 0)
  );

  for (const link of navigationLinks) {
    if (!link.href?.startsWith("/")) {
      continue;
    }
    declaredNavigationElementCount += 1;
    if (allowedNavigationTargets.has(link.href)) {
      representedAllowedNavigationTargetCount += 1;
    } else {
      disallowedNavigationTargetCount += 1;
    }
  }

  return {
    headingCount: headings.length,
    sectionCount: sections.length,
    semanticContainerCount: semanticContainers.length,
    repeatedStructureGroupCount: repeated.groupCount,
    consistentRepeatedStructureGroupCount: repeated.consistentGroupCount,
    styledElementCount: countStyledElements(tree),
    totalElementCount: totalElements,
    requiredActionCount: expectedActionTexts(input.pageContract).length,
    representedRequiredActionCount: countRepresentedRequiredActions(input.pageContract, actionTexts),
    requiredFeedbackSurfaceCount: input.pageContract.feedbackSurfaces.length,
    representedFeedbackSurfaceCount: feedbackSurfaces.length,
    requiredRecoverySurfaceCount: input.pageContract.recoverySurfaces.length,
    representedRecoverySurfaceCount: recoverySurfaces.length,
    allowedNavigationTargetCount: allowedNavigationTargets.size,
    representedAllowedNavigationTargetCount,
    declaredNavigationElementCount,
    disallowedNavigationTargetCount,
    pageRole,
    approximateContentBlockCount: countContentBlocks(tree)
  };
}

export function scoreCandidateSignals(signals: CandidateSoftScoreSignals): CandidateSoftScores {
  const styledRatio = signals.totalElementCount > 0 ? signals.styledElementCount / signals.totalElementCount : 0;
  const densityRange = DENSITY_RANGES[signals.pageRole];
  const densityDeltaBelow = densityRange.min - signals.approximateContentBlockCount;
  const densityDeltaAbove = signals.approximateContentBlockCount - densityRange.max;
  const densityDelta = Math.max(densityDeltaBelow, densityDeltaAbove, 0);
  const hasWorkflowSignals = [
    signals.representedRequiredActionCount > 0,
    signals.representedFeedbackSurfaceCount > 0,
    signals.semanticContainerCount > 0
  ].filter(Boolean).length;
  const hasRecoveryRequirement = signals.requiredRecoverySurfaceCount > 0;
  const representedRecovery = signals.representedRecoverySurfaceCount > 0;

  const scores = {
    design_consistency:
      signals.repeatedStructureGroupCount > 0
        ? signals.consistentRepeatedStructureGroupCount === signals.repeatedStructureGroupCount
          ? 1
          : 0.5
        : 0,
    information_hierarchy:
      signals.headingCount >= 1 && signals.sectionCount >= 2
        ? 1
        : signals.headingCount >= 1 || signals.sectionCount >= 1
          ? 0.5
          : 0,
    visual_polish:
      signals.semanticContainerCount >= 2 && styledRatio >= 0.5
        ? 1
        : signals.semanticContainerCount >= 1 || styledRatio >= 0.25
          ? 0.5
          : 0,
    density_fit:
      densityDelta === 0
        ? 1
        : densityDelta <= 2
          ? 0.5
          : 0,
    enterprise_saas_fit:
      signals.representedRequiredActionCount > 0 && signals.representedFeedbackSurfaceCount > 0 && signals.semanticContainerCount > 0
        ? 1
        : hasWorkflowSignals >= 2
          ? 0.5
          : 0,
    component_clarity:
      signals.representedRequiredActionCount >= signals.requiredActionCount &&
      signals.representedFeedbackSurfaceCount >= signals.requiredFeedbackSurfaceCount &&
      (!hasRecoveryRequirement || representedRecovery)
        ? 1
        : signals.representedRequiredActionCount > 0 || signals.representedFeedbackSurfaceCount > 0 || representedRecovery
          ? 0.5
          : 0,
    navigation_clarity:
      signals.representedAllowedNavigationTargetCount > 0 &&
      signals.declaredNavigationElementCount > 0 &&
      signals.disallowedNavigationTargetCount === 0
        ? 1
        : signals.representedAllowedNavigationTargetCount > 0 && signals.disallowedNavigationTargetCount === 0
          ? 0.5
          : 0
  } satisfies CandidateSoftScores;

  return scores;
}

export function scoreCandidateHtml(input: {
  html: string;
  pageContract: PageContract;
  validationIssueCodes?: readonly string[];
}): CandidateSoftScores {
  return scoreCandidateSignals(extractSoftScoreSignals(input));
}

export function makeDeterministicSoftScores(
  partial: Partial<Record<SoftScoreKey, number>> = {}
): CandidateSoftScores {
  const scores = {} as CandidateSoftScores;
  for (const key of DEFAULT_SOFT_SCORE_KEYS) {
    const value = partial[key] ?? 0;
    if (!Number.isFinite(value) || value < 0 || value > 1) {
      throw new Error(`Soft score ${key} must be a finite number in the range 0..1.`);
    }
    scores[key] = clampBucket(value);
  }
  return scores;
}

export function totalSoftScore(scores: CandidateSoftScores | undefined): number {
  if (!scores) {
    return 0;
  }
  return DEFAULT_SOFT_SCORE_KEYS.reduce((sum, key) => sum + scores[key], 0) / DEFAULT_SOFT_SCORE_KEYS.length;
}

export function rankEligibleCandidateAttempts<T extends {
  attemptId: string;
  candidateIndex: number;
  hardGateIssues: readonly string[];
  hardGateResult: StitchCandidateAttempt["hardGateResult"];
  softScores?: CandidateSoftScores;
}>(
  attempts: readonly T[]
): T[] {
  const ineligibleAttempt = attempts.find((attempt) => !isCandidateAttemptEligible(attempt));
  if (ineligibleAttempt) {
    throw new Error(`rankEligibleCandidateAttempts requires only hard-gate-eligible attempts. Ineligible attempt: ${ineligibleAttempt.attemptId}`);
  }

  return attempts
    .slice()
    .sort((left, right) => {
      const scoreDelta = totalSoftScore(right.softScores) - totalSoftScore(left.softScores);
      if (scoreDelta !== 0) {
        return scoreDelta;
      }
      if (left.candidateIndex !== right.candidateIndex) {
        return left.candidateIndex - right.candidateIndex;
      }
      return left.attemptId.localeCompare(right.attemptId);
    });
}

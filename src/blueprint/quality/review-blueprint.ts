import { createId } from "../shared/ids.js";
import type {
  BlueprintQualityIssue,
  BlueprintQualityReport,
  ProductBlueprintV1
} from "../types/blueprint.js";

const requiredDesktopBreakpoints = ["1920x1080", "1440x900", "2560x1440"];

function issue(
  code: BlueprintQualityIssue["code"],
  path: string,
  message: string,
  severity: BlueprintQualityIssue["severity"],
  repairability: BlueprintQualityIssue["repairability"],
  suggestedFix?: string,
  affectedPaths?: string[],
  rationale?: string
): BlueprintQualityIssue {
  return { code, path, message, severity, repairability, suggestedFix, affectedPaths, rationale };
}

function reviewAppStructure(blueprint: ProductBlueprintV1, issues: BlueprintQualityIssue[]): void {
  const shell = blueprint.ui.appStructure.shell;
  const pageCount = blueprint.ui.pages.length;
  const navigationType = blueprint.ui.navigation.type;

  if (shell === "wizard") {
    const hasWizardEvidence = navigationType !== "minimal";
    if (!hasWizardEvidence || pageCount < 2) {
      issues.push(
        issue(
          "app_structure_mismatch",
          "ui.appStructure.shell",
          "AppStructure shell is wizard, but the blueprint lacks strong wizard evidence such as stepper-like navigation or explicit multi-step structure.",
          "blocker",
          "targeted_repairable",
          "Adjust appStructure to match the existing linear form-to-result page structure without inventing wizard pages.",
          ["ui.appStructure.shell", "ui.navigation.type", "ui.pages"],
          "Wizard shell without wizard structure misleads downstream implementation."
        )
      );
    }
  }
}

function reviewPrimaryActionPolicy(blueprint: ProductBlueprintV1, issues: BlueprintQualityIssue[]): void {
  if (!blueprint.generationPolicy.stitchGenerationRules.requirePrimaryActionInEveryPage) {
    issues.push(
      issue(
        "primary_action_policy_weak",
        "generationPolicy.stitchGenerationRules.requirePrimaryActionInEveryPage",
        "Global primary-action policy is weakened without a strong reason. Keep the global rule strong and express readonly/result exceptions at the page-contract level.",
        "medium",
        "targeted_repairable",
        "Set requirePrimaryActionInEveryPage to true and keep page-level readonly/confirmation semantics for exceptions.",
        ["generationPolicy.stitchGenerationRules.requirePrimaryActionInEveryPage"]
      )
    );
  }

  for (const page of blueprint.ui.pages) {
    const isResultLike = page.readonly || page.confirmationOnly;
    if (isResultLike && page.secondaryActions.length === 0) {
      issues.push(
        issue(
          "missing_result_page_action",
          `ui.pages.${page.id}.secondaryActions`,
          "Readonly or confirmation pages should usually provide a useful next action such as edit details, start over, download result, copy result, continue, or go back.",
          "medium",
          "targeted_repairable",
          "Add at least one useful secondary action on the result/confirmation page.",
          [`ui.pages.${page.id}.secondaryActions`]
        )
      );
    }
  }
}

function reviewDesktopResponsivePolicy(blueprint: ProductBlueprintV1, issues: BlueprintQualityIssue[]): void {
  const { mobileFirst, breakpoints } = blueprint.ui.responsivePolicy;
  const missingBreakpoints = requiredDesktopBreakpoints.filter((value) => !breakpoints.includes(value));

  if (mobileFirst) {
    issues.push(
      issue(
        "desktop_resolution_policy_missing",
        "ui.responsivePolicy.mobileFirst",
        "This product is intended for desktop display, so responsive policy should not be mobile-first.",
        "high",
        "targeted_repairable",
        "Set responsivePolicy.mobileFirst to false and define the required desktop resolutions.",
        ["ui.responsivePolicy.mobileFirst", "ui.responsivePolicy.breakpoints"]
      )
    );
  }

  if (missingBreakpoints.length > 0) {
    issues.push(
      issue(
        "desktop_resolution_policy_missing",
        "ui.responsivePolicy.breakpoints",
        `Desktop-responsive policy is incomplete. Required resolution targets are ${requiredDesktopBreakpoints.join(", ")}, with 1920x1080 as the primary design baseline. Missing: ${missingBreakpoints.join(", ")}.`,
        "high",
        "targeted_repairable",
        "Define desktop breakpoints for 1920x1080 as the primary baseline, then adapt the layout for 1440x900 and 2560x1440.",
        ["ui.responsivePolicy.breakpoints", "generationPolicy.inferenceRules"]
      )
    );
  }
}

export function reviewBlueprintQuality(
  sessionId: string,
  blueprintId: string,
  blueprint: ProductBlueprintV1
): BlueprintQualityReport {
  const issues: BlueprintQualityIssue[] = [];

  // Default local quality review is intentionally limited to code-verifiable,
  // structurally inspectable issues. Subjective semantic quality checks stay
  // outside the default blocking path unless experimental review is enabled.
  reviewAppStructure(blueprint, issues);
  reviewPrimaryActionPolicy(blueprint, issues);
  reviewDesktopResponsivePolicy(blueprint, issues);

  const hasBlocker = issues.some((item) => item.severity === "blocker");
  const hasHigh = issues.some((item) => item.severity === "high");

  return {
    id: createId("qrev"),
    sessionId,
    blueprintId,
    passed: !hasBlocker && !hasHigh,
    issues,
    createdAt: new Date().toISOString()
  };
}

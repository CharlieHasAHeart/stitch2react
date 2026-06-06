import { createId } from "../shared/ids.js";
import type { ProductBlueprintV1, QualityIssue, QualityReviewReport } from "../types/blueprint.js";

const requiredDesktopBreakpoints = ["1920x1080", "1440x900", "2560x1440"];

function issue(
  code: QualityIssue["code"],
  path: string,
  message: string,
  severity: QualityIssue["severity"],
  repairability: QualityIssue["repairability"],
  suggestedFix?: string
): QualityIssue {
  return { code, path, message, severity, repairability, suggestedFix };
}

function reviewAppStructure(blueprint: ProductBlueprintV1, issues: QualityIssue[]): void {
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
          "Adjust appStructure to match the existing linear form-to-result page structure without inventing wizard pages."
        )
      );
    }
  }
}

function reviewImmediateResultSemantics(blueprint: ProductBlueprintV1, issues: QualityIssue[]): void {
  const raw = blueprint.input.raw;
  const expectsImmediateResult = /看到结果|查看结果|结果/.test(raw);
  if (!expectsImmediateResult) {
    return;
  }

  const ambiguousResultSignals = [
    blueprint.input.normalizedSummary.value,
    blueprint.product.primaryValueProposition.value,
    blueprint.product.successDefinition.value,
    ...blueprint.uncertainty.assumptions.map((item) => item.defaultDecision),
    ...blueprint.uncertainty.unresolvedQuestions.map((item) => item.defaultDecision)
  ].join(" ");

  if (/申请结果反馈/.test(ambiguousResultSignals) && /报价结果/.test(ambiguousResultSignals)) {
    issues.push(
      issue(
        "explicit_outcome_weakened",
        "product.successDefinition",
        "The blueprint weakens the user's immediate-result intent by allowing both quote-result and generic submission-feedback interpretations, which may mislead downstream generation.",
        "high",
        "targeted_repairable",
        "Preserve the immediate visible result in successDefinition, primary flow completion signal, result page purpose, and default decisions."
      )
    );
  }
}

function reviewPrimaryActionPolicy(blueprint: ProductBlueprintV1, issues: QualityIssue[]): void {
  if (!blueprint.generationPolicy.stitchGenerationRules.requirePrimaryActionInEveryPage) {
    issues.push(
      issue(
        "primary_action_policy_weak",
        "generationPolicy.stitchGenerationRules.requirePrimaryActionInEveryPage",
        "Global primary-action policy is weakened without a strong reason. Keep the global rule strong and express readonly/result exceptions at the page-contract level.",
        "medium",
        "targeted_repairable",
        "Set requirePrimaryActionInEveryPage to true and keep page-level readonly/confirmation semantics for exceptions."
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
          "Add at least one useful secondary action on the result/confirmation page."
        )
      );
    }
  }
}

function reviewDesktopResponsivePolicy(blueprint: ProductBlueprintV1, issues: QualityIssue[]): void {
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
        "Set responsivePolicy.mobileFirst to false and define the required desktop resolutions."
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
        "Define desktop breakpoints for 1920x1080 as the primary baseline, then adapt the layout for 1440x900 and 2560x1440."
      )
    );
  }
}

function reviewFieldSpecificity(blueprint: ProductBlueprintV1, issues: QualityIssue[]): void {
  const unresolvedExactInput = blueprint.uncertainty.unresolvedQuestions.some((item) =>
    item.id.includes("input_schema")
  );
  const genericFormData = blueprint.domain.entities.some(
    (entity) => entity.id === "quote_request" && entity.fields.some((field) => field.name === "formData" && field.type === "object")
  );

  if (unresolvedExactInput && genericFormData) {
    issues.push(
      issue(
        "generic_field_specificity",
        "domain.entities.quote_request.fields.formData",
        "The blueprint is still highly generic about required quote-request fields. Downstream generation may need stronger field assumptions or explicit placeholders to avoid vague UI output.",
        "medium",
        "targeted_repairable",
        "Clarify the minimum quote-request input fields or document strong placeholder assumptions."
      )
    );
  }
}

export function reviewBlueprintQuality(
  sessionId: string,
  blueprintId: string,
  blueprint: ProductBlueprintV1
): QualityReviewReport {
  const issues: QualityIssue[] = [];

  reviewAppStructure(blueprint, issues);
  reviewImmediateResultSemantics(blueprint, issues);
  reviewPrimaryActionPolicy(blueprint, issues);
  reviewDesktopResponsivePolicy(blueprint, issues);
  reviewFieldSpecificity(blueprint, issues);

  const hasBlocker = issues.some((item) => item.severity === "blocker");
  const hasHigh = issues.some((item) => item.severity === "high");

  return {
    id: createId("qrev"),
    sessionId,
    blueprintId,
    passes: !hasBlocker && !hasHigh,
    issues,
    createdAt: new Date().toISOString()
  };
}

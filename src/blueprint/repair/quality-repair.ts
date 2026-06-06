import { productBlueprintSchema } from "../schemas/blueprint.js";
import type { ProductBlueprintV1, QualityReviewReport } from "../types/blueprint.js";

const desktopBreakpoints = ["1920x1080", "1440x900", "2560x1440"];

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function makeResultPageAction(pageId: string) {
  return {
    id: `${pageId}_next_action`,
    label: "Start over",
    kind: "secondary" as const,
    targetPageId: "quote_request_form",
    feedback: "Lets the user return to the request form and submit a new input"
  };
}

export function repairBlueprintQuality(
  blueprint: ProductBlueprintV1,
  report: QualityReviewReport
): ProductBlueprintV1 {
  const repaired = clone(blueprint);

  for (const issue of report.issues) {
    switch (issue.code) {
      case "app_structure_mismatch": {
        if (repaired.ui.appStructure.shell === "wizard") {
          repaired.ui.appStructure.shell = "single_page";
        }
        break;
      }
      case "explicit_outcome_weakened": {
        repaired.product.successDefinition.value =
          "User submits the request and sees an immediate estimated quote or result.";
        repaired.product.successDefinition.source = "defaulted";
        repaired.product.successDefinition.confidence = "medium";
        repaired.product.successDefinition.evidence =
          "The user explicitly asked to submit and see a result, so the MVP keeps an immediate visible outcome.";

        const primaryFlow = repaired.flows.coreUserFlows[0];
        if (primaryFlow) {
          primaryFlow.completionSignal = {
            userVisible: true,
            signal: "An immediate estimated quote or result is visible after submission"
          };
        }

        for (const page of repaired.ui.pages) {
          const isResultPage = page.readonly || page.confirmationOnly || /result|quote/i.test(page.id);
          if (isResultPage) {
            page.purpose = "Show the immediate estimated quote or result after the request is submitted.";
          }
        }

        repaired.uncertainty.assumptions = repaired.uncertainty.assumptions.map((item) => {
          if (/结果/.test(item.defaultDecision) || /反馈/.test(item.defaultDecision)) {
            return {
              ...item,
              defaultDecision:
                "Show an immediate estimated quote or result using a deterministic placeholder calculation."
            };
          }
          return item;
        });

        repaired.uncertainty.unresolvedQuestions = repaired.uncertainty.unresolvedQuestions.map((item) => {
          if (/结果/.test(item.defaultDecision) || /反馈/.test(item.defaultDecision)) {
            return {
              ...item,
              defaultDecision:
                "Show an immediate estimated quote or result using a deterministic placeholder calculation."
            };
          }
          return item;
        });
        break;
      }
      case "primary_action_policy_weak": {
        repaired.generationPolicy.stitchGenerationRules.requirePrimaryActionInEveryPage = true;
        break;
      }
      case "missing_result_page_action": {
        for (const page of repaired.ui.pages) {
          const isResultLike = page.readonly || page.confirmationOnly;
          if (isResultLike && page.secondaryActions.length === 0) {
            page.secondaryActions = [makeResultPageAction(page.id)];
          }
        }
        break;
      }
      case "desktop_resolution_policy_missing": {
        repaired.ui.responsivePolicy.mobileFirst = false;
        repaired.ui.responsivePolicy.breakpoints = desktopBreakpoints;

        if (!repaired.generationPolicy.inferenceRules.some((rule) => rule.includes("1920x1080"))) {
          repaired.generationPolicy.inferenceRules.push(
            "Treat 1920x1080 as the primary desktop layout baseline, then adapt the same interface for 1440x900 and 2560x1440 without changing the core flow."
          );
        }

        if (!repaired.uncertainty.assumptions.some((item) => item.id === "assumption_desktop_resolution_strategy")) {
          repaired.uncertainty.assumptions.push({
            id: "assumption_desktop_resolution_strategy",
            question: "Which screen resolutions should guide responsive behavior?",
            defaultDecision:
              "Design first for 1920x1080 desktop, then adapt the layout for 1440x900 and 2560x1440 without prioritizing mobile display.",
            rationale:
              "The product is primarily used on desktop screens, and these three resolutions define the required adaptation targets."
          });
        }
        break;
      }
      case "generic_field_specificity": {
        for (const entity of repaired.domain.entities) {
          if (entity.id === "quote_request") {
            const hasFormData = entity.fields.some((field) => field.name === "formData" && field.type === "object");
            if (hasFormData && !entity.fields.some((field) => field.name === "contactName")) {
              entity.fields = [
                { name: "contactName", type: "string", required: true, description: "Primary contact name" },
                { name: "requestDetails", type: "string", required: true, description: "Main quote request details" },
                { name: "email", type: "string", required: false, description: "Optional contact email" }
              ];
            }
          }
        }
        break;
      }
    }
  }

  return productBlueprintSchema.parse(repaired);
}

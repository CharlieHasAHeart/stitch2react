import { productBlueprintSchema } from "../schemas/blueprint.js";
import type { ProductBlueprintV1, ValidationReport } from "../types/blueprint.js";

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function pageSupportableFlowIds(blueprint: ProductBlueprintV1): Set<string> {
  return new Set<string>([
    ...blueprint.flows.coreUserFlows.map((flow) => flow.id),
    ...blueprint.flows.supportingInteractionFlows.map((flow) => flow.id),
    ...blueprint.flows.feedbackFlows.map((flow) => flow.id),
    ...blueprint.flows.recoveryFlows.map((flow) => flow.id)
  ]);
}

export function repairBlueprint(
  blueprint: ProductBlueprintV1,
  report: ValidationReport
): ProductBlueprintV1 {
  const repaired = clone(blueprint);

  for (const issue of report.issues) {
    if (issue.path.includes("completionSignal")) {
      for (const flow of repaired.flows.coreUserFlows) {
        if (!flow.completionSignal.signal.trim()) {
          flow.completionSignal = {
            userVisible: true,
            signal: `User sees confirmation that ${flow.userGoal.toLowerCase()} is complete`
          };
        }
      }
    }

    if (issue.path.includes("trigger")) {
      for (const flow of repaired.flows.coreUserFlows) {
        if (!flow.trigger.trim()) {
          flow.trigger = `User starts ${flow.name.toLowerCase()}`;
        }
      }
    }

    if (issue.path.includes("steps")) {
      for (const flow of repaired.flows.coreUserFlows) {
        if (flow.steps.length < 2) {
          flow.steps = [
            ...flow.steps,
            {
              id: `${flow.id}_step_repair`,
              label: "System confirms result",
              actor: "system",
              kind: "feedback",
              detail: "System returns a visible result to the user"
            }
          ];
        }
      }
    }

    if (issue.path.includes("uiSurfaceIds")) {
      for (const flow of repaired.flows.coreUserFlows) {
        if (flow.uiSurfaceIds.length === 0 && repaired.ui.pages[0]) {
          flow.uiSurfaceIds = [repaired.ui.pages[0].id];
        }
      }
    }

    if (issue.path.includes("feedback") && issue.path.includes("coreUserFlows")) {
      for (const flow of repaired.flows.coreUserFlows) {
        if (flow.feedback.length === 0) {
          flow.feedback = ["Visible success or error message is shown."];
        }
      }
    }

    if (issue.path.includes("primaryAction")) {
      for (const page of repaired.ui.pages) {
        if (!page.confirmationOnly && !page.readonly && !page.primaryAction) {
          page.primaryAction = {
            id: `${page.id}_primary`,
            label: "Continue",
            kind: "primary",
            triggersFlowId: page.supportsFlowIds[0],
            feedback: "Shows progress and result feedback"
          };
        }
      }
    }

    if (issue.path.includes("supportsFlowIds") && issue.message.includes("PageContract must support at least one flow")) {
      const fallbackFlowId = repaired.flows.coreUserFlows[0]?.id;
      for (const page of repaired.ui.pages) {
        if (page.supportsFlowIds.length === 0 && fallbackFlowId) {
          page.supportsFlowIds = [fallbackFlowId];
        }
      }
    }

    if (issue.path.includes("supportsFlowIds") && issue.code === "page_invalid_supported_flow") {
      const allowedIds = pageSupportableFlowIds(repaired);
      const fallbackFlowId = repaired.flows.coreUserFlows[0]?.id;
      for (const page of repaired.ui.pages) {
        const filtered = page.supportsFlowIds.filter((flowId) => allowedIds.has(flowId));
        if (filtered.length > 0) {
          page.supportsFlowIds = Array.from(new Set(filtered));
        } else if (fallbackFlowId) {
          page.supportsFlowIds = [fallbackFlowId];
        }
      }
    }

    if (issue.path.includes("recoveryActions")) {
      for (const flow of repaired.flows.recoveryFlows) {
        if (flow.recoveryActions.length === 0) {
          flow.recoveryActions = ["Retry the failed action"];
        }
      }
    }

    if (issue.path.includes("unresolvedQuestions")) {
      for (const question of repaired.uncertainty.unresolvedQuestions) {
        if (!question.defaultDecision.trim()) {
          question.defaultDecision = "Proceed with the smallest coherent MVP behavior.";
        }
      }
    }
  }

  return productBlueprintSchema.parse(repaired);
}

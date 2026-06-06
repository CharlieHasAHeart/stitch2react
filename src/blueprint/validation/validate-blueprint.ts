import { ZodError } from "zod";
import { productBlueprintSchema } from "../schemas/blueprint.js";
import { createId } from "../shared/ids.js";
import type {
  CoreUserFlow,
  PageContract,
  ProductBlueprintV1,
  RecoveryFlow,
  ValidationIssue,
  ValidationReport
} from "../types/blueprint.js";

function flowIssue(path: string, message: string): ValidationIssue {
  return { path, message, severity: "error" };
}

function hasMeaningfulSteps(flow: CoreUserFlow): boolean {
  return flow.steps.filter((step) => step.detail.trim().length > 0).length >= 2;
}

function validateFlow(flow: CoreUserFlow, issues: ValidationIssue[]): void {
  if (!flow.trigger.trim()) {
    issues.push(flowIssue(`flows.coreUserFlows.${flow.id}.trigger`, "Core flow must have a trigger."));
  }
  if (!hasMeaningfulSteps(flow)) {
    issues.push(
      flowIssue(`flows.coreUserFlows.${flow.id}.steps`, "Core flow must have at least two meaningful steps.")
    );
  }
  if (!flow.completionSignal.signal.trim()) {
    issues.push(
      flowIssue(
        `flows.coreUserFlows.${flow.id}.completionSignal`,
        "Core flow must have a completion signal."
      )
    );
  }
  if (flow.uiSurfaceIds.length === 0) {
    issues.push(
      flowIssue(`flows.coreUserFlows.${flow.id}.uiSurfaceIds`, "Core flow must have at least one UI surface.")
    );
  }
  if (flow.feedback.length === 0) {
    issues.push(flowIssue(`flows.coreUserFlows.${flow.id}.feedback`, "User-visible core flow must have feedback."));
  }
}

type FlowReferenceSets = {
  pageSupportableFlowIds: Set<string>;
  actionTriggerableFlowIds: Set<string>;
  allDeclaredFlowIds: Set<string>;
};

function buildFlowReferenceSets(blueprint: ProductBlueprintV1): FlowReferenceSets {
  const coreIds = blueprint.flows.coreUserFlows.map((flow) => flow.id);
  const supportingIds = blueprint.flows.supportingInteractionFlows.map((flow) => flow.id);
  const feedbackIds = blueprint.flows.feedbackFlows.map((flow) => flow.id);
  const recoveryIds = blueprint.flows.recoveryFlows.map((flow) => flow.id);

  // Side effect flow UI visibility support is not yet represented in the schema.
  // Until such fields exist, keep side effect flows out of UI reference sets.
  const pageSupportableFlowIds = new Set<string>([
    ...coreIds,
    ...supportingIds,
    ...feedbackIds,
    ...recoveryIds
  ]);

  const actionTriggerableFlowIds = new Set<string>([
    ...coreIds,
    ...supportingIds,
    ...recoveryIds
  ]);

  const allDeclaredFlowIds = new Set<string>([
    ...coreIds,
    ...supportingIds,
    ...blueprint.flows.sideEffectFlows.map((flow) => flow.id),
    ...feedbackIds,
    ...recoveryIds
  ]);

  return {
    pageSupportableFlowIds,
    actionTriggerableFlowIds,
    allDeclaredFlowIds
  };
}

function validatePage(
  page: PageContract,
  flowReferenceSets: FlowReferenceSets,
  issues: ValidationIssue[]
): void {
  if (page.supportsFlowIds.length === 0) {
    issues.push(flowIssue(`ui.pages.${page.id}.supportsFlowIds`, "PageContract must support at least one flow."));
  }

  for (const flowId of page.supportsFlowIds) {
    if (!flowReferenceSets.pageSupportableFlowIds.has(flowId)) {
      const message = flowReferenceSets.allDeclaredFlowIds.has(flowId)
        ? `Flow id ${flowId} exists in the blueprint but is not page-supportable under the semantic validation contract.`
        : `Unknown supported flow id: ${flowId}.`;
      issues.push(flowIssue(`ui.pages.${page.id}.supportsFlowIds`, message));
    }
  }

  const actions = [page.primaryAction, ...page.secondaryActions].filter(Boolean);
  for (const action of actions) {
    if (!action?.triggersFlowId) {
      continue;
    }

    if (!flowReferenceSets.actionTriggerableFlowIds.has(action.triggersFlowId)) {
      const message = flowReferenceSets.allDeclaredFlowIds.has(action.triggersFlowId)
        ? `Flow id ${action.triggersFlowId} exists in the blueprint but is not action-triggerable under the semantic validation contract.`
        : `Unknown trigger flow id: ${action.triggersFlowId}.`;
      issues.push(
        flowIssue(`ui.pages.${page.id}.actions.${action.id}.triggersFlowId`, message)
      );
    }
  }

  if (!page.confirmationOnly && !page.readonly && !page.primaryAction) {
    issues.push(
      flowIssue(`ui.pages.${page.id}.primaryAction`, "Non-readonly, non-confirmation page must have a primary action.")
    );
  }
  if (page.primaryAction && !page.primaryAction.feedback.trim() && !page.primaryAction.targetPageId?.trim()) {
    issues.push(
      flowIssue(
        `ui.pages.${page.id}.primaryAction.feedback`,
        "Primary action must have expected feedback or a clear target."
      )
    );
  }
}

function validateRecoveryFlows(recoveryFlows: RecoveryFlow[], issues: ValidationIssue[]): void {
  for (const flow of recoveryFlows) {
    if (flow.recoveryActions.length === 0) {
      issues.push(
        flowIssue(`flows.recoveryFlows.${flow.id}.recoveryActions`, "Recovery flow must have at least one recovery action.")
      );
    }
  }
}

function semanticIssues(blueprint: ProductBlueprintV1): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const coreFlows = blueprint.flows.coreUserFlows;
  const flowReferenceSets = buildFlowReferenceSets(blueprint);

  for (const flow of coreFlows) {
    validateFlow(flow, issues);
  }

  for (const page of blueprint.ui.pages) {
    validatePage(page, flowReferenceSets, issues);
  }

  validateRecoveryFlows(blueprint.flows.recoveryFlows, issues);

  for (const question of blueprint.uncertainty.unresolvedQuestions) {
    if (!question.defaultDecision.trim()) {
      issues.push(
        flowIssue(
          `uncertainty.unresolvedQuestions.${question.id}.defaultDecision`,
          "Every unresolved question must have a default decision."
        )
      );
    }
  }

  if (blueprint.visualPolicy.imageUsage.forbidUiAsImage !== true) {
    issues.push(
      flowIssue("visualPolicy.imageUsage.forbidUiAsImage", "visualPolicy.imageUsage.forbidUiAsImage must be true.")
    );
  }

  if (blueprint.generationPolicy.noFollowUpQuestions !== true) {
    issues.push(
      flowIssue("generationPolicy.noFollowUpQuestions", "generationPolicy.noFollowUpQuestions must be true.")
    );
  }

  const explicitConstraintText = blueprint.input.explicitConstraints.value.join(" ").toLowerCase();
  const hasNoLoginConstraint = explicitConstraintText.includes("no login");
  if (hasNoLoginConstraint) {
    const hasLoginArtifacts =
      JSON.stringify(blueprint.flows).toLowerCase().includes("login") ||
      JSON.stringify(blueprint.ui).toLowerCase().includes("login");
    if (hasLoginArtifacts) {
      issues.push(
        flowIssue("input.explicitConstraints", "Explicit constraint 'no login' was violated in flows or UI.")
      );
    }
  }

  const scopeExplicitlyRequestsMore =
    blueprint.input.requestedScope.source === "explicit" &&
    blueprint.input.requestedScope.value === "full_product_mvp";
  if (!scopeExplicitlyRequestsMore) {
    if (blueprint.flows.coreUserFlows.length > blueprint.generationPolicy.maxCoreFlows) {
      issues.push(flowIssue("flows.coreUserFlows", "Core flow count exceeds generation policy."));
    }
    if (blueprint.ui.pages.length > blueprint.generationPolicy.maxPages) {
      issues.push(flowIssue("ui.pages", "Page count exceeds generation policy."));
    }
  }

  return issues;
}

export function validateBlueprint(
  sessionId: string,
  blueprintId: string,
  blueprint: unknown
): ValidationReport {
  const issues: ValidationIssue[] = [];
  let parsedBlueprint: ProductBlueprintV1 | null = null;

  try {
    parsedBlueprint = productBlueprintSchema.parse(blueprint);
  } catch (error) {
    if (error instanceof ZodError) {
      for (const issue of error.issues) {
        issues.push({
          path: issue.path.join("."),
          message: issue.message,
          severity: "error"
        });
      }
    } else {
      issues.push({
        path: "$",
        message: error instanceof Error ? error.message : String(error),
        severity: "error"
      });
    }
  }

  if (parsedBlueprint) {
    issues.push(...semanticIssues(parsedBlueprint));
  }

  return {
    id: createId("val"),
    sessionId,
    blueprintId,
    schemaValid: parsedBlueprint !== null,
    semanticValid: parsedBlueprint !== null && issues.length === 0,
    issues,
    createdAt: new Date().toISOString()
  };
}

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

function issue(code: string, path: string, message: string): ValidationIssue {
  return { code, path, message, severity: "error", repairability: "targeted_repairable" };
}

function hasMeaningfulSteps(flow: CoreUserFlow): boolean {
  return flow.steps.filter((step) => step.detail.trim().length > 0).length >= 2;
}

function expectsVisibleResult(rawInput: string): boolean {
  return /看到结果|查看结果|结果|quote|报价|answer|output/i.test(rawInput);
}

function validateFlow(flow: CoreUserFlow, issues: ValidationIssue[]): void {
  if (!flow.trigger.trim()) {
    issues.push(issue("core_flow_missing_trigger", `flows.coreUserFlows.${flow.id}.trigger`, "Core flow must have a trigger."));
  }
  if (!hasMeaningfulSteps(flow)) {
    issues.push(
      issue(
        "core_flow_insufficient_steps",
        `flows.coreUserFlows.${flow.id}.steps`,
        "Core flow must have at least two meaningful steps."
      )
    );
  }
  if (!flow.completionSignal.signal.trim()) {
    issues.push(
      issue(
        "core_flow_missing_completion_signal",
        `flows.coreUserFlows.${flow.id}.completionSignal`,
        "Core flow must have a completion signal."
      )
    );
  }
  if (flow.uiSurfaceIds.length === 0) {
    issues.push(
      issue(
        "core_flow_missing_ui_surface",
        `flows.coreUserFlows.${flow.id}.uiSurfaceIds`,
        "Core flow must have at least one UI surface."
      )
    );
  }
  if (flow.feedback.length === 0) {
    issues.push(
      issue(
        "core_flow_missing_feedback",
        `flows.coreUserFlows.${flow.id}.feedback`,
        "User-visible core flow must have feedback."
      )
    );
  }
}

function validateVisibleOutcomePreservation(
  blueprint: ProductBlueprintV1,
  issues: ValidationIssue[]
): void {
  if (!expectsVisibleResult(blueprint.input.raw)) {
    return;
  }

  const primaryFlow = blueprint.flows.coreUserFlows[0];
  if (!primaryFlow) {
    return;
  }

  const combinedSignals = [
    blueprint.product.successDefinition.value,
    primaryFlow.completionSignal.signal,
    ...blueprint.ui.pages.map((page) => page.purpose),
    ...blueprint.ui.pages.flatMap((page) => page.states.map((state) => state.description)),
    ...blueprint.ui.pages.flatMap((page) => page.secondaryActions.map((action) => action.feedback))
  ]
    .join(" ")
    .toLowerCase();

  const onlyGenericSubmission =
    /submitted|submission|已提交|提交成功|申请已提交/.test(combinedSignals) &&
    !/result|quote|报价|answer|output|结果/.test(combinedSignals);

  if (onlyGenericSubmission) {
    issues.push(
      issue(
        "explicit_outcome_not_preserved",
        "flows.coreUserFlows.0.completionSignal",
        "The user's visible result outcome was weakened into generic submission feedback. Preserve a visible result/quote/answer/output completion signal."
      )
    );
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
    issues.push(
      issue(
        "page_missing_supported_flow",
        `ui.pages.${page.id}.supportsFlowIds`,
        "PageContract must support at least one flow."
      )
    );
  }

  for (const flowId of page.supportsFlowIds) {
    if (!flowReferenceSets.pageSupportableFlowIds.has(flowId)) {
      const message = flowReferenceSets.allDeclaredFlowIds.has(flowId)
        ? `Flow id ${flowId} exists in the blueprint but is not page-supportable under the semantic validation contract.`
        : `Unknown supported flow id: ${flowId}.`;
      issues.push(issue("page_invalid_supported_flow", `ui.pages.${page.id}.supportsFlowIds`, message));
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
        issue("action_invalid_trigger_flow", `ui.pages.${page.id}.actions.${action.id}.triggersFlowId`, message)
      );
    }
  }

  if (!page.confirmationOnly && !page.readonly && !page.primaryAction) {
    issues.push(
      issue(
        "page_missing_primary_action",
        `ui.pages.${page.id}.primaryAction`,
        "Non-readonly, non-confirmation page must have a primary action."
      )
    );
  }
  if (page.primaryAction && !page.primaryAction.feedback.trim() && !page.primaryAction.targetPageId?.trim()) {
    issues.push(
      issue(
        "primary_action_missing_feedback",
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
        issue(
          "recovery_flow_missing_actions",
          `flows.recoveryFlows.${flow.id}.recoveryActions`,
          "Recovery flow must have at least one recovery action."
        )
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
        issue(
          "unresolved_question_missing_default_decision",
          `uncertainty.unresolvedQuestions.${question.id}.defaultDecision`,
          "Every unresolved question must have a default decision."
        )
      );
    }
  }

  if (blueprint.generationPolicy.noFollowUpQuestions !== true) {
    issues.push(
      issue(
        "generation_policy_no_follow_up_required",
        "generationPolicy.noFollowUpQuestions",
        "generationPolicy.noFollowUpQuestions must be true."
      )
    );
  }

  const explicitConstraintText = blueprint.input.explicitConstraints.value.join(" ").toLowerCase();
  const hasNoLoginConstraint = explicitConstraintText.includes("no login") || explicitConstraintText.includes("无需登录");
  if (hasNoLoginConstraint) {
    const hasLoginArtifacts =
      JSON.stringify(blueprint.flows).toLowerCase().includes("login") ||
      JSON.stringify(blueprint.ui).toLowerCase().includes("login");
    if (hasLoginArtifacts) {
      issues.push(
        issue(
          "explicit_constraint_no_login_violated",
          "input.explicitConstraints",
          "Explicit no-login constraint was violated in flows or UI."
        )
      );
    }
  }

  const scopeExplicitlyRequestsMore =
    blueprint.input.requestedScope.source === "explicit" &&
    blueprint.input.requestedScope.value === "full_product_mvp";
  if (!scopeExplicitlyRequestsMore) {
    if (blueprint.flows.coreUserFlows.length > blueprint.generationPolicy.maxCoreFlows) {
      issues.push(issue("core_flow_count_exceeds_policy", "flows.coreUserFlows", "Core flow count exceeds generation policy."));
    }
    if (blueprint.ui.pages.length > blueprint.generationPolicy.maxPages) {
      issues.push(issue("page_count_exceeds_policy", "ui.pages", "Page count exceeds generation policy."));
    }
  }

  validateVisibleOutcomePreservation(blueprint, issues);

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
      for (const zodIssue of error.issues) {
        issues.push({
          severity: "error",
          code: "schema_validation_error",
          path: zodIssue.path.join("."),
          message: zodIssue.message,
          repairability: "targeted_repairable"
        });
      }
    } else {
      issues.push({
        severity: "error",
        code: "schema_validation_exception",
        path: "$",
        message: error instanceof Error ? error.message : String(error),
        repairability: "non_repairable"
      });
    }
  }

  if (parsedBlueprint) {
    issues.push(...semanticIssues(parsedBlueprint));
  }

  const schemaValid = parsedBlueprint !== null;
  const semanticValid = parsedBlueprint !== null && issues.length === 0;

  return {
    id: createId("val"),
    validationId: createId("val"),
    sessionId,
    blueprintId,
    schemaValid,
    semanticValid,
    issues,
    createdAt: new Date().toISOString()
  };
}

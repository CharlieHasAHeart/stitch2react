import type {
  FlowModel,
  PageContract,
  ProductBlueprintV1,
  StitchPromptPlan,
  StitchPromptPlanPage,
  StitchPromptPlanPageRole
} from "../../blueprint/types/blueprint.js";

function classifyPageRole(page: PageContract): StitchPromptPlanPageRole {
  const haystack = [page.id, page.name, page.route, page.purpose].join(" ").toLowerCase();

  if (page.confirmationOnly) {
    return "confirmation";
  }
  if (page.readonly && /detail/.test(haystack)) {
    return "readonly_detail";
  }
  if (page.readonly || /result|success|confirmation|complete/.test(haystack)) {
    return "result";
  }
  if (/dashboard/.test(haystack)) {
    return "dashboard";
  }
  if (page.primaryAction || page.componentRequirements.some((item) => /form|input|textarea|select/i.test(item.type))) {
    return "input";
  }
  if (page.secondaryActions.length > 0) {
    return "supporting";
  }
  return "unknown";
}

function resolveRequiredDomainEntityIds(page: PageContract, flows: FlowModel): string[] {
  const entityIds = new Set<string>();
  for (const flow of flows.coreUserFlows) {
    if (page.supportsFlowIds.includes(flow.id)) {
      for (const entityId of flow.involvedEntityIds) {
        entityIds.add(entityId);
      }
    }
  }
  return Array.from(entityIds);
}

function buildPlanPage(page: PageContract, blueprint: ProductBlueprintV1): StitchPromptPlanPage {
  return {
    pageId: page.id,
    pageName: page.name,
    pageRole: classifyPageRole(page),
    supportedFlowIds: page.supportsFlowIds,
    requiredDomainEntityIds: resolveRequiredDomainEntityIds(page, blueprint.flows),
    requiredActions: [
      ...(page.primaryAction ? [page.primaryAction.label] : []),
      ...page.secondaryActions.map((action) => action.label)
    ],
    requiredStates: page.states.map((state) => state.name),
    requiredFeedbackSurfaces: page.feedbackSurfaces.map((surface) => surface.type),
    requiredRecoverySurfaces: page.recoverySurfaces.map((surface) => surface.type)
  };
}

export function buildStitchPromptPlan(
  sessionId: string,
  blueprintId: string,
  frozenBlueprint: ProductBlueprintV1,
  targetPages?: string[]
): StitchPromptPlan {
  const pages = frozenBlueprint.ui.pages
    .filter((page) => !targetPages || targetPages.includes(page.id))
    .map((page) => buildPlanPage(page, frozenBlueprint));

  return {
    sessionId,
    blueprintId,
    pages
  };
}

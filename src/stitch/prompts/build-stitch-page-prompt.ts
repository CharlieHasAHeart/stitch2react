import type {
  PageContract,
  ProductBlueprintV1,
  StitchPagePromptArtifact,
  StitchPromptPlanPage
} from "../../blueprint/types/blueprint.js";
import { compileStitchPromptConstraints } from "../constraints/compile-stitch-prompt-constraints.js";
import { loadStitchUiConstraints } from "../constraints/load-stitch-ui-constraints.js";

function nowIso(): string {
  return new Date().toISOString();
}

function findSupportedFlowSummaries(blueprint: ProductBlueprintV1, page: PageContract): string[] {
  return blueprint.flows.coreUserFlows
    .filter((flow) => page.supportsFlowIds.includes(flow.id))
    .map((flow) => {
      const steps = flow.steps.slice(0, 3).map((step) => `${step.actor}:${step.label}`).join("; ");
      return `${flow.id}: goal=${flow.userGoal}; trigger=${flow.trigger}; steps=${steps}; completion=${flow.completionSignal.signal}`;
    });
}

export function buildStitchPagePrompt(
  sessionId: string,
  blueprintId: string,
  frozenBlueprint: ProductBlueprintV1,
  planPage: StitchPromptPlanPage,
  page: PageContract
): StitchPagePromptArtifact {
  const supportedFlowSummaries = findSupportedFlowSummaries(frozenBlueprint, page);
  const constraints = loadStitchUiConstraints();
  const compiledConstraints = compileStitchPromptConstraints({ constraints, frozenBlueprint, page });

  const prompt = [
    `Generate a single HTML page for Stitch from the frozen ProductBlueprintV1.`,
    ``,
    `Product context:`,
    `- name: ${frozenBlueprint.product.name.value}`,
    `- value proposition: ${frozenBlueprint.product.primaryValueProposition.value}`,
    `- success definition: ${frozenBlueprint.product.successDefinition.value}`,
    `- out of scope: ${frozenBlueprint.product.outOfScope.value.join(", ") || "none"}`,
    ``,
    `Page contract:`,
    `- pageId: ${page.id}`,
    `- pageName: ${page.name}`,
    `- route: ${page.route}`,
    `- purpose: ${page.purpose}`,
    `- pageRole: ${planPage.pageRole}`,
    `- supportedFlowIds: ${page.supportsFlowIds.join(", ")}`,
    `- primaryAction: ${page.primaryAction ? `${page.primaryAction.id}:${page.primaryAction.label}` : "none"}`,
    `- secondaryActions: ${page.secondaryActions.map((action) => `${action.id}:${action.label}`).join(", ") || "none"}`,
    `- states: ${page.states.map((state) => state.name).join(", ") || "none"}`,
    `- feedbackSurfaces: ${page.feedbackSurfaces.map((surface) => surface.type).join(", ") || "none"}`,
    `- recoverySurfaces: ${page.recoverySurfaces.map((surface) => surface.type).join(", ") || "none"}`,
    `- requiredSections: ${page.sections.map((section) => section.name).join(", ") || "none"}`,
    `- componentRequirements: ${page.componentRequirements.map((item) => `${item.type}:${item.purpose}`).join(", ") || "none"}`,
    `- completionSignals: ${supportedFlowSummaries.map((summary) => summary.split("; completion=")[1] ?? "").filter(Boolean).join(", ") || "none"}`,
    ``,
    `Global rules:`,
    ...compiledConstraints.globalRules.map((rule) => `- ${rule}`),
    ``,
    `HTML contract:`,
    ...compiledConstraints.htmlContractRules.map((rule) => `- ${rule}`),
    ``,
    `Interaction contract:`,
    ...compiledConstraints.interactionRules.map((rule) => `- ${rule}`),
    ``,
    `Navigation contract:`,
    ...compiledConstraints.navigationRules.map((rule) => `- ${rule}`),
    ``,
    `Forbidden patterns:`,
    ...compiledConstraints.forbiddenPatterns.map((rule) => `- ${rule}`),
    ``,
    `Flow requirements:`,
    ...supportedFlowSummaries.map((summary) => `- ${summary}`),
    ``,
    `Return only the page HTML.`
  ].join("\n");

  return {
    sessionId,
    blueprintId,
    pageId: page.id,
    prompt,
    sourcePageContractId: page.id,
    sourceFlowIds: page.supportsFlowIds,
    createdAt: nowIso()
  };
}

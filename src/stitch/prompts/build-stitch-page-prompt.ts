import type {
  PageContract,
  ProductBlueprintV1,
  StitchPagePromptArtifact,
  StitchPromptPlanPage
} from "../../blueprint/types/blueprint.js";
import {
  getAppArchetypeConstraints,
  resolveAppArchetype
} from "../constraints/load-app-archetype-constraints.js";

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

function buildNavigationConstraints(frozenBlueprint: ProductBlueprintV1, page: PageContract): string[] {
  const constraints: string[] = [
    `- appArchetype: ${resolveAppArchetype(frozenBlueprint)}`,
    `- appShell: ${frozenBlueprint.ui.appStructure.shell}`,
    `- navigationType: ${frozenBlueprint.ui.navigation.type}`,
    `- globalNavItems: ${frozenBlueprint.ui.navigation.globalNavItems.join(", ") || "none"}`
  ];

  const hasPageNavigationActions =
    Boolean(page.primaryAction?.targetPageId) || page.secondaryActions.some((action) => action.targetPageId);
  const archetype = resolveAppArchetype(frozenBlueprint);
  const ruleSet = getAppArchetypeConstraints(archetype);

  if (ruleSet && !hasPageNavigationActions) {
    constraints.push(...ruleSet.promptRules.map((rule) => `- ${rule}`));
  }

  return constraints;
}

export function buildStitchPagePrompt(
  sessionId: string,
  blueprintId: string,
  frozenBlueprint: ProductBlueprintV1,
  planPage: StitchPromptPlanPage,
  page: PageContract
): StitchPagePromptArtifact {
  const supportedFlowSummaries = findSupportedFlowSummaries(frozenBlueprint, page);
  const navigationConstraints = buildNavigationConstraints(frozenBlueprint, page);

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
    `- primaryAction: ${page.primaryAction ? page.primaryAction.label : "none"}`,
    `- secondaryActions: ${page.secondaryActions.map((action) => action.label).join(", ") || "none"}`,
    `- states: ${page.states.map((state) => state.name).join(", ") || "none"}`,
    `- feedbackSurfaces: ${page.feedbackSurfaces.map((surface) => surface.type).join(", ") || "none"}`,
    `- recoverySurfaces: ${page.recoverySurfaces.map((surface) => surface.type).join(", ") || "none"}`,
    `- requiredSections: ${page.sections.map((section) => section.name).join(", ") || "none"}`,
    `- componentRequirements: ${page.componentRequirements.map((item) => `${item.type}:${item.purpose}`).join(", ") || "none"}`,
    ``,
    `Navigation and shell constraints:`,
    ...navigationConstraints,
    ``,
    `Flow requirements:`,
    ...supportedFlowSummaries.map((summary) => `- ${summary}`),
    ``,
    `Visual and HTML requirements:`,
    `- Use real HTML elements.`,
    `- Use real text, real buttons, and real form controls.`,
    `- Do not embed the primary UI in an image.`,
    `- Respect visualPolicy.imageUsage.forbidUiAsImage = true.`,
    `- Make the page self-contained and editable.`,
    `- Do not invent new pages, flows, roles, auth, payment, collaboration, or integrations.`,
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

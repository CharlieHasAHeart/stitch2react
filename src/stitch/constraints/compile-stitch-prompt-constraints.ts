import type { ProductBlueprintV1, PageContract } from "../../blueprint/types/blueprint.js";
import type { StitchUiConstraints } from "./load-stitch-ui-constraints.js";

export type CompiledStitchPromptConstraints = {
  globalRules: string[];
  htmlContractRules: string[];
  interactionRules: string[];
  navigationRules: string[];
  forbiddenPatterns: string[];
};

export function compileStitchPromptConstraints(input: {
  constraints: StitchUiConstraints;
  frozenBlueprint: ProductBlueprintV1;
  page: PageContract;
}): CompiledStitchPromptConstraints {
  const { constraints, frozenBlueprint, page } = input;

  const htmlContractRules = [
    constraints.html.requireVisibleRoot ? "Render a visible root container for the page using a main element." : undefined,
    constraints.html.requirePageIdAttribute ? `Add data-page-id="${page.id}" to the main page root.` : undefined,
    constraints.html.requireHeading ? "Render a visible h1 heading that matches the page purpose." : undefined,
    constraints.html.requireSemanticActionMarkers ? "Add data-action-id and data-action-kind to declared action elements." : undefined,
    constraints.html.requireFeedbackSurfaceMarkers ? "Add data-feedback-surface markers to declared feedback surfaces and use role=\"status\" with aria-live when appropriate." : undefined,
    constraints.html.requireRecoverySurfaceMarkers ? "Add data-recovery-surface markers to declared recovery surfaces." : undefined
  ].filter(Boolean) as string[];

  const interactionRules = [
    `Clickable elements include: ${constraints.interaction.clickableSelectors.join(", ")}.`,
    `Allowed visible click behaviors: ${constraints.interaction.allowedVisibleBehaviors.join(", ")}.`,
    "Hover, focus, highlight, or color change alone is not enough."
  ];

  const navigationRules = [
    `Navigation type: ${frozenBlueprint.ui.navigation.type}.`,
    `Global navigation items: ${frozenBlueprint.ui.navigation.globalNavItems.join(", ") || "none"}.`,
    `Page route: ${page.route}.`,
    "Only link to routes declared by PageContracts.",
    "Do not invent navigation destinations."
  ];

  return {
    globalRules: constraints.promptRules.global,
    htmlContractRules,
    interactionRules,
    navigationRules,
    forbiddenPatterns: constraints.interaction.forbiddenNoopPatterns
  };
}

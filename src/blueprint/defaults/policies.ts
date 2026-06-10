import type {
  GenerationPolicy,
  GlobalGenerationPolicySeed,
  VisualPolicy
} from "../types/blueprint.js";

export const defaultGlobalGenerationPolicySeed: GlobalGenerationPolicySeed = {
  noFollowUpQuestions: true,
  assumptionStrategy: "conservative_mvp",
  explicitBeatsInferred: true,
  doNotExpandScope: true
};

export const defaultGenerationPolicy: GenerationPolicy = {
  noFollowUpQuestions: true,
  assumptionStrategy: "conservative_mvp",
  defaultScopeWhenAmbiguous: "single_primary_flow_mvp",
  maxCoreFlows: 3,
  maxPages: 5,
  maxPrimaryActionsPerPage: 2,
  inferenceRules: [
    "Prefer explicit user requirements over inferred requirements.",
    "When ambiguous, choose the smallest coherent MVP scope.",
    "Do not introduce payments, authentication, collaboration, or admin roles unless they are explicit or strongly implied.",
    "Every core user flow must have a completion signal.",
    "Every user-visible flow must have at least one UI surface."
  ],
  safetyRules: [
    "Do not generate regulated, harmful, or unsafe product behavior.",
    "Do not invent integrations with real third-party services unless explicitly requested.",
    "Mark uncertain decisions as assumptions or unresolved questions with default decisions."
  ],
  stitchGenerationRules: {
    generatePagesIndividually: true,
    includeFlowContextInEveryPrompt: true,
    includeVisualPolicyInEveryPrompt: true,
    requirePrimaryActionInEveryPage: true,
    requireCompletionSignalWhenApplicable: true,
    requireFeedbackAndRecoveryStates: true,
    validateAfterGeneration: true
  }
};

export const defaultVisualPolicy: VisualPolicy = {
  imageUsage: {
    allowDecorativeBackgrounds: true,
    allowContentImages: true,
    maxSingleImageDominanceRatio: 0.35,
    decorativeImageGuidance:
      "Images may be used as subtle, low-opacity background accents or content thumbnails, but never as the main interface.",
    forbiddenImageUses: [
      "Do not render menus, buttons, forms, tables, charts, cards, dashboards, or important text inside raster images.",
      "Do not use a single full-page screenshot as the UI.",
      "Do not hide critical information inside decorative images."
    ]
  },
  htmlElementPolicy: {
    requireRealText: true,
    requireRealButtons: true,
    requireRealForms: true,
    requireRealNavigation: true,
    requireRealDataDisplay: true,
    requireSemanticSections: true
  },
  designTone: {
    value: "modern, clear, product-grade",
    source: "defaulted",
    confidence: "medium"
  },
  density: {
    value: "balanced",
    source: "defaulted",
    confidence: "medium"
  },
  layoutPreference: {
    value: "clear hierarchy with obvious primary actions",
    source: "defaulted",
    confidence: "medium"
  },
  colorIntent: {
    value: { mood: "professional" },
    source: "defaulted",
    confidence: "medium"
  },
  typographyIntent: {
    value: { style: "modern_sans", emphasis: "medium" },
    source: "defaulted",
    confidence: "medium"
  },
  motionIntent: {
    value: { level: "subtle" },
    source: "defaulted",
    confidence: "medium"
  }
};

# ProductBlueprintV1 Specification

## 1. Purpose

`ProductBlueprintV1` is the foundational schema for a one-shot product-to-Stitch-to-React generation system.

The system assumes the user only provides input once. The input may be a one-sentence idea, a short brief, a structured PRD, a workflow description, a screen request, a reference product description, or a mixture of these. The job of the LLM is to normalize that input into a complete, traceable, generation-ready blueprint.

This blueprint is not only a human-readable PRD. It is the structured contract consumed by later stages:

```text
User One-shot Input
  -> ProductBlueprintV1
  -> Flow Blueprint
  -> Page Contracts
  -> Stitch Prompts
  -> HTML + Screenshot
  -> React Project
```

## 2. Core Principles

1. **One-shot input, structured output**  
   The user gives input once; the system must produce a complete blueprint.

2. **Explicit beats inferred**  
   User-stated information always takes precedence over inferred or defaulted information.

3. **Every inferred decision must be traceable**  
   Important fields carry source, confidence, evidence, and optional risk.

4. **Flow before pages**  
   Pages are derived from user flows, not the other way around.

5. **Completion signal required**  
   Every core user flow should define what visible or verifiable result indicates completion.

6. **UI surface required**  
   Every user-visible flow must map to a UI surface, primary action, feedback surface, and completion signal.

7. **Real HTML over visual illusion**  
   Stitch output should use real HTML elements for UI. Images may be decorative or content-based, but must not replace the interface.

8. **Conservative MVP by default**  
   When the input is ambiguous, generate a small, coherent MVP instead of over-expanding the product.

---

## 3. Top-level Schema

```ts
// ======================================================
// One-shot Product Blueprint v1
// ======================================================

export type ProductBlueprintV1 = {
  meta: BlueprintMeta;
  input: InputUnderstanding;
  product: ProductIntent;
  users: UserModel;
  domain: DomainModel;
  flows: FlowModel;
  ui: UIModel;
  visualPolicy: VisualPolicy;
  generationPolicy: GenerationPolicy;
  uncertainty: UncertaintyModel;
};
```

---

## 4. Common Field Types

Important fields should not store only a value. They should also store where the value came from and how reliable it is.

```ts
export type FieldSource = "explicit" | "inferred" | "defaulted";

export type Confidence = "high" | "medium" | "low";

export type Field<T> = {
  value: T;

  /**
   * explicit: directly stated by the user
   * inferred: reasonably inferred by the LLM from context
   * defaulted: filled by system default policy
   */
  source: FieldSource;

  /**
   * Confidence in this field.
   */
  confidence: Confidence;

  /**
   * If source = explicit, record source text.
   * If source = inferred, record inference basis.
   */
  evidence?: string;

  /**
   * Risk if this field may affect downstream generation quality.
   */
  risk?: string;
};
```

---

## 5. BlueprintMeta

Records metadata about this blueprint generation.

```ts
export type BlueprintMeta = {
  version: "1.0";

  /**
   * Current system mode: the user only inputs once, no follow-up questions.
   */
  mode: "one_shot";

  /**
   * Original input language, for example "zh-CN" or "en-US".
   */
  inputLanguage: string;

  /**
   * Language used for downstream documents, pages, and code.
   */
  outputLanguage: string;

  /**
   * Downstream generation target.
   */
  downstreamTarget: "stitch_to_react";

  /**
   * ISO timestamp.
   */
  generatedAt: string;
};
```

---

## 6. InputUnderstanding

Describes how the system understands the user's first and only input.

```ts
export type InputUnderstanding = {
  raw: string;

  type: Field<InputType>;

  maturity: Field<InputMaturity>;

  requestedScope: Field<RequestedScope>;

  /**
   * Explicit constraints from the user, for example:
   * - mobile only
   * - no login
   * - B2B oriented
   * - visual style reference: Linear
   */
  explicitConstraints: Field<string[]>;

  /**
   * Reference products, websites, or styles mentioned by the user.
   */
  references: Field<ReferenceInput[]>;

  /**
   * Concise normalized explanation of the input.
   */
  normalizedSummary: Field<string>;
};

export type InputType =
  | "one_sentence_idea"
  | "short_brief"
  | "structured_prd"
  | "workflow_description"
  | "screen_request"
  | "reference_product_description"
  | "mixed";

export type InputMaturity =
  | "idea"
  | "rough_brief"
  | "structured_requirements"
  | "implementation_ready";

export type RequestedScope =
  | "single_screen"
  | "single_flow"
  | "multi_page_app"
  | "full_product_mvp";

export type ReferenceInput = {
  name?: string;
  url?: string;
  description?: string;

  /**
   * What the user wants to reference.
   */
  referenceFor:
    | "visual_style"
    | "interaction_pattern"
    | "product_structure"
    | "copywriting_tone"
    | "unknown";
};
```

---

## 7. ProductIntent

Defines the core product intention. This is the upstream source for flows, pages, and Stitch prompts.

```ts
export type ProductIntent = {
  name: Field<string>;

  category: Field<string>;

  oneSentenceSummary: Field<string>;

  targetProblem: Field<string>;

  primaryValueProposition: Field<string>;

  /**
   * Definition of success for this product or MVP.
   * Flow-level completion signals are derived from this.
   */
  successDefinition: Field<string>;

  /**
   * Current generation scope exclusions.
   * This prevents uncontrolled LLM expansion.
   */
  outOfScope: Field<string[]>;

  /**
   * Product target platform.
   */
  platform: Field<ProductPlatform[]>;

  /**
   * Product complexity estimate.
   */
  complexity: Field<ProductComplexity>;
};

export type ProductPlatform =
  | "web_desktop"
  | "web_mobile"
  | "responsive_web"
  | "mobile_app"
  | "admin_console"
  | "unknown";

export type ProductComplexity = "simple" | "moderate" | "complex";
```

---

## 8. UserModel

Defines who uses the product, why they use it, and how sophisticated they are.

```ts
export type UserModel = {
  primaryUsers: Field<UserPersona[]>;

  secondaryUsers: Field<UserPersona[]>;

  userMotivations: Field<string[]>;

  userPainPoints: Field<string[]>;

  userSkillLevel: Field<UserSkillLevel>;

  /**
   * Whether the product involves multiple roles or permission levels.
   */
  roleComplexity: Field<RoleComplexity>;
};

export type UserPersona = {
  id: string;

  role: string;

  description: string;

  goals: string[];

  painPoints?: string[];

  /**
   * What this role can do inside the product.
   */
  permissions?: string[];
};

export type UserSkillLevel =
  | "consumer"
  | "professional"
  | "technical"
  | "admin";

export type RoleComplexity =
  | "single_user"
  | "single_role"
  | "multi_role_simple"
  | "multi_role_complex";
```

---

## 9. DomainModel

Defines business objects and rules. This directly affects forms, tables, detail pages, mock APIs, and state management.

```ts
export type DomainModel = {
  entities: Field<DomainEntity[]>;

  relationships: Field<EntityRelationship[]>;

  statuses: Field<DomainStatus[]>;

  /**
   * Important business rules, for example:
   * - booking cannot overlap
   * - paid invoice amount cannot be edited
   */
  businessRules: Field<BusinessRule[]>;

  /**
   * Mock data required by the MVP.
   */
  mockDataNeeds: Field<MockDataNeed[]>;
};

export type DomainEntity = {
  name: string;

  description: string;

  typicalFields: DomainField[];

  importance: "primary" | "secondary" | "supporting";
};

export type DomainField = {
  name: string;

  type:
    | "string"
    | "number"
    | "boolean"
    | "date"
    | "datetime"
    | "enum"
    | "currency"
    | "email"
    | "phone"
    | "url"
    | "text"
    | "object"
    | "array";

  required: boolean;

  description?: string;

  enumValues?: string[];
};

export type EntityRelationship = {
  from: string;

  to: string;

  type: "one_to_one" | "one_to_many" | "many_to_one" | "many_to_many";

  description: string;
};

export type DomainStatus = {
  entity: string;

  statuses: string[];

  defaultStatus?: string;

  terminalStatuses?: string[];
};

export type BusinessRule = {
  id: string;

  description: string;

  affectedEntities: string[];

  source: FieldSource;

  confidence: Confidence;
};

export type MockDataNeed = {
  entity: string;

  count: number;

  purpose:
    | "table"
    | "detail"
    | "dashboard_metric"
    | "chart"
    | "form_prefill"
    | "empty_state"
    | "error_state";
};
```

---

## 10. FlowModel

The central model of the system. A flow is not just page navigation. A flow includes user goals, system effects, feedback, recovery, state transitions, and completion signals.

```ts
export type FlowModel = {
  coreUserFlows: CoreUserFlow[];

  supportingFlows: SupportingInteractionFlow[];

  sideEffectFlows: SideEffectFlow[];

  feedbackFlows: FeedbackFlow[];

  recoveryFlows: RecoveryFlow[];

  stateTransitions: StateTransition[];

  /**
   * Dependencies between flows.
   */
  dependencies: FlowDependency[];
};
```

---

## 11. CoreUserFlow

A primary path the user follows to accomplish a product goal.

```ts
export type CoreUserFlow = {
  id: string;

  name: string;

  priority: "primary" | "secondary";

  userGoal: Field<string>;

  trigger: Field<string>;

  /**
   * Ordered user and system actions.
   */
  steps: FlowStep[];

  /**
   * System changes caused by this flow.
   */
  systemEffects: Field<string[]>;

  /**
   * Feedback the user should see during the flow.
   */
  feedback: Field<string[]>;

  /**
   * How the user recovers from failure, invalid input, or blocked states.
   */
  recovery: Field<string[]>;

  /**
   * Visible result that indicates flow completion.
   */
  completionSignal: Field<string>;

  involvedEntities: string[];

  /**
   * UI pages or regions that carry this flow.
   */
  uiSurfaces: string[];

  confidence: Confidence;
};

export type FlowStep = {
  order: number;

  actor: "user" | "system";

  action: string;

  /**
   * UI surface where this step happens.
   */
  surface?: string;

  expectedFeedback?: string;

  resultingState?: string;

  /**
   * Critical steps usually map to primary actions or important states.
   */
  isCritical?: boolean;
};
```

---

## 12. SupportingInteractionFlow

An auxiliary interaction that helps the user complete or recover a core flow.

Examples include opening filters, viewing details, retrying submission, saving drafts, copying links, or expanding advanced settings.

```ts
export type SupportingInteractionFlow = {
  id: string;

  name: string;

  supportsCoreFlowIds: string[];

  userGoal: Field<string>;

  trigger: Field<string>;

  actions: string[];

  feedback: string[];

  completionSignal: Field<string>;

  /**
   * Whether this should be shown inline, in a modal, drawer, page, or toast.
   */
  uiTreatment: "inline" | "modal" | "drawer" | "separate_page" | "toast_only";

  confidence: Confidence;
};
```

---

## 13. SideEffectFlow

A system-effect path triggered by a user action or a core flow.

```ts
export type SideEffectFlow = {
  id: string;

  name: string;

  triggeredByFlowId: string;

  trigger: Field<string>;

  systemEffects: SideEffect[];

  visibleToUser: boolean;

  feedbackSurface?: string;

  completionSignal?: Field<string>;

  confidence: Confidence;
};

export type SideEffect = {
  order: number;

  effect:
    | "create_record"
    | "update_record"
    | "delete_record"
    | "send_notification"
    | "start_background_job"
    | "generate_artifact"
    | "update_status"
    | "validate_input"
    | "sync_external_service"
    | "other";

  description: string;

  affectedEntity?: string;

  resultingState?: string;
};
```

---

## 14. FeedbackFlow

Defines how the system communicates state to the user.

```ts
export type FeedbackFlow = {
  id: string;

  name: string;

  relatedFlowIds: string[];

  states: FeedbackState[];

  /**
   * Where feedback appears.
   */
  surfaces: string[];

  /**
   * Important states should not rely on color alone.
   */
  requiresVisibleText: boolean;
};

export type FeedbackState = {
  state:
    | "idle"
    | "pending"
    | "progress"
    | "success"
    | "failure"
    | "blocked"
    | "validation_error"
    | "empty"
    | "completed";

  message: string;

  visualTreatment:
    | "inline_message"
    | "toast"
    | "banner"
    | "modal"
    | "status_badge"
    | "progress_indicator"
    | "empty_state"
    | "error_panel";
};
```

---

## 15. RecoveryFlow

Defines how the user or system recovers after invalid input, blocked state, failure, or interruption.

```ts
export type RecoveryFlow = {
  id: string;

  name: string;

  relatedFlowIds: string[];

  failureCondition: Field<string>;

  userVisibleFeedback: Field<string>;

  recoveryActions: RecoveryAction[];

  preservesUserInput: boolean;

  confidence: Confidence;
};

export type RecoveryAction = {
  label: string;

  action:
    | "retry"
    | "edit_input"
    | "replace_file"
    | "go_back"
    | "contact_support"
    | "dismiss"
    | "choose_alternative"
    | "refresh"
    | "other";

  targetSurface?: string;
};
```

---

## 16. StateTransition

A user-visible, domain, runtime, or UI state change.

```ts
export type StateTransition = {
  id: string;

  relatedFlowId: string;

  entityOrStateName: string;

  from: string;

  to: string;

  trigger: string;

  visibleToUser: boolean;

  feedback?: string;
};
```

---

## 17. FlowDependency

Defines dependencies between flows.

```ts
export type FlowDependency = {
  fromFlowId: string;

  toFlowId: string;

  type:
    | "requires_completion"
    | "unlocks"
    | "provides_data"
    | "provides_state"
    | "recovery_for"
    | "feedback_for";

  description: string;
};
```

---

## 18. UIModel

Defines UI structure derived from flows.

```ts
export type UIModel = {
  appStructure: Field<AppStructure>;

  navigation: Field<NavigationModel>;

  pages: PageContract[];

  globalComponents: Field<GlobalComponent[]>;

  responsivePolicy: Field<ResponsivePolicy>;
};
```

---

## 19. AppStructure

Defines the overall product UI structure.

```ts
export type AppStructure = {
  pattern:
    | "single_page_flow"
    | "multi_step_wizard"
    | "dashboard_app"
    | "marketplace"
    | "content_app"
    | "admin_console"
    | "landing_plus_app"
    | "form_to_result"
    | "unknown";

  rationale: string;
};
```

---

## 20. NavigationModel

Defines navigation style and items.

```ts
export type NavigationModel = {
  type:
    | "none"
    | "top_nav"
    | "sidebar"
    | "bottom_nav"
    | "stepper"
    | "tabs"
    | "breadcrumb"
    | "mixed";

  primaryItems: NavigationItem[];

  secondaryItems?: NavigationItem[];
};

export type NavigationItem = {
  label: string;

  targetPageId: string;

  route: string;

  iconHint?: string;

  relatedFlowIds?: string[];
};
```

---

## 21. PageContract

The page-level contract used to generate Stitch prompts.

```ts
export type PageContract = {
  id: string;

  name: string;

  route: string;

  /**
   * Why this page exists.
   */
  purpose: string;

  /**
   * Which flows this page supports.
   */
  supportsFlowIds: string[];

  /**
   * Where the user comes from before entering this page.
   */
  entryConditions: string[];

  /**
   * Most important actions on this page.
   */
  primaryActions: UIAction[];

  secondaryActions: UIAction[];

  requiredSections: PageSection[];

  requiredComponents: UIComponentRequirement[];

  /**
   * Required visible states on the page.
   */
  states: UIState[];

  feedbackSurfaces: FeedbackSurface[];

  recoverySurfaces: RecoverySurface[];

  completionSignals: string[];

  /**
   * Page-specific hints passed into Stitch prompt generation.
   */
  stitchPromptHints: string[];
};
```

---

## 22. UIAction

Defines a user action available in the UI.

```ts
export type UIAction = {
  id: string;

  label: string;

  actionType:
    | "navigate"
    | "submit"
    | "save"
    | "cancel"
    | "open_modal"
    | "close_modal"
    | "filter"
    | "search"
    | "sort"
    | "select"
    | "upload"
    | "download"
    | "retry"
    | "confirm"
    | "other";

  triggersFlowId?: string;

  targetPageId?: string;

  targetRoute?: string;

  expectedFeedback?: string;

  importance: "primary" | "secondary" | "tertiary";
};
```

---

## 23. PageSection

Defines a required page region.

```ts
export type PageSection = {
  id: string;

  name: string;

  purpose: string;

  priority: "primary" | "secondary" | "supporting";

  contentRequirements: string[];

  relatedFlowIds?: string[];
};
```

---

## 24. UIComponentRequirement

Defines component-level needs. These are not final React components, but they help with later component extraction.

```ts
export type UIComponentRequirement = {
  id: string;

  componentType:
    | "header"
    | "sidebar"
    | "nav"
    | "card"
    | "metric_card"
    | "table"
    | "form"
    | "input"
    | "select"
    | "button"
    | "tabs"
    | "stepper"
    | "modal"
    | "drawer"
    | "toast"
    | "banner"
    | "chart"
    | "timeline"
    | "list"
    | "detail_panel"
    | "empty_state"
    | "error_state"
    | "confirmation"
    | "image"
    | "custom";

  purpose: string;

  dataEntity?: string;

  requiredInteractions?: string[];

  relatedFlowIds?: string[];
};
```

---

## 25. UIState

Defines required UI states for pages or components.

```ts
export type UIState = {
  name:
    | "default"
    | "empty"
    | "loading"
    | "submitting"
    | "success"
    | "error"
    | "validation_error"
    | "blocked"
    | "disabled"
    | "selected"
    | "expanded"
    | "completed";

  description: string;

  visibleMessage?: string;

  relatedFlowIds?: string[];
};
```

---

## 26. FeedbackSurface

Defines where feedback is shown in the UI.

```ts
export type FeedbackSurface = {
  id: string;

  type:
    | "inline"
    | "toast"
    | "banner"
    | "modal"
    | "status_badge"
    | "progress_bar"
    | "empty_state"
    | "error_panel";

  messagePurpose: string;

  relatedFlowIds: string[];
};
```

---

## 27. RecoverySurface

Defines where recovery actions appear in the UI.

```ts
export type RecoverySurface = {
  id: string;

  failureCondition: string;

  recoveryActions: UIAction[];

  relatedFlowIds: string[];
};
```

---

## 28. GlobalComponent

Defines reusable cross-page UI components.

```ts
export type GlobalComponent = {
  id: string;

  name: string;

  componentType:
    | "app_shell"
    | "sidebar"
    | "top_nav"
    | "footer"
    | "theme_toggle"
    | "notification_center"
    | "user_menu"
    | "global_search"
    | "command_palette"
    | "other";

  purpose: string;

  appearsOnPageIds: string[];
};
```

---

## 29. ResponsivePolicy

Defines responsive behavior.

```ts
export type ResponsivePolicy = {
  target:
    | "desktop_first"
    | "mobile_first"
    | "responsive"
    | "desktop_only"
    | "mobile_only";

  importantBreakpoints?: string[];

  layoutBehavior: string;
};
```

---

## 30. VisualPolicy

Controls visual output and prevents Stitch from generating a full-page image instead of real UI.

```ts
export type VisualPolicy = {
  imageUsage: ImageUsagePolicy;

  htmlElementPolicy: HtmlElementPolicy;

  designTone: Field<string>;

  density: Field<VisualDensity>;

  layoutPreference: Field<string>;

  colorIntent: Field<ColorIntent>;

  typographyIntent: Field<TypographyIntent>;

  motionIntent: Field<MotionIntent>;
};

export type ImageUsagePolicy = {
  allowDecorativeBackgrounds: boolean;

  allowContentImages: boolean;

  forbidUiAsImage: boolean;

  /**
   * Maximum visual area ratio for a single image above the fold.
   * Example: 0.35 means no more than 35%.
   */
  maxSingleImageDominanceRatio: number;

  decorativeImageGuidance: string;

  forbiddenImageUses: string[];
};

export type HtmlElementPolicy = {
  requireRealText: boolean;

  requireRealButtons: boolean;

  requireRealForms: boolean;

  requireRealNavigation: boolean;

  requireRealDataDisplay: boolean;

  requireSemanticSections: boolean;
};

export type VisualDensity = "minimal" | "balanced" | "dense";

export type ColorIntent = {
  primary?: string;

  background?: string;

  accent?: string;

  mood:
    | "calm"
    | "energetic"
    | "professional"
    | "playful"
    | "premium"
    | "technical"
    | "editorial";
};

export type TypographyIntent = {
  style:
    | "modern_sans"
    | "editorial"
    | "technical"
    | "friendly"
    | "premium";

  emphasis: "low" | "medium" | "high";
};

export type MotionIntent = {
  level: "none" | "subtle" | "expressive";

  notes?: string;
};
```

---

## 31. GenerationPolicy

Defines how the system behaves under one-shot generation.

```ts
export type GenerationPolicy = {
  noFollowUpQuestions: true;

  assumptionStrategy:
    | "conservative_mvp"
    | "best_practice_product_pattern"
    | "creative_expansion";

  defaultScopeWhenAmbiguous:
    | "single_primary_flow_mvp"
    | "three_to_five_page_mvp"
    | "single_screen";

  maxCoreFlows: number;

  maxPages: number;

  maxPrimaryActionsPerPage: number;

  inferenceRules: string[];

  safetyRules: string[];

  stitchGenerationRules: StitchGenerationRules;
};

export type StitchGenerationRules = {
  generatePagesIndividually: boolean;

  includeFlowContextInEveryPrompt: boolean;

  includeVisualPolicyInEveryPrompt: boolean;

  requirePrimaryActionInEveryPage: boolean;

  requireCompletionSignalWhenApplicable: boolean;

  requireFeedbackAndRecoveryStates: boolean;

  validateAfterGeneration: boolean;
};
```

---

## 32. UncertaintyModel

Since the system cannot ask follow-up questions, uncertainty must be recorded and handled with default decisions.

```ts
export type UncertaintyModel = {
  assumptions: Assumption[];

  unresolvedQuestions: UnresolvedQuestion[];

  risks: Risk[];

  blockedAreas: BlockedArea[];
};

export type Assumption = {
  id: string;

  statement: string;

  reason: string;

  affects: BlueprintArea[];

  confidence: Confidence;
};

export type UnresolvedQuestion = {
  id: string;

  question: string;

  impact: "low" | "medium" | "high";

  /**
   * Because the system cannot ask follow-up questions,
   * every unresolved question must have a default decision.
   */
  defaultDecision: string;

  affects: BlueprintArea[];
};

export type Risk = {
  id: string;

  description: string;

  severity: "low" | "medium" | "high";

  mitigation: string;

  affects: BlueprintArea[];
};

export type BlockedArea = {
  area: BlueprintArea;

  reason: string;

  /**
   * In one-shot mode, the system should usually not fully block generation.
   * Instead, it can exclude, default, placeholder, or defer the affected area.
   */
  defaultHandling:
    | "exclude_from_mvp"
    | "use_safe_default"
    | "generate_placeholder"
    | "defer_to_later";
};

export type BlueprintArea =
  | "product"
  | "users"
  | "domain"
  | "flows"
  | "ui"
  | "visual"
  | "data"
  | "api"
  | "state"
  | "react_generation"
  | "stitch_generation";
```

---

## 33. Recommended Default Policies

For the first implementation, use conservative defaults:

```ts
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
```

Recommended default visual policy:

```ts
export const defaultVisualPolicy: VisualPolicy = {
  imageUsage: {
    allowDecorativeBackgrounds: true,
    allowContentImages: true,
    forbidUiAsImage: true,
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
    value: {
      mood: "professional"
    },
    source: "defaulted",
    confidence: "medium"
  },
  typographyIntent: {
    value: {
      style: "modern_sans",
      emphasis: "medium"
    },
    source: "defaulted",
    confidence: "medium"
  },
  motionIntent: {
    value: {
      level: "subtle"
    },
    source: "defaulted",
    confidence: "medium"
  }
};
```

---

## 34. How Downstream Stages Should Use ProductBlueprintV1

### 34.1 Flow generation

Use:

```text
product
users
domain
flows
uncertainty
```

The system should derive flow candidates from user intent, domain entities, and default assumptions.

### 34.2 Page contract generation

Use:

```text
flows.coreUserFlows
flows.feedbackFlows
flows.recoveryFlows
ui.appStructure
ui.navigation
```

Each page should support named flows and contain primary actions, feedback surfaces, recovery surfaces, and completion signals.

### 34.3 Stitch prompt generation

Use:

```text
product
users
flows
ui.pages
visualPolicy
generationPolicy.stitchGenerationRules
```

Every Stitch prompt should include:

- product context
- page purpose
- supported flow IDs
- primary actions
- expected feedback
- completion signals
- visual policy
- HTML element requirements

### 34.4 React generation

Use:

```text
domain
flows
ui
visualPolicy
uncertainty
```

React generation should turn page contracts into components, mock data, state, and interactions.

---

## 35. Summary

`ProductBlueprintV1` is the foundation for a one-shot product generation system.

Its central idea is:

```text
Do not generate pages directly from a vague PRD.
Generate a traceable product blueprint first.
Then derive flows, page contracts, Stitch prompts, and React code from that blueprint.
```

The most important design requirements are:

```text
1. Every important field tracks explicit / inferred / defaulted source.
2. Every core flow has user goal, trigger, system effects, feedback, recovery, and completion signal.
3. Every page exists because it supports a flow.
4. Stitch must generate real HTML UI, not UI-as-image.
5. Ambiguity is handled through assumptions and default decisions, not follow-up questions.
```

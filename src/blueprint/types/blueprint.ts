export type FieldSource = "explicit" | "inferred" | "defaulted";

export type Confidence = "high" | "medium" | "low";

export type Field<T> = {
  value: T;
  source: FieldSource;
  confidence: Confidence;
  evidence?: string;
  risk?: string;
};

export type BlueprintMeta = {
  version: "1.0";
  mode: "one_shot";
  inputLanguage: string;
  outputLanguage: string;
  downstreamTarget: "stitch_to_react";
  generatedAt: string;
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
  referenceFor:
    | "visual_style"
    | "interaction_pattern"
    | "product_structure"
    | "copywriting_tone"
    | "unknown";
};

export type InputUnderstanding = {
  raw: string;
  type: Field<InputType>;
  maturity: Field<InputMaturity>;
  requestedScope: Field<RequestedScope>;
  explicitConstraints: Field<string[]>;
  references: Field<ReferenceInput[]>;
  normalizedSummary: Field<string>;
};

export type ProductPlatform = "web" | "mobile_web" | "mobile_app" | "desktop_web";

export type ProductComplexity = "simple" | "moderate" | "complex";

export type ProductIntent = {
  name: Field<string>;
  category: Field<string>;
  oneSentenceSummary: Field<string>;
  targetProblem: Field<string>;
  primaryValueProposition: Field<string>;
  successDefinition: Field<string>;
  outOfScope: Field<string[]>;
  platform: Field<ProductPlatform[]>;
  complexity: Field<ProductComplexity>;
};

export type UserType = "end_user" | "operator" | "admin" | "guest";

export type UserPersona = {
  id: string;
  label: string;
  type: UserType;
  goals: string[];
  painPoints: string[];
};

export type UserModel = {
  primaryPersona: Field<UserPersona>;
  secondaryPersonas: Field<UserPersona[]>;
  userSegmentsSummary: Field<string>;
};

export type DomainEntityField = {
  name: string;
  type: string;
  required: boolean;
  description: string;
};

export type DomainEntity = {
  id: string;
  name: string;
  description: string;
  fields: DomainEntityField[];
};

export type DomainRelationship = {
  fromEntityId: string;
  toEntityId: string;
  relation: string;
  description: string;
};

export type DomainModel = {
  entities: DomainEntity[];
  relationships: DomainRelationship[];
  businessRules: string[];
};

export type FlowStep = {
  id: string;
  label: string;
  actor: "user" | "system";
  kind: "action" | "validation" | "feedback" | "state_change";
  detail: string;
};

export type CompletionSignal = {
  userVisible: boolean;
  signal: string;
};

export type CoreUserFlow = {
  id: string;
  name: string;
  userGoal: string;
  trigger: string;
  steps: FlowStep[];
  systemEffects: string[];
  feedback: string[];
  recovery: string[];
  completionSignal: CompletionSignal;
  involvedEntityIds: string[];
  uiSurfaceIds: string[];
};

export type SupportingInteractionFlow = {
  id: string;
  name: string;
  supportsCoreFlowId: string;
  trigger: string;
  steps: FlowStep[];
};

export type SideEffectFlow = {
  id: string;
  name: string;
  sourceCoreFlowId: string;
  effects: string[];
};

export type FeedbackFlow = {
  id: string;
  name: string;
  sourceFlowId: string;
  states: string[];
  surfaces: string[];
};

export type RecoveryFlow = {
  id: string;
  name: string;
  sourceFlowId: string;
  failureCondition: string;
  recoveryActions: string[];
};

export type StateTransition = {
  flowId: string;
  from: string;
  to: string;
  condition: string;
};

export type FlowDependency = {
  fromFlowId: string;
  toFlowId: string;
  reason: string;
};

export type FlowModel = {
  coreUserFlows: CoreUserFlow[];
  supportingInteractionFlows: SupportingInteractionFlow[];
  sideEffectFlows: SideEffectFlow[];
  feedbackFlows: FeedbackFlow[];
  recoveryFlows: RecoveryFlow[];
  stateTransitions: StateTransition[];
  dependencies: FlowDependency[];
};

export type UIAction = {
  id: string;
  label: string;
  kind: "primary" | "secondary" | "navigation" | "recovery";
  triggersFlowId?: string;
  targetPageId?: string;
  feedback: string;
};

export type PageSection = {
  id: string;
  name: string;
  purpose: string;
};

export type FeedbackSurface = {
  id: string;
  type: "inline" | "toast" | "banner" | "empty_state" | "success_panel";
  purpose: string;
};

export type RecoverySurface = {
  id: string;
  type: "error_panel" | "retry_area" | "editable_form";
  purpose: string;
};

export type UIState = {
  name: string;
  description: string;
};

export type UIComponentRequirement = {
  type: string;
  purpose: string;
  required: boolean;
};

export type PageContract = {
  id: string;
  name: string;
  route: string;
  purpose: string;
  supportsFlowIds: string[];
  primaryAction?: UIAction;
  secondaryActions: UIAction[];
  sections: PageSection[];
  componentRequirements: UIComponentRequirement[];
  states: UIState[];
  feedbackSurfaces: FeedbackSurface[];
  recoverySurfaces: RecoverySurface[];
  stitchPromptHints: string[];
  readonly: boolean;
  confirmationOnly: boolean;
};

export type AppStructure = {
  shell: "single_page" | "dashboard" | "wizard";
  pageOrder: string[];
};

export type NavigationModel = {
  type: "minimal" | "top_nav" | "sidebar";
  globalNavItems: string[];
};

export type GlobalComponent = {
  id: string;
  name: string;
  purpose: string;
};

export type ResponsivePolicy = {
  mobileFirst: boolean;
  breakpoints: string[];
};

export type UIModel = {
  appStructure: AppStructure;
  navigation: NavigationModel;
  pages: PageContract[];
  globalComponents: GlobalComponent[];
  responsivePolicy: ResponsivePolicy;
};

export type VisualPolicy = {
  imageUsage: {
    allowDecorativeBackgrounds: boolean;
    allowContentImages: boolean;
    forbidUiAsImage: true;
    maxSingleImageDominanceRatio: number;
    decorativeImageGuidance: string;
    forbiddenImageUses: string[];
  };
  htmlElementPolicy: {
    requireRealText: boolean;
    requireRealButtons: boolean;
    requireRealForms: boolean;
    requireRealNavigation: boolean;
    requireRealDataDisplay: boolean;
    requireSemanticSections: boolean;
  };
  designTone: Field<string>;
  density: Field<string>;
  layoutPreference: Field<string>;
  colorIntent: Field<{ mood: string }>;
  typographyIntent: Field<{ style: string; emphasis: string }>;
  motionIntent: Field<{ level: string }>;
};

export type GenerationPolicy = {
  noFollowUpQuestions: true;
  assumptionStrategy: "conservative_mvp";
  defaultScopeWhenAmbiguous: "single_primary_flow_mvp";
  maxCoreFlows: number;
  maxPages: number;
  maxPrimaryActionsPerPage: number;
  inferenceRules: string[];
  safetyRules: string[];
  stitchGenerationRules: {
    generatePagesIndividually: boolean;
    includeFlowContextInEveryPrompt: boolean;
    includeVisualPolicyInEveryPrompt: boolean;
    requirePrimaryActionInEveryPage: boolean;
    requireCompletionSignalWhenApplicable: boolean;
    requireFeedbackAndRecoveryStates: boolean;
    validateAfterGeneration: boolean;
  };
};

export type Assumption = {
  id: string;
  question: string;
  defaultDecision: string;
  rationale: string;
};

export type UncertaintyModel = {
  assumptions: Assumption[];
  unresolvedQuestions: Assumption[];
  notableRisks: string[];
};

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

export type BlueprintStage =
  | "input_understanding"
  | "domain_modeling"
  | "flow_modeling"
  | "ui_modeling"
  | "policy_uncertainty"
  | "blueprint_assembly"
  | "blueprint_repair"
  | "quality_repair";

export type SessionStatus =
  | "draft"
  | "validating"
  | "repairing"
  | "validated"
  | "quality_reviewing"
  | "quality_repairing"
  | "quality_repaired"
  | "frozen"
  | "failed";

export type ArtifactType =
  | "raw_input"
  | "input_understanding"
  | "product_intent"
  | "user_model"
  | "domain_model"
  | "flow_model"
  | "ui_model"
  | "visual_policy"
  | "generation_policy"
  | "uncertainty_model"
  | "blueprint"
  | "validation_report"
  | "quality_review_report";

export type BlueprintVersionStatus =
  | "draft"
  | "repaired"
  | "validated"
  | "frozen"
  | "superseded";

export type GenerationSession = {
  id: string;
  status: SessionStatus;
  rawInputArtifactId: string;
  activeBlueprintId?: string;
  createdAt: string;
  updatedAt: string;
};

export type GenerationStageRun = {
  id: string;
  sessionId: string;
  stage: BlueprintStage;
  promptVersion: string;
  model: string;
  inputArtifactIds: string[];
  outputArtifactId?: string;
  openaiResponseId?: string;
  status: "pending" | "completed" | "failed";
  error?: string;
  createdAt: string;
  updatedAt: string;
};

export type GenerationArtifact = {
  id: string;
  sessionId: string;
  artifactType: ArtifactType;
  version: number;
  json: unknown;
  checksum?: string;
  createdAt: string;
};

export type BlueprintVersion = {
  id: string;
  sessionId: string;
  version: number;
  status: BlueprintVersionStatus;
  artifactId: string;
  validationReportId?: string;
  qualityReviewReportId?: string;
  createdAt: string;
};

export type ValidationIssueSeverity = "error" | "warning";

export type ValidationIssue = {
  path: string;
  message: string;
  severity: ValidationIssueSeverity;
};

export type ValidationReport = {
  id: string;
  sessionId: string;
  blueprintId: string;
  schemaValid: boolean;
  semanticValid: boolean;
  issues: ValidationIssue[];
  createdAt: string;
};

export type QualityIssueSeverity = "blocker" | "high" | "medium" | "low";
export type QualityIssueRepairability = "targeted_repairable" | "non_repairable";
export type QualityIssueCode =
  | "app_structure_mismatch"
  | "explicit_outcome_weakened"
  | "primary_action_policy_weak"
  | "missing_result_page_action"
  | "desktop_resolution_policy_missing"
  | "generic_field_specificity";

export type QualityIssue = {
  code: QualityIssueCode;
  path: string;
  message: string;
  severity: QualityIssueSeverity;
  repairability: QualityIssueRepairability;
  suggestedFix?: string;
};

export type QualityReviewReport = {
  id: string;
  sessionId: string;
  blueprintId: string;
  passes: boolean;
  issues: QualityIssue[];
  createdAt: string;
};

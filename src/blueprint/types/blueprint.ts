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

export type AppArchetype =
  | "single_page_tool"
  | "form_to_result_tool"
  | "multi_page_app"
  | "dashboard_app"
  | "wizard_flow";

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
  appArchetype: AppArchetype;
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

export type GlobalGenerationPolicySeed = {
  noFollowUpQuestions: true;
  assumptionStrategy: "conservative_mvp";
  forbidUiAsImage: true;
  explicitBeatsInferred: true;
  doNotExpandScope: true;
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

export type PipelinePhase =
  | "session_input_contract"
  | "product_frame"
  | "product_behavior_model"
  | "ui_contract_model"
  | "blueprint_assembly"
  | "quality_and_repair"
  | "freeze";

export type PipelineGate =
  | "input_contract"
  | "intent_scope"
  | "domain_flow_consistency"
  | "flow_ui_coverage"
  | "full_deterministic_validation"
  | "quality_revalidation";

export type BlueprintStage =
  | "input_contract"
  | "input_understanding"
  | "product_frame"
  | "domain_modeling"
  | "flow_modeling"
  | "flow_quality_review"
  | "ui_modeling"
  | "ui_contract_review"
  | "policy_uncertainty"
  | "blueprint_assembly"
  | "deterministic_validation"
  | "semantic_quality_review"
  | "repair_routing"
  | "blueprint_repair"
  | "quality_repair"
  | "post_repair_guard"
  | "freeze";

export type SessionStatus =
  | "created"
  | "input_contract_checked"
  | "product_frame_generated"
  | "intent_scope_checked"
  | "domain_generated"
  | "flows_generated"
  | "domain_flow_checked"
  | "ui_generated"
  | "flow_ui_checked"
  | "policy_generated"
  | "blueprint_assembled"
  | "validating"
  | "validated"
  | "quality_reviewing"
  | "repair_routing"
  | "repairing"
  | "quality_repairing"
  | "quality_repaired"
  | "blueprint_frozen"
  | "stitch_prompt_planning"
  | "stitch_generating"
  | "stitch_validating"
  | "stitch_completed"
  | "failed";

export type ArtifactType =
  | "raw_input"
  | "global_policy_seed"
  | "gate_report"
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
  | "quality_review_report"
  | "repair_plan"
  | "repair_guard_report"
  | "quality_repair_candidate"
  | "stitch_prompt_plan"
  | "stitch_page_prompt"
  | "stitch_html"
  | "stitch_screenshot"
  | "stitch_html_validation_report"
  | "stitch_page_generation_report";

export type BlueprintVersionStatus =
  | "draft"
  | "repaired"
  | "quality_repaired"
  | "validated"
  | "frozen"
  | "superseded";

export type GenerationSession = {
  id: string;
  status: SessionStatus;
  rawInputArtifactId: string;
  globalPolicySeedArtifactId?: string;
  activeBlueprintId?: string;
  error?: string;
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

export type GateIssueSeverity = "error" | "warning";

export type GateIssue = {
  severity: GateIssueSeverity;
  code: string;
  path: string;
  message: string;
  suggestedFix?: string;
};

export type GateContext = {
  layer: "session" | "product_frame" | "flow" | "ui" | "blueprint" | "quality";
  kind: "structural" | "light_review" | "deterministic_validation" | "quality_revalidation";
  sourceStage?: BlueprintStage;
};

export type GateReport = {
  id: string;
  gate: PipelineGate;
  context: GateContext;
  sessionId: string;
  inputArtifactIds: string[];
  passed: boolean;
  issues: GateIssue[];
  createdAt: string;
};

export type ValidationIssueSeverity = "error" | "warning";
export type Repairability = "not_needed" | "targeted_repairable" | "non_repairable";

export type ValidationIssue = {
  severity: ValidationIssueSeverity;
  code: string;
  path: string;
  message: string;
  suggestedFix?: string;
  repairability?: Repairability;
};

export type ValidationReport = {
  id: string;
  validationId: string;
  sessionId: string;
  blueprintId?: string;
  schemaValid: boolean;
  semanticValid: boolean;
  issues: ValidationIssue[];
  createdAt: string;
};

export type BlueprintQualityIssueSeverity = "blocker" | "high" | "medium" | "low";
export type BlueprintQualityIssueCode =
  | "app_structure_mismatch"
  | "explicit_outcome_weakened"
  | "primary_action_policy_weak"
  | "missing_result_page_action"
  | "desktop_resolution_policy_missing"
  | "generic_field_specificity"
  | "flow_quality_weak"
  | "ui_contract_ambiguous"
  | "uncertainty_default_misleading"
  | "other";

export type BlueprintQualityIssue = {
  severity: BlueprintQualityIssueSeverity;
  code: BlueprintQualityIssueCode;
  path: string;
  message: string;
  affectedPaths?: string[];
  rationale?: string;
  suggestedFix?: string;
  repairability: Repairability;
};

export type BlueprintQualityReport = {
  id: string;
  sessionId: string;
  blueprintId: string;
  passed: boolean;
  issues: BlueprintQualityIssue[];
  createdAt: string;
};

export type RepairRoute =
  | "no_repair_needed"
  | "code_schema_repair"
  | "code_reference_repair"
  | "code_policy_repair"
  | "llm_semantic_local_repair"
  | "quality_repair"
  | "manual_blocking_issue";

export type RepairPlan = {
  id: string;
  sessionId: string;
  blueprintId: string;
  route: RepairRoute;
  source: "gate_report" | "validation_report" | "quality_review_report";
  sourceReportId?: string;
  sourceGate?: PipelineGate;
  sourceGateContext?: GateContext;
  sourceIssueCodes: string[];
  affectedPaths: string[];
  allowedMutationPaths: string[];
  protectedPaths: string[];
  requiresPostRepairGuard: boolean;
  requiresReviewAfterRepair: boolean;
  rationale: string;
  maxAttempts: number;
  createdAt: string;
};

export type FreezeEligibility = {
  sessionId: string;
  blueprintId: string;
  schemaValid: boolean;
  semanticValid: boolean;
  qualityPassed: boolean;
  unresolvedBlockers: BlueprintQualityIssue[];
  unresolvedHighMisleadingIssues: BlueprintQualityIssue[];
  canFreeze: boolean;
  rationale: string;
};

export type StitchPromptPlanPageRole =
  | "input"
  | "result"
  | "confirmation"
  | "readonly_detail"
  | "dashboard"
  | "supporting"
  | "unknown";

export type StitchPromptPlanPage = {
  pageId: string;
  pageName: string;
  pageRole: StitchPromptPlanPageRole;
  supportedFlowIds: string[];
  requiredDomainEntityIds: string[];
  requiredActions: string[];
  requiredStates: string[];
  requiredFeedbackSurfaces: string[];
  requiredRecoverySurfaces: string[];
};

export type StitchPromptPlan = {
  sessionId: string;
  blueprintId: string;
  pages: StitchPromptPlanPage[];
};

export type StitchPagePromptArtifact = {
  sessionId: string;
  blueprintId: string;
  pageId: string;
  prompt: string;
  sourcePageContractId: string;
  sourceFlowIds: string[];
  createdAt: string;
};

export type StitchHtmlValidationIssueSeverity = "error" | "warning";

export type StitchHtmlValidationIssue = {
  severity: StitchHtmlValidationIssueSeverity;
  code: string;
  message: string;
  path?: string;
  suggestedFix?: string;
};

export type StitchHtmlValidationReport = {
  id: string;
  sessionId: string;
  blueprintId: string;
  pageId: string;
  htmlArtifactId?: string;
  passed: boolean;
  issues: StitchHtmlValidationIssue[];
  createdAt: string;
};

export type StitchPageGenerationReport = {
  id: string;
  sessionId: string;
  blueprintId: string;
  pageId: string;
  promptArtifactId: string;
  htmlArtifactId?: string;
  screenshotArtifactId?: string;
  validationReportId: string;
  status: "generated" | "validated" | "failed";
  createdAt: string;
};

export type StitchPageGenerationResult = {
  sessionId: string;
  blueprintId: string;
  pageId: string;
  promptArtifactId: string;
  htmlArtifactId?: string;
  screenshotArtifactId?: string;
  validationReportId: string;
  status: "generated" | "validated" | "failed";
};

export type StitchGenerationInput = {
  sessionId: string;
  blueprintId: string;
  frozenBlueprint: ProductBlueprintV1;
  targetPages?: string[];
};

export type StitchPipelineResult = {
  sessionId: string;
  blueprintId: string;
  promptPlanArtifactId: string;
  pageResults: StitchPageGenerationResult[];
};

export type QualityRepairCandidate = {
  blueprint: ProductBlueprintV1;
  source: "llm_quality_repair" | "deterministic_quality_repair";
  repairPlanId: string;
  targetIssueCodes: string[];
  createdAt: string;
};

export type RepairGuardChangeReason =
  | "protected_field_reverted"
  | "outside_allowed_repair_scope"
  | "explicit_fact_changed"
  | "id_or_reference_changed"
  | "deterministic_invariant_reapplied";

export type RepairGuardChange = {
  path: string;
  candidateValue: unknown;
  guardedValue: unknown;
  reason: RepairGuardChangeReason;
};

export type RepairGuardReport = {
  id: string;
  sessionId: string;
  blueprintId: string;
  repairPlanId: string;
  candidateArtifactId: string;
  guardedArtifactId: string;
  protectedFields: string[];
  allowedMutationPaths: string[];
  revertedChanges: RepairGuardChange[];
  rejectedChanges: RepairGuardChange[];
  reappliedInvariants: string[];
  passed: boolean;
  createdAt: string;
};

export type PageRole =
  | "input"
  | "result"
  | "confirmation"
  | "readonly_detail"
  | "dashboard"
  | "supporting"
  | "unknown";

export type PageRoleClassification = {
  pageId: string;
  role: PageRole;
  evidence: string[];
  confidence: Confidence;
};

export type QualityIssue = BlueprintQualityIssue;
export type QualityReviewReport = BlueprintQualityReport;

import { z } from "zod";

const fieldSourceSchema = z.enum(["explicit", "inferred", "defaulted"]);
const confidenceSchema = z.enum(["high", "medium", "low"]);
const repairabilitySchema = z.enum(["not_needed", "targeted_repairable", "non_repairable"]);

export const fieldSchema = <T extends z.ZodTypeAny>(valueSchema: T) =>
  z.object({
    value: valueSchema,
    source: fieldSourceSchema,
    confidence: confidenceSchema,
    evidence: z.string().optional(),
    risk: z.string().optional()
  });

const referenceInputSchema = z.object({
  name: z.string().optional(),
  url: z.string().optional(),
  description: z.string().optional(),
  referenceFor: z.enum([
    "visual_style",
    "interaction_pattern",
    "product_structure",
    "copywriting_tone",
    "unknown"
  ])
});

export const globalGenerationPolicySeedSchema = z.object({
  noFollowUpQuestions: z.literal(true),
  assumptionStrategy: z.literal("conservative_mvp"),
  forbidUiAsImage: z.literal(true),
  explicitBeatsInferred: z.literal(true),
  doNotExpandScope: z.literal(true)
});

export const inputUnderstandingSchema = z.object({
  raw: z.string().min(1),
  type: fieldSchema(
    z.enum([
      "one_sentence_idea",
      "short_brief",
      "structured_prd",
      "workflow_description",
      "screen_request",
      "reference_product_description",
      "mixed"
    ])
  ),
  maturity: fieldSchema(
    z.enum(["idea", "rough_brief", "structured_requirements", "implementation_ready"])
  ),
  requestedScope: fieldSchema(
    z.enum(["single_screen", "single_flow", "multi_page_app", "full_product_mvp"])
  ),
  explicitConstraints: fieldSchema(z.array(z.string())),
  references: fieldSchema(z.array(referenceInputSchema)),
  normalizedSummary: fieldSchema(z.string())
});

export const productIntentSchema = z.object({
  name: fieldSchema(z.string()),
  category: fieldSchema(z.string()),
  oneSentenceSummary: fieldSchema(z.string()),
  targetProblem: fieldSchema(z.string()),
  primaryValueProposition: fieldSchema(z.string()),
  successDefinition: fieldSchema(z.string()),
  outOfScope: fieldSchema(z.array(z.string())),
  platform: fieldSchema(z.array(z.enum(["web", "mobile_web", "mobile_app", "desktop_web"]))),
  complexity: fieldSchema(z.enum(["simple", "moderate", "complex"]))
});

const userPersonaSchema = z.object({
  id: z.string(),
  label: z.string(),
  type: z.enum(["end_user", "operator", "admin", "guest"]),
  goals: z.array(z.string()),
  painPoints: z.array(z.string())
});

export const userModelSchema = z.object({
  primaryPersona: fieldSchema(userPersonaSchema),
  secondaryPersonas: fieldSchema(z.array(userPersonaSchema)),
  userSegmentsSummary: fieldSchema(z.string())
});

const domainEntityFieldSchema = z.object({
  name: z.string(),
  type: z.string(),
  required: z.boolean(),
  description: z.string()
});

export const domainModelSchema = z.object({
  entities: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      description: z.string(),
      fields: z.array(domainEntityFieldSchema)
    })
  ),
  relationships: z.array(
    z.object({
      fromEntityId: z.string(),
      toEntityId: z.string(),
      relation: z.string(),
      description: z.string()
    })
  ),
  businessRules: z.array(z.string())
});

const flowStepSchema = z.object({
  id: z.string(),
  label: z.string(),
  actor: z.enum(["user", "system"]),
  kind: z.enum(["action", "validation", "feedback", "state_change"]),
  detail: z.string()
});

const completionSignalSchema = z.object({
  userVisible: z.boolean(),
  signal: z.string()
});

const coreUserFlowSchema = z.object({
  id: z.string(),
  name: z.string(),
  userGoal: z.string(),
  trigger: z.string(),
  steps: z.array(flowStepSchema),
  systemEffects: z.array(z.string()),
  feedback: z.array(z.string()),
  recovery: z.array(z.string()),
  completionSignal: completionSignalSchema,
  involvedEntityIds: z.array(z.string()),
  uiSurfaceIds: z.array(z.string())
});

export const flowModelSchema = z.object({
  coreUserFlows: z.array(coreUserFlowSchema),
  supportingInteractionFlows: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      supportsCoreFlowId: z.string(),
      trigger: z.string(),
      steps: z.array(flowStepSchema)
    })
  ),
  sideEffectFlows: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      sourceCoreFlowId: z.string(),
      effects: z.array(z.string())
    })
  ),
  feedbackFlows: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      sourceFlowId: z.string(),
      states: z.array(z.string()),
      surfaces: z.array(z.string())
    })
  ),
  recoveryFlows: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      sourceFlowId: z.string(),
      failureCondition: z.string(),
      recoveryActions: z.array(z.string())
    })
  ),
  stateTransitions: z.array(
    z.object({
      flowId: z.string(),
      from: z.string(),
      to: z.string(),
      condition: z.string()
    })
  ),
  dependencies: z.array(
    z.object({
      fromFlowId: z.string(),
      toFlowId: z.string(),
      reason: z.string()
    })
  )
});

const uiActionSchema = z.object({
  id: z.string(),
  label: z.string(),
  kind: z.enum(["primary", "secondary", "navigation", "recovery"]),
  triggersFlowId: z.string().optional(),
  targetPageId: z.string().optional(),
  feedback: z.string()
});

const pageContractSchema = z.object({
  id: z.string(),
  name: z.string(),
  route: z.string(),
  purpose: z.string(),
  supportsFlowIds: z.array(z.string()),
  primaryAction: uiActionSchema.optional(),
  secondaryActions: z.array(uiActionSchema),
  sections: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      purpose: z.string()
    })
  ),
  componentRequirements: z.array(
    z.object({
      type: z.string(),
      purpose: z.string(),
      required: z.boolean()
    })
  ),
  states: z.array(
    z.object({
      name: z.string(),
      description: z.string()
    })
  ),
  feedbackSurfaces: z.array(
    z.object({
      id: z.string(),
      type: z.enum(["inline", "toast", "banner", "empty_state", "success_panel"]),
      purpose: z.string()
    })
  ),
  recoverySurfaces: z.array(
    z.object({
      id: z.string(),
      type: z.enum(["error_panel", "retry_area", "editable_form"]),
      purpose: z.string()
    })
  ),
  stitchPromptHints: z.array(z.string()),
  readonly: z.boolean(),
  confirmationOnly: z.boolean()
});

export const pageContractSchemaExport = pageContractSchema;

export const uiModelSchema = z.object({
  appStructure: z.object({
    shell: z.enum(["single_page", "dashboard", "wizard"]),
    pageOrder: z.array(z.string())
  }),
  navigation: z.object({
    type: z.enum(["minimal", "top_nav", "sidebar"]),
    globalNavItems: z.array(z.string())
  }),
  pages: z.array(pageContractSchema),
  globalComponents: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      purpose: z.string()
    })
  ),
  responsivePolicy: z.object({
    mobileFirst: z.boolean(),
    breakpoints: z.array(z.string())
  })
});

export const visualPolicySchema = z.object({
  imageUsage: z.object({
    allowDecorativeBackgrounds: z.boolean(),
    allowContentImages: z.boolean(),
    forbidUiAsImage: z.literal(true),
    maxSingleImageDominanceRatio: z.number(),
    decorativeImageGuidance: z.string(),
    forbiddenImageUses: z.array(z.string())
  }),
  htmlElementPolicy: z.object({
    requireRealText: z.boolean(),
    requireRealButtons: z.boolean(),
    requireRealForms: z.boolean(),
    requireRealNavigation: z.boolean(),
    requireRealDataDisplay: z.boolean(),
    requireSemanticSections: z.boolean()
  }),
  designTone: fieldSchema(z.string()),
  density: fieldSchema(z.string()),
  layoutPreference: fieldSchema(z.string()),
  colorIntent: fieldSchema(z.object({ mood: z.string() })),
  typographyIntent: fieldSchema(z.object({ style: z.string(), emphasis: z.string() })),
  motionIntent: fieldSchema(z.object({ level: z.string() }))
});

export const generationPolicySchema = z.object({
  noFollowUpQuestions: z.literal(true),
  assumptionStrategy: z.literal("conservative_mvp"),
  defaultScopeWhenAmbiguous: z.literal("single_primary_flow_mvp"),
  maxCoreFlows: z.number().int().positive(),
  maxPages: z.number().int().positive(),
  maxPrimaryActionsPerPage: z.number().int().positive(),
  inferenceRules: z.array(z.string()),
  safetyRules: z.array(z.string()),
  stitchGenerationRules: z.object({
    generatePagesIndividually: z.boolean(),
    includeFlowContextInEveryPrompt: z.boolean(),
    includeVisualPolicyInEveryPrompt: z.boolean(),
    requirePrimaryActionInEveryPage: z.boolean(),
    requireCompletionSignalWhenApplicable: z.boolean(),
    requireFeedbackAndRecoveryStates: z.boolean(),
    validateAfterGeneration: z.boolean()
  })
});

export const uncertaintyModelSchema = z.object({
  assumptions: z.array(
    z.object({
      id: z.string(),
      question: z.string(),
      defaultDecision: z.string(),
      rationale: z.string()
    })
  ),
  unresolvedQuestions: z.array(
    z.object({
      id: z.string(),
      question: z.string(),
      defaultDecision: z.string(),
      rationale: z.string()
    })
  ),
  notableRisks: z.array(z.string())
});

export const blueprintMetaSchema = z.object({
  version: z.literal("1.0"),
  mode: z.literal("one_shot"),
  inputLanguage: z.string(),
  outputLanguage: z.string(),
  downstreamTarget: z.literal("stitch_to_react"),
  generatedAt: z.string()
});

export const productBlueprintSchema = z.object({
  meta: blueprintMetaSchema,
  input: inputUnderstandingSchema,
  product: productIntentSchema,
  users: userModelSchema,
  domain: domainModelSchema,
  flows: flowModelSchema,
  ui: uiModelSchema,
  visualPolicy: visualPolicySchema,
  generationPolicy: generationPolicySchema,
  uncertainty: uncertaintyModelSchema
});

export const gateIssueSchema = z.object({
  severity: z.enum(["error", "warning"]),
  code: z.string(),
  path: z.string(),
  message: z.string(),
  suggestedFix: z.string().optional()
});

export const gateReportSchema = z.object({
  id: z.string(),
  gate: z.enum([
    "input_contract",
    "intent_scope",
    "domain_flow_consistency",
    "flow_ui_coverage",
    "full_deterministic_validation",
    "quality_revalidation"
  ]),
  context: z.object({
    layer: z.enum(["session", "product_frame", "flow", "ui", "blueprint", "quality"]),
    kind: z.enum(["structural", "light_review", "deterministic_validation", "quality_revalidation"]),
    sourceStage: z
      .enum([
        "input_contract",
        "input_understanding",
        "product_frame",
        "domain_modeling",
        "flow_modeling",
        "flow_quality_review",
        "ui_modeling",
        "ui_contract_review",
        "policy_uncertainty",
        "blueprint_assembly",
        "deterministic_validation",
        "semantic_quality_review",
        "repair_routing",
        "blueprint_repair",
        "quality_repair",
        "post_repair_guard",
        "freeze"
      ])
      .optional()
  }),
  sessionId: z.string(),
  inputArtifactIds: z.array(z.string()),
  passed: z.boolean(),
  issues: z.array(gateIssueSchema),
  createdAt: z.string()
});

export const validationIssueSchema = z.object({
  severity: z.enum(["error", "warning"]),
  code: z.string(),
  path: z.string(),
  message: z.string(),
  suggestedFix: z.string().optional(),
  repairability: repairabilitySchema.optional()
});

export const validationReportSchema = z.object({
  id: z.string(),
  validationId: z.string(),
  sessionId: z.string(),
  blueprintId: z.string().optional(),
  schemaValid: z.boolean(),
  semanticValid: z.boolean(),
  issues: z.array(validationIssueSchema),
  createdAt: z.string()
});

export const blueprintQualityIssueSchema = z.object({
  severity: z.enum(["blocker", "high", "medium", "low"]),
  code: z.enum([
    "app_structure_mismatch",
    "explicit_outcome_weakened",
    "primary_action_policy_weak",
    "missing_result_page_action",
    "desktop_resolution_policy_missing",
    "generic_field_specificity",
    "flow_quality_weak",
    "ui_contract_ambiguous",
    "uncertainty_default_misleading",
    "other"
  ]),
  path: z.string(),
  message: z.string(),
  affectedPaths: z.array(z.string()).optional(),
  rationale: z.string().optional(),
  suggestedFix: z.string().optional(),
  repairability: repairabilitySchema
});

export const blueprintQualityReportSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  blueprintId: z.string(),
  passed: z.boolean(),
  issues: z.array(blueprintQualityIssueSchema),
  createdAt: z.string()
});

export const repairPlanSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  blueprintId: z.string(),
  route: z.enum([
    "no_repair_needed",
    "code_schema_repair",
    "code_reference_repair",
    "code_policy_repair",
    "llm_semantic_local_repair",
    "quality_repair",
    "manual_blocking_issue"
  ]),
  source: z.enum(["gate_report", "validation_report", "quality_review_report"]),
  sourceReportId: z.string().optional(),
  sourceGate: z
    .enum([
      "input_contract",
      "intent_scope",
      "domain_flow_consistency",
      "flow_ui_coverage",
      "full_deterministic_validation",
      "quality_revalidation"
    ])
    .optional(),
  sourceGateContext: z
    .object({
      layer: z.enum(["session", "product_frame", "flow", "ui", "blueprint", "quality"]),
      kind: z.enum(["structural", "light_review", "deterministic_validation", "quality_revalidation"]),
      sourceStage: z
        .enum([
          "input_contract",
          "input_understanding",
          "product_frame",
          "domain_modeling",
          "flow_modeling",
          "flow_quality_review",
          "ui_modeling",
          "ui_contract_review",
          "policy_uncertainty",
          "blueprint_assembly",
          "deterministic_validation",
          "semantic_quality_review",
          "repair_routing",
          "blueprint_repair",
          "quality_repair",
          "post_repair_guard",
          "freeze"
        ])
        .optional()
    })
    .optional(),
  sourceIssueCodes: z.array(z.string()),
  affectedPaths: z.array(z.string()),
  allowedMutationPaths: z.array(z.string()),
  protectedPaths: z.array(z.string()),
  requiresPostRepairGuard: z.boolean(),
  requiresReviewAfterRepair: z.boolean(),
  rationale: z.string(),
  maxAttempts: z.number().int().positive(),
  createdAt: z.string()
});

export const qualityRepairCandidateSchema = z.object({
  blueprint: productBlueprintSchema,
  source: z.enum(["llm_quality_repair", "deterministic_quality_repair"]),
  repairPlanId: z.string(),
  targetIssueCodes: z.array(z.string()),
  createdAt: z.string()
});

export const repairGuardChangeSchema = z.object({
  path: z.string(),
  candidateValue: z.unknown(),
  guardedValue: z.unknown(),
  reason: z.enum([
    "protected_field_reverted",
    "outside_allowed_repair_scope",
    "explicit_fact_changed",
    "id_or_reference_changed",
    "deterministic_invariant_reapplied"
  ])
});

export const repairGuardReportSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  blueprintId: z.string(),
  repairPlanId: z.string(),
  candidateArtifactId: z.string(),
  guardedArtifactId: z.string(),
  protectedFields: z.array(z.string()),
  allowedMutationPaths: z.array(z.string()),
  revertedChanges: z.array(repairGuardChangeSchema),
  rejectedChanges: z.array(repairGuardChangeSchema),
  reappliedInvariants: z.array(z.string()),
  passed: z.boolean(),
  createdAt: z.string()
});

export const freezeEligibilitySchema = z.object({
  sessionId: z.string(),
  blueprintId: z.string(),
  schemaValid: z.boolean(),
  semanticValid: z.boolean(),
  qualityPassed: z.boolean(),
  unresolvedBlockers: z.array(blueprintQualityIssueSchema),
  unresolvedHighMisleadingIssues: z.array(blueprintQualityIssueSchema),
  canFreeze: z.boolean(),
  rationale: z.string()
});

export const stitchPromptPlanPageSchema = z.object({
  pageId: z.string(),
  pageName: z.string(),
  pageRole: z.enum(["input", "result", "confirmation", "readonly_detail", "dashboard", "supporting", "unknown"]),
  supportedFlowIds: z.array(z.string()),
  requiredDomainEntityIds: z.array(z.string()),
  requiredActions: z.array(z.string()),
  requiredStates: z.array(z.string()),
  requiredFeedbackSurfaces: z.array(z.string()),
  requiredRecoverySurfaces: z.array(z.string())
});

export const stitchPromptPlanSchema = z.object({
  sessionId: z.string(),
  blueprintId: z.string(),
  pages: z.array(stitchPromptPlanPageSchema)
});

export const stitchPagePromptArtifactSchema = z.object({
  sessionId: z.string(),
  blueprintId: z.string(),
  pageId: z.string(),
  prompt: z.string(),
  sourcePageContractId: z.string(),
  sourceFlowIds: z.array(z.string()),
  createdAt: z.string()
});

export const stitchHtmlValidationIssueSchema = z.object({
  severity: z.enum(["error", "warning"]),
  code: z.string(),
  message: z.string(),
  path: z.string().optional(),
  suggestedFix: z.string().optional()
});

export const stitchHtmlValidationReportSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  blueprintId: z.string(),
  pageId: z.string(),
  htmlArtifactId: z.string().optional(),
  passed: z.boolean(),
  issues: z.array(stitchHtmlValidationIssueSchema),
  createdAt: z.string()
});

export const stitchCrossPageValidationReportSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  blueprintId: z.string(),
  pageIds: z.array(z.string()),
  htmlArtifactIds: z.array(z.string()),
  passed: z.boolean(),
  issues: z.array(stitchHtmlValidationIssueSchema),
  createdAt: z.string()
});

export const stitchHtmlPostprocessReportSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  blueprintId: z.string(),
  pageIds: z.array(z.string()),
  sourceIssueCodes: z.array(z.string()),
  appliedFixes: z.array(z.string()),
  changedArtifacts: z.array(z.string()),
  rejectedFixes: z.array(
    z.object({
      fix: z.string(),
      reason: z.string()
    })
  ),
  createdAt: z.string()
});

export const validatedStitchArtifactGateReportSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  blueprintId: z.string(),
  pageIds: z.array(z.string()),
  htmlArtifactIds: z.array(z.string()),
  validationArtifactIds: z.array(z.string()),
  passed: z.boolean(),
  issues: z.array(z.string()),
  createdAt: z.string()
});

export const stitchPageGenerationReportSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  blueprintId: z.string(),
  pageId: z.string(),
  promptArtifactId: z.string(),
  htmlArtifactId: z.string().optional(),
  screenshotArtifactId: z.string().optional(),
  validationReportId: z.string(),
  status: z.enum(["generated", "validated", "failed"]),
  createdAt: z.string()
});

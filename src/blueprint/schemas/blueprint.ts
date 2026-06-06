import { z } from "zod";

const fieldSourceSchema = z.enum(["explicit", "inferred", "defaulted"]);
const confidenceSchema = z.enum(["high", "medium", "low"]);

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

export const validationIssueSchema = z.object({
  path: z.string(),
  message: z.string(),
  severity: z.enum(["error", "warning"])
});

export const validationReportSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  blueprintId: z.string(),
  schemaValid: z.boolean(),
  semanticValid: z.boolean(),
  issues: z.array(validationIssueSchema),
  createdAt: z.string()
});

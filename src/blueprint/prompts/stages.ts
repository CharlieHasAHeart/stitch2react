import type { BlueprintStage } from "../types/blueprint.js";

export const STAGE_PROMPT_VERSION = "v3";
export const STAGE_TEMPERATURE = 0.2;

type StageContract = {
  mustInclude: string[];
  mustNotInclude: string[];
  requiredInvariants: string[];
  allowedDefaults: string[];
  forbiddenExpansions: string[];
  outputCompletenessChecklist: string[];
};

function formatStageContract(contract: StageContract): string {
  const render = (title: string, items: string[]) => `${title}:\n${items.map((item) => `- ${item}`).join("\n")}`;
  return [
    render("mustInclude", contract.mustInclude),
    render("mustNotInclude", contract.mustNotInclude),
    render("requiredInvariants", contract.requiredInvariants),
    render("allowedDefaults", contract.allowedDefaults),
    render("forbiddenExpansions", contract.forbiddenExpansions),
    render("outputCompletenessChecklist", contract.outputCompletenessChecklist)
  ].join("\n\n");
}

function buildGenerationStageInstructions(
  baseInstructions: string[],
  contract: StageContract | undefined
): string {
  return [...baseInstructions, contract ? formatStageContract(contract) : ""].filter(Boolean).join("\n\n");
}

const stageGenerationContracts: Partial<Record<BlueprintStage, StageContract>> = {
  input_understanding: {
    mustInclude: [
      "InputUnderstanding.raw copied from the provided user input.",
      "A conservative normalized summary of the user's request.",
      "Explicit constraints such as no-login when present.",
      "Initial ProductIntent and UserModel fields needed for downstream stages.",
      "Input type, maturity, and requested scope classified from the provided input."
    ],
    mustNotInclude: [
      "Flows, pages, APIs, or implementation detail not asked for by this stage.",
      "Invented enterprise scope, integrations, payments, admin systems, or authentication unless explicit."
    ],
    requiredInvariants: [
      "Mark user-stated facts as explicit and keep inferred/defaulted fields separate.",
      "No follow-up questions.",
      "Conservative MVP interpretation only."
    ],
    allowedDefaults: [
      "Platform defaults to web when not otherwise constrained.",
      "Requested scope may default to single_primary_flow_mvp-compatible intent."
    ],
    forbiddenExpansions: [
      "Do not invent team collaboration, payments, external integrations, or account systems.",
      "Do not turn a rough brief into a broad multi-role product."
    ],
    outputCompletenessChecklist: [
      "input is complete and traceable.",
      "product preserves explicit constraints.",
      "users define at least one usable primary persona.",
      "requestedScope and normalizedSummary are usable by downstream stages without re-reading raw input."
    ]
  },
  product_frame: {
    mustInclude: [
      "A tightened ProductIntent suitable for downstream domain and flow generation.",
      "UserModel that matches the product's primary actor.",
      "Preserved explicit constraints and out-of-scope boundaries.",
      "A stable successDefinition that preserves the visible user outcome when one is stated."
    ],
    mustNotInclude: [
      "Detailed domain entities, flows, UI pages, or technical implementation choices."
    ],
    requiredInvariants: [
      "Keep conservative MVP scope.",
      "Preserve explicit no-login and similar user constraints.",
      "Do not mark inferred facts as explicit.",
      "Do not weaken submit-and-see-result style requests into generic submission acknowledgment semantics."
    ],
    allowedDefaults: [
      "Out-of-scope may explicitly exclude auth, payments, collaboration, and integrations when absent."
    ],
    forbiddenExpansions: [
      "No extra product lines, team roles, or operator/admin panels unless explicitly requested."
    ],
    outputCompletenessChecklist: [
      "product has a stable successDefinition.",
      "outOfScope is present.",
      "users remain aligned to the product summary.",
      "the visible success outcome is clear enough to drive flow completion signals later."
    ]
  },
  domain_modeling: {
    mustInclude: [
      "Only the domain entities, relationships, and business rules needed for the smallest coherent MVP.",
      "Enough domain structure to support the primary flow's inputs, validation, and result state."
    ],
    mustNotInclude: [
      "UI structure, navigation, page layout, or frontend component detail.",
      "Unnecessary entities for unsupported product scope."
    ],
    requiredInvariants: [
      "Entities must support the stated product intent and likely flows.",
      "Business rules must not contradict explicit constraints.",
      "Do not encode business certainty that the user did not provide."
    ],
    allowedDefaults: [
      "A minimal entity set may be inferred when the user only describes outcomes."
    ],
    forbiddenExpansions: [
      "No backend/admin subsystems, audit consoles, billing objects, or integration objects unless explicit."
    ],
    outputCompletenessChecklist: [
      "Each entity is necessary.",
      "Relationships are coherent.",
      "Business rules are compatible with a one-shot MVP."
    ]
  },
  flow_modeling: {
    mustInclude: [
      "At least one core user flow with trigger, steps, feedback, recovery, completion signal, involved entities, and UI surfaces.",
      "Supporting, feedback, recovery, and side-effect flows only when they materially support the core flow.",
      "Each core flow has at least one validation or system-effect step, not only input or navigation steps.",
      "Completion signals that describe the user-visible result of the flow."
    ],
    mustNotInclude: [
      "Pure page-order descriptions disguised as flows.",
      "Overly implementation-specific mechanisms when user/business semantics are sufficient.",
      "Generic request-submitted language when the user explicitly asked to see a result, quote, answer, or output."
    ],
    requiredInvariants: [
      "The user's visible outcome must remain preserved.",
      "Every core flow must have at least two meaningful steps.",
      "Every user-visible core flow must define a completion signal and UI surfaces.",
      "Do not reduce the flow to route changes, button clicks, or generic form submission semantics."
    ],
    allowedDefaults: [
      "Conservative recovery paths for validation failure or retry scenarios.",
      "A single primary core flow when the request is sparse.",
      "A mock or deterministic placeholder result when the user asks to see a result but real calculation logic is unspecified."
    ],
    forbiddenExpansions: [
      "Do not introduce unrelated secondary products or admin/operator flows.",
      "Do not force stronger business assumptions than the user asked for.",
      "Do not add login, payment, collaboration, or external integration flows unless explicit."
    ],
    outputCompletenessChecklist: [
      "core flows are complete.",
      "feedback and recovery are present where user-visible.",
      "state transitions do not contradict the flow narrative.",
      "the primary completion signal still reflects the user's requested visible outcome."
    ]
  },
  ui_modeling: {
    mustInclude: [
      "Pages derived from flows.",
      "Primary actions on non-readonly, non-confirmation pages.",
      "Feedback surfaces and recovery surfaces that map to flow semantics.",
      "Every core flow has at least one supporting page or clearly named UI surface.",
      "Result or confirmation pages expose completion signals through page purpose, actions, or states."
    ],
    mustNotInclude: [
      "Pages with no supporting flow.",
      "Image-only UI representations.",
      "Page role inferred only from business nouns such as quote, request, order, or report."
    ],
    requiredInvariants: [
      "Every page supports at least one flow.",
      "Primary actions are explicit and consistent with flow semantics.",
      "UI contract remains conservative and implementation-ready.",
      "Primary actions must have clear success feedback or clear target behavior.",
    ],
    allowedDefaults: [
      "A minimal page set derived directly from the supported flows when suitable.",
      "Result/readonly pages may prefer secondary actions over primary submit actions.",
    ],
    forbiddenExpansions: [
      "Do not add navigation systems or extra pages without flow support.",
    ],
    outputCompletenessChecklist: [
      "All pages are flow-backed.",
      "Feedback and recovery surfaces are present where needed.",
      "Primary and secondary actions are structurally usable.",
      "page roles are explicit through page fields, states, routes, and actions rather than vague wording.",
    ]
  },
  policy_uncertainty: {
    mustInclude: [
      "visualPolicy, generationPolicy, and uncertainty only.",
      "Default decisions for every unresolved question."
    ],
    mustNotInclude: [
      "New product scope, new entities, new flows, or new pages."
    ],
    requiredInvariants: [
      "Policies must reinforce conservative MVP behavior.",
      "Uncertainty must stay explicit and traceable."
    ],
    allowedDefaults: [
      "Conservative visual defaults and desktop/web defaults when not otherwise constrained."
    ],
    forbiddenExpansions: [
      "Do not use this stage to reinterpret the product."
    ],
    outputCompletenessChecklist: [
      "visual policy is complete.",
      "generation policy preserves non-negotiable invariants.",
      "every unresolved question has a defaultDecision."
    ]
  },
  blueprint_assembly: {
    mustInclude: [
      "The full ProductBlueprintV1 assembled strictly from upstream artifacts.",
      "Only upstream-derived sections with no fresh invention during assembly."
    ],
    mustNotInclude: [
      "New facts, new scope, or reinterpretation beyond the provided artifacts."
    ],
    requiredInvariants: [
      "Preserve explicit user constraints.",
      "Do not alter upstream semantics while assembling.",
      "Do not silently weaken visible outcome language from upstream product, flow, or UI artifacts."
    ],
    allowedDefaults: [
      "Only defaults already present in upstream artifacts."
    ],
    forbiddenExpansions: [
      "No new flows, pages, entities, or policies beyond upstream inputs."
    ],
    outputCompletenessChecklist: [
      "All top-level sections are present.",
      "The output is fully valid ProductBlueprintV1 JSON.",
      "The assembled blueprint is traceable to upstream artifacts only.",
      "no section introduces scope or semantics not already present upstream."
    ]
  }
};

export const stageReasoningEffort: Record<BlueprintStage, "low" | "medium" | "high"> = {
  input_contract: "low",
  input_understanding: "low",
  product_frame: "low",
  domain_modeling: "low",
  flow_modeling: "medium",
  flow_quality_review: "low",
  ui_modeling: "medium",
  ui_contract_review: "low",
  policy_uncertainty: "low",
  blueprint_assembly: "low",
  deterministic_validation: "low",
  semantic_quality_review: "medium",
  repair_routing: "low",
  blueprint_repair: "medium",
  quality_repair: "medium",
  post_repair_guard: "low",
  freeze: "low"
};

export const stageMaxOutputTokens: Record<BlueprintStage, number> = {
  input_contract: 1000,
  input_understanding: 3000,
  product_frame: 4000,
  domain_modeling: 5000,
  flow_modeling: 8000,
  flow_quality_review: 3000,
  ui_modeling: 8000,
  ui_contract_review: 3000,
  policy_uncertainty: 5000,
  blueprint_assembly: 12000,
  deterministic_validation: 2000,
  semantic_quality_review: 6000,
  repair_routing: 2000,
  blueprint_repair: 12000,
  quality_repair: 12000,
  post_repair_guard: 1000,
  freeze: 1000
};

export const stageInstructions: Record<BlueprintStage, string> = {
  input_contract: `You are checking the input contract for ProductBlueprintV1 generation. Return only the provided policy seed and do not ask follow-up questions.`,
  input_understanding: buildGenerationStageInstructions(
    [
      `You are generating the input_understanding stage for ProductBlueprintV1.`,
      `Use only the provided JSON payload.`,
      `Return JSON containing exactly: input, product, users.`,
      `Apply the global policy seed, do not ask follow-up questions, use conservative MVP assumptions, and mark explicit vs inferred vs defaulted correctly.`,
      `Optimize for a strong first-pass artifact instead of relying on later repair.`
    ],
    stageGenerationContracts.input_understanding
  ),
  product_frame: buildGenerationStageInstructions(
    [
      `You are refining the product frame for ProductBlueprintV1.`,
      `Use only the provided JSON payload.`,
      `Return JSON containing exactly: input, product, users.`,
      `Preserve explicit constraints, keep conservative MVP scope, and do not invent flows or pages.`,
      `Strengthen intent clarity for downstream domain and flow generation without expanding product scope.`
    ],
    stageGenerationContracts.product_frame
  ),
  domain_modeling: buildGenerationStageInstructions(
    [
      `You are generating the domain_modeling stage for ProductBlueprintV1.`,
      `Use only the provided upstream JSON artifacts.`,
      `Return valid DomainModel JSON.`,
      `Do not ask follow-up questions.`,
      `Do not expand scope beyond the smallest coherent MVP.`,
      `Produce only the domain structure required to support downstream flow modeling.`
    ],
    stageGenerationContracts.domain_modeling
  ),
  flow_modeling: buildGenerationStageInstructions(
    [
      `You are generating the flow_modeling stage for ProductBlueprintV1.`,
      `Use only the provided upstream JSON artifacts.`,
      `Return valid FlowModel JSON.`,
      `Every core flow must include trigger, at least two meaningful steps, feedback, recovery, completion signal, involved entities, and UI surfaces.`,
      `Do not reduce flows to page navigation.`,
      `Preserve the user's visible outcome language in the primary flow completion signal.`
    ],
    stageGenerationContracts.flow_modeling
  ),
  flow_quality_review: `You are reviewing only the flow layer for ProductBlueprintV1.
Return a BlueprintQualityReport JSON focused on semantic flow quality issues.
Do not rewrite the blueprint.`,
  ui_modeling: buildGenerationStageInstructions(
    [
      `You are generating the ui_modeling stage for ProductBlueprintV1.`,
      `Use only the provided upstream JSON artifacts.`,
      `Return valid UIModel JSON.`,
      `Pages must be derived from flows.`,
      `Every page must support at least one flow.`,
      `Every non-readonly, non-confirmation page must have a primary action.`,
      `Prefer the smallest flow-backed UI structure that satisfies the product intent.`
    ],
    stageGenerationContracts.ui_modeling
  ),
  ui_contract_review: `You are reviewing only the UI contract layer for ProductBlueprintV1.
Return a BlueprintQualityReport JSON focused on UI contract ambiguity and flow coverage quality issues.
Do not rewrite the blueprint.`,
  policy_uncertainty: buildGenerationStageInstructions(
    [
      `You are generating the policy_uncertainty stage for ProductBlueprintV1.`,
      `Use only the provided upstream JSON artifacts.`,
      `Return JSON containing exactly: visualPolicy, generationPolicy, uncertainty.`,
      `Set generationPolicy.noFollowUpQuestions to true.`,
      `Every unresolved question must have a default decision.`,
      `Do not use this stage to add scope, entities, flows, or pages.`
    ],
    stageGenerationContracts.policy_uncertainty
  ),
  blueprint_assembly: buildGenerationStageInstructions(
    [
      `You are generating the blueprint_assembly stage for ProductBlueprintV1.`,
      `Use only the provided upstream JSON artifacts.`,
      `Return the full ProductBlueprintV1 JSON.`,
      `Do not change explicit user facts.`,
      `Do not expand scope.`,
      `Assembly is a composition step only: do not reinterpret the product or generate new sections beyond the provided artifacts.`
    ],
    stageGenerationContracts.blueprint_assembly
  ),
  deterministic_validation: `You are not asked to generate content in this stage.`,
  semantic_quality_review: `You are performing semantic_quality_review for ProductBlueprintV1.
Use only the provided validated blueprint and validation report.
Return a BlueprintQualityReport JSON.
Report only semantic quality issues that are structurally valid but misleading, vague, weak, or inconsistent enough to harm downstream generation.
Do not repair the blueprint.
Do not change explicit user facts.
Do not expand scope.`,
  repair_routing: `You are not asked to generate content in this stage.`,
  blueprint_repair: `You are generating the blueprint_repair stage for ProductBlueprintV1.
Use only the provided JSON payload containing the invalid blueprint and validation issues.
Repair only invalid or inconsistent fields.
Return the full corrected ProductBlueprintV1 JSON.
Do not change explicit user facts.
Do not expand scope.`,
  quality_repair: `You are generating the quality_repair stage for ProductBlueprintV1.
Use only the provided JSON payload containing the validated blueprint, quality review issues, and repair rules.
Repair only the targeted quality issues.
Do not change explicit user facts.
Do not expand scope.
Do not rerun unrelated design decisions.
Return the full corrected ProductBlueprintV1 JSON.`,
  post_repair_guard: `You are not asked to generate content in this stage.`,
  freeze: `You are not asked to generate content in this stage.`
};

import type { BlueprintStage } from "../types/blueprint.js";

export const STAGE_PROMPT_VERSION = "v2";
export const STAGE_TEMPERATURE = 0.2;

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
  input_understanding: `You are generating the input_understanding stage for ProductBlueprintV1.
Use only the provided JSON payload.
Return JSON containing exactly: input, product, users.
Apply the global policy seed, do not ask follow-up questions, use conservative MVP assumptions, mark explicit vs inferred vs defaulted correctly, and do not invent large scope.`,
  product_frame: `You are refining the product frame for ProductBlueprintV1.
Use only the provided JSON payload.
Return JSON containing exactly: input, product, users.
Preserve explicit constraints, keep conservative MVP scope, and do not invent flows or pages.`,
  domain_modeling: `You are generating the domain_modeling stage for ProductBlueprintV1.
Use only the provided upstream JSON artifacts.
Return valid DomainModel JSON.
Do not ask follow-up questions.
Do not expand scope beyond the smallest coherent MVP.`,
  flow_modeling: `You are generating the flow_modeling stage for ProductBlueprintV1.
Use only the provided upstream JSON artifacts.
Return valid FlowModel JSON.
Every core flow must include trigger, at least two meaningful steps, feedback, recovery, completion signal, involved entities, and UI surfaces.
Do not reduce flows to page navigation.`,
  flow_quality_review: `You are reviewing only the flow layer for ProductBlueprintV1.
Return a BlueprintQualityReport JSON focused on semantic flow quality issues.
Do not rewrite the blueprint.`,
  ui_modeling: `You are generating the ui_modeling stage for ProductBlueprintV1.
Use only the provided upstream JSON artifacts.
Return valid UIModel JSON.
Pages must be derived from flows.
Every page must support at least one flow.
Every non-readonly, non-confirmation page must have a primary action.`,
  ui_contract_review: `You are reviewing only the UI contract layer for ProductBlueprintV1.
Return a BlueprintQualityReport JSON focused on UI contract ambiguity and flow coverage quality issues.
Do not rewrite the blueprint.`,
  policy_uncertainty: `You are generating the policy_uncertainty stage for ProductBlueprintV1.
Use only the provided upstream JSON artifacts.
Return JSON containing exactly: visualPolicy, generationPolicy, uncertainty.
Set generationPolicy.noFollowUpQuestions to true.
Set visualPolicy.imageUsage.forbidUiAsImage to true.
Every unresolved question must have a default decision.`,
  blueprint_assembly: `You are generating the blueprint_assembly stage for ProductBlueprintV1.
Use only the provided upstream JSON artifacts.
Return the full ProductBlueprintV1 JSON.
Do not change explicit user facts.
Do not expand scope.`,
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
